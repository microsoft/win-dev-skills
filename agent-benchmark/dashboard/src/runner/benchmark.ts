import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  statSync,
} from "fs";
import { join, resolve } from "path";
import {
  benchRoot,
  repoRoot,
  loadGlobalConfig,
  loadPrompt,
  loadScenario,
  loadValidationPrompt,
  loadRetrospectivePrompt,
  loadSummaryPrompt,
} from "./config.js";
import type { RunEntry, ScenarioConfig, CandidateConfig } from "../types.js";
import { parse as parseYaml } from "yaml";

// Parse YAML frontmatter from a section .md file
function parseSectionDeps(sectionFile: string): { skills?: string[]; inline_skills?: string[]; mcp?: string[] } {
  if (!existsSync(sectionFile)) return {};
  const raw = readFileSync(sectionFile, "utf-8").replace(/\r\n/g, "\n");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  try { return parseYaml(fmMatch[1]) || {}; } catch { return {}; }
}

export interface BenchmarkCallbacks {
  onOutput: (data: string) => void;
  onStatusChange: (entry: RunEntry) => void;
}

interface ProcessResult {
  exitCode: number;
  output: string;
  timedOut?: boolean;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  onOutput: (data: string) => void,
  timeoutMs?: number,
  useShell = true
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, shell: useShell, stdio: "pipe" });
    let output = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let resolved = false;
    let completionDetected = false;

    // Silence detection: if process produced substantial output but goes
    // quiet for 120s, assume it's stuck (e.g. copilot finished but winapp
    // run child keeps process tree alive without printing "Total session time:")
    // 120s is long enough for builds (MSBuild can take 30-60s) to complete.
    const SILENCE_THRESHOLD_MS = 300_000;
    const MIN_OUTPUT_FOR_SILENCE = 10_000; // 10KB — enough to know copilot actually ran
    let silenceTimer: NodeJS.Timeout | undefined;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (output.length >= MIN_OUTPUT_FOR_SILENCE) {
        silenceTimer = setTimeout(() => {
          if (!resolved && !completionDetected && proc.pid) {
            onOutput("\n⚠️  Output silent for 5 minutes — force killing stuck process\n");
            spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
          }
        }, SILENCE_THRESHOLD_MS);
      }
    };

    // Close stdin so the process knows no input is coming
    proc.stdin?.end();

    const finish = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (silenceTimer) clearTimeout(silenceTimer);
      resolve({ exitCode: code ?? 1, output, timedOut });
    };

    const forceKillAfterDelay = (delayMs: number) => {
      if (completionDetected) return; // already scheduled a kill
      completionDetected = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      setTimeout(() => {
        if (!resolved && proc.pid) {
          spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
        }
      }, delayMs);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        if (proc.pid) {
          spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
        } else {
          proc.kill();
        }
      }, timeoutMs);
    }

    const checkCompletion = () => {
      // Detect copilot completion via multiple patterns — copilot is done
      // but may be stuck because winapp run keeps the process tree alive
      if (!completionDetected && !resolved) {
        if (
          output.includes("Total session time:") ||
          output.includes("Total usage est:") ||
          output.includes("Reached maximum number of auto")
        ) {
          forceKillAfterDelay(5000);
        }
      }
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput(text);
      resetSilenceTimer();
      checkCompletion();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput(text);
      resetSilenceTimer();
      checkCompletion();
    });
    proc.on("close", (code) => finish(code));
    proc.on("exit", (code) => finish(code));
    proc.on("error", () => finish(1));
  });
}

/**
 * Run copilot with --output-format json and parse the JSONL stream.
 * Shows reasoning/thinking as dimmed text alongside normal tool/message output.
 * Falls back gracefully for any unparseable lines.
 */
function runCopilotProcess(
  args: string[],
  cwd: string,
  onOutput: (data: string) => void,
  timeoutMs?: number,
): Promise<ProcessResult> {
  const jsonArgs = [...args, "--output-format", "json"];
  let rawOutput = "";
  let inReasoning = false;
  let lineBuffer = "";

  const processJsonLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      const type: string = event.type || "";
      const data = event.data || {};

      switch (type) {
        case "assistant.reasoning_delta": {
          if (!inReasoning) {
            inReasoning = true;
            onOutput("\x1b[2m💭 ");
          }
          onOutput((data.deltaContent || "").replace(/\n/g, " "));
          break;
        }
        case "assistant.reasoning": {
          if (inReasoning) { onOutput("\x1b[0m\n"); inReasoning = false; }
          break;
        }
        case "assistant.message_delta": {
          if (inReasoning) { onOutput("\x1b[0m\n"); inReasoning = false; }
          onOutput(data.content || "");
          break;
        }
        case "assistant.message": {
          if (inReasoning) { onOutput("\x1b[0m\n"); inReasoning = false; }
          break;
        }
        case "tool.execution_start": {
          if (inReasoning) { onOutput("\x1b[0m\n"); inReasoning = false; }
          const name = data.toolName || "tool";
          const summary = data.intentionSummary || Object.values(data.arguments || {}).map((v: unknown) => String(v).substring(0, 60)).join(", ");
          onOutput(`● ${name}${summary ? ` — ${summary.substring(0, 120)}` : ""}\n`);
          break;
        }
        case "tool.execution_complete": {
          const result = data.result?.content || "";
          const lines = typeof result === "string" ? result.split("\n") : [];
          const preview = lines.length > 0 ? lines[0].substring(0, 120) : "";
          const suffix = lines.length > 1 ? ` (${lines.length} lines)` : "";
          if (preview) onOutput(`  └ ${preview}${suffix}\n`);
          break;
        }
        case "result": {
          // Session end — show usage info
          if (data.content) onOutput(data.content + "\n");
          break;
        }
        // Ignore ephemeral/status events silently
      }
    } catch {
      // Not valid JSON — pass through as-is
      onOutput(line + "\n");
    }
  };

  return new Promise((resolve) => {
    const proc = spawn("copilot", jsonArgs, { cwd, shell: false, stdio: "pipe" });
    let rawOutput = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let resolved = false;
    let completionDetected = false;

    const SILENCE_THRESHOLD_MS = 300_000;
    const MIN_OUTPUT_FOR_SILENCE = 5_000;
    let silenceTimer: NodeJS.Timeout | undefined;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (rawOutput.length >= MIN_OUTPUT_FOR_SILENCE) {
        silenceTimer = setTimeout(() => {
          if (!resolved && !completionDetected && proc.pid) {
            onOutput("\n⚠️  Output silent for 5 minutes — force killing stuck process\n");
            spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
          }
        }, SILENCE_THRESHOLD_MS);
      }
    };

    proc.stdin?.end();

    const finish = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (inReasoning) onOutput("\x1b[0m\n");
      resolve({ exitCode: code ?? 1, output: rawOutput, timedOut });
    };

    const forceKillAfterDelay = (delayMs: number) => {
      if (completionDetected) return;
      completionDetected = true;
      if (silenceTimer) clearTimeout(silenceTimer);
      setTimeout(() => {
        if (!resolved && proc.pid) {
          spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
        }
      }, delayMs);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        if (proc.pid) {
          spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { shell: true });
        } else {
          proc.kill();
        }
      }, timeoutMs);
    }

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      lineBuffer += text;
      resetSilenceTimer();

      // Process complete JSONL lines
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || ""; // keep incomplete last line
      for (const line of lines) {
        processJsonLine(line);
      }

      // Check for session completion
      if (rawOutput.includes('"type":"result"') || rawOutput.includes("Total session time:")) {
        forceKillAfterDelay(5000);
      }
    };

    proc.stdout?.on("data", handleData);
    proc.stderr?.on("data", handleData);
    proc.on("close", (code) => finish(code));
    proc.on("exit", (code) => finish(code));
    proc.on("error", () => finish(1));
  });
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function flattenSkills(skillsSrc: string, targetSkillsDir: string): number {
  let count = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (existsSync(join(full, "SKILL.md"))) {
          copyDirRecursive(full, join(targetSkillsDir, entry.name));
          count++;
        } else {
          walk(full);
        }
      }
    }
  }
  walk(skillsSrc);
  return count;
}

function parseUsage(output: string) {
  const usage: Record<string, any> = {};
  let m;
  m = output.match(/Total usage est:\s+(\d+)\s+Premium/);
  if (m) usage.premium_requests = parseInt(m[1]);
  m = output.match(/API time spent:\s+(.+?)[\r\n]/);
  if (m) usage.api_time = m[1].trim();
  m = output.match(/Total session time:\s+(.+?)[\r\n]/);
  if (m) usage.session_time = m[1].trim();
  m = output.match(/Total code changes:\s+(.+?)[\r\n]/);
  if (m) usage.code_changes = m[1].trim();

  const modelMatches = [
    ...output.matchAll(
      /(\S+)\s+(\d+\.?\d*[mk]?) in, (\d+\.?\d*[mk]?) out, (\d+\.?\d*[mk]?) cached/g
    ),
  ];
  usage.models = {};
  for (const mm of modelMatches) {
    usage.models[mm[1]] = {
      input: mm[2],
      output: mm[3],
      cached: mm[4],
    };
  }
  return usage;
}

function parseValidationJson(output: string): any | null {
  // Try ```json block first — handles nested objects like requirements: {"1": {...}}
  const jsonBlockMatch = output.match(/```json\s*([\s\S]+?)\s*```/);
  if (jsonBlockMatch) {
    // Extract the outermost {} from the block
    const block = jsonBlockMatch[1].trim();
    const firstBrace = block.indexOf("{");
    if (firstBrace >= 0) {
      // Find matching closing brace by counting
      let depth = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < block.length; i++) {
        if (block[i] === "{") depth++;
        else if (block[i] === "}") {
          depth--;
          if (depth === 0) { lastBrace = i; break; }
        }
      }
      if (lastBrace > firstBrace) {
        try {
          return JSON.parse(block.substring(firstBrace, lastBrace + 1));
        } catch { /* fall through */ }
      }
    }
  }
  // Fallback: find any JSON object with project_score or ui_score (flat objects only)
  let m = output.match(/(\{[^{}]*"project_score"[^}]*\})/s);
  if (!m) m = output.match(/(\{[^{}]*"ui_score"[^}]*\})/s);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  }
  return null;
}

interface StructuredReqResult {
  id: number;
  text: string;
  status: "pass" | "fail";
  reason: string;
}

/**
 * Extract structured requirement results from validation JSON.
 * Handles both new format (requirements: {"1": {status, reason}})
 * and old format (requirements_passed: [...], requirements_failed: [...]).
 */
function extractRequirementResults(
  validation: Record<string, any>,
  scenarioRequirements: string[]
): StructuredReqResult[] {
  const results: StructuredReqResult[] = [];

  // New format: requirements object keyed by number
  if (validation.requirements && typeof validation.requirements === "object" && !Array.isArray(validation.requirements)) {
    for (const [key, val] of Object.entries(validation.requirements)) {
      const id = parseInt(key, 10);
      if (isNaN(id)) continue;
      const v = val as Record<string, any>;
      const status = v.status === "pass" ? "pass" : "fail";
      const reason = v.reason || "";
      const text = (id >= 1 && id <= scenarioRequirements.length)
        ? scenarioRequirements[id - 1]
        : `Requirement ${id}`;
      results.push({ id, text, status, reason });
    }
  }
  // Old format: requirements_passed / requirements_failed arrays
  else {
    const passed: string[] = Array.isArray(validation.requirements_passed) ? validation.requirements_passed : [];
    const failed: string[] = Array.isArray(validation.requirements_failed) ? validation.requirements_failed : [];

    // Try to match each to a scenario requirement by number prefix
    const seen = new Set<number>();
    for (const r of passed) {
      const m = r.match(/^(\d+)\.\s*/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (id > 0 && !seen.has(id)) {
        seen.add(id);
        const text = (id >= 1 && id <= scenarioRequirements.length)
          ? scenarioRequirements[id - 1]
          : r.replace(/^\d+\.\s*/, "").trim();
        results.push({ id, text, status: "pass", reason: "" });
      }
    }
    for (const r of failed) {
      const m = r.match(/^(\d+)\.\s*/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (id > 0 && !seen.has(id)) {
        seen.add(id);
        const text = (id >= 1 && id <= scenarioRequirements.length)
          ? scenarioRequirements[id - 1]
          : r.replace(/^\d+\.\s*/, "").split(/:\s*/)[0].trim();
        const reason = r.replace(/^\d+\.\s*/, "").trim();
        results.push({ id, text, status: "fail", reason });
      }
    }
    // Handle unnumbered requirements (assign sequential IDs not yet seen)
    let nextId = 1;
    for (const r of [...passed, ...failed]) {
      if (/^\d+\.\s*/.test(r)) continue;
      while (seen.has(nextId)) nextId++;
      seen.add(nextId);
      const isPassed = passed.includes(r);
      const text = (nextId >= 1 && nextId <= scenarioRequirements.length)
        ? scenarioRequirements[nextId - 1]
        : r.split(/:\s*/)[0].trim();
      results.push({ id: nextId, text, status: isPassed ? "pass" : "fail", reason: isPassed ? "" : r });
      nextId++;
    }
  }

  return results.sort((a, b) => a.id - b.id);
}

/** Count passed/failed from structured results */
function countReqResults(results: StructuredReqResult[]): { passed: number; failed: number; total: number } {
  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  return { passed, failed, total: passed + failed };
}

export async function runBenchmark(
  entry: RunEntry,
  runDir: string,
  opts: { maxBuildMinutes: number; maxContinues: number },
  callbacks: BenchmarkCallbacks
): Promise<void> {
  const globalConfig = loadGlobalConfig();
  const scenarioResult = loadScenario(entry.scenarioPath);
  const scenarioConfig: ScenarioConfig = scenarioResult?.config || { name: entry.scenarioConfigName, description: "", type: "new" };
  const baseAppName = scenarioConfig.app_name || scenarioConfig.name;
  // Unique app name per run to avoid MSIX registration conflicts in parallel runs
  const runIndex = entry.iteration || 1;
  const condShort = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "").replace(/^candidate-/, "");
  const appName = `${baseAppName}${condShort}${runIndex}`;
  // Flat trial folder directly under runDir (short paths avoid MAX_PATH issues)
  const trialDir = join(runDir, entry.trialName);
  const workDir = join(trialDir, "app");
  mkdirSync(workDir, { recursive: true });

  const setStatus = (status: RunEntry["status"]) => {
    entry.status = status;
    callbacks.onStatusChange(entry);
  };

  const log = (msg: string) => callbacks.onOutput(msg + "\n");

  const banner = (stage: string, icon: string, color: "cyan" | "yellow" | "green" | "magenta" | "red" = "cyan") => {
    const colors: Record<string, string> = {
      cyan: "\x1b[36m",
      yellow: "\x1b[33m",
      green: "\x1b[32m",
      magenta: "\x1b[35m",
      red: "\x1b[31m",
    };
    const c = colors[color] || "";
    const reset = "\x1b[0m";
    callbacks.onOutput(`\n${c}${"━".repeat(60)}${reset}\n`);
    callbacks.onOutput(`${c}  ${icon}  ${stage}${reset}\n`);
    callbacks.onOutput(`${c}${"━".repeat(60)}${reset}\n\n`);
  };

  const cleanupApps = async () => {
    try {
      await runProcess("taskkill", ["/IM", `${appName}.exe`, "/F"], workDir, () => {}, 5000);
    } catch {}
    try {
      await runProcess("taskkill", ["/IM", "winapp.exe", "/F"], workDir, () => {}, 5000);
    } catch {}
    if (entry.conditionType === "electron") {
      try {
        await runProcess("taskkill", ["/IM", "electron.exe", "/F"], workDir, () => {}, 5000);
      } catch {}
    }
  };

  // ─── SETUP ───
  entry.startedAt = new Date();
  setStatus("setup");
  banner(`SETUP: ${entry.condition} / ${entry.model}`, "🔧", "cyan");

  // Kill any stale instances from previous runs to avoid launch collisions
  await cleanupApps();

  // Init git
  await runProcess("git", ["init", "--quiet"], workDir, () => {});

  // Condition-specific setup
  let agentFlag = false;
  let promptAddendum = "";
  let mcpConfigPath: string | undefined;

  if (entry.conditionType === "electron") {
    // Electron: no scaffold, just set the prompt to build an Electron app
    promptAddendum = `IMPORTANT: Build this as an **Electron** desktop app (not WinUI 3). Use HTML, CSS, and JavaScript/TypeScript. Use npm for package management. The app should look and feel like a native Windows application. Create the project in: ${workDir}`;
  } else if (entry.conditionType === "starter") {
    const cmd =
      globalConfig.conditions.starter?.template_command ||
      `dotnet new winui -n ${appName} --output "${workDir}"`;
    const expandedCmd = cmd
      .replace(/\{app_name\}/g, appName)
      .replace(/\{app_dir\}/g, workDir);
    log(`  Scaffolding: ${expandedCmd}`);
    await runProcess(expandedCmd, [], workDir, () => {});
    promptAddendum = (
      globalConfig.conditions.starter?.prompt_addendum || ""
    )
      .replace(/\{app_name\}/g, appName)
      .replace(/\{app_dir\}/g, workDir);
  } else if (entry.conditionType === "candidate" && entry.pluginPath) {
    // Read candidate config early to check for custom scaffold/build/launch
    const configPath = join(entry.pluginPath, "config.json");
    let candidateConfig: CandidateConfig | undefined;
    if (existsSync(configPath)) {
      try { candidateConfig = JSON.parse(readFileSync(configPath, "utf-8")); } catch {}
    }

    // Scaffold — use custom scaffold_command if provided
    const defaultScaffold = globalConfig.conditions.candidate?.template_command ||
      `dotnet new winui -n ${appName} --output "${workDir}"`;
    const templateCmd = (candidateConfig?.scaffold_command || defaultScaffold)
      .replace(/\{app_name\}/g, appName)
      .replace(/\{app_dir\}/g, workDir);
    // Custom scaffold tools may fail if dir already exists — remove it first
    if (candidateConfig?.scaffold_command && existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true });
    }
    log(`  Scaffolding: ${templateCmd}`);
    await runProcess(templateCmd, [], trialDir, () => {});
    // Ensure workDir exists after scaffold (some tools create it, some don't)
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

    // Strip template instructions
    const agentsMd = join(workDir, "AGENTS.md");
    const ghDir = join(workDir, ".github");
    if (existsSync(agentsMd)) rmSync(agentsMd);
    if (existsSync(ghDir)) rmSync(ghDir, { recursive: true, force: true });
    log("  Stripped template agent instructions");

    // Install candidate — try new src/ config-based approach first
    const targetGh = join(workDir, ".github");
    mkdirSync(join(targetGh, "skills"), { recursive: true });
    mkdirSync(join(targetGh, "agents"), { recursive: true });

    const configPathForInstall = join(entry.pluginPath, "config.json");
    if (existsSync(configPathForInstall) && candidateConfig) {
      // New src/ structure: agent.md + config.json → resolve skills from src/skills/ and src/.local/skills/
      const srcSkillsDirs = [join(repoRoot, "src", "skills"), join(repoRoot, "src", ".local", "skills")];
      const srcMcpDir = join(repoRoot, "src", "mcp");

      // Copy or assemble agent file
      const agentFile = join(entry.pluginPath, "winui3.agent.md");
      // Support custom sections_root for .local agents
      const sectionsRoot = (candidateConfig as any).sections_root
        ? join(repoRoot, (candidateConfig as any).sections_root)
        : join(repoRoot, "src", "agents", "_sections");
      const sectionsDir = sectionsRoot;
      if ((candidateConfig as any).sections && existsSync(sectionsDir)) {
        // Slot-based assembly: base.md has {{slot_name}} placeholders
        // Each section in config fills its matching slot; unfilled slots are removed
        const sections: string[] = (candidateConfig as any).sections;
        const baseFile = join(sectionsDir, "base.md");
        const baseRaw = existsSync(baseFile) ? readFileSync(baseFile, "utf-8") : "";
        // Extract agent name and frontmatter from base
        const nameMatch = baseRaw.match(/^---\s*\n[\s\S]*?name:\s*(\S+)[\s\S]*?\n---/);
        const agentName = nameMatch ? nameMatch[1] : "winui3";
        const fmMatch = baseRaw.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
        const frontmatter = fmMatch ? fmMatch[1] : "";
        let template = baseRaw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

        // Fill slots with matching section content (strip frontmatter from each)
        for (const section of sections) {
          if (section === "base") continue;
          const sectionFile = join(sectionsDir, `${section}.md`);
          if (existsSync(sectionFile)) {
            const content = readFileSync(sectionFile, "utf-8")
              .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").trim();
            template = template.replace(`{{${section}}}`, content);
          }
        }

        // Remove any unfilled slots
        template = template.replace(/\{\{[a-z_-]+\}\}\n?/g, "");

        // Inline skill content into agent.md if configured
        if ((candidateConfig as any).inline_skills) {
          let inlinedSkills: string[] = [];
          for (const section of sections) {
            const deps2 = parseSectionDeps(join(sectionsDir, `${section}.md`));
            const toInline = deps2.inline_skills || [];
            for (const skill of toInline) {
              if (inlinedSkills.includes(skill)) continue;
              // Search both src/skills/ and src/.local/skills/
              let skillMd: string | null = null;
              for (const dir of srcSkillsDirs) {
                const candidate = join(dir, skill, "SKILL.md");
                if (existsSync(candidate)) { skillMd = candidate; break; }
              }
              if (skillMd) {
                const skillContent = readFileSync(skillMd, "utf-8")
                  .replace(/^---[\s\S]*?---\s*/m, ""); // strip YAML frontmatter
                template += "\n\n" + skillContent.trim() + "\n";
                inlinedSkills.push(skill);
              }
            }
          }
          if (inlinedSkills.length > 0) {
            log(`  Inlined ${inlinedSkills.length} skill(s): ${inlinedSkills.join(", ")}`);
          }
        }

        writeFileSync(join(targetGh, "agents", `${agentName}.agent.md`), frontmatter + template);
        log(`  Assembled ${agentName} agent with slots: ${sections.filter(s => s !== "base").join("+") || "(base only)"}`);

        // Set agent flag with correct name
        agentFlag = true;
        (entry as any)._agentName = agentName;
        // Auto-resolve section dependencies (skills + mcp from section frontmatter)
        for (const section of sections) {
          const deps = parseSectionDeps(join(sectionsDir, `${section}.md`));
          if (deps.skills) {
            if (!candidateConfig.skills.include) candidateConfig.skills.include = [];
            for (const s of deps.skills) {
              if (!candidateConfig.skills.include.includes(s)) {
                candidateConfig.skills.include.push(s);
              }
            }
          }
          if (deps.inline_skills) {
            if (!candidateConfig.skills.include) candidateConfig.skills.include = [];
            for (const s of deps.inline_skills) {
              if (!candidateConfig.skills.include.includes(s)) {
                candidateConfig.skills.include.push(s);
              }
            }
          }
          if (deps.mcp) {
            if (!candidateConfig.mcp) candidateConfig.mcp = {};
            if (!candidateConfig.mcp.include) candidateConfig.mcp.include = [];
            for (const m of deps.mcp) {
              if (!candidateConfig.mcp.include.includes(m)) {
                candidateConfig.mcp.include.push(m);
              }
            }
          }
        }
      } else if (existsSync(agentFile)) {
        copyFileSync(agentFile, join(targetGh, "agents", "winui3.agent.md"));
      }

      // Resolve skills list — search both src/skills/ and src/.local/skills/
      const findAllSkills = () => {
        const found = new Set<string>();
        for (const dir of srcSkillsDirs) {
          if (existsSync(dir)) {
            for (const d of readdirSync(dir)) {
              if (statSync(join(dir, d)).isDirectory()) found.add(d);
            }
          }
        }
        return Array.from(found);
      };
      const findSkillPath = (name: string): string | null => {
        for (const dir of srcSkillsDirs) {
          const p = join(dir, name);
          if (existsSync(p)) return p;
        }
        return null;
      };

      let skillsToInstall: string[];
      if (candidateConfig.skills.include) {
        skillsToInstall = candidateConfig.skills.include;
      } else if (candidateConfig.skills.exclude) {
        skillsToInstall = findAllSkills().filter(d => !candidateConfig.skills.exclude!.includes(d));
      } else {
        skillsToInstall = findAllSkills();
      }

      // Copy selected skills
      let skillCount = 0;
      for (const skill of skillsToInstall) {
        const skillSrc = findSkillPath(skill);
        if (skillSrc) {
          copyDirRecursive(skillSrc, join(targetGh, "skills", skill));
          skillCount++;
        }
      }
      log(`  Installed ${skillCount} skills`);

      // Resolve MCP servers
      if (candidateConfig.mcp && (candidateConfig.mcp.include || candidateConfig.mcp.exclude || candidateConfig.mcp.all)) {
        let mcpServers: string[];
        if (candidateConfig.mcp.include) {
          mcpServers = candidateConfig.mcp.include;
        } else if (candidateConfig.mcp.exclude) {
          mcpServers = existsSync(srcMcpDir)
            ? readdirSync(srcMcpDir)
                .filter(f => f.endsWith(".json"))
                .map(f => f.replace(".json", ""))
                .filter(n => !candidateConfig.mcp.exclude!.includes(n))
            : [];
        } else {
          mcpServers = existsSync(srcMcpDir)
            ? readdirSync(srcMcpDir).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""))
            : [];
        }

        if (mcpServers.length > 0) {
          const mergedMcp: Record<string, any> = {};
          for (const server of mcpServers) {
            const mcpFile = join(srcMcpDir, `${server}.json`);
            if (existsSync(mcpFile)) {
              const content = JSON.parse(readFileSync(mcpFile, "utf-8"));
              // Merge server definitions
              if (content.mcpServers) {
                Object.assign(mergedMcp, content.mcpServers);
              } else {
                Object.assign(mergedMcp, content);
              }
            }
          }
          if (Object.keys(mergedMcp).length > 0) {
            const copilotDir = join(workDir, ".copilot");
            mkdirSync(copilotDir, { recursive: true });
            mcpConfigPath = join(copilotDir, "mcp-config.json");
            writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: mergedMcp }, null, 2));
            log(`  Installed ${mcpServers.length} MCP server(s)`);
          }
        }
      }
    } else {
      // Old plugin-candidates/ structure: agents/ + skills/ folders
      const candidateAgents = join(entry.pluginPath, "agents");
      if (existsSync(candidateAgents)) {
        for (const f of readdirSync(candidateAgents)) {
          if (f.endsWith(".agent.md")) {
            copyFileSync(
              join(candidateAgents, f),
              join(targetGh, "agents", f)
            );
          }
        }
      }

      const candidateSkills = join(entry.pluginPath, "skills");
      if (existsSync(candidateSkills)) {
        const count = flattenSkills(candidateSkills, join(targetGh, "skills"));
        log(`  Installed ${count} skills from candidate`);
      }

      // Install MCP config
      const mcpJson = join(entry.pluginPath, ".mcp.json");
      if (existsSync(mcpJson)) {
        const mcpContent = JSON.parse(readFileSync(mcpJson, "utf-8"));
        const mcpConfig = mcpContent.mcpServers ? mcpContent : { mcpServers: mcpContent };
        const copilotDir = join(workDir, ".copilot");
        mkdirSync(copilotDir, { recursive: true });
        mcpConfigPath = join(copilotDir, "mcp-config.json");
        writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
        log("  Installed MCP config at .copilot/mcp-config.json");
      }
    }

    // Copy build.ps1 if present in installed skills
    const buildScript = join(targetGh, "skills", "winui3-dev-workflow", "build.ps1");
    if (existsSync(buildScript)) {
      log("  build.ps1 available in winui3-dev-workflow skill");
    }

    // Use candidate's prompt_addendum if specified, otherwise default WinUI message
    if (candidateConfig?.prompt_addendum) {
      promptAddendum = candidateConfig.prompt_addendum
        .replace(/\{app_name\}/g, appName)
        .replace(/\{app_dir\}/g, workDir);
    } else {
      promptAddendum = `IMPORTANT: A WinUI 3 project has already been scaffolded in ${workDir}. Do NOT run 'dotnet new winui' — the project structure (csproj, App.xaml, MainWindow, appxmanifest) is already in place. Build your app on top of the existing project. A build.ps1 script is available at .github/skills/winui3-dev-workflow/build.ps1 that uses MSBuild instead of dotnet build for more reliable XAML compilation.`;
    }
    // Store candidate config on entry for build/launch phase
    (entry as any)._candidateConfig = candidateConfig;
    agentFlag = true;
  }

  // Git commit
  await runProcess("git", ["add", "-A"], workDir, () => {});
  await runProcess(
    "git",
    ["commit", "-m", "initial setup", "--quiet", "--allow-empty"],
    workDir,
    () => {}
  );

  // ─── BUILD PHASE ───
  setStatus("building");
  const resolvedAgentName = (entry as any)._agentName || "winui3";
  banner(`COPILOT BUILD: ${entry.model}${agentFlag ? ` --agent ${resolvedAgentName}` : ""}`, "🤖", "yellow");

  // Capture session dirs before build
  const sessionStateDir = join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".copilot",
    "session-state"
  );
  const preSessions = existsSync(sessionStateDir)
    ? readdirSync(sessionStateDir)
    : [];

  // Build prompt
  const promptRaw = loadPrompt(entry.scenarioPath);
  let prompt = promptRaw.trim();
  const sourcePath = scenarioConfig.original_app?.source_dir
    ?.replace(/\{repo_root\}/g, repoRoot)
    ?.replace(/\{scenario_dir\}/g, entry.scenarioPath);
  if (sourcePath) {
    prompt += `\n\nThe original app source code is at: ${sourcePath}`;
  }
  prompt += `\n\nIMPORTANT: Create the project in the current directory: ${workDir}`;

  // Include test assets flagged for the build agent
  const buildAssets = scenarioConfig.test_assets?.filter(a => a.include_in_build);
  if (buildAssets && buildAssets.length > 0) {
    prompt += "\n\n## Test Assets\nThe following test assets are available:\n";
    for (const asset of buildAssets) {
      prompt += `\n- **${asset.name}**: \`${asset.path}\``;
      if (asset.description) prompt += `\n  ${asset.description}`;
    }
  }

  if (promptAddendum) prompt += `\n\n${promptAddendum}`;

  // Ensure non-Electron, non-custom-framework conditions explicitly mention WinUI 3
  if (entry.conditionType !== "electron" && !prompt.includes("WinUI 3") && !prompt.includes("Duct") && !(entry as any)._candidateConfig?.scaffold_command) {
    prompt += `\n\nIMPORTANT: Build this as a **WinUI 3** desktop app using the **Windows App SDK** and C#.`;
  }

  // Run copilot (shell: false to preserve prompt as a single arg)
  const promptFile = join(trialDir, "build-prompt.txt");
  writeFileSync(promptFile, prompt);

  const copilotArgs = [
    "-p",
    prompt,
    "--yolo",
    "--model",
    entry.model,
    "--max-autopilot-continues",
    String(opts.maxContinues),
  ];
  if (agentFlag) copilotArgs.push("--agent", resolvedAgentName);
  if (mcpConfigPath) copilotArgs.push("--additional-mcp-config", `@${mcpConfigPath}`);

  entry.startedAt = new Date();
  const buildResult = await runProcess(
    "copilot",
    copilotArgs,
    workDir,
    callbacks.onOutput,
    opts.maxBuildMinutes * 60 * 1000,
    false  // Don't use shell — avoids prompt arg splitting
  );

  writeFileSync(join(trialDir, "session-log.txt"), buildResult.output);

  if (buildResult.timedOut) {
    banner(`TIMEOUT: Build exceeded ${opts.maxBuildMinutes} minutes`, "⏰", "red");
    await cleanupApps();
    setStatus("timeout");
    entry.finishedAt = new Date();
    writeFileSync(
      join(trialDir, "results.json"),
      JSON.stringify(
        {
          trial: entry.trialName,
          scenario: scenarioConfig.name,
          condition: entry.condition,
          model: entry.model,
          metrics: { score: 0, builds: false, runs: false, timeout: true },
        },
        null,
        2
      )
    );
    return;
  }

  // Find build session ID
  let buildSessionId: string | undefined;
  if (existsSync(sessionStateDir)) {
    const postSessions = readdirSync(sessionStateDir);
    const newSessions = postSessions.filter((s) => !preSessions.includes(s));
    if (newSessions.length > 0) {
      // Pick the newest one
      const sorted = newSessions
        .map((s) => ({
          name: s,
          mtime: statSync(join(sessionStateDir, s)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);
      buildSessionId = sorted[0].name;
      entry.buildSessionId = buildSessionId;
      log(`  Build session ID: ${buildSessionId}`);
    }
  }

  // Parse usage
  const usage = parseUsage(buildResult.output);
  entry.sessionTime = usage.session_time;
  entry.apiTime = usage.api_time;
  entry.codeChanges = usage.code_changes;
  if (usage.models) {
    const firstModel = Object.keys(usage.models)[0];
    if (firstModel) {
      entry.inputTokens = usage.models[firstModel].input;
      entry.outputTokens = usage.models[firstModel].output;
      entry.cachedTokens = usage.models[firstModel].cached;
    }
  }

  // ─── ELECTRON BUILD & LAUNCH ───
  if (entry.conditionType === "electron") {
    setStatus("dotnet_build");
    banner("NPM BUILD", "🔨", "cyan");

    const pkgJson = join(workDir, "package.json");
    if (existsSync(pkgJson)) {
      log("  Found package.json");
      const npmResult = await runProcess("npm", ["install"], workDir, callbacks.onOutput, 120000);
      writeFileSync(join(trialDir, "build-output.txt"), npmResult.output);
      entry.builds = npmResult.exitCode === 0;
      log(`  npm install: ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
    } else {
      banner("FAILED: No package.json found", "❌", "red");
      entry.builds = false;
      entry.runs = false;
      entry.score = 0;
      entry.failReason = "No package.json";
    }

    if (entry.builds) {
      setStatus("launching");
      banner("LAUNCH ELECTRON APP", "🚀", "cyan");

      const electronProc = spawn("npm", ["start"], {
        cwd: workDir, shell: true, stdio: "pipe", detached: true,
      });
      electronProc.unref();
      await new Promise(r => setTimeout(r, 10000));

      entry.runs = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        const listResult = await runProcess(
          "winapp", ["ui", "list-windows", "-a", "electron", "--json"],
          workDir, () => {}, 15000
        );
        if (listResult.output.includes('"hwnd"')) { entry.runs = true; break; }
        if (attempt < 5) {
          log(`  Window not found, retrying... (${attempt}/5)`);
          await new Promise(r => setTimeout(r, 8000));
        }
      }
      log(`  ${entry.runs ? "PASS ✅ Electron app running" : "FAIL ❌ No window"}`);
      if (!entry.runs) { entry.score = 0; }
    }
  }

  // ─── DOTNET BUILD (WinUI only — Electron handled above) ───
  if (entry.conditionType !== "electron") {
  setStatus("dotnet_build");
  banner("DOTNET BUILD", "🔨", "cyan");

  // Find csproj — skip .github, .copilot, and Generated Files to avoid
  // picking up tool projects (e.g., CacheGenerator.csproj from winmd-api-search)
  const findCsproj = (dir: string): string | null => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".csproj")) return full;
      if (
        entry.isDirectory() &&
        entry.name !== "bin" &&
        entry.name !== "obj" &&
        entry.name !== ".github" &&
        entry.name !== ".copilot" &&
        entry.name !== "Generated Files"
      ) {
        const found = findCsproj(full);
        if (found) return found;
      }
    }
    return null;
  };

  const csproj = findCsproj(workDir);
  if (!csproj) {
    banner("FAILED: No .csproj found", "❌", "red");
    entry.builds = false;
    entry.runs = false;
    entry.score = 0;
    entry.failReason = "No csproj";
  }

  if (csproj) {
    log(`  Found: ${csproj}`);
    const candidateCfg = (entry as any)._candidateConfig as CandidateConfig | undefined;

    let buildCmd: string;
    if (candidateCfg?.build_command) {
      // Custom build command from candidate config
      buildCmd = candidateCfg.build_command.replace(/\{csproj\}/g, `"${csproj}"`);
      log(`  Using custom build: ${buildCmd}`);
    } else {
      // Default: prefer build.ps1 (MSBuild), fallback to dotnet build
      const buildScript = join(repoRoot, "src", "skills", "winui3-dev-workflow", "build.ps1");
      if (existsSync(buildScript)) {
        buildCmd = `powershell -NoProfile -File "${buildScript}" "${csproj}" /p:Platform=x64 /p:Configuration=Debug /restore`;
        log(`  Using MSBuild via build.ps1`);
      } else {
        buildCmd = (globalConfig.build.fallback_command || globalConfig.build.command)
          .replace(/\{csproj\}/g, `"${csproj}"`);
        log(`  Using dotnet build (build.ps1 not found)`);
      }
    }
    const dotnetResult = await runProcess(
      buildCmd,
      [],
      workDir,
      callbacks.onOutput
    );
    writeFileSync(join(trialDir, "build-output.txt"), dotnetResult.output);
    entry.builds = dotnetResult.exitCode === 0;
    log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);

    if (!entry.builds) {
      banner("FAILED: dotnet build failed", "❌", "red");
      entry.runs = false;
      entry.score = 0;
      entry.failReason = "Build failed";
    }
  }

  // ─── LAUNCH ───
  if (entry.builds) {
    setStatus("launching");
    banner("LAUNCH APP", "🚀", "cyan");

  // Find output folder
  const csprojDir = join(csproj!, "..");
  const binDirs = [join(csprojDir, "bin", "x64", "Debug"), join(csprojDir, "bin", "Debug")];
  let outputFolder: string | null = null;

  for (const bd of binDirs) {
    if (!existsSync(bd)) continue;
    const tfmDir = readdirSync(bd).find((d) =>
      d.match(/net\d/) && statSync(join(bd, d)).isDirectory()
    );
    if (tfmDir) {
      const winDir = join(bd, tfmDir, "win-x64");
      outputFolder = existsSync(winDir) ? winDir : join(bd, tfmDir);
      break;
    }
  }

  entry.runs = false;
  let launchPid: string | undefined;
  if (outputFolder) {
    const candidateCfg2 = (entry as any)._candidateConfig as CandidateConfig | undefined;
    const forceUnpackaged = candidateCfg2?.launch_mode === "unpackaged";

    // Check if packaged (unless candidate forces unpackaged)
    const hasManifest = !forceUnpackaged && (
      readdirSync(outputFolder).some((f) =>
        f.toLowerCase().includes("appxmanifest")
      ) ||
      readdirSync(workDir).some(
        (f) => f === "Package.appxmanifest"
      )
    );

    if (hasManifest) {
      log(`  Packaged app: winapp run --json "${outputFolder}"`);
      // winapp run --json outputs {"AUMID":"...","ProcessId":12345} and blocks until app exits
      let launchOutput = "";
      const winappProc = spawn("winapp", ["run", outputFolder, "--json"], {
        cwd: workDir,
        shell: true,
        stdio: "pipe",
      });

      // Collect output to find PID from JSON, with 90s timeout
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          log("  Launch timeout (90s) — continuing");
          resolve();
        }, 90000);

        winappProc.stdout?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          launchOutput += text;
          // Parse JSON output for ProcessId
          try {
            const json = JSON.parse(launchOutput.trim());
            if (json.ProcessId) {
              launchPid = String(json.ProcessId);
              clearTimeout(timer);
              // Give the app a moment to render its window
              setTimeout(resolve, 8000);
            }
          } catch {
            // JSON not complete yet, keep collecting
          }
        });
        winappProc.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          launchOutput += text;
          log(text);
        });
      });

      // Detach so it doesn't block us
      winappProc.unref();

      if (launchPid) {
        log(`  App launched (PID: ${launchPid})`);
      } else {
        log(`  winapp output: ${launchOutput.trim()}`);
        log("  No PID detected — waiting 30s for app to appear");
        await new Promise((r) => setTimeout(r, 30000));
      }
    } else {
      const exes = readdirSync(outputFolder).filter(
        (f) =>
          f.endsWith(".exe") &&
          !f.match(/createdump|hostfxr|RestartAgent/)
      );
      if (exes.length > 0) {
        log(`  Launching: ${join(outputFolder, exes[0])}`);
        spawn(join(outputFolder, exes[0]), [], {
          detached: true,
          stdio: "ignore",
        });
        await new Promise((r) => setTimeout(r, 8000));
      }
    }

    // Check if running (try by PID first, then by app name)
    for (let attempt = 1; attempt <= 5; attempt++) {
      // Try by PID first (more reliable, avoids name collisions)
      if (launchPid) {
        let listResult = await runProcess(
          "winapp",
          ["ui", "list-windows", "-a", launchPid, "--json"],
          workDir,
          (d) => log(d),
          15000
        );
        if (listResult.output.includes('"hwnd"')) {
          entry.runs = true;
          break;
        }
      }
      // Fallback: try by app name
      let listResult = await runProcess(
        "winapp",
        ["ui", "list-windows", "-a", appName, "--json"],
        workDir,
        (d) => log(d),
        15000
      );
      if (listResult.output.includes('"hwnd"')) {
        entry.runs = true;
        break;
      }
      if (attempt < 5) {
        log(`  Window not found, retrying... (${attempt}/5)`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }

  log(`  ${entry.runs ? "PASS ✅ App running" : "FAIL ❌ No window"}`);

  if (!entry.runs) {
    entry.score = 0;
    banner("App didn't run — skipping validation", "⏭️", "yellow");
  }
  } // end if (entry.builds) for launch
  } // end if not electron

  // ─── VALIDATION ─── (only if app is running)
  if (entry.runs) {
    setStatus("validating");
    banner("VALIDATION", "🔍", "magenta");

  // Capture session dirs before validation
  const preValSessions = existsSync(sessionStateDir) ? readdirSync(sessionStateDir) : [];

  const valTemplate = loadValidationPrompt();
  let valPrompt = valTemplate
    .replace(/\{original_prompt\}/g, promptRaw.trim())
    .replace(/\{app_name\}/g, appName)
    .replace(/\{task_type\}/g, scenarioConfig.type)
    .replace(/\{results_dir\}/g, trialDir)
    .replace(/\{reference_section\}/g, "")
    .replace(/\{original_app_name\}/g, "N/A")
    .replace(/\{test_image_section\}/g, "");

  // Add requirements
  if (scenarioConfig.requirements && scenarioConfig.requirements.length > 0) {
    let reqSection = "## Scenario-specific requirements\n\n";
    scenarioConfig.requirements.forEach((r, i) => {
      reqSection += `${i + 1}. ${r}\n`;
    });
    valPrompt = valPrompt.replace(/\{scenario_requirements\}/g, reqSection);
  } else {
    valPrompt = valPrompt.replace(/\{scenario_requirements\}/g, "");
  }

  // Add test assets
  if (scenarioConfig.test_assets && scenarioConfig.test_assets.length > 0) {
    let assetSection = "\n## Test Assets\nUse these assets to test the app:\n";
    for (const asset of scenarioConfig.test_assets) {
      assetSection += `\n- **${asset.name}**: \`${asset.path}\``;
      if (asset.description) assetSection += `\n  ${asset.description}`;
    }
    valPrompt += assetSection;
  }

  // Add test notes
  if (scenarioConfig.test_notes) {
    valPrompt += `\n\n## Test Notes\n${scenarioConfig.test_notes}`;
  }

  valPrompt += `\n\n## Project source code location\nThe app source code is at: ${workDir}\n`;

  const valResult = await runProcess(
    "copilot",
    ["-p", valPrompt, "--yolo", "--model", entry.model],
    trialDir,
    callbacks.onOutput,
    20 * 60 * 1000,  // 20 minute hard timeout for validation
    false  // No shell — preserve prompt arg
  );
  writeFileSync(join(trialDir, "validation-log.txt"), valResult.output);

  // Find validation session ID
  if (existsSync(sessionStateDir)) {
    const postValSessions = readdirSync(sessionStateDir);
    const newValSessions = postValSessions.filter((s) => !preValSessions.includes(s));
    if (newValSessions.length > 0) {
      const sorted = newValSessions
        .map((s) => ({ name: s, mtime: statSync(join(sessionStateDir, s)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      entry.validationSessionId = sorted[0].name;
      log(`  Validation session ID: ${entry.validationSessionId}`);
    }
  }

  // Parse validation scores
  const validation = parseValidationJson(valResult.output);
  if (validation) {
    const ps = Math.min(10, Math.max(0, validation.project_score || 0));
    const us = Math.min(10, Math.max(0, validation.ui_score || 0));
    const vs = Math.min(10, Math.max(0, validation.visual_score || 0));
    const fs = Math.min(10, Math.max(0, validation.functionality_score || 0));
    const generalPoints = ps + us + vs + fs;

    // Extract structured requirement results (handles both new and old format)
    const scenarioReqs = scenarioConfig.requirements || [];
    const reqResults = extractRequirementResults(validation, scenarioReqs);
    const { passed: reqPassed, total: reqTotal } = countReqResults(reqResults);
    const reqPoints =
      reqTotal > 0 ? Math.round((50 * reqPassed) / reqTotal * 10) / 10 : 0;

    entry.score = Math.round(10 + generalPoints + reqPoints);
    entry.qualityBreakdown = `${Math.round(10 + generalPoints)}:${Math.round(reqPoints)}`;

    // Store structured data on the entry for saveResults
    (entry as any)._validationData = {
      subscores: { project: ps, ui: us, visual: vs, functionality: fs },
      requirements: reqResults,
    };

    log(`  Score: ${entry.score}/100 (Proj:${ps} UI:${us} Vis:${vs} Func:${fs} Reqs:${reqPassed}/${reqTotal})`);
  } else {
    log("  WARN: No validation JSON found");
    entry.score = 10;
  }
  } // end if (entry.runs) for validation

  // ─── RETROSPECTIVE ─── (always runs if we have a build session)
  if (buildSessionId) {
    setStatus("retrospective");
    banner("RETROSPECTIVE (Opus)", "📝", "green");

    const retroPrompt = loadRetrospectivePrompt();
    const retroResult = await runProcess(
      "copilot",
      [
        `--resume=${buildSessionId}`,
        "-p",
        retroPrompt,
        "--yolo",
        "--model",
        "claude-opus-4.6",
      ],
      trialDir,
      callbacks.onOutput,
      undefined,
      false  // No shell
    );
    writeFileSync(join(trialDir, "retrospective-log.txt"), retroResult.output);

    const retroJson = parseValidationJson(retroResult.output);
    if (retroJson) {
      writeFileSync(
        join(trialDir, "retrospective.json"),
        JSON.stringify(retroJson, null, 2)
      );
      // Store retro data on entry for inclusion in results.json
      (entry as any)._retroData = retroJson;
    }
  }

  // ─── CLEANUP ───
  banner("CLEANUP & RESULTS", "✅", "green");
  await cleanupApps();

  // ─── SAVE RESULTS ───
  setStatus(entry.failReason ? "failed" : "done");
  entry.finishedAt = new Date();
  const runElapsed = entry.startedAt
    ? Math.round((entry.finishedAt.getTime() - entry.startedAt.getTime()) / 1000)
    : 0;
  const elapsedStr = `${Math.floor(runElapsed / 60)}m ${runElapsed % 60}s`;
  saveResults(trialDir, entry, scenarioConfig, usage);

  banner(`DONE: ${entry.score ?? 0}/100 in ${elapsedStr}`, entry.failReason ? "❌" : "✅", entry.failReason ? "red" : "green");
  log(`  Build: ${entry.builds ? "✅" : "❌"} | Run: ${entry.runs ? "✅" : "❌"} | Score: ${entry.score ?? 0}/100`);
  log(`  Copilot: ${entry.sessionTime || "—"} | Elapsed: ${elapsedStr}`);
  if (entry.failReason) log(`  Failure: ${entry.failReason}`);
}

export async function runSummaryAnalysis(
  entries: RunEntry[],
  runDir: string,
  onOutput: (data: string) => void
): Promise<void> {
  const template = loadSummaryPrompt();

  const resultsData = entries
    .filter((e) => ["done", "failed", "timeout"].includes(e.status))
    .map((e) => {
      const trialDir = join(runDir, e.scenarioConfigName, e.trialName);
      let retroSummary = "";
      const retroPath = join(trialDir, "retrospective.json");
      if (existsSync(retroPath)) {
        try {
          const retro = JSON.parse(readFileSync(retroPath, "utf-8"));
          retroSummary = retro.summary || "";
          const wrongItems = Array.isArray(retro.what_went_wrong) ? retro.what_went_wrong.join("; ") : "";
          const sinkItems = Array.isArray(retro.time_sinks) ? retro.time_sinks.join("; ") : "";
          const missingItems = Array.isArray(retro.missing_tools_or_knowledge) ? retro.missing_tools_or_knowledge.join("; ") : "";
          const knownItems = Array.isArray(retro.known_issues) ? retro.known_issues.join("; ") : "";
          if (wrongItems) retroSummary += `\n  - What went wrong: ${wrongItems}`;
          if (sinkItems) retroSummary += `\n  - Time sinks: ${sinkItems}`;
          if (missingItems) retroSummary += `\n  - Missing: ${missingItems}`;
          if (knownItems) retroSummary += `\n  - Known issues: ${knownItems}`;
          if (retro.build_fix_cycles) retroSummary += `\n  - Build fix cycles: ${retro.build_fix_cycles}`;
          if (retro.confidence_score) retroSummary += `\n  - Confidence: ${retro.confidence_score}/10`;
        } catch {}
      }
      return `### ${e.condition} / ${e.model} / ${e.scenario}
- Score: ${e.score ?? "N/A"}/100
- Builds: ${e.builds ?? "N/A"}, Runs: ${e.runs ?? "N/A"}
- Session time: ${e.sessionTime || "N/A"}
- Code changes: ${e.codeChanges || "N/A"}
- Status: ${e.status}${e.failReason ? ` (${e.failReason})` : ""}
- Retrospective: ${retroSummary || "N/A"}`;
    })
    .join("\n\n");

  const prompt = template.replace("{results_data}", resultsData);

  onOutput("Running final summary analysis with Opus...\n");

  const result = await runProcess(
    "copilot",
    ["-p", prompt, "--yolo", "--model", "claude-opus-4.6", "--deny-tool=edit", "--deny-tool=create"],
    runDir,
    onOutput,
    300000, // 5 minute timeout for summary
    false
  );

  writeFileSync(join(runDir, "summary-log.txt"), result.output);

  const jsonMatch = result.output.match(/```json\s*(\{.+?\})\s*```/s);
  if (jsonMatch) {
    try {
      const summary = JSON.parse(jsonMatch[1]);
      writeFileSync(
        join(runDir, "summary.json"),
        JSON.stringify(summary, null, 2)
      );
    } catch {}
  }
}

function saveResults(
  trialDir: string,
  entry: RunEntry,
  config: ScenarioConfig,
  usage: Record<string, any>
) {
  // Extract structured validation data if available
  const valData = (entry as any)._validationData as {
    subscores: { project: number; ui: number; visual: number; functionality: number };
    requirements: StructuredReqResult[];
  } | undefined;

  const retroData = (entry as any)._retroData as Record<string, any> | undefined;

  // Read build errors if build failed
  let buildErrors = "";
  if (!entry.builds) {
    const buildOutputPath = join(trialDir, "build-output.txt");
    if (existsSync(buildOutputPath)) {
      try {
        const output = readFileSync(buildOutputPath, "utf-8");
        // Extract error lines (MSBuild/dotnet error patterns)
        const errorLines = output.split("\n").filter(l =>
          /\berror\b/i.test(l) && !/\d+ Warning/.test(l) && !/Build succeeded/.test(l)
        );
        buildErrors = errorLines.slice(0, 20).join("\n").trim();
        if (!buildErrors) {
          // Fallback: last 30 lines
          buildErrors = output.split("\n").slice(-30).join("\n").trim();
        }
      } catch { /* ignore */ }
    }
  }

  const results: Record<string, any> = {
    trial: entry.trialName,
    scenario: config.name,
    condition: entry.condition,
    type: config.type,
    model: entry.model,
    iteration: entry.iteration,
    timestamp: new Date().toISOString(),
    session_ids: {
      build: entry.buildSessionId || null,
      validation: entry.validationSessionId || null,
    },
    metrics: {
      score: entry.score,
      builds: entry.builds,
      runs: entry.runs,
      time_and_tokens: usage,
      ...(valData ? {
        subscores: valData.subscores,
        requirements: valData.requirements,
      } : {}),
    },
    ...(entry.failReason ? { fail_reason: entry.failReason } : {}),
    ...(buildErrors ? { build_errors: buildErrors } : {}),
    ...(retroData ? { retrospective: retroData } : {}),
  };
  writeFileSync(join(trialDir, "results.json"), JSON.stringify(results, null, 2));
}


// =============================================================================
// Revalidate — skip copilot build, just rebuild + launch + validate
// =============================================================================

export async function revalidateBenchmark(
  entry: RunEntry,
  runDir: string,
  callbacks: BenchmarkCallbacks
): Promise<void> {
  const globalConfig = loadGlobalConfig();

  // Find scenario config
  const scenarioResult = loadScenario(entry.scenarioPath);
  const scenarioConfig: ScenarioConfig = scenarioResult?.config || { name: entry.scenarioConfigName, description: "", type: "new" };

  const baseAppName = scenarioConfig.app_name || scenarioConfig.name;
  const runIndex = entry.iteration || 1;
  const condShort = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "").replace(/^candidate-/, "");
  const appName = `${baseAppName}${condShort}${runIndex}`;
  const trialDir = join(runDir, entry.trialName);
  const workDir = join(trialDir, "app");

  const setStatus = (status: RunEntry["status"]) => {
    entry.status = status;
    callbacks.onStatusChange(entry);
  };
  const log = (msg: string) => callbacks.onOutput(msg + "\n");
  const banner = (stage: string, icon: string, color: "cyan" | "yellow" | "green" | "magenta" | "red" = "cyan") => {
    const colors: Record<string, string> = { cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m", magenta: "\x1b[35m", red: "\x1b[31m" };
    const c = colors[color] || "";
    const reset = "\x1b[0m";
    callbacks.onOutput(`\n${c}${"━".repeat(60)}${reset}\n`);
    callbacks.onOutput(`${c}  ${icon}  ${stage}${reset}\n`);
    callbacks.onOutput(`${c}${"━".repeat(60)}${reset}\n\n`);
  };

  if (!existsSync(workDir)) {
    log(`  ERROR: App directory not found: ${workDir}`);
    setStatus("failed");
    entry.failReason = "No app directory";
    return;
  }

  entry.startedAt = new Date();
  banner(`REVALIDATE: ${entry.condition}`, "🔄", "cyan");

  // Kill stale instances
  try { await runProcess("taskkill", ["/IM", `${appName}.exe`, "/F"], workDir, () => {}, 5000); } catch {}

  // ─── BUILD & LAUNCH ───
  if (entry.conditionType === "electron") {
    // ─── ELECTRON BUILD ───
    setStatus("dotnet_build");
    banner("NPM BUILD", "🔨", "cyan");

    const pkgJson = join(workDir, "package.json");
    if (existsSync(pkgJson)) {
      log("  Found package.json");
      const npmResult = await runProcess("npm", ["install"], workDir, callbacks.onOutput, 120000);
      writeFileSync(join(trialDir, "build-output.txt"), npmResult.output);
      entry.builds = npmResult.exitCode === 0;
      log(`  npm install: ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
    } else {
      banner("FAILED: No package.json found", "❌", "red");
      entry.builds = false;
      entry.runs = false;
      entry.score = 0;
      entry.failReason = "No package.json";
    }

    if (entry.builds) {
      setStatus("launching");
      banner("LAUNCH ELECTRON APP", "🚀", "cyan");

      const electronProc = spawn("npm", ["start"], {
        cwd: workDir, shell: true, stdio: "pipe", detached: true,
      });
      electronProc.unref();
      await new Promise(r => setTimeout(r, 10000));

      entry.runs = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        const listResult = await runProcess(
          "winapp", ["ui", "list-windows", "-a", "electron", "--json"],
          workDir, () => {}, 15000
        );
        if (listResult.output.includes('"hwnd"')) { entry.runs = true; break; }
        if (attempt < 5) {
          log(`  Window not found, retrying... (${attempt}/5)`);
          await new Promise(r => setTimeout(r, 8000));
        }
      }
      log(`  ${entry.runs ? "PASS ✅ Electron app running" : "FAIL ❌ No window"}`);
      if (!entry.runs) { entry.score = 0; }
    }
  } // end if (entry.conditionType === "electron")

  // ─── DOTNET BUILD (WinUI only) ───
  // Skip WinUI build/launch for Electron (already handled above)
  if (entry.conditionType !== "electron") {
  setStatus("dotnet_build");
  banner("DOTNET BUILD", "🔨", "cyan");

  const findCsproj = (dir: string): string | null => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isFile() && e.name.endsWith(".csproj")) return full;
      if (e.isDirectory() && !["bin","obj",".github",".copilot","Generated Files"].includes(e.name)) {
        const found = findCsproj(full);
        if (found) return found;
      }
    }
    return null;
  };

  const csproj = findCsproj(workDir);
  if (!csproj) {
    entry.builds = false; entry.runs = false; entry.score = 0;
    entry.failReason = "No csproj";
    setStatus("failed");
    return;
  }

  log(`  Found: ${csproj}`);
  const buildScript = join(repoRoot, "src", "skills", "dev-workflow", "build.ps1");
  let buildCmd: string;
  if (existsSync(buildScript)) {
    buildCmd = `powershell -NoProfile -File "${buildScript}" "${csproj}" /p:Platform=x64 /p:Configuration=Debug /restore`;
  } else {
    buildCmd = `dotnet build "${csproj}" -c Debug -p:Platform=x64`;
  }
  const dotnetResult = await runProcess(buildCmd, [], workDir, callbacks.onOutput);
  writeFileSync(join(trialDir, "build-output.txt"), dotnetResult.output);
  entry.builds = dotnetResult.exitCode === 0;
  log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);

  if (!entry.builds) {
    entry.runs = false; entry.score = 0; entry.failReason = "Build failed";
    setStatus("failed");
    entry.finishedAt = new Date();
    return;
  }

  // ─── LAUNCH ───
  setStatus("launching");
  banner("LAUNCH APP", "🚀", "cyan");

  const csprojDir = join(csproj, "..");
  const binDirs = [join(csprojDir, "bin", "x64", "Debug"), join(csprojDir, "bin", "Debug")];
  let outputFolder: string | null = null;
  for (const bd of binDirs) {
    if (!existsSync(bd)) continue;
    const tfmDir = readdirSync(bd).find(d => d.match(/net\d/) && statSync(join(bd, d)).isDirectory());
    if (tfmDir) {
      const winDir = join(bd, tfmDir, "win-x64");
      outputFolder = existsSync(winDir) ? winDir : join(bd, tfmDir);
      break;
    }
  }

  entry.runs = false;
  let launchPid: string | undefined;
  if (outputFolder) {
    const hasManifest = readdirSync(outputFolder).some(f => f.toLowerCase().includes("appxmanifest"));
    if (hasManifest) {
      log(`  Packaged app: winapp run "${outputFolder}"`);
      let launchOutput = "";
      const winappProc = spawn("winapp", ["run", outputFolder, "--json"], { cwd: workDir, shell: true, stdio: "pipe" });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { log("  Launch timeout (90s)"); resolve(); }, 90000);
        winappProc.stdout?.on("data", (chunk: Buffer) => {
          launchOutput += chunk.toString();
          try {
            const json = JSON.parse(launchOutput.trim());
            if (json.ProcessId) { launchPid = String(json.ProcessId); clearTimeout(timer); setTimeout(resolve, 8000); }
          } catch {}
        });
      });
      winappProc.unref();
      if (launchPid) log(`  App launched (PID: ${launchPid})`);
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      if (launchPid) {
        const checkResult = await runProcess("winapp", ["ui", "list-windows", "-a", launchPid, "--json"], workDir, () => {}, 10000);
        if (checkResult.output.includes('"hwnd"')) { entry.runs = true; break; }
      }
      const listResult = await runProcess("winapp", ["ui", "list-windows", "-a", appName, "--json"], workDir, () => {}, 15000);
      if (listResult.output.includes('"hwnd"')) { entry.runs = true; break; }
      if (attempt < 5) { log(`  Retrying... (${attempt}/5)`); await new Promise(r => setTimeout(r, 10000)); }
    }
  }

  log(`  ${entry.runs ? "PASS ✅" : "FAIL ❌"}`);
  if (!entry.runs) { entry.score = 0; }
  } // end WinUI build/launch block

  // ─── VALIDATION ───
  if (entry.runs) {
    setStatus("validating");
    banner("VALIDATION", "🔍", "magenta");

    const promptRaw = loadPrompt(entry.scenarioPath);
    const valTemplate = loadValidationPrompt();
    let valPrompt = valTemplate
      .replace(/\{original_prompt\}/g, promptRaw.trim())
      .replace(/\{app_name\}/g, appName)
      .replace(/\{task_type\}/g, scenarioConfig.type)
      .replace(/\{results_dir\}/g, trialDir)
      .replace(/\{reference_section\}/g, "")
      .replace(/\{test_image_section\}/g, "")
      .replace(/\{scenario_requirements\}/g, "");

    if (scenarioConfig.requirements) {
      valPrompt += "\n\n## Scenario Requirements\n" + scenarioConfig.requirements.map((r, i) => `${i+1}. ${r}`).join("\n");
    }

    if (scenarioConfig.test_assets && scenarioConfig.test_assets.length > 0) {
      let assetSection = "\n## Test Assets\nUse these assets to test the app:\n";
      for (const asset of scenarioConfig.test_assets) {
        assetSection += `\n- **${asset.name}**: \`${asset.path}\``;
        if (asset.description) assetSection += `\n  ${asset.description}`;
      }
      valPrompt += assetSection;
    }

    if (scenarioConfig.test_notes) {
      valPrompt += `\n\n## Test Notes\n${scenarioConfig.test_notes}`;
    }

    valPrompt += `\n\n## Project source code location\nThe app source code is at: ${workDir}\n`;

    const valResult = await runProcess("copilot", ["-p", valPrompt, "--yolo", "--model", "claude-sonnet-4.5"], workDir, callbacks.onOutput, 15 * 60 * 1000, false);
    writeFileSync(join(trialDir, "validation-log.txt"), valResult.output);

    const validation = parseValidationJson(valResult.output);
    if (validation) {
      const ps = Math.min(10, Math.max(0, validation.project_score || 0));
      const us = Math.min(10, Math.max(0, validation.ui_score || 0));
      const vs = Math.min(10, Math.max(0, validation.visual_score || 0));
      const fs = Math.min(10, Math.max(0, validation.functionality_score || 0));
      const generalPoints = ps + us + vs + fs;

      const scenarioReqs = scenarioConfig.requirements || [];
      const reqResults = extractRequirementResults(validation, scenarioReqs);
      const { passed: reqPassed, total: reqTotal } = countReqResults(reqResults);
      const reqPoints = reqTotal > 0 ? Math.round((50 * reqPassed) / reqTotal * 10) / 10 : 0;
      entry.score = Math.round(10 + generalPoints + reqPoints);
      entry.qualityBreakdown = `${Math.round(10 + generalPoints)}:${Math.round(reqPoints)}`;

      (entry as any)._validationData = {
        subscores: { project: ps, ui: us, visual: vs, functionality: fs },
        requirements: reqResults,
      };

      log(`  Score: ${entry.score}/100 (Proj:${ps} UI:${us} Vis:${vs} Func:${fs} Reqs:${reqPassed}/${reqTotal})`);
    } else {
      entry.score = 10;
    }
  }

  // ─── CLEANUP & SAVE ───
  try { await runProcess("taskkill", ["/IM", `${appName}.exe`, "/F"], workDir, () => {}, 5000); } catch {}
  setStatus(entry.score && entry.score > 10 ? "done" : "failed");
  entry.finishedAt = new Date();

  // Read existing results for usage data
  let usage: Record<string, any> = {};
  const existingResults = join(trialDir, "results.json");
  if (existsSync(existingResults)) {
    try {
      const old = JSON.parse(readFileSync(existingResults, "utf-8"));
      usage = old.metrics?.time_and_tokens || {};
    } catch {}
  }
  saveResults(trialDir, entry, scenarioConfig, usage);
  log(`  Revalidation complete: ${entry.score}/100`);
}