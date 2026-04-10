import { spawn } from "child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
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
  validateAgentSetupScripts,
} from "./config.js";
import type { RunEntry, ScenarioConfig, AgentSetupConfig, GlobalConfig } from "../types.js";
import { parse as parseYaml } from "yaml";
import { platform } from "os";

const isWindows = platform() === "win32";

/** Kill a process tree by PID — cross-platform. */
function killProcessTree(pid: number, force = false): void {
  if (isWindows) {
    const args = ["/PID", String(pid), "/T"];
    if (force) args.push("/F");
    spawn("taskkill", args, { shell: true });
  } else {
    // On macOS/Linux, kill the process group (negative PID)
    try { process.kill(-pid, force ? "SIGKILL" : "SIGTERM"); } catch {}
    // Fallback: kill the individual process
    try { process.kill(pid, force ? "SIGKILL" : "SIGTERM"); } catch {}
  }
}

/** Kill a process by name — cross-platform. */
function killProcessByName(name: string, force = false): Promise<void> {
  if (isWindows) {
    const exeName = name.endsWith(".exe") ? name : `${name}.exe`;
    return runProcess("taskkill", ["/IM", exeName, "/F"], ".", () => {}, 5000).then(() => {});
  } else {
    const signal = force ? "SIGKILL" : "SIGTERM";
    return runProcess("pkill", [force ? "-9" : "-15", "-x", name], ".", () => {}, 5000).then(() => {});
  }
}

/** Check if a macOS app is running by name. */
async function isMacAppRunning(appName: string, log: (msg: string) => void): Promise<boolean> {
  const result = await runProcess("pgrep", ["-x", appName], ".", () => {}, 5000);
  return result.exitCode === 0;
}

// Parse YAML frontmatter from a section .md file
function parseSectionDeps(sectionFile: string): { skills?: string[]; inline_skills?: string[]; mcp?: string[] } {
  if (!existsSync(sectionFile)) return {};
  const raw = readFileSync(sectionFile, "utf-8").replace(/\r\n/g, "\n");
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  try { return parseYaml(fmMatch[1]) || {}; } catch { return {}; }
}

/** Recursively find files matching a filename pattern (simple glob: just the filename part). */
function findFilesRecursive(dir: string, pattern: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "bin" && entry.name !== "obj") {
        results.push(...findFilesRecursive(fullPath, pattern));
      } else if (entry.isFile()) {
        // Simple wildcard match
        const asteriskCount = (pattern.match(/\*/g) || []).length;
        if (asteriskCount === 1 && pattern.startsWith("*")) {
          // Pattern like *.xaml or *.cs — match by extension
          const ext = pattern.slice(1);
          if (entry.name.endsWith(ext)) results.push(fullPath);
        } else if (asteriskCount > 0) {
          // Pattern like *ViewModel*.cs — all non-wildcard parts must appear in order
          const parts = pattern.split("*").filter(Boolean);
          if (parts.every(p => entry.name.includes(p))) results.push(fullPath);
        } else {
          if (entry.name === pattern) results.push(fullPath);
        }
      }
    }
  } catch { /* permission errors etc */ }
  return results;
}

interface TracerResult {
  id: string;
  skill: string;
  hit: boolean;
  matches: number;
  details: string;
}

interface TracerReport {
  total_tracers: number;
  total_hits: number;
  adherence_rate: number;
  per_skill: Record<string, { hits: number; total: number; rate: number }>;
  tracers: TracerResult[];
}

/** Detect tracer rules in a built app directory. Returns null if tracers.json not found. */
function detectTracers(appDir: string): TracerReport | null {
  const tracersPath = join(benchRoot, "common", "tracers.json");
  if (!existsSync(tracersPath) || !existsSync(appDir)) return null;

  let config: any;
  try { config = JSON.parse(readFileSync(tracersPath, "utf-8")); } catch { return null; }
  if (!config.tracers || !Array.isArray(config.tracers)) return null;

  const results: TracerResult[] = [];
  let totalHits = 0;
  const skillStats: Record<string, { hits: number; total: number }> = {};

  for (const tracer of config.tracers) {
    let hit = false;
    let matchCount = 0;
    let details = "";
    const detection = tracer.detection;

    // Extract filename pattern from glob (last path segment)
    const globPattern = (detection.glob || "").replace(/\*\*\//g, "");

    if (detection.type === "grep") {
      const files = findFilesRecursive(appDir, globPattern);
      for (const file of files) {
        try {
          const content = readFileSync(file, "utf-8");
          if (content.includes(detection.pattern)) matchCount++;
        } catch { /* skip */ }
      }
      const expectMin = detection.expect_min || 1;
      hit = matchCount >= expectMin;
      details = `Found ${matchCount} matches (expected >= ${expectMin})`;

    } else if (detection.type === "file_exists") {
      const files = findFilesRecursive(appDir, globPattern);
      if (files.length > 0) {
        hit = true;
        matchCount = files.length;
        details = `File found (${matchCount})`;
        if (detection.secondary) {
          let secondaryHit = false;
          for (const file of files) {
            try {
              const content = readFileSync(file, "utf-8");
              if (content.includes(detection.secondary.pattern)) { secondaryHit = true; break; }
            } catch { /* skip */ }
          }
          if (!secondaryHit) {
            hit = false;
            details += ` but secondary pattern '${detection.secondary.pattern}' not found`;
          } else {
            details += " with matching content";
          }
        }
      } else {
        details = "File not found";
      }
    }

    if (hit) totalHits++;

    const skill = tracer.skill as string;
    if (!skillStats[skill]) skillStats[skill] = { hits: 0, total: 0 };
    skillStats[skill].total++;
    if (hit) skillStats[skill].hits++;

    results.push({ id: tracer.id, skill, hit, matches: matchCount, details });
  }

  const totalTracers = config.tracers.length;
  const perSkill: Record<string, { hits: number; total: number; rate: number }> = {};
  for (const [skill, stats] of Object.entries(skillStats)) {
    perSkill[skill] = { ...stats, rate: stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) / 100 : 0 };
  }

  return {
    total_tracers: totalTracers,
    total_hits: totalHits,
    adherence_rate: totalTracers > 0 ? Math.round((totalHits / totalTracers) * 100) / 100 : 0,
    per_skill: perSkill,
    tracers: results,
  };
}

/** Load the agent config.json from its pluginPath. */
function loadAgentConfig(pluginPath: string): AgentSetupConfig {
  const configPath = join(pluginPath, "config.json");
  if (existsSync(configPath)) {
    try { return JSON.parse(readFileSync(configPath, "utf-8")); } catch {}
  }
  return {};
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
  useShell = true,
  extraEnv?: Record<string, string>
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: useShell,
      stdio: "pipe",
      env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    });
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
            onOutput("\n⚠️  Output silent for 5 minutes — requesting graceful shutdown\n");
            gracefulThenForceKill(proc.pid, 15000);
          }
        }, SILENCE_THRESHOLD_MS);
      }
    };

    // Graceful shutdown: send Ctrl+C to let copilot write session.shutdown, then force kill
    const gracefulThenForceKill = (pid: number, graceMs: number) => {
      killProcessTree(pid, false);
      setTimeout(() => {
        if (!resolved) {
          killProcessTree(pid, true);
        }
      }, graceMs);
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
          killProcessTree(proc.pid, true);
        }
      }, delayMs);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        if (proc.pid) {
          // Graceful shutdown first to allow session.shutdown event to be written
          gracefulThenForceKill(proc.pid, 15000);
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

/** Format token count with k/m suffix */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Format milliseconds to human-readable duration */
function formatDurationMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${s}s`;
}

/**
 * Aggregate token usage from copilot session-state events.jsonl files.
 * Matches sessions by cwd (working directory) to reliably associate sub-agent
 * sessions with their parent trial, even when multiple trials run concurrently.
 * Falls back to summing individual assistant.message events if no session.shutdown exists.
 */
function aggregateSessionUsage(
  trialWorkDir: string,
  log: (msg: string) => void,
): Record<string, any> | null {
  const sessionStateDir = join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".copilot",
    "session-state"
  );
  if (!existsSync(sessionStateDir)) return null;

  // Normalize the trial dir path for comparison
  const normalizedTrialDir = trialWorkDir.toLowerCase().replace(/[\\/]+/g, "/").replace(/\/$/, "");

  const sessionDirs = readdirSync(sessionStateDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      name: d.name,
      path: join(sessionStateDir, d.name),
      eventsPath: join(sessionStateDir, d.name, "events.jsonl"),
    }))
    .filter(d => existsSync(d.eventsPath));

  // Aggregate across all matching sessions
  const modelTotals: Record<string, { input: number; output: number; cached: number }> = {};
  let totalPremium = 0;
  let totalApiMs = 0;
  let matchedSessions = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let earliestStart = Infinity;
  let latestEnd = 0;

  for (const sd of sessionDirs) {
    try {
      const lines = readFileSync(sd.eventsPath, "utf-8").split("\n").filter(l => l.trim());
      if (lines.length === 0) continue;

      // Check session.start cwd — must be within the trial directory
      const startEv = JSON.parse(lines[0]);
      if (startEv.type !== "session.start") continue;
      const cwd = (startEv.data?.context?.cwd || "").toLowerCase().replace(/[\\/]+/g, "/").replace(/\/$/, "");
      if (!cwd.startsWith(normalizedTrialDir)) continue;

      matchedSessions++;
      const sessionStartMs = new Date(startEv.data.startTime).getTime();
      if (sessionStartMs < earliestStart) earliestStart = sessionStartMs;

      // Try to get data from session.shutdown first (most accurate)
      let gotShutdown = false;
      for (let i = lines.length - 1; i >= 0; i--) {
        const ev = JSON.parse(lines[i]);
        if (ev.type === "session.shutdown" && ev.data) {
          gotShutdown = true;
          const d = ev.data;
          totalPremium += d.totalPremiumRequests || 0;
          totalApiMs += d.totalApiDurationMs || 0;
          if (d.codeChanges) {
            totalAdded += d.codeChanges.linesAdded || 0;
            totalRemoved += d.codeChanges.linesRemoved || 0;
          }
          if (d.modelMetrics) {
            for (const [model, metrics] of Object.entries(d.modelMetrics)) {
              const mu = (metrics as any).usage || {};
              if (!modelTotals[model]) modelTotals[model] = { input: 0, output: 0, cached: 0 };
              modelTotals[model].input += mu.inputTokens || 0;
              modelTotals[model].output += mu.outputTokens || 0;
              modelTotals[model].cached += mu.cacheReadTokens || 0;
            }
          }
          break;
        }
      }

      // Fallback: if no shutdown (process was killed), aggregate from assistant.message events
      if (!gotShutdown) {
        const model = startEv.data.selectedModel || "unknown";
        if (!modelTotals[model]) modelTotals[model] = { input: 0, output: 0, cached: 0 };
        for (const line of lines) {
          const ev = JSON.parse(line);
          if (ev.type === "assistant.message" && ev.data?.outputTokens) {
            modelTotals[model].output += ev.data.outputTokens;
          }
        }
        // Note: input/cached tokens aren't available per-message, only in shutdown
      }

      // Always check for sub-agent events (subagent.completed / subagent.failed)
      // These track totalTokens for each sub-agent spawned via the task tool.
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if ((ev.type === "subagent.completed" || ev.type === "subagent.failed") && ev.data) {
            const subModel = ev.data.model || "unknown";
            if (!modelTotals[subModel]) modelTotals[subModel] = { input: 0, output: 0, cached: 0 };
            // totalTokens includes input+output; attribute as input since most tokens are context
            modelTotals[subModel].input += ev.data.totalTokens || 0;
            totalApiMs += ev.data.durationMs || 0;
            matchedSessions++; // Count sub-agents as additional sessions
          }
        } catch {}
      }
    } catch {
      // Skip unparseable sessions
    }
  }

  if (matchedSessions === 0) return null;

  log(`  Session-state fallback: found ${matchedSessions} session(s) matching trial cwd`);

  // Compute session duration from earliest start to now (best effort)
  const sessionDurationMs = earliestStart < Infinity
    ? Date.now() - earliestStart
    : 0;

  // Build usage object in the same format as parseUsage
  const usage: Record<string, any> = {
    premium_requests: totalPremium,
    api_time: totalApiMs > 0 ? formatDurationMs(totalApiMs) : undefined,
    session_time: sessionDurationMs > 0 ? formatDurationMs(sessionDurationMs) : undefined,
    models: {} as Record<string, { input: string; output: string; cached: string }>,
  };
  if (totalAdded || totalRemoved) {
    usage.code_changes = `+${totalAdded} -${totalRemoved}`;
  }
  for (const [model, totals] of Object.entries(modelTotals)) {
    usage.models[model] = {
      input: formatTokenCount(totals.input),
      output: formatTokenCount(totals.output),
      cached: formatTokenCount(totals.cached),
    };
  }
  return usage;
}

// =============================================================================
// Extracted Build & Launch Helpers
// =============================================================================

/** Find .csproj recursively, skipping .github/.copilot/Generated Files. */
function findCsproj(dir: string): string | null {
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
}

/** Default dotnet/MSBuild build flow. */
async function defaultDotnetBuild(
  workDir: string,
  trialDir: string,
  globalConfig: GlobalConfig,
  callbacks: BenchmarkCallbacks,
  log: (msg: string) => void,
): Promise<{ success: boolean; csproj: string | null; output: string }> {
  const csproj = findCsproj(workDir);
  if (!csproj) {
    return { success: false, csproj: null, output: "" };
  }
  log(`  Found: ${csproj}`);

  // Default: prefer build.ps1 (MSBuild, Windows-only), fallback to dotnet build
  let buildCmd: string;
  const buildScript = join(repoRoot, "src", "skills", "winui3-dev-workflow", "build.ps1");
  if (isWindows && existsSync(buildScript)) {
    buildCmd = `powershell -NoProfile -File "${buildScript}" "${csproj}" /p:Platform=x64 /p:Configuration=Debug /restore`;
    log(`  Using MSBuild via build.ps1`);
  } else {
    buildCmd = (globalConfig.build.fallback_command || globalConfig.build.command)
      .replace(/\{csproj\}/g, `"${csproj}"`);
    log(`  Using dotnet build (build.ps1 not found)`);
  }
  const result = await runProcess(buildCmd, [], workDir, callbacks.onOutput);
  writeFileSync(join(trialDir, "build-output.txt"), result.output);
  return { success: result.exitCode === 0, csproj, output: result.output };
}

/** Default WinApp launch flow (packaged/unpackaged WinUI). */
async function defaultWinappLaunch(
  workDir: string,
  appName: string,
  csproj: string,
  launchMode: "packaged" | "unpackaged" | undefined,
  callbacks: BenchmarkCallbacks,
  log: (msg: string) => void,
): Promise<{ success: boolean; pid?: string }> {
  const csprojDir = join(csproj, "..");
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

  if (!outputFolder) return { success: false };

  let launchPid: string | undefined;
  const forceUnpackaged = launchMode === "unpackaged";

  // Check project root for manifest (the source of truth for packaged apps)
  const hasManifest = !forceUnpackaged && (
    existsSync(join(workDir, "Package.appxmanifest")) ||
    existsSync(join(workDir, "appxmanifest.xml"))
  );

  if (hasManifest) {
    log(`  Packaged app: winapp run --json "${outputFolder}"`);
    let launchOutput = "";
    const winappProc = spawn("winapp", ["run", outputFolder, "--json"], {
      cwd: workDir,
      shell: true,
      stdio: "pipe",
    });

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        log("  Launch timeout (90s) — continuing");
        resolve();
      }, 90000);

      winappProc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        launchOutput += text;
        try {
          const json = JSON.parse(launchOutput.trim());
          if (json.ProcessId) {
            launchPid = String(json.ProcessId);
            clearTimeout(timer);
            setTimeout(resolve, 8000);
          }
        } catch {}
      });
      winappProc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        launchOutput += text;
        log(text);
      });
    });

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
  let success = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (launchPid) {
      const listResult = await runProcess(
        "winapp",
        ["ui", "list-windows", "-a", launchPid, "--json"],
        workDir,
        (d) => log(d),
        15000
      );
      if (listResult.output.includes('"hwnd"')) { success = true; break; }
    }
    const listResult = await runProcess(
      "winapp",
      ["ui", "list-windows", "-a", appName, "--json"],
      workDir,
      (d) => log(d),
      15000
    );
    if (listResult.output.includes('"hwnd"')) { success = true; break; }
    if (attempt < 5) {
      log(`  Window not found, retrying... (${attempt}/5)`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  return { success, pid: launchPid };
}

/** Custom build command — run the command, write build-output.txt, return success. */
async function customBuild(
  command: string,
  workDir: string,
  trialDir: string,
  callbacks: BenchmarkCallbacks,
  log: (msg: string) => void,
): Promise<boolean> {
  log(`  Running custom build: ${command}`);
  const result = await runProcess(command, [], workDir, callbacks.onOutput, 120000);
  writeFileSync(join(trialDir, "build-output.txt"), result.output);
  return result.exitCode === 0;
}

/** Auto-detect macOS app executable name from build products. */
function detectMacAppExecutable(workDir: string): string | null {
  const debugDir = join(workDir, "build", "Build", "Products", "Debug");
  if (!existsSync(debugDir)) return null;
  const apps = readdirSync(debugDir).filter(f => f.endsWith(".app") && !f.includes("-Runner"));
  if (apps.length === 0) return null;
  // The executable name matches the .app bundle name (minus .app)
  return apps[0].replace(/\.app$/, "");
}

/** Custom launch command — run (detached), wait for window with detectApp name. */
async function customLaunch(
  command: string,
  detectApp: string,
  workDir: string,
  log: (msg: string) => void,
): Promise<{ success: boolean; pid?: string }> {
  log(`  Running custom launch: ${command}`);
  const parts = command.split(/\s+/);
  const proc = spawn(parts[0], parts.slice(1), {
    cwd: workDir, shell: true, stdio: "pipe", detached: true,
  });
  proc.unref();
  await new Promise(r => setTimeout(r, 10000));

  let success = false;

  if (isWindows) {
    // Windows: use winapp to detect window
    for (let attempt = 1; attempt <= 5; attempt++) {
      const listResult = await runProcess(
        "winapp", ["ui", "list-windows", "-a", detectApp, "--json"],
        workDir, () => {}, 15000
      );
      if (listResult.output.includes('"hwnd"')) { success = true; break; }
      if (attempt < 5) {
        log(`  Window not found, retrying... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  } else {
    // macOS/Linux: check if process is running by name
    // Also try auto-detected app name from build products
    const autoDetected = detectMacAppExecutable(workDir);
    const namesToTry = [detectApp];
    if (autoDetected && autoDetected !== detectApp) namesToTry.push(autoDetected);

    for (let attempt = 1; attempt <= 5; attempt++) {
      for (const name of namesToTry) {
        const pgrepResult = await runProcess(
          "pgrep", ["-x", name],
          workDir, () => {}, 5000
        );
        if (pgrepResult.exitCode === 0) { success = true; break; }
      }
      if (success) break;
      // Fallback: partial match on any of the names
      for (const name of namesToTry) {
        const pgrepResult2 = await runProcess(
          "pgrep", ["-f", name],
          workDir, () => {}, 5000
        );
        if (pgrepResult2.exitCode === 0) { success = true; break; }
      }
      if (success) break;
      if (attempt < 5) {
        log(`  Process not found, retrying... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  }
  return { success };
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
  const condShort = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "");
  // Load agent config early so we can check unique_app_name
  const agentConfig = loadAgentConfig(entry.pluginPath);
  const appName = agentConfig.unique_app_name === false
    ? baseAppName
    : `${baseAppName}${condShort}${runIndex}`;
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

  // Expand launch_detect template variables (same as launch_command)
  const expandedLaunchDetect = (agentConfig.launch_detect || "")
    .replace(/\{app_dir\}/g, workDir)
    .replace(/\{app_name\}/g, appName) || appName;

  const cleanupApps = async () => {
    // Kill app processes
    if (!isWindows) {
      // macOS: gracefully quit the app first, then force-kill
      try {
        await runProcess("osascript", ["-e", `tell application "${appName}" to quit`], ".", () => {}, 5000);
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
    }
    try { await killProcessByName(appName, true); } catch {}
    if (isWindows) {
      try { await killProcessByName("winapp", true); } catch {}
    }
    if (expandedLaunchDetect && expandedLaunchDetect !== appName) {
      if (!isWindows) {
        try {
          await runProcess("osascript", ["-e", `tell application "${expandedLaunchDetect}" to quit`], ".", () => {}, 5000);
          await new Promise(r => setTimeout(r, 2000));
        } catch {}
      }
      try { await killProcessByName(expandedLaunchDetect, true); } catch {}
    }

    // Uninstall sideloaded app
    if (isWindows) {
      // Remove registered AppX package
      try {
        await runProcess(
          "powershell", ["-NoProfile", "-Command",
            `Get-AppxPackage | Where-Object { $_.Name -match '${appName.replace(/'/g, "''")}' } | Remove-AppxPackage -ErrorAction SilentlyContinue`],
          ".", () => {}, 15000
        );
      } catch {}
    }

    // Remove screenshot files left by the validation agent (keep final-screenshot/screenshot for HTML report)
    const keepScreenshots = /^(final-screenshot|screenshot)\.(png|jpg|jpeg|bmp)$/i;
    for (const dir of [trialDir, workDir]) {
      if (!existsSync(dir)) continue;
      try {
        for (const f of readdirSync(dir)) {
          if (/\.(png|jpg|jpeg|bmp)$/i.test(f) && !keepScreenshots.test(f)) {
            rmSync(join(dir, f), { force: true });
          }
        }
      } catch {}
    }

    // Remove bulky build artifacts (xcodebuild DerivedData, .NET bin/obj)
    // Keeps source code but frees ~500MB-1GB per trial
    const bulkDirs = [
      join(workDir, "build"),           // xcodebuild -derivedDataPath ./build
      join(workDir, "build-derived"),    // alternate derivedData path
      join(workDir, "DerivedData"),
      join(workDir, "bin"),             // .NET build output
      join(workDir, "obj"),             // .NET intermediate
    ];
    for (const d of bulkDirs) {
      if (existsSync(d)) {
        try { rmSync(d, { recursive: true, force: true }); } catch {}
      }
    }
    // Also remove any nested bin/obj from subdirectories (e.g., csproj subfolders)
    if (existsSync(workDir)) {
      try {
        for (const sub of readdirSync(workDir)) {
          const subPath = join(workDir, sub);
          if (!statSync(subPath).isDirectory()) continue;
          for (const target of ["bin", "obj"]) {
            const t = join(subPath, target);
            if (existsSync(t)) {
              try { rmSync(t, { recursive: true, force: true }); } catch {}
            }
          }
        }
      } catch {}
    }
  };

  // ─── SETUP ───
  entry.startedAt = new Date();
  setStatus("setup");
  banner(`SETUP: ${entry.condition} / ${entry.model}`, "🔧", "cyan");

  // Kill any stale instances from previous runs to avoid launch collisions
  await cleanupApps();

  let agentFlag = false;
  let mcpConfigPath: string | undefined;

  // ── 1. Run setup scripts (if any) ──
  if (agentConfig.preset_scripts && agentConfig.preset_scripts.length > 0) {
    let resolvedScripts;
    try {
      resolvedScripts = validateAgentSetupScripts(
        condShort,
        agentConfig.preset_scripts
      );
    } catch (err: any) {
      log(`  ❌ Script validation failed: ${err.message}`);
      entry.failReason = `setup_script_failed: ${err.message}`;
      setStatus("failed");
      entry.finishedAt = new Date();
      writeFileSync(
        join(trialDir, "results.json"),
        JSON.stringify(
          {
            trial: entry.trialName,
            scenario: scenarioConfig.name,
            condition: entry.condition,
            model: entry.model,
            metrics: { score: 0, builds: false, runs: false, timeout: false },
            setup_scripts: [],
          },
          null,
          2
        )
      );
      return;
    }

    const setupScriptResults: Array<{ script: string; exit_code: number; duration_seconds: number }> = [];
    const setupLogPath = join(trialDir, "setup-script.log");

    for (const script of resolvedScripts) {
      const scriptStartTime = Date.now();
      const header = `\n=== ${script.name} (${new Date().toISOString()}) ===\n`;
      writeFileSync(setupLogPath, header, { flag: "a" });
      log(`  Running setup script: ${script.name} (timeout: ${script.timeoutMinutes}m)`);

      // Run script with the appropriate shell based on file extension
      const isShellScript = script.entryPoint.endsWith(".sh");
      const scriptCmd = isShellScript ? "bash" : "powershell";
      const scriptArgs = isShellScript
        ? [script.entryPoint]
        : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script.entryPoint];

      const scriptResult = await runProcess(
        scriptCmd,
        scriptArgs,
        workDir,
        (data) => {
          writeFileSync(setupLogPath, data, { flag: "a" });
          callbacks.onOutput(data);
        },
        script.timeoutMinutes * 60 * 1000,
        false,
        {
          BENCH_APP_DIR: workDir,
          BENCH_APP_NAME: appName,
          BENCH_SCENARIO_DIR: entry.scenarioPath,
          BENCH_SCENARIO_NAME: scenarioConfig.name,
          BENCH_AGENTSETUP_NAME: condShort,
          BENCH_AGENTSETUP_DIR: entry.pluginPath,
          BENCH_SCRIPT_DIR: script.scriptDir,
          BENCH_ROOT: benchRoot,
        }
      );

      const durationSeconds = Math.round((Date.now() - scriptStartTime) / 1000);
      setupScriptResults.push({
        script: script.name,
        exit_code: scriptResult.exitCode,
        duration_seconds: durationSeconds,
      });

      if (scriptResult.exitCode !== 0) {
        const reason = scriptResult.timedOut
          ? `setup_script_failed: ${script.name} (timed out after ${script.timeoutMinutes}m)`
          : `setup_script_failed: ${script.name} (exit code: ${scriptResult.exitCode})`;
        log(`  ❌ ${reason}`);
        entry.failReason = reason;
        setStatus("failed");
        entry.finishedAt = new Date();
        writeFileSync(
          join(trialDir, "results.json"),
          JSON.stringify(
            {
              trial: entry.trialName,
              scenario: scenarioConfig.name,
              condition: entry.condition,
              model: entry.model,
              metrics: { score: 0, builds: false, runs: false, timeout: false },
              setup_scripts: setupScriptResults,
            },
            null,
            2
          )
        );
        return;
      }

      log(`  ✅ ${script.name} completed (${durationSeconds}s)`);
    }

    (entry as any)._setupScriptResults = setupScriptResults;
  }

  // ── 2. Run scaffold_command (if any) ──
  // v2: convert scaffold template name to scaffold_command
  if (agentConfig.scaffold && !agentConfig.scaffold_command && !agentConfig.preset_scripts) {
    agentConfig.scaffold_command = `dotnet new ${agentConfig.scaffold} -n {app_name} --output {app_dir} --force`;
  }
  if (agentConfig.scaffold_command) {
    const templateCmd = agentConfig.scaffold_command
      .replace(/\{app_name\}/g, appName)
      .replace(/\{app_dir\}/g, workDir);
    // Custom scaffold tools may fail if dir already exists — remove it first
    if (existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true });
    }
    log(`  Scaffolding: ${templateCmd}`);
    await runProcess(templateCmd, [], trialDir, () => {});
    if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  }

  // Init git (after scaffold so it doesn't get deleted)
  await runProcess("git", ["init", "--quiet"], workDir, () => {});

  // ── 3. Install agent ──
  const targetGh = join(workDir, ".github");
  mkdirSync(join(targetGh, "skills"), { recursive: true });
  mkdirSync(join(targetGh, "agents"), { recursive: true });

  const srcSkillsDirs = [join(repoRoot, "src", "skills"), join(repoRoot, "src", ".local", "skills")];
  const srcMcpDir = join(repoRoot, "src", "mcp");

  if (agentConfig.agent) {
    // ── v2 mode: pre-built agent.md file ──
    const agentSrc = join(repoRoot, agentConfig.agent);
    if (existsSync(agentSrc)) {
      const agentContent = readFileSync(agentSrc, "utf-8");
      const nameMatch = agentContent.match(/^---\s*\n[\s\S]*?name:\s*(\S+)[\s\S]*?\n---/);
      const agentName = nameMatch ? nameMatch[1] : "winui3";
      copyFileSync(agentSrc, join(targetGh, "agents", `${agentName}.agent.md`));
      agentFlag = true;
      (entry as any)._agentName = agentName;
      log(`  Installed v2 agent: ${agentName} from ${agentConfig.agent}`);
    } else {
      log(`  WARNING: Agent file not found: ${agentSrc}`);
    }

    // Generate prompt_skills addendum
    if (agentConfig.prompt_skills && agentConfig.prompt_skills.length > 0) {
      const skillMentions = agentConfig.prompt_skills
        .map(s => `please use the \`${s}\` skill`)
        .join(" and ");
      const addendum = `\n\nAlso, ${skillMentions} to help guide your work.`;
      if (agentConfig.prompt_addendum) {
        agentConfig.prompt_addendum += addendum;
      } else {
        agentConfig.prompt_addendum = addendum;
      }
      log(`  Prompt skills: ${agentConfig.prompt_skills.join(", ")}`);
    }

  } else if (agentConfig.sections) {
    const sectionsRoot = agentConfig.sections_root
      ? join(repoRoot, agentConfig.sections_root)
      : join(repoRoot, "src", "agents", "_sections");
    const sectionsDir = sectionsRoot;

    if (existsSync(sectionsDir)) {
      const sections = agentConfig.sections;
      const baseSection = sections[0];
      const baseFile = join(sectionsDir, `${baseSection}.md`);
      const baseRaw = existsSync(baseFile) ? readFileSync(baseFile, "utf-8") : "";
      const nameMatch = baseRaw.match(/^---\s*\n[\s\S]*?name:\s*(\S+)[\s\S]*?\n---/);
      const agentName = nameMatch ? nameMatch[1] : baseSection;
      const fmMatch = baseRaw.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
      const frontmatter = fmMatch ? fmMatch[1] : "";
      let template = baseRaw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

      for (const section of sections) {
        if (section === baseSection) continue;
        const sectionFile = join(sectionsDir, `${section}.md`);
        if (existsSync(sectionFile)) {
          const content = readFileSync(sectionFile, "utf-8")
            .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").trim();
          template = template.replace(`{{${section}}}`, content);
        }
      }

      template = template.replace(/\{\{[a-z_-]+\}\}\n?/g, "");

      // Inline skill content into agent.md if configured
      if (agentConfig.inline_skills) {
        const inlinedSkills: string[] = [];
        for (const section of sections) {
          const deps2 = parseSectionDeps(join(sectionsDir, `${section}.md`));
          const toInline = deps2.inline_skills || [];
          for (const skill of toInline) {
            if (inlinedSkills.includes(skill)) continue;
            let skillMd: string | null = null;
            for (const dir of srcSkillsDirs) {
              const skillPath = join(dir, skill, "SKILL.md");
              if (existsSync(skillPath)) { skillMd = skillPath; break; }
            }
            if (skillMd) {
              const skillContent = readFileSync(skillMd, "utf-8")
                .replace(/^---[\s\S]*?---\s*/m, "");
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
      log(`  Assembled ${agentName} agent with slots: ${sections.filter(s => s !== baseSection).join("+") || "(base only)"}`);

      agentFlag = true;
      (entry as any)._agentName = agentName;

      // Auto-resolve section dependencies (skills + mcp from section frontmatter)
      if (!agentConfig.skills) agentConfig.skills = {};
      if (!agentConfig.mcp) agentConfig.mcp = {};
      for (const section of sections) {
        const deps = parseSectionDeps(join(sectionsDir, `${section}.md`));
        if (deps.skills) {
          if (!agentConfig.skills.include) agentConfig.skills.include = [];
          for (const s of deps.skills) {
            if (!agentConfig.skills.include.includes(s)) {
              agentConfig.skills.include.push(s);
            }
          }
        }
        if (deps.inline_skills) {
          if (!agentConfig.skills.include) agentConfig.skills.include = [];
          for (const s of deps.inline_skills) {
            if (!agentConfig.skills.include.includes(s)) {
              agentConfig.skills.include.push(s);
            }
          }
        }
        if (deps.mcp) {
          if (!agentConfig.mcp.include) agentConfig.mcp.include = [];
          for (const m of deps.mcp) {
            if (!agentConfig.mcp.include.includes(m)) {
              agentConfig.mcp.include.push(m);
            }
          }
        }
      }
    }
  } else {
    // No sections — check for a standalone agent file
    const agentFile = join(entry.pluginPath, "winui3.agent.md");
    if (existsSync(agentFile)) {
      copyFileSync(agentFile, join(targetGh, "agents", "winui3.agent.md"));
      agentFlag = true;
    }
    // Also check old plugin structure: agents/ + skills/ folders
    const legacyAgents = join(entry.pluginPath, "agents");
    if (existsSync(legacyAgents)) {
      for (const f of readdirSync(legacyAgents)) {
        if (f.endsWith(".agent.md")) {
          copyFileSync(
            join(legacyAgents, f),
            join(targetGh, "agents", f)
          );
          agentFlag = true;
        }
      }
    }

    const legacySkills = join(entry.pluginPath, "skills");
    if (existsSync(legacySkills)) {
      const count = flattenSkills(legacySkills, join(targetGh, "skills"));
      log(`  Installed ${count} skills from agent setup`);
    }

    // Install MCP config from old structure
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

  // ── 4. Install skills ──
  if (agentConfig.skills) {
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
    if (agentConfig.skills.include) {
      skillsToInstall = agentConfig.skills.include;
    } else if (agentConfig.skills.exclude) {
      skillsToInstall = findAllSkills().filter(d => !agentConfig.skills!.exclude!.includes(d));
    } else if (agentConfig.skills.all) {
      skillsToInstall = findAllSkills();
    } else {
      skillsToInstall = [];
    }

    let skillCount = 0;
    for (const skill of skillsToInstall) {
      const skillSrc = findSkillPath(skill);
      if (skillSrc) {
        copyDirRecursive(skillSrc, join(targetGh, "skills", skill));
        skillCount++;
      }
    }
    if (skillCount > 0) log(`  Installed ${skillCount} skills`);
  }

  // ── 4b. Install hooks ──
  if (agentConfig.hooks) {
    const hooksDir = join(entry.pluginPath, agentConfig.hooks);
    if (existsSync(hooksDir)) {
      const hooksJsonSrc = join(hooksDir, "hooks.json");
      if (existsSync(hooksJsonSrc)) {
        // Read hooks config and resolve script paths to absolute
        let hooksContent = readFileSync(hooksJsonSrc, "utf-8");
        const absHooksDir = resolve(hooksDir).replace(/\\/g, "\\\\");
        hooksContent = hooksContent.replace(/\$\{HOOKS_DIR\}/g, absHooksDir);

        // Install to .github/hooks/ in the working directory
        const targetHooksDir = join(targetGh, "hooks");
        mkdirSync(targetHooksDir, { recursive: true });
        writeFileSync(join(targetHooksDir, "hooks.json"), hooksContent);
        log(`  Installed hooks from ${agentConfig.hooks}`);
      }
    }
  }

  // ── 5. Install MCP servers ──
  if (agentConfig.mcp && !mcpConfigPath && (agentConfig.mcp.include || agentConfig.mcp.exclude || agentConfig.mcp.all)) {
    let mcpServers: string[];
    if (agentConfig.mcp.include) {
      mcpServers = agentConfig.mcp.include;
    } else if (agentConfig.mcp.exclude) {
      mcpServers = existsSync(srcMcpDir)
        ? readdirSync(srcMcpDir)
            .filter(f => f.endsWith(".json"))
            .map(f => f.replace(".json", ""))
            .filter(n => !agentConfig.mcp!.exclude!.includes(n))
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

  // Copy build.ps1 if present in installed skills
  const buildScript = join(targetGh, "skills", "winui3-dev-workflow", "build.ps1");
  if (existsSync(buildScript)) {
    log("  build.ps1 available in winui3-dev-workflow skill");
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
    process.env.HOME || process.env.USERPROFILE || "",
    ".copilot",
    "session-state"
  );
  const preSessions = existsSync(sessionStateDir)
    ? readdirSync(sessionStateDir)
    : [];

  // ── 6. Build prompt ──
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

  if (agentConfig.prompt_addendum) {
    const expandedAddendum = agentConfig.prompt_addendum
      .replace(/\{app_name\}/g, appName)
      .replace(/\{app_dir\}/g, workDir);
    prompt += `\n\n${expandedAddendum}`;
  }

  // Add framework hint if not already present in prompt
  if (agentConfig.framework_hint && !prompt.includes(agentConfig.framework_hint)) {
    prompt += `\n\nIMPORTANT: Build this as a **${agentConfig.framework_hint}** app.`;
  }

  // ── 7. Run copilot ──
  const promptFile = join(trialDir, "build-prompt.txt");
  writeFileSync(promptFile, prompt);

  // Show the full prompt in the live view
  log(`\n\x1b[36m${"─".repeat(60)}\x1b[0m`);
  log(`\x1b[36m  📝  PROMPT\x1b[0m`);
  log(`\x1b[36m${"─".repeat(60)}\x1b[0m\n`);
  log(prompt);
  log(`\n\x1b[36m${"─".repeat(60)}\x1b[0m\n`);

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
  let usage = parseUsage(buildResult.output);

  // Fallback: if parseUsage found no models (e.g., orchestrator agents that delegate to sub-agents),
  // aggregate token usage from copilot session-state events.jsonl files matching this trial's cwd.
  if (!usage.models || Object.keys(usage.models).length === 0) {
    const sessionUsage = aggregateSessionUsage(workDir, log);
    if (sessionUsage) {
      usage = { ...usage, ...sessionUsage };
      log(`  Aggregated usage from session-state: ${Object.keys(sessionUsage.models || {}).length} model(s)`);
    }
  }

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

  // ── 8. Build ──
  setStatus("dotnet_build");
  if (agentConfig.build_command) {
    banner("CUSTOM BUILD", "🔨", "cyan");
    const customCsproj = findCsproj(workDir);
    const expandedBuildCmd = agentConfig.build_command
      .replace(/\{app_dir\}/g, workDir)
      .replace(/\{app_name\}/g, appName)
      .replace(/\{csproj\}/g, customCsproj ? `"${customCsproj}"` : "");
    entry.builds = await customBuild(expandedBuildCmd, workDir, trialDir, callbacks, log);
    if (customCsproj) (entry as any)._csproj = customCsproj;
    log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
    if (!entry.builds) {
      banner("FAILED: Custom build failed", "❌", "red");
      entry.runs = false;
      entry.score = 0;
      entry.failReason = "Build failed";
    }
  } else {
    banner("DOTNET BUILD", "🔨", "cyan");
    const dotnetResult = await defaultDotnetBuild(workDir, trialDir, globalConfig, callbacks, log);
    if (!dotnetResult.csproj) {
      banner("FAILED: No .csproj found", "❌", "red");
      entry.builds = false;
      entry.runs = false;
      entry.score = 0;
      entry.failReason = "No csproj";
    } else {
      entry.builds = dotnetResult.success;
      log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
      if (!entry.builds) {
        banner("FAILED: dotnet build failed", "❌", "red");
        entry.runs = false;
        entry.score = 0;
        entry.failReason = "Build failed";
      }
      // Store csproj for launch phase
      (entry as any)._csproj = dotnetResult.csproj;
    }
  }

  // ── 9. Launch ──
  if (entry.builds) {
    setStatus("launching");
    if (agentConfig.launch_command) {
      banner("LAUNCH APP (custom)", "🚀", "cyan");
      const expandedLaunchCmd = agentConfig.launch_command
        .replace(/\{app_dir\}/g, workDir)
        .replace(/\{app_name\}/g, appName);
      const launchResult = await customLaunch(
        expandedLaunchCmd,
        expandedLaunchDetect,
        workDir,
        log
      );
      entry.runs = launchResult.success;
    } else {
      banner("LAUNCH APP", "🚀", "cyan");
      const csproj = (entry as any)._csproj as string | undefined;
      if (csproj) {
        const launchResult = await defaultWinappLaunch(
          workDir, appName, csproj, agentConfig.launch_mode, callbacks, log
        );
        entry.runs = launchResult.success;
      } else {
        entry.runs = false;
      }
    }
    log(`  ${entry.runs ? "PASS ✅ App running" : "FAIL ❌ No window"}`);
    if (!entry.runs) {
      entry.score = 0;
      banner("App didn't run — skipping validation", "⏭️", "yellow");
    }
  }

  // ─── VALIDATION ─── (only if app is running)
  if (entry.runs) {
    setStatus("validating");
    banner("VALIDATION", "🔍", "magenta");

  // Capture session dirs before validation
  const preValSessions = existsSync(sessionStateDir) ? readdirSync(sessionStateDir) : [];

  const valTemplate = loadValidationPrompt(agentConfig.framework_hint);
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
    40 * 60 * 1000,  // 40 minute hard timeout for validation
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
  let validation = parseValidationJson(valResult.output);

  // If validation timed out without producing JSON, ask for a follow-up scoring
  if (!validation && valResult.timedOut && entry.validationSessionId) {
    banner("VALIDATION TIMED OUT — requesting scores", "⏰", "yellow");
    log("  Validation ran out of time before producing scores. Asking for JSON output based on work done so far...");

    const followUpPrompt = `You ran out of time during validation. Based on everything you've already checked and observed, output your evaluation JSON now. Do NOT do any more investigation — just score based on what you've seen so far. Output ONLY the JSON block in a \`\`\`json code fence.`;
    const followUpResult = await runProcess(
      "copilot",
      [`--resume=${entry.validationSessionId}`, "-p", followUpPrompt, "--yolo", "--model", entry.model],
      trialDir,
      callbacks.onOutput,
      5 * 60 * 1000,  // 5 minute timeout for follow-up
      false
    );

    // Append follow-up output to validation log
    const followUpLog = "\n\n=== VALIDATION TIMEOUT FOLLOW-UP ===\n" + followUpResult.output;
    appendFileSync(join(trialDir, "validation-log.txt"), followUpLog);

    validation = parseValidationJson(followUpResult.output);
    if (validation) {
      log("  Follow-up produced scores successfully");
    } else {
      log("  Follow-up also failed to produce scores");
    }
  }

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
    if (valResult.timedOut) {
      log("  ERROR: Validation timed out and failed to produce scores");
      entry.failReason = "Validation timed out";
    } else {
      log("  WARN: No validation JSON found in output");
    }
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
      (entry as any)._retroData = retroJson;
    }
  }

  // ─── TRACER DETECTION ───
  const tracerAppDir = join(trialDir, "app");
  const tracerData = detectTracers(tracerAppDir);
  if (tracerData) {
    (entry as any)._tracerData = tracerData;
    writeFileSync(join(trialDir, "tracer-report.json"), JSON.stringify(tracerData, null, 2));
    log(`  Tracers: ${tracerData.total_hits}/${tracerData.total_tracers} (${Math.round(tracerData.adherence_rate * 100)}%)`);
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
  const tracerData = (entry as any)._tracerData as TracerReport | undefined;

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
    ...(tracerData ? { skill_adherence: {
      adherence_rate: tracerData.adherence_rate,
      hits: tracerData.total_hits,
      total: tracerData.total_tracers,
      per_skill: tracerData.per_skill,
      tracers: tracerData.tracers,
    } } : {}),
  };
  if ((entry as any)._setupScriptResults) {
    results.setup_scripts = (entry as any)._setupScriptResults;
  }
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
  const condShort = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "");
  const trialDir = join(runDir, entry.trialName);
  const workDir = join(trialDir, "app");

  // Load agent config for build/launch behavior
  const agentConfig = loadAgentConfig(entry.pluginPath);
  const appName = agentConfig.unique_app_name === false
    ? baseAppName
    : `${baseAppName}${condShort}${runIndex}`;

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

  // Expand launch_detect template variables
  const expandedLaunchDetect = (agentConfig.launch_detect || "")
    .replace(/\{app_dir\}/g, workDir)
    .replace(/\{app_name\}/g, appName) || appName;

  if (!existsSync(workDir)) {
    log(`  ERROR: App directory not found: ${workDir}`);
    setStatus("failed");
    entry.failReason = "No app directory";
    return;
  }

  entry.startedAt = new Date();
  banner(`REVALIDATE: ${entry.condition}`, "🔄", "cyan");

  // Kill stale instances
  try { await killProcessByName(appName, true); } catch {}

  // ─── BUILD & LAUNCH ───
  setStatus("dotnet_build");
  if (agentConfig.build_command) {
    banner("CUSTOM BUILD", "🔨", "cyan");
    const customCsproj = findCsproj(workDir);
    const expandedBuildCmd = agentConfig.build_command
      .replace(/\{app_dir\}/g, workDir)
      .replace(/\{app_name\}/g, appName)
      .replace(/\{csproj\}/g, customCsproj ? `"${customCsproj}"` : "");
    entry.builds = await customBuild(expandedBuildCmd, workDir, trialDir, callbacks, log);
    if (customCsproj) (entry as any)._csproj = customCsproj;
    log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
    if (!entry.builds) {
      entry.runs = false; entry.score = 0; entry.failReason = "Build failed";
      setStatus("failed");
      entry.finishedAt = new Date();
      return;
    }
  } else {
    banner("DOTNET BUILD", "🔨", "cyan");
    const dotnetResult = await defaultDotnetBuild(workDir, trialDir, globalConfig, callbacks, log);
    if (!dotnetResult.csproj) {
      entry.builds = false; entry.runs = false; entry.score = 0;
      entry.failReason = "No csproj";
      setStatus("failed");
      return;
    }
    entry.builds = dotnetResult.success;
    log(`  ${entry.builds ? "PASS ✅" : "FAIL ❌"}`);
    if (!entry.builds) {
      entry.runs = false; entry.score = 0; entry.failReason = "Build failed";
      setStatus("failed");
      entry.finishedAt = new Date();
      return;
    }
    (entry as any)._csproj = dotnetResult.csproj;
  }

  // ─── LAUNCH ───
  setStatus("launching");
  if (agentConfig.launch_command) {
    banner("LAUNCH APP (custom)", "🚀", "cyan");
    const expandedLaunchCmd = agentConfig.launch_command
      .replace(/\{app_dir\}/g, workDir)
      .replace(/\{app_name\}/g, appName);
    const launchResult = await customLaunch(
      expandedLaunchCmd,
      expandedLaunchDetect,
      workDir,
      log
    );
    entry.runs = launchResult.success;
  } else {
    banner("LAUNCH APP", "🚀", "cyan");
    const csproj = (entry as any)._csproj as string | undefined;
    if (csproj) {
      const launchResult = await defaultWinappLaunch(
        workDir, appName, csproj, agentConfig.launch_mode, callbacks, log
      );
      entry.runs = launchResult.success;
    } else {
      entry.runs = false;
    }
  }

  log(`  ${entry.runs ? "PASS ✅" : "FAIL ❌"}`);
  if (!entry.runs) { entry.score = 0; }

  // ─── VALIDATION ───
  if (entry.runs) {
    setStatus("validating");
    banner("VALIDATION", "🔍", "magenta");

    const promptRaw = loadPrompt(entry.scenarioPath);
    const valTemplate = loadValidationPrompt(agentConfig.framework_hint);
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

    const valResult = await runProcess("copilot", ["-p", valPrompt, "--yolo", "--model", "claude-sonnet-4.5"], workDir, callbacks.onOutput, 40 * 60 * 1000, false);
    writeFileSync(join(trialDir, "validation-log.txt"), valResult.output);

    let validation = parseValidationJson(valResult.output);

    // If validation timed out without producing JSON, ask for follow-up scoring
    if (!validation && valResult.timedOut) {
      banner("VALIDATION TIMED OUT — requesting scores", "⏰", "yellow");
      log("  Validation ran out of time. Asking for JSON output based on work done so far...");

      // Find validation session ID for resume
      let valSessionId: string | undefined;
      if (existsSync(join(process.env.HOME || process.env.USERPROFILE || "", ".copilot", "session-state"))) {
        const ssDir = join(process.env.HOME || process.env.USERPROFILE || "", ".copilot", "session-state");
        const sessions = readdirSync(ssDir)
          .map(s => ({ name: s, mtime: statSync(join(ssDir, s)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime);
        if (sessions.length > 0) valSessionId = sessions[0].name;
      }

      if (valSessionId) {
        const followUpPrompt = `You ran out of time during validation. Based on everything you've already checked and observed, output your evaluation JSON now. Do NOT do any more investigation — just score based on what you've seen so far. Output ONLY the JSON block in a \`\`\`json code fence.`;
        const followUpResult = await runProcess(
          "copilot",
          [`--resume=${valSessionId}`, "-p", followUpPrompt, "--yolo", "--model", "claude-sonnet-4.5"],
          workDir,
          callbacks.onOutput,
          5 * 60 * 1000,
          false
        );
        appendFileSync(join(trialDir, "validation-log.txt"), "\n\n=== VALIDATION TIMEOUT FOLLOW-UP ===\n" + followUpResult.output);
        validation = parseValidationJson(followUpResult.output);
        if (validation) log("  Follow-up produced scores successfully");
        else log("  Follow-up also failed to produce scores");
      }
    }

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
      if (valResult.timedOut) {
        log("  ERROR: Validation timed out and failed to produce scores");
        entry.failReason = "Validation timed out";
      } else {
        log("  WARN: No validation JSON found in output");
      }
      entry.score = 10;
    }
  }

  // ─── CLEANUP & SAVE ───
  // Gracefully quit + force-kill app
  if (!isWindows) {
    try {
      await runProcess("osascript", ["-e", `tell application "${appName}" to quit`], ".", () => {}, 5000);
      await new Promise(r => setTimeout(r, 2000));
    } catch {}
  }
  try { await killProcessByName(appName, true); } catch {}
  if (expandedLaunchDetect && expandedLaunchDetect !== appName) {
    if (!isWindows) {
      try {
        await runProcess("osascript", ["-e", `tell application "${expandedLaunchDetect}" to quit`], ".", () => {}, 5000);
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
    }
    try { await killProcessByName(expandedLaunchDetect, true); } catch {}
  }

  // Uninstall sideloaded app
  if (isWindows) {
    try { await killProcessByName("winapp", true); } catch {}
    try {
      await runProcess(
        "powershell", ["-NoProfile", "-Command",
          `Get-AppxPackage | Where-Object { $_.Name -match '${appName.replace(/'/g, "''")}' } | Remove-AppxPackage -ErrorAction SilentlyContinue`],
        ".", () => {}, 15000
      );
    } catch {}
  }

  // Remove screenshot files left by the validation agent (keep final-screenshot/screenshot for HTML report)
  const keepScreenshots = /^(final-screenshot|screenshot)\.(png|jpg|jpeg|bmp)$/i;
  for (const dir of [trialDir, workDir]) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir)) {
        if (/\.(png|jpg|jpeg|bmp)$/i.test(f) && !keepScreenshots.test(f)) {
          rmSync(join(dir, f), { force: true });
        }
      }
    } catch {}
  }

  // Remove bulky build artifacts (xcodebuild DerivedData, .NET bin/obj)
  const bulkDirs = [
    join(workDir, "build"),
    join(workDir, "build-derived"),
    join(workDir, "DerivedData"),
    join(workDir, "bin"),
    join(workDir, "obj"),
  ];
  for (const d of bulkDirs) {
    if (existsSync(d)) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
  }
  if (existsSync(workDir)) {
    try {
      for (const sub of readdirSync(workDir)) {
        const subPath = join(workDir, sub);
        if (!statSync(subPath).isDirectory()) continue;
        for (const target of ["bin", "obj"]) {
          const t = join(subPath, target);
          if (existsSync(t)) {
            try { rmSync(t, { recursive: true, force: true }); } catch {}
          }
        }
      }
    } catch {}
  }

  setStatus(entry.score && entry.score > 10 ? "done" : "failed");
  entry.finishedAt = new Date();

  // Read existing results for usage data
  let usage: Record<string, any> = {};
  const existingResults = join(trialDir, "results.json");
  if (existsSync(existingResults)) {
    try {
      const old = JSON.parse(readFileSync(existingResults, "utf-8"));
      usage = old.metrics?.time_and_tokens || {};
      // Restore build-phase metrics onto the entry so the UI doesn't lose them
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
      // Restore build session ID
      entry.buildSessionId = old.session_ids?.build || entry.buildSessionId;
    } catch {}
  }
  // Run tracer detection for revalidation too
  const revalTracerData = detectTracers(join(trialDir, "app"));
  if (revalTracerData) {
    (entry as any)._tracerData = revalTracerData;
    writeFileSync(join(trialDir, "tracer-report.json"), JSON.stringify(revalTracerData, null, 2));
  }
  saveResults(trialDir, entry, scenarioConfig, usage);
}