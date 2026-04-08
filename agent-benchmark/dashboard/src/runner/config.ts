import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { platform } from "os";
import {
  GlobalConfig,
  ScenarioConfig,
  AgentSetupInfo,
  ScriptEntry,
} from "../types.js";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const benchRoot = resolve(__dirname, "..", "..", "..");
export const repoRoot = resolve(benchRoot, "..");
export const resultsRoot = join(benchRoot, "results");
export const scenariosDir = join(benchRoot, "scenarios");

export function loadGlobalConfig(): GlobalConfig {
  const configPath = join(benchRoot, "common", "config.json");
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

// Parse scenario.md (YAML frontmatter + markdown body) or fall back to scenario.json + prompt.md
export function loadScenario(scenarioDir: string): { config: ScenarioConfig; prompt: string } | null {
  const scenarioMd = join(scenarioDir, "scenario.md");
  const scenarioJson = join(scenarioDir, "scenario.json");

  if (existsSync(scenarioMd)) {
    const raw = readFileSync(scenarioMd, "utf-8").replace(/\r\n/g, "\n");
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (fmMatch) {
      const config = parseYaml(fmMatch[1]) as ScenarioConfig;
      const prompt = fmMatch[2].trim();
      return { config, prompt };
    }
  }

  if (existsSync(scenarioJson)) {
    const config = JSON.parse(readFileSync(scenarioJson, "utf-8")) as ScenarioConfig;
    const promptFile = join(scenarioDir, "prompt.md");
    const prompt = existsSync(promptFile) ? readFileSync(promptFile, "utf-8") : "";
    return { config, prompt };
  }

  return null;
}

// Resolve a scenario name to its path, checking both flat and nested group folders.
// Handles legacy names (e.g. "macos-counter") by scanning all nested dirs.
export function resolveScenarioPath(scenarioName: string): string {
  if (!scenarioName) return "";
  // Direct match (flat)
  const direct = join(scenariosDir, scenarioName);
  if (existsSync(direct)) return direct;
  // Search inside group folders (one level deep)
  if (existsSync(scenariosDir)) {
    for (const group of readdirSync(scenariosDir)) {
      const nested = join(scenariosDir, group, scenarioName);
      if (existsSync(nested) && statSync(nested).isDirectory()) return nested;
    }
  }
  return "";
}

export function discoverScenarios(): Array<{
  name: string;
  path: string;
  config: ScenarioConfig;
}> {
  if (!existsSync(scenariosDir)) return [];
  const results: Array<{ name: string; path: string; config: ScenarioConfig }> = [];

  for (const entry of readdirSync(scenariosDir)) {
    const dir = join(scenariosDir, entry);
    if (!statSync(dir).isDirectory()) continue;

    // Direct scenario folder (e.g. scenarios/ai-journal/)
    const direct = loadScenario(dir);
    if (direct) {
      results.push({ name: entry, path: dir, config: direct.config });
      continue;
    }

    // Group folder (e.g. scenarios/counter/counter-winui/)
    for (const sub of readdirSync(dir)) {
      const subDir = join(dir, sub);
      if (!statSync(subDir).isDirectory()) continue;
      const nested = loadScenario(subDir);
      if (nested) {
        results.push({ name: sub, path: subDir, config: nested.config });
      }
    }
  }

  return results;
}

export function discoverAgentSetups(): AgentSetupInfo[] {
  const agentSetups: AgentSetupInfo[] = [];

  // Scan agent directories: src/agents/ and src/.local/agents/
  const agentDirs = [
    join(repoRoot, "src", "agents"),
    join(repoRoot, "src", ".local", "agents"),
  ];
  for (const srcAgentsDir of agentDirs) {
    if (!existsSync(srcAgentsDir)) continue;
    for (const d of readdirSync(srcAgentsDir)) {
      const full = join(srcAgentsDir, d);
      if (!statSync(full).isDirectory()) continue;
      if (d.startsWith("_")) continue; // skip _sections, etc.

      // Direct agent folder (has config.json)
      if (existsSync(join(full, "config.json"))) {
        let config: import("../types.js").AgentSetupConfig | undefined;
        try {
          config = JSON.parse(readFileSync(join(full, "config.json"), "utf-8"));
        } catch {}
        agentSetups.push({ name: d, path: full, config });
        continue;
      }

      // Group folder (e.g. src/agents/swiftui/swiftui-DAV/)
      for (const sub of readdirSync(full)) {
        const subFull = join(full, sub);
        if (!statSync(subFull).isDirectory()) continue;
        if (!existsSync(join(subFull, "config.json"))) continue;
        let config: import("../types.js").AgentSetupConfig | undefined;
        try {
          config = JSON.parse(readFileSync(join(subFull, "config.json"), "utf-8"));
        } catch {}
        agentSetups.push({ name: sub, path: subFull, config });
      }
    }
  }

  if (agentSetups.length > 0) return agentSetups;

  // Legacy path: if no agents found under src/agents/, try reading agentsetups.root
  // from config.json. This supports older setups that store agent variants in a
  // separate directory (defined in config.agentsetups.root).
  // If config.agentsetups.root is not defined, we return an empty array 
  //   - this is not an error, since running with only bare/starter conditions (no agent setups) is valid.
  const config = loadGlobalConfig();
  const legacyRootRaw = config.agentsetups?.root;
  if (!legacyRootRaw) return [];

  let legacyRoot = legacyRootRaw;
  if (!legacyRoot.startsWith("/") && !legacyRoot.match(/^[A-Z]:/i)) {
    legacyRoot = resolve(benchRoot, legacyRoot);
  }

  if (!existsSync(legacyRoot)) return [];

  return readdirSync(legacyRoot)
    .filter((d) => {
      const full = join(legacyRoot, d);
      return (
        statSync(full).isDirectory() &&
        (existsSync(join(full, "agents")) || existsSync(join(full, "skills")))
      );
    })
    .map((d) => ({
      name: d,
      path: join(legacyRoot, d),
    }));
}

export function getNextRunName(): string {
  if (!existsSync(resultsRoot)) return "run1";

  const existing = readdirSync(resultsRoot)
    .filter((d) => d.match(/^run(\d+)/))
    .map((d) => parseInt(d.match(/^run(\d+)/)![1]));

  const nextNum =
    existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `run${nextNum}`;
}

function formatTimestamp(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  return `${mm}${dd}${yy}-${HH}${MM}${SS}`;
}

export function loadPrompt(scenarioPath: string): string {
  const result = loadScenario(scenarioPath);
  if (result) return result.prompt;
  // Fallback
  const promptFile = join(scenarioPath, "prompt.md");
  return existsSync(promptFile) ? readFileSync(promptFile, "utf-8") : "";
}

export function loadValidationPrompt(platformHint?: string): string {
  // Route to platform-specific validation prompt
  const variant = platformHint?.toLowerCase().includes("swiftui") ? "swiftui"
    : "winui";
  return readFileSync(join(benchRoot, "common", `validate-${variant}.prompt.md`), "utf-8");
}

export function loadRetrospectivePrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "retrospective.prompt.md"),
    "utf-8"
  );
}

export function loadSummaryPrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "summary.prompt.md"),
    "utf-8"
  );
}

export const AVAILABLE_MODELS = [
  "claude-opus-4.6",
  "claude-sonnet-4.6",
  "claude-sonnet-4.5",
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.1",
];

// =============================================================================
// Matrix Loading
// =============================================================================

export interface RunMatrix {
  scenarios: string[];
  agents: string[];
  models: string[];
  concurrency: number;
  iterations: number;
}

/** Load a benchmark matrix from a run-meta.json or any JSON file with the same shape. */
export function loadRunMatrix(filePath: string): RunMatrix | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    return {
      scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
      agents: Array.isArray(raw.agents) ? raw.agents : [],
      models: Array.isArray(raw.models) ? raw.models : [],
      concurrency: typeof raw.concurrency === "number" ? raw.concurrency : 3,
      iterations: typeof raw.iterations === "number" ? raw.iterations : 1,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Run Discovery & Loading
// =============================================================================

export function discoverRuns(): Array<{ name: string; path: string; date: Date }> {
  if (!existsSync(resultsRoot)) return [];
  return readdirSync(resultsRoot)
    .filter((d) => d.match(/^run\d+/) && statSync(join(resultsRoot, d)).isDirectory())
    .map((d) => ({
      name: d,
      path: join(resultsRoot, d),
      date: statSync(join(resultsRoot, d)).mtime,
    }))
    .sort((a, b) => {
      const aNum = parseInt(a.name.match(/^run(\d+)/)![1]);
      const bNum = parseInt(b.name.match(/^run(\d+)/)![1]);
      return bNum - aNum; // newest first
    });
}

export function loadRunFromDisk(
  runDir: string
): { entries: import("../types.js").RunEntry[]; runName: string } {
  const runName = runDir.split(/[\\/]/).pop() || "unknown";
  const entries: import("../types.js").RunEntry[] = [];

  // Recursively find all results.json files
  function findResults(dir: string): string[] {
    const found: string[] = [];
    if (!existsSync(dir)) return found;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name === "results.json") {
        found.push(full);
      } else if (
        entry.isDirectory() &&
        entry.name !== "app" &&
        entry.name !== "bin" &&
        entry.name !== "obj"
      ) {
        found.push(...findResults(full));
      }
    }
    return found;
  }

  const resultFiles = findResults(runDir);

  for (const file of resultFiles) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf-8"));
      const m = raw.metrics || {};
      const tt = m.time_and_tokens || {};

      // Determine condition type from condition name
      const condBase = (raw.condition || "").replace(/\s*\[\d+\/\d+\]$/, "");

      // Extract token info from first model
      let inputTokens: string | undefined;
      let outputTokens: string | undefined;
      let cachedTokens: string | undefined;
      if (tt.models) {
        const firstModel = Object.keys(tt.models)[0];
        if (firstModel) {
          inputTokens = tt.models[firstModel].input;
          outputTokens = tt.models[firstModel].output;
          cachedTokens = tt.models[firstModel].cached;
        }
      }

      // Determine scenario path (best effort — check flat and nested group folders)
      const scenarioName = raw.scenario || "";
      const scenarioPath = resolveScenarioPath(scenarioName);

      // Determine status from metrics
      let status: import("../types.js").RunStatus = "done";
      if (m.timeout) status = "timeout";
      else if (m.score === 0 && !m.builds) status = "failed";
      else if (m.score !== undefined) status = "done";

      // Find pluginPath from agent name
      let pluginPath = "";
      const agentName = condBase.replace(/^agentsetup-/, "");
      const agentSetups = discoverAgentSetups();
      const match = agentSetups.find((c) => c.name === agentName);
      if (match) pluginPath = match.path;

      const entry: import("../types.js").RunEntry = {
        id: `${scenarioName}/${raw.trial || "unknown"}`,
        scenario: scenarioName,
        scenarioPath,
        scenarioConfigName: scenarioName,
        condition: raw.condition || condBase,
        pluginPath,
        model: raw.model || "unknown",
        trialName: raw.trial || "unknown",
        iteration: raw.iteration,
        status,
        score: m.score,
        builds: m.builds,
        runs: m.runs,
        sessionTime: tt.session_time,
        apiTime: tt.api_time,
        codeChanges: tt.code_changes,
        inputTokens,
        outputTokens,
        cachedTokens,
        failReason: m.score === 0 ? (m.timeout ? "Timeout" : !m.builds ? "Build failed" : !m.runs ? "App failed to run" : undefined) : undefined,
        currentOutput: "",
        startedAt: raw.timestamp ? new Date(raw.timestamp) : undefined,
        finishedAt: raw.timestamp ? new Date(raw.timestamp) : undefined,
        buildSessionId: raw.session_ids?.build,
        validationSessionId: raw.session_ids?.validation,
      };

      entries.push(entry);
    } catch {
      // Skip unparseable results
    }
  }

  return { entries, runName };
}

// =============================================================================
// Script Resolution (Feature: Agent Setup Scripts)
// =============================================================================

export const scriptsDir = join(repoRoot, "src", "scripts");

/**
 * Resolve the entry-point script file for a script subfolder under src/scripts/.
 * On Windows, looks for .ps1 files; on macOS/Linux, looks for .sh files (then .ps1 as fallback).
 * Returns the absolute path to the entry-point script.
 * Throws with a descriptive message if the script cannot be resolved.
 */
export function resolveScriptEntryPoint(scriptName: string): string {
  const scriptFolder = join(scriptsDir, scriptName);
  if (!existsSync(scriptFolder) || !statSync(scriptFolder).isDirectory()) {
    throw new Error(`Setup script folder not found: src/scripts/${scriptName}`);
  }

  const isWin = platform() === "win32";
  const primaryExt = isWin ? ".ps1" : ".sh";
  const fallbackExt = isWin ? ".sh" : ".ps1";

  let scriptFiles = readdirSync(scriptFolder).filter(
    (f) => f.endsWith(primaryExt) && statSync(join(scriptFolder, f)).isFile()
  );

  // Fallback to other extension if no primary scripts found
  if (scriptFiles.length === 0) {
    scriptFiles = readdirSync(scriptFolder).filter(
      (f) => f.endsWith(fallbackExt) && statSync(join(scriptFolder, f)).isFile()
    );
  }

  if (scriptFiles.length === 0) {
    throw new Error(
      `No ${primaryExt} or ${fallbackExt} file found in src/scripts/${scriptName}/`
    );
  }

  if (scriptFiles.length === 1) {
    return join(scriptFolder, scriptFiles[0]);
  }

  // Multiple script files - look for well-known names
  const wellKnownBases = ["action", "setup", "run"];
  for (const base of wellKnownBases) {
    for (const ext of [primaryExt, fallbackExt]) {
      const candidate = `${base}${ext}`;
      if (scriptFiles.includes(candidate)) {
        return join(scriptFolder, candidate);
      }
    }
  }

  throw new Error(
    `Multiple script files in src/scripts/${scriptName}/ and none named action/setup/run${primaryExt}`
  );
}

/**
 * Validate all script references for an agent setup config.
 * Returns resolved entries with absolute paths and timeouts.
 * Throws on first invalid reference.
 */
export function validateAgentSetupScripts(
  agentSetupName: string,
  scripts: ScriptEntry[]
): Array<{ name: string; entryPoint: string; timeoutMinutes: number; scriptDir: string }> {
  return scripts.map((entry) => {
    const name = typeof entry === "string" ? entry : entry.name;
    const timeoutMinutes =
      typeof entry === "object" && entry.timeout_minutes
        ? entry.timeout_minutes
        : 5;
    const entryPoint = resolveScriptEntryPoint(name);
    return {
      name,
      entryPoint,
      timeoutMinutes,
      scriptDir: join(scriptsDir, name),
    };
  });
}
