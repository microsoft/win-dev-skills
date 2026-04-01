import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  GlobalConfig,
  ScenarioConfig,
  CandidateInfo,
  ScriptEntry,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const benchRoot = resolve(__dirname, "..", "..", "..");
export const repoRoot = resolve(benchRoot, "..");
export const resultsRoot = join(benchRoot, "results");
export const scenariosDir = join(benchRoot, "scenarios");

export function loadGlobalConfig(): GlobalConfig {
  const configPath = join(benchRoot, "common", "config.json");
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

export function discoverScenarios(): Array<{
  name: string;
  path: string;
  config: ScenarioConfig;
}> {
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir)
    .filter((d) => {
      const p = join(scenariosDir, d, "scenario.json");
      return existsSync(p);
    })
    .map((d) => ({
      name: d,
      path: join(scenariosDir, d),
      config: JSON.parse(
        readFileSync(join(scenariosDir, d, "scenario.json"), "utf-8")
      ),
    }));
}

export function discoverCandidates(): CandidateInfo[] {
  // Primary: look in src/agents/ (new structure)
  const srcAgentsDir = join(repoRoot, "src", "agents");
  if (existsSync(srcAgentsDir)) {
    return readdirSync(srcAgentsDir)
      .filter((d) => {
        const full = join(srcAgentsDir, d);
        return (
          statSync(full).isDirectory() &&
          existsSync(join(full, "config.json"))
        );
      })
      .map((d) => {
        let config: import("../types.js").CandidateConfig | undefined;
        try {
          config = JSON.parse(
            readFileSync(join(srcAgentsDir, d, "config.json"), "utf-8")
          );
        } catch {}
        return {
          name: d,
          path: join(srcAgentsDir, d),
          config,
        };
      });
  }

  // Fallback: old plugin-candidates/ structure
  const config = loadGlobalConfig();
  let candidatesRoot = config.candidates?.root || "../plugin-candidates";

  if (!candidatesRoot.startsWith("/") && !candidatesRoot.match(/^[A-Z]:/i)) {
    candidatesRoot = resolve(benchRoot, candidatesRoot);
  }

  if (!existsSync(candidatesRoot)) {
    candidatesRoot = join(repoRoot, "plugin-candidates");
  }

  if (!existsSync(candidatesRoot)) return [];

  return readdirSync(candidatesRoot)
    .filter((d) => {
      const full = join(candidatesRoot, d);
      return (
        statSync(full).isDirectory() &&
        (existsSync(join(full, "agents")) || existsSync(join(full, "skills")))
      );
    })
    .map((d) => ({
      name: d,
      path: join(candidatesRoot, d),
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
  return readFileSync(join(scenarioPath, "prompt.md"), "utf-8");
}

export function loadValidationPrompt(): string {
  return readFileSync(
    join(benchRoot, "common", "validate.prompt.md"),
    "utf-8"
  );
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

export const AVAILABLE_MODELS = ["claude-opus-4.6", "claude-sonnet-4.5"];

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
      let conditionType: "bare" | "starter" | "candidate" = "candidate";
      const condBase = (raw.condition || "").replace(/\s*\[\d+\/\d+\]$/, "");
      if (condBase === "bare") conditionType = "bare";
      else if (condBase === "starter") conditionType = "starter";

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

      // Determine scenario path (best effort)
      const scenarioName = raw.scenario || "";
      const scenarioPath = existsSync(join(scenariosDir, scenarioName))
        ? join(scenariosDir, scenarioName)
        : "";

      // Determine status from metrics
      let status: import("../types.js").RunStatus = "done";
      if (m.timeout) status = "timeout";
      else if (m.score === 0 && !m.builds) status = "failed";
      else if (m.score !== undefined) status = "done";

      // Find pluginPath from candidate name
      let pluginPath: string | undefined;
      if (conditionType === "candidate") {
        const candName = condBase.replace(/^candidate-/, "");
        const candidates = discoverCandidates();
        const match = candidates.find((c) => c.name === candName);
        if (match) pluginPath = match.path;
      }

      const entry: import("../types.js").RunEntry = {
        id: `${scenarioName}/${raw.trial || "unknown"}`,
        scenario: scenarioName,
        scenarioPath,
        scenarioConfigName: scenarioName,
        condition: raw.condition || condBase,
        conditionType,
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
// Script Resolution (Feature: Candidate Setup Scripts)
// =============================================================================

export const scriptsDir = join(repoRoot, "src", "scripts");

/**
 * Resolve the entry-point .ps1 file for a script subfolder under src/scripts/.
 * Returns the absolute path to the entry-point script.
 * Throws with a descriptive message if the script cannot be resolved.
 */
export function resolveScriptEntryPoint(scriptName: string): string {
  const scriptFolder = join(scriptsDir, scriptName);
  if (!existsSync(scriptFolder) || !statSync(scriptFolder).isDirectory()) {
    throw new Error(`Setup script folder not found: src/scripts/${scriptName}`);
  }

  const ps1Files = readdirSync(scriptFolder).filter(
    (f) => f.endsWith(".ps1") && statSync(join(scriptFolder, f)).isFile()
  );

  if (ps1Files.length === 0) {
    throw new Error(
      `No .ps1 file found in src/scripts/${scriptName}/`
    );
  }

  if (ps1Files.length === 1) {
    return join(scriptFolder, ps1Files[0]);
  }

  // Multiple .ps1 files — look for well-known names
  for (const candidate of ["action.ps1", "setup.ps1", "run.ps1"]) {
    if (ps1Files.includes(candidate)) {
      return join(scriptFolder, candidate);
    }
  }

  throw new Error(
    `Multiple .ps1 files in src/scripts/${scriptName}/ and none named action.ps1, setup.ps1, or run.ps1`
  );
}

/**
 * Validate all script references for a candidate config.
 * Returns resolved entries with absolute paths and timeouts.
 * Throws on first invalid reference.
 */
export function validateCandidateScripts(
  candidateName: string,
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
