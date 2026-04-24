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
  symlinkSync,
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
import { parseTokenString } from "../components/scatter-plot.js";
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

// =============================================================================
// Copilot-specific process runner with --output-format json
// =============================================================================

interface CopilotProcessResult extends ProcessResult {
  sessionId?: string;
  usage?: {
    premiumRequests?: number;
    totalApiDurationMs?: number;
    sessionDurationMs?: number;
    codeChanges?: { linesAdded: number; linesRemoved: number };
  };
  tokenTotals: {
    mainOutput: number;
    subTotal: number;
    subAgentTotalTokens: number;
    subAgentCount: number;
    subAgentDetails: Array<{ name: string; totalTokens: number; durationMs: number }>;
  };
}

/**
 * Run copilot CLI with --output-format json.
 * Parses JSONL events from stdout in real-time:
 *   - Writes each event to `eventsFile` (JSONL) for persistence
 *   - Tracks running token totals
 *   - Reconstructs human-readable text for `onOutput` callback
 *   - Calls `onTokenUpdate` with running totals after each assistant.message
 *   - Detects session completion via the `result` event
 */
function runCopilotProcess(
  args: string[],
  cwd: string,
  eventsFile: string,
  onOutput: (data: string) => void,
  onTokenUpdate?: (totals: {
    mainOutput: number;
    subTotal: number;
    premiumRequests: number;
    subAgentTotalTokens: number;
    subAgentCount: number;
    subAgentDetails: Array<{ name: string; totalTokens: number; durationMs: number }>;
  }) => void,
  timeoutMs?: number,
): Promise<CopilotProcessResult> {
  return new Promise((resolve) => {
    // Inject --output-format json
    const fullArgs = [...args, "--output-format", "json"];

    const proc = spawn("copilot", fullArgs, {
      cwd,
      shell: false,
      stdio: "pipe",
    });

    let rawOutput = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let resolved = false;
    let resultEvent: any = null;

    // Running token totals — main agent vs sub-agents
    let mainOutputTokens = 0;
    let subTotalTokens = 0;
    let totalPremiumRequests = 0;
    let subAgentTotalTokens = 0;  // totalTokens from subagent.completed (input+output)
    let subAgentCount = 0;
    const subAgentDetails: Array<{ name: string; totalTokens: number; durationMs: number }> = [];
    const taskNameMap = new Map<string, string>();  // toolCallId → custom task name

    const fireTokenUpdate = () => {
      if (onTokenUpdate) {
        onTokenUpdate({ mainOutput: mainOutputTokens, subTotal: subTotalTokens, premiumRequests: totalPremiumRequests, subAgentTotalTokens, subAgentCount, subAgentDetails });
      }
    };

    // Silence detection — based on meaningful JSONL events, not raw bytes.
    // Only resets on events that indicate real progress (assistant messages,
    // tool completions, sub-agent results). Ephemeral events like reasoning
    // deltas and partial tool output do NOT reset the timer — copilot could
    // be stuck in a reasoning loop producing deltas without making progress.
    const SILENCE_THRESHOLD_MS = 300_000;
    const MIN_EVENTS_FOR_SILENCE = 3; // Need at least a few real events before activating
    let silenceTimer: NodeJS.Timeout | undefined;
    let meaningfulEventCount = 0;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (meaningfulEventCount >= MIN_EVENTS_FOR_SILENCE) {
        silenceTimer = setTimeout(() => {
          if (!resolved && proc.pid) {
            onOutput("\n⚠️  No meaningful output for 5 minutes — requesting graceful shutdown\n");
            killProcessTree(proc.pid, false);
            setTimeout(() => { if (!resolved && proc.pid) killProcessTree(proc.pid, true); }, 15000);
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
      resolve({
        exitCode: code ?? 1,
        output: rawOutput,
        timedOut,
        sessionId: resultEvent?.sessionId,
        usage: resultEvent?.usage,
        tokenTotals: { mainOutput: mainOutputTokens, subTotal: subTotalTokens, subAgentTotalTokens, subAgentCount, subAgentDetails },
      });
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        if (proc.pid) {
          killProcessTree(proc.pid, false);
          setTimeout(() => { if (!resolved && proc.pid) killProcessTree(proc.pid, true); }, 15000);
        } else {
          proc.kill();
        }
      }, timeoutMs);
    }

    // Buffer for incomplete JSONL lines (data may arrive in partial chunks)
    let lineBuffer = "";
    // Track cumulative partial output length per tool call to show only deltas
    const partialOutputLengths = new Map<string, number>();

    const processJsonLine = (line: string) => {
      if (!line.trim()) return;

      // Append raw line to events file
      try { appendFileSync(eventsFile, line + "\n"); } catch {}

      let ev: any;
      try { ev = JSON.parse(line); } catch { return; }

      const type: string = ev.type || "";

      // Reconstruct human-readable output for dashboard display
      switch (type) {
        case "assistant.message_delta":
          // Streaming text — show delta content (only main agent, not sub-agents)
          resetSilenceTimer();
          if (ev.data?.deltaContent && !ev.data?.parentToolCallId) {
            onOutput(ev.data.deltaContent);
          }
          break;

        case "assistant.reasoning_delta":
          // Reasoning/thinking stream — model is actively working
          resetSilenceTimer();
          break;

        case "assistant.message":
          // Complete message with token count
          meaningfulEventCount++;
          resetSilenceTimer();
          if (ev.data?.outputTokens) {
            if (ev.data.parentToolCallId) {
              // Sub-agent message — track separately
              subTotalTokens += ev.data.outputTokens;
            } else {
              // Main agent message
              mainOutputTokens += ev.data.outputTokens;
            }
            fireTokenUpdate();
          }
          // Show tool requests summary (only for main agent, not sub-agent noise)
          if (!ev.data?.parentToolCallId && ev.data?.toolRequests?.length > 0) {
            for (const tr of ev.data.toolRequests) {
              if (tr.name && tr.name !== "report_intent") {
                onOutput(`\n🔧 ${tr.name}(${summarizeArgs(tr.arguments)})\n`);
              }
            }
          }
          break;

        case "tool.execution_start":
          // Track task() tool calls to map toolCallId to custom agent name
          if (ev.data?.toolName === "task" && ev.data?.arguments?.name && ev.data?.toolCallId) {
            taskNameMap.set(ev.data.toolCallId, ev.data.arguments.description || ev.data.arguments.name);
          }
          break;

        case "tool.execution_partial_result":
          // Streaming output from long-running tools (e.g., dotnet build, powershell, sub-agents)
          // Reset silence timer — partial output means the process is actively working
          resetSilenceTimer();
          // partialOutput is cumulative — extract only the new delta
          if (ev.data?.partialOutput && ev.data?.toolCallId) {
            const callId = ev.data.toolCallId;
            const prevLen = partialOutputLengths.get(callId) || 0;
            const full = ev.data.partialOutput;
            if (full.length > prevLen) {
              const delta = full.substring(prevLen);
              partialOutputLengths.set(callId, full.length);
              // Show non-empty trimmed lines from the delta
              const newLines = delta.split("\n").filter((l: string) => l.trim());
              for (const nl of newLines) {
                if (nl.trim().length > 0 && nl.trim().length < 300) {
                  onOutput(`  ${nl.trim()}\n`);
                }
              }
            }
          }
          break;

        case "tool.execution_complete":
          meaningfulEventCount++;
          resetSilenceTimer();
          if (ev.data?.result?.content) {
            const content = ev.data.result.content;
            // Truncate very long tool results for display
            const display = content.length > 500 ? content.substring(0, 500) + "…" : content;
            onOutput(`${display}\n`);
          }
          break;

        case "subagent.completed":
        case "subagent.failed":
          meaningfulEventCount++;
          resetSilenceTimer();
          if (ev.data) {
            const status = type === "subagent.completed" ? "✅" : "❌";
            const tokenInfo = ev.data.totalTokens ? ` (${ev.data.totalTokens} total tokens, ${ev.data.durationMs || 0}ms)` : "";
            onOutput(`\n${status} Sub-agent ${type.split(".")[1]}: ${ev.data.agentDisplayName || ev.data.agentName || "?"} ${ev.data.model || ""}${tokenInfo}\n`);
            // Track sub-agent total tokens (input+output combined)
            if (ev.data.totalTokens) {
              subAgentTotalTokens += ev.data.totalTokens;
              subAgentCount++;
              const customName = taskNameMap.get(ev.data.toolCallId) || ev.data.agentDisplayName || ev.data.agentName || `sub-${subAgentCount}`;
              subAgentDetails.push({
                name: customName,
                totalTokens: ev.data.totalTokens,
                durationMs: ev.data.durationMs || 0,
              });
              fireTokenUpdate();
            }
          }
          break;

        case "result":
          // Final summary event
          resultEvent = ev;
          if (ev.usage) {
            totalPremiumRequests = ev.usage.premiumRequests || 0;
            fireTokenUpdate();
          }
          // Also signal completion — kill process tree after brief delay since copilot
          // may have child processes (winapp run) keeping the tree alive
          if (!resolved && proc.pid) {
            setTimeout(() => { if (!resolved && proc.pid) killProcessTree(proc.pid, true); }, 5000);
          }
          break;

        case "assistant.turn_start":
          if (ev.data?.turnId && parseInt(ev.data.turnId) > 0) {
            onOutput(`\n── Turn ${ev.data.turnId} ──\n`);
          }
          break;

        case "subagent.started":
          // Sub-agent spawned — log it for visibility
          if (ev.data) {
            onOutput(`\n🚀 Sub-agent started: ${ev.data.agentDisplayName || ev.data.agentName || "unknown"}\n`);
          }
          meaningfulEventCount++;
          resetSilenceTimer();
          break;

        // Quiet events — skip display
        case "assistant.turn_end":
        case "assistant.reasoning":
        case "user.message":
        case "session.mcp_servers_loaded":
        case "session.mcp_server_status_changed":
        case "session.tools_updated":
        case "session.skills_loaded":
        case "session.background_tasks_changed":
        case "session.info":
        case "system.notification":
          break;

        default:
          // Log unexpected event types for debugging
          if (!ev.ephemeral) {
            onOutput(`[${type}]\n`);
          }
          break;
      }
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;

      // Parse complete JSONL lines
      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || ""; // Keep incomplete last line in buffer
      for (const line of lines) {
        processJsonLine(line);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      rawOutput += text;
      onOutput(text);
    });

    proc.on("close", (code) => finish(code));
    proc.on("exit", (code) => finish(code));
    proc.on("error", () => finish(1));
  });
}

/**
 * Convert a JSONL events file to human-readable text transcript.
 * Mirrors the logic in scripts/dev-get-session-txt.ps1.
 */
function eventsToReadableText(eventsFile: string): string {
  if (!existsSync(eventsFile)) return "";
  const lines = readFileSync(eventsFile, "utf-8").split("\n").filter((l: string) => l.trim());
  const out: string[] = [];

  for (const line of lines) {
    let ev: any;
    try { ev = JSON.parse(line); } catch { continue; }

    switch (ev.type) {
      case "assistant.turn_start":
        out.push(`\n=== TURN ${ev.data?.turnId} ===\n`);
        break;
      case "assistant.reasoning_delta":
        if (ev.data?.deltaContent) out.push(ev.data.deltaContent);
        break;
      case "assistant.message_delta":
        if (ev.data?.deltaContent) out.push(ev.data.deltaContent);
        break;
      case "assistant.message":
        if (ev.data?.toolRequests?.length > 0) {
          for (const tr of ev.data.toolRequests) {
            out.push(`\n--- TOOL: ${tr.name} ---\n`);
            if (tr.arguments) out.push(JSON.stringify(tr.arguments) + "\n");
          }
        }
        break;
      case "tool.execution_complete":
        if (ev.data?.result?.content) {
          out.push(`--- RESULT ---\n${ev.data.result.content}\n`);
        }
        break;
      case "subagent.started":
        out.push(`\n=== SUB-AGENT STARTED: ${ev.data?.agentDisplayName || ev.data?.agentName || "unknown"} ===\n`);
        break;
      case "subagent.completed":
        out.push(`\n=== SUB-AGENT COMPLETED: ${ev.data?.agentDisplayName || ev.data?.agentName || "?"} ${ev.data?.model || ""} (${ev.data?.totalTokens || "?"} tokens, ${ev.data?.durationMs || "?"}ms) ===\n`);
        break;
      case "subagent.failed":
        out.push(`\n=== SUB-AGENT FAILED: ${ev.data?.agentDisplayName || ev.data?.agentName || "?"} ${ev.data?.model || ""} (${ev.data?.totalTokens || "?"} tokens, ${ev.data?.durationMs || "?"}ms) ===\n`);
        break;
      case "result":
        out.push(`\n=== SESSION END ===\n`);
        if (ev.usage) {
          out.push(`Premium requests: ${ev.usage.premiumRequests}\n`);
          out.push(`API time: ${ev.usage.totalApiDurationMs}ms\n`);
          out.push(`Session time: ${ev.usage.sessionDurationMs}ms\n`);
          if (ev.usage.codeChanges) {
            out.push(`Code changes: +${ev.usage.codeChanges.linesAdded} -${ev.usage.codeChanges.linesRemoved}\n`);
          }
        }
        break;
    }
  }
  return out.join("");
}

/** Summarize tool call arguments for display (short form) */
function summarizeArgs(args: Record<string, any> | undefined): string {
  if (!args) return "";
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  // Show first arg value, truncated
  const [key, val] = entries[0];
  const str = typeof val === "string" ? val : JSON.stringify(val);
  const short = str.length > 80 ? str.substring(0, 80) + "…" : str;
  return entries.length === 1 ? short : `${short}, …`;
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
  localSessionStateDir?: string,
): Record<string, any> | null {
  // Prefer local session-state dir (from --config-dir) over global ~/.copilot
  const sessionStateDir = localSessionStateDir && existsSync(localSessionStateDir)
    ? localSessionStateDir
    : join(process.env.HOME || process.env.USERPROFILE || "", ".copilot", "session-state");
  if (!existsSync(sessionStateDir)) return null;

  // When using local session-state, skip cwd matching — all sessions belong to this trial
  const useLocalDir = localSessionStateDir && existsSync(localSessionStateDir);

  // Normalize the trial dir path for comparison (only needed for global dir scanning)
  const normalizedTrialDir = trialWorkDir.toLowerCase().replace(/[\\/]+/g, "/").replace(/\/$/, "");

  const sessionDirs = readdirSync(sessionStateDir, { withFileTypes: true })
    .filter((d: any) => d.isDirectory())
    .map((d: any) => ({
      name: d.name,
      path: join(sessionStateDir, d.name),
      eventsPath: join(sessionStateDir, d.name, "events.jsonl"),
    }))
    .filter((d: any) => existsSync(d.eventsPath));

  // Aggregate across all matching sessions — separate main vs sub-agent metrics
  const mainModelTotals: Record<string, { input: number; output: number; cached: number }> = {};
  const subModelTotals: Record<string, { input: number; output: number; cached: number }> = {};
  let totalPremium = 0;
  let totalApiMs = 0;
  let matchedSessions = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let earliestStart = Infinity;
  let subAgentCount = 0;

  for (const sd of sessionDirs) {
    try {
      const lines = readFileSync(sd.eventsPath, "utf-8").split("\n").filter((l: string) => l.trim());
      if (lines.length === 0) continue;

      // Check session.start cwd — must be within the trial directory (skip check for local dir)
      const startEv = JSON.parse(lines[0]);
      if (startEv.type !== "session.start") continue;
      if (!useLocalDir) {
        const cwd = (startEv.data?.context?.cwd || "").toLowerCase().replace(/[\\/]+/g, "/").replace(/\/$/, "");
        if (!cwd.startsWith(normalizedTrialDir)) continue;
      }

      matchedSessions++;
      const sessionStartMs = new Date(startEv.data.startTime).getTime();
      if (sessionStartMs < earliestStart) earliestStart = sessionStartMs;

      // Parse ALL session.shutdown events — classify as main vs sub-agent
      // Sub-agent shutdowns: no shutdownType field
      // Main session shutdown: shutdownType === "routine", has totalPremiumRequests
      // Retrospective --resume shutdown: also "routine" but appears after main — skip
      let mainFound = false;
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (ev.type !== "session.shutdown" || !ev.data) continue;

          const d = ev.data;
          const isRoutine = d.shutdownType === "routine";

          if (isRoutine && !mainFound) {
            // Main session — first routine shutdown
            mainFound = true;
            totalPremium += d.totalPremiumRequests || 0;
            totalApiMs += d.totalApiDurationMs || 0;
            if (d.codeChanges) {
              totalAdded += d.codeChanges.linesAdded || 0;
              totalRemoved += d.codeChanges.linesRemoved || 0;
            }
            if (d.modelMetrics) {
              for (const [model, metrics] of Object.entries(d.modelMetrics)) {
                const mu = (metrics as any).usage || {};
                if (!mainModelTotals[model]) mainModelTotals[model] = { input: 0, output: 0, cached: 0 };
                mainModelTotals[model].input += mu.inputTokens || 0;
                mainModelTotals[model].output += mu.outputTokens || 0;
                mainModelTotals[model].cached += mu.cacheReadTokens || 0;
              }
            }
          } else if (!isRoutine && !d.shutdownType) {
            // Sub-agent session — no shutdownType field
            subAgentCount++;
            if (d.modelMetrics) {
              for (const [model, metrics] of Object.entries(d.modelMetrics)) {
                const mu = (metrics as any).usage || {};
                if (!subModelTotals[model]) subModelTotals[model] = { input: 0, output: 0, cached: 0 };
                subModelTotals[model].input += mu.inputTokens || 0;
                subModelTotals[model].output += mu.outputTokens || 0;
                subModelTotals[model].cached += mu.cacheReadTokens || 0;
              }
            }
          }
          // Skip subsequent routine shutdowns (retrospective --resume)
        } catch {}
      }

      // Fallback: if no shutdown (process was killed), aggregate from assistant.message events
      if (!mainFound) {
        const model = startEv.data.selectedModel || "unknown";
        if (!mainModelTotals[model]) mainModelTotals[model] = { input: 0, output: 0, cached: 0 };
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.type === "assistant.message" && ev.data?.outputTokens) {
              mainModelTotals[model].output += ev.data.outputTokens;
            }
          } catch {}
        }
      }
    } catch {
      // Skip unparseable sessions
    }
  }

  if (matchedSessions === 0) return null;

  log(`  Session-state: found ${matchedSessions} session(s), ${subAgentCount} sub-agent shutdown(s)`);

  // Compute session duration from earliest start to now (best effort)
  const sessionDurationMs = earliestStart < Infinity
    ? Date.now() - earliestStart
    : 0;

  // Build usage object — includes both main and sub-agent breakdowns
  const usage: Record<string, any> = {
    premium_requests: totalPremium,
    api_time: totalApiMs > 0 ? formatDurationMs(totalApiMs) : undefined,
    session_time: sessionDurationMs > 0 ? formatDurationMs(sessionDurationMs) : undefined,
    models: {} as Record<string, { input: string; output: string; cached: string }>,
    sub_agent_count: subAgentCount,
    sub_agent_models: {} as Record<string, { input: string; output: string; cached: string }>,
  };
  if (totalAdded || totalRemoved) {
    usage.code_changes = `+${totalAdded} -${totalRemoved}`;
  }
  for (const [model, totals] of Object.entries(mainModelTotals)) {
    usage.models[model] = {
      input: formatTokenCount(totals.input),
      output: formatTokenCount(totals.output),
      cached: formatTokenCount(totals.cached),
    };
  }
  for (const [model, totals] of Object.entries(subModelTotals)) {
    usage.sub_agent_models[model] = {
      input: formatTokenCount(totals.input),
      output: formatTokenCount(totals.output),
      cached: formatTokenCount(totals.cached),
    };
  }
  return usage;
}

/**
 * Copy session-state events.jsonl to the trial output directory.
 * Saves as {label}-events.jsonl (e.g., "build-events.jsonl", "validation-events.jsonl").
 */
function copySessionEvents(
  sessionId: string,
  trialDir: string,
  label: string,
  log: (msg: string) => void,
): void {
  const sessionStateDir = join(
    process.env.HOME || process.env.USERPROFILE || "",
    ".copilot",
    "session-state"
  );
  const eventsPath = join(sessionStateDir, sessionId, "events.jsonl");
  if (existsSync(eventsPath)) {
    const dest = join(trialDir, `${label}-events.jsonl`);
    copyFileSync(eventsPath, dest);
    log(`  Saved ${label} session events → ${label}-events.jsonl`);
  }
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

  // Default: prefer BuildAndRun.ps1 (MSBuild, Windows-only), fallback to dotnet build
  let buildCmd: string;
  const buildScript = join(repoRoot, "src", "skills", "winui3-dev-workflow", "BuildAndRun.ps1");
  if (isWindows && existsSync(buildScript)) {
    buildCmd = `powershell -NoProfile -File "${buildScript}" "${csproj}" -SkipRun /p:Platform=x64 /p:Configuration=Debug`;
    log(`  Using BuildAndRun.ps1`);
  } else {
    buildCmd = (globalConfig.build.fallback_command || globalConfig.build.command)
      .replace(/\{csproj\}/g, `"${csproj}"`);
    log(`  Using dotnet build (BuildAndRun.ps1 not found)`);
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
  // Look in both workDir and csprojDir since the agent may create the project in a subdirectory
  const hasManifest = !forceUnpackaged && (
    existsSync(join(workDir, "Package.appxmanifest")) ||
    existsSync(join(workDir, "appxmanifest.xml")) ||
    existsSync(join(csprojDir, "Package.appxmanifest")) ||
    existsSync(join(csprojDir, "appxmanifest.xml"))
  );

  if (hasManifest) {
    log(`  Packaged app: winapp run --detach --json "${outputFolder}"`);
    let launchOutput = "";
    const winappProc = spawn("winapp", ["run", outputFolder, "--detach", "--json"], {
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
  // XcodeGen/xcodebuild: look for .app bundle in build/Build/Products/Debug/
  const debugDir = join(workDir, "build", "Build", "Products", "Debug");
  if (existsSync(debugDir)) {
    const apps = readdirSync(debugDir).filter(f => f.endsWith(".app") && !f.includes("-Runner"));
    if (apps.length > 0) return apps[0].replace(/\.app$/, "");
  }
  // SPM: look for executables in .build/debug/ (symlink to arch-specific dir)
  const spmDebugDir = join(workDir, ".build", "debug");
  if (existsSync(spmDebugDir)) {
    try {
      const files = readdirSync(spmDebugDir);
      for (const f of files) {
        const fp = join(spmDebugDir, f);
        try {
          const st = statSync(fp);
          if (st.isFile() && !f.includes(".") && (st.mode & 0o111)) return f;
        } catch {}
      }
    } catch {}
  }
  return null;
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
  let pid: string | undefined;

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
    // macOS: find the app process by matching the workDir in its path
    // This avoids name mismatches (agent may name the app differently) and
    // disambiguates concurrent runs (multiple apps with the same executable name).
    const autoDetected = detectMacAppExecutable(workDir);
    const namesToTry = [detectApp];
    if (autoDetected && autoDetected !== detectApp) namesToTry.push(autoDetected);

    for (let attempt = 1; attempt <= 5; attempt++) {
      // First: try to find a process whose executable path is inside this trial's workDir
      const psResult = await runProcess(
        "bash", ["-c", `ps axo pid,comm | grep -F "${workDir}" | grep -v grep | grep -v xcodebuild | head -1 | awk '{print $1}'`],
        workDir, () => {}, 5000
      );
      const foundPid = psResult.output.trim();
      if (foundPid && /^\d+$/.test(foundPid)) {
        pid = foundPid;
        success = true;
        log(`  Found app process by path (PID: ${pid})`);
        break;
      }

      // Fallback: exact name match
      for (const name of namesToTry) {
        const pgrepResult = await runProcess(
          "pgrep", ["-x", name],
          workDir, () => {}, 5000
        );
        if (pgrepResult.exitCode === 0) {
          pid = pgrepResult.output.trim().split("\n")[0];
          success = true;
          break;
        }
      }
      if (success) break;
      // Fallback: partial match on any of the names
      for (const name of namesToTry) {
        const pgrepResult2 = await runProcess(
          "pgrep", ["-f", name],
          workDir, () => {}, 5000
        );
        if (pgrepResult2.exitCode === 0) {
          pid = pgrepResult2.output.trim().split("\n")[0];
          success = true;
          break;
        }
      }
      if (success) break;
      if (attempt < 5) {
        log(`  Process not found, retrying... (${attempt}/5)`);
        await new Promise(r => setTimeout(r, 8000));
      }
    }
  }
  if (pid) log(`  App PID: ${pid}`);
  return { success, pid };
}

function parseValidationJson(output: string): any | null {
  // Strip ANSI escape codes — copilot CLI colorizes output which breaks regex matching
  const clean = output.replace(/\x1b\[[\d;]*m/g, "");

  // Helper: try to extract valid JSON from a block of text
  const tryParseBlock = (block: string): any | null => {
    if (block.includes("<0-10>") || block.includes("<0–10>")) return null;
    const firstBrace = block.indexOf("{");
    if (firstBrace < 0) return null;
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
      try { return JSON.parse(block.substring(firstBrace, lastBrace + 1)); }
      catch { return null; }
    }
    return null;
  };

  // Try ```json blocks (closed with ```) — iterate ALL matches, skipping templates
  const jsonBlockRegex = /```json\s*([\s\S]+?)\s*```/g;
  let jsonBlockMatch: RegExpExecArray | null;
  while ((jsonBlockMatch = jsonBlockRegex.exec(clean)) !== null) {
    const result = tryParseBlock(jsonBlockMatch[1].trim());
    if (result) return result;
  }

  // Fallback: unclosed ```json block (copilot output sometimes omits closing fence)
  const unclosedMatch = clean.match(/```json\s*([\s\S]+)$/);
  if (unclosedMatch) {
    const result = tryParseBlock(unclosedMatch[1].trim());
    if (result) return result;
  }

  // Fallback: find any JSON object with project_score or ui_score (flat objects only)
  let m = clean.match(/(\{[^{}]*"project_score"[^}]*\})/s);
  if (!m) m = clean.match(/(\{[^{}]*"ui_score"[^}]*\})/s);
  if (m) {
    try { return JSON.parse(m[1]); }
    catch { return null; }
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
  const logsDir = join(trialDir, "session-logs-dir");
  mkdirSync(workDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  // Set up local .copilot config dir with symlinks so session-state writes locally
  const trialConfigDir = join(logsDir, ".copilot");
  mkdirSync(trialConfigDir, { recursive: true });
  const globalCopilot = join(process.env.HOME || process.env.USERPROFILE || "", ".copilot");
  for (const item of ["config.json", "session-store.db", "session-store.db-shm", "session-store.db-wal", "installed-plugins", "ide"]) {
    const target = join(globalCopilot, item);
    const link = join(trialConfigDir, item);
    if (existsSync(target) && !existsSync(link)) {
      try { symlinkSync(target, link); } catch { /* ignore if symlink fails */ }
    }
  }

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

  // Declare appPid early so cleanupApps closure can reference it
  let appPid: string | undefined;

  const cleanupApps = async () => {
    // Kill app processes — first by PID (reliable for packaged apps whose process
    // name may be truncated), then by name as fallback.
    if (appPid) {
      const pid = parseInt(appPid, 10);
      if (!isNaN(pid)) {
        try { killProcessTree(pid, true); } catch {}
      }
    }
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
      // Packaged WinUI apps may have truncated process names (e.g.
      // "FileExplorerwinui3-base-learn-proxy-guided2" → "FileExplorer").
      // Kill any process whose name starts with the first PascalCase word of appName.
      const shortName = appName.match(/^[A-Z][a-z]+(?:[A-Z][a-z]+)*/)?.[0];
      if (shortName && shortName !== appName) {
        try {
          await runProcess(
            "powershell", ["-NoProfile", "-Command",
              `Get-Process | Where-Object { $_.ProcessName -like '${shortName}*' } | Stop-Process -Force -ErrorAction SilentlyContinue`],
            ".", () => {}, 10000
          );
        } catch {}
      }
      // Agent may rename the app (e.g. "TabNotepad" instead of "TextEditorwinui3-base1").
      // Kill any process whose executable path is inside the trial workDir.
      try {
        const escapedDir = workDir.replace(/\\/g, "\\\\").replace(/'/g, "''");
        await runProcess(
          "powershell", ["-NoProfile", "-Command",
            `Get-Process | Where-Object { try { $_.Path -and $_.Path.StartsWith('${escapedDir}') } catch { $false } } | Stop-Process -Force -ErrorAction SilentlyContinue`],
          ".", () => {}, 10000
        );
      } catch {}
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
            scenario: entry.scenarioConfigName,
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
          BENCH_SCENARIO_NAME: entry.scenarioConfigName,
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
              scenario: entry.scenarioConfigName,
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

  // Copy BuildAndRun.ps1 if present in installed skills
  const buildScript = join(targetGh, "skills", "winui3-dev-workflow", "BuildAndRun.ps1");
  if (existsSync(buildScript)) {
    log("  BuildAndRun.ps1 available in winui3-dev-workflow skill");
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

  prompt += `\n\nDo NOT run any git operations (git add, git commit, git status, etc.) — focus only on building the app.`;

  // ── 7. Run copilot ──
  const promptFile = join(logsDir, "build-prompt.txt");
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
  copilotArgs.push("--config-dir", trialConfigDir);

  entry.startedAt = new Date();
  const buildResult = await runCopilotProcess(
    copilotArgs,
    workDir,
    join(logsDir, "build-events.jsonl"),
    callbacks.onOutput,
    (totals) => {
      // Real-time token update — format rich display string
      const mainOut = formatTokenCount(totals.mainOutput);
      const totalOut = formatTokenCount(totals.mainOutput + totals.subTotal);
      if (totals.subTotal > 0) {
        const subTot = formatTokenCount(totals.subTotal);
        entry.tokenDisplay = `out: ${totalOut} (main: ${mainOut}, subs: ${subTot})`;
      } else {
        entry.tokenDisplay = `out: ${mainOut}`;
      }
      entry.outputTokens = formatTokenCount(totals.mainOutput);
      entry.premiumRequests = totals.premiumRequests;
      if (totals.subAgentTotalTokens > 0) {
        entry.subAgentInputTokens = formatTokenCount(totals.subAgentTotalTokens);
        entry.subAgentCount = totals.subAgentCount;
        entry.subAgentDetails = totals.subAgentDetails;
      }
      callbacks.onStatusChange(entry);
    },
    opts.maxBuildMinutes * 60 * 1000,
  );

  writeFileSync(join(logsDir, "session-log.txt"), eventsToReadableText(join(logsDir, "build-events.jsonl")));

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
          scenario: entry.scenarioConfigName,
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

  // Session ID from --output-format json result event
  let buildSessionId = buildResult.sessionId;
  if (buildSessionId) {
    entry.buildSessionId = buildSessionId;
    log(`  Build session ID: ${buildSessionId}`);
  } else {
    // Fallback: find session ID by diffing session-state dirs
    if (existsSync(sessionStateDir)) {
      const postSessions = readdirSync(sessionStateDir);
      const newSessions = postSessions.filter((s: string) => !preSessions.includes(s));
      if (newSessions.length > 0) {
        const sorted = newSessions
          .map((s: string) => ({ name: s, mtime: statSync(join(sessionStateDir, s)).mtimeMs }))
          .sort((a: any, b: any) => b.mtime - a.mtime);
        buildSessionId = sorted[0].name;
        entry.buildSessionId = buildSessionId;
        log(`  Build session ID (fallback): ${buildSessionId}`);
      }
    }
  }

  // Parse usage — prefer structured data from --output-format json result event
  let usage: Record<string, any> = {};
  if (buildResult.usage) {
    usage = {
      premium_requests: buildResult.usage.premiumRequests,
      api_time: buildResult.usage.totalApiDurationMs
        ? formatDurationMs(buildResult.usage.totalApiDurationMs) : undefined,
      session_time: buildResult.usage.sessionDurationMs
        ? formatDurationMs(buildResult.usage.sessionDurationMs) : undefined,
      code_changes: buildResult.usage.codeChanges
        ? `+${buildResult.usage.codeChanges.linesAdded} -${buildResult.usage.codeChanges.linesRemoved}` : undefined,
      models: {},
    };
    log(`  Usage from JSON result: ${usage.premium_requests} premium, ${usage.session_time}`);
  } else {
    // Fallback: parse from text output  
    usage = parseUsage(buildResult.output);
  }

  // Fallback: if parseUsage found no models (e.g., orchestrator agents that delegate to sub-agents),
  // aggregate token usage from copilot session-state events.jsonl files matching this trial's cwd.
  const localSessionState = join(logsDir, ".copilot", "session-state");
  if (!usage.models || Object.keys(usage.models).length === 0) {
    const sessionUsage = aggregateSessionUsage(workDir, log, localSessionState);
    if (sessionUsage) {
      usage = { ...usage, ...sessionUsage };
      log(`  Aggregated usage from session-state: ${Object.keys(sessionUsage.models || {}).length} model(s)`);
    }
  } else {
    // Even when we have main model data, still aggregate to get sub-agent breakdown
    const sessionUsage = aggregateSessionUsage(workDir, log, localSessionState);
    if (sessionUsage) {
      usage.sub_agent_count = sessionUsage.sub_agent_count;
      usage.sub_agent_models = sessionUsage.sub_agent_models;
    }
  }

  entry.sessionTime = usage.session_time;
  entry.apiTime = usage.api_time;
  entry.codeChanges = usage.code_changes;
  entry.premiumRequests = usage.premium_requests;
  if (usage.models) {
    const firstModel = Object.keys(usage.models)[0];
    if (firstModel) {
      entry.inputTokens = usage.models[firstModel].input;
      entry.outputTokens = usage.models[firstModel].output;
      entry.cachedTokens = usage.models[firstModel].cached;
    }
  }
  // Populate sub-agent token breakdown from session-state shutdown events
  // (may be empty if sub-agent shutdowns lack modelMetrics)
  if (usage.sub_agent_models && Object.keys(usage.sub_agent_models).length > 0) {
    let subIn = 0, subCached = 0;
    for (const m of Object.values(usage.sub_agent_models) as any[]) {
      subIn += parseTokenString(m.input);
      subCached += parseTokenString(m.cached);
    }
    entry.subAgentInputTokens = formatTokenCount(subIn);
    entry.subAgentCachedTokens = formatTokenCount(subCached);
    entry.subAgentCount = usage.sub_agent_count || 0;
  } else if (buildResult.tokenTotals.subAgentTotalTokens > 0) {
    // Fallback: use totalTokens from subagent.completed events (no cache breakdown)
    entry.subAgentInputTokens = formatTokenCount(buildResult.tokenTotals.subAgentTotalTokens);
    entry.subAgentCount = buildResult.tokenTotals.subAgentCount;
    entry.subAgentDetails = buildResult.tokenTotals.subAgentDetails;
    // Also store in usage for persistence
    usage.sub_agent_count = buildResult.tokenTotals.subAgentCount;
    usage.sub_agent_total_tokens = formatTokenCount(buildResult.tokenTotals.subAgentTotalTokens);
    usage.sub_agent_details = buildResult.tokenTotals.subAgentDetails;
  }

  // Write aggregated session usage to logs dir
  if (Object.keys(usage).length > 0) {
    writeFileSync(
      join(logsDir, "session-usage.json"),
      JSON.stringify({
        build_session_id: buildSessionId || null,
        ...usage,
      }, null, 2)
    );
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
    entry.builds = await customBuild(expandedBuildCmd, workDir, logsDir, callbacks, log);
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
    const dotnetResult = await defaultDotnetBuild(workDir, logsDir, globalConfig, callbacks, log);
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
      appPid = launchResult.pid;
    } else {
      banner("LAUNCH APP", "🚀", "cyan");
      const csproj = (entry as any)._csproj as string | undefined;
      if (csproj) {
        const launchResult = await defaultWinappLaunch(
          workDir, appName, csproj, agentConfig.launch_mode, callbacks, log
        );
        entry.runs = launchResult.success;
        appPid = launchResult.pid;
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
  // Resolve the actual process name for macOS (may differ from appName for bare agents)
  const actualAppProcess = detectMacAppExecutable(workDir) || appName;
  let valPrompt = valTemplate
    .replace(/\{original_prompt\}/g, promptRaw.trim())
    .replace(/\{app_name\}/g, actualAppProcess)
    .replace(/\{app_pid\}/g, appPid || "")
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

  // Point validation at the actual project directory (may be a subdirectory of workDir)
  const valCsproj = (entry as any)._csproj as string | undefined;
  const projectDir = valCsproj ? join(valCsproj, "..") : workDir;
  valPrompt += `\n\n## Project source code location\nThe app source code is at: ${projectDir}\n`;

  const valResult = await runCopilotProcess(
    ["-p", valPrompt, "--yolo", "--model", entry.model, "--config-dir", trialConfigDir],
    trialDir,
    join(logsDir, "validation-events.jsonl"),
    callbacks.onOutput,
    undefined, // no token update callback for validation
    40 * 60 * 1000,  // 40 minute hard timeout for validation
  );
  writeFileSync(join(logsDir, "validation-log.txt"), eventsToReadableText(join(logsDir, "validation-events.jsonl")));

  // Session ID from result event
  if (valResult.sessionId) {
    entry.validationSessionId = valResult.sessionId;
    log(`  Validation session ID: ${entry.validationSessionId}`);
  } else {
    // Fallback: find by diffing session-state dirs
    if (existsSync(sessionStateDir)) {
      const postValSessions = readdirSync(sessionStateDir);
      const newValSessions = postValSessions.filter((s: string) => !preValSessions.includes(s));
      if (newValSessions.length > 0) {
        const sorted = newValSessions
          .map((s: string) => ({ name: s, mtime: statSync(join(sessionStateDir, s)).mtimeMs }))
          .sort((a: any, b: any) => b.mtime - a.mtime);
        entry.validationSessionId = sorted[0].name;
        log(`  Validation session ID (fallback): ${entry.validationSessionId}`);
      }
    }
  }

  // Parse validation scores from the readable text (not raw JSONL events)
  const validationText = eventsToReadableText(join(logsDir, "validation-events.jsonl"));
  let validation = parseValidationJson(validationText);

  // If validation timed out without producing JSON, ask for a follow-up scoring
  if (!validation && valResult.timedOut && entry.validationSessionId) {
    banner("VALIDATION TIMED OUT — requesting scores", "⏰", "yellow");
    log("  Validation ran out of time before producing scores. Asking for JSON output based on work done so far...");

    const followUpPrompt = `You ran out of time during validation. Based on everything you've already checked and observed, output your evaluation JSON now. Do NOT do any more investigation — just score based on what you've seen so far. Output ONLY the JSON block in a \`\`\`json code fence.`;
    const followUpResult = await runCopilotProcess(
      [`--resume=${entry.validationSessionId}`, "-p", followUpPrompt, "--yolo", "--model", entry.model, "--config-dir", trialConfigDir],
      trialDir,
      join(logsDir, "validation-followup-events.jsonl"),
      callbacks.onOutput,
      undefined, // no token update
      5 * 60 * 1000,  // 5 minute timeout for follow-up
    );

    // Append follow-up transcript to validation log
    const followUpText = "\n\n=== VALIDATION TIMEOUT FOLLOW-UP ===\n" + eventsToReadableText(join(logsDir, "validation-followup-events.jsonl"));
    appendFileSync(join(logsDir, "validation-log.txt"), followUpText);

    validation = parseValidationJson(followUpText);
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

  // ─── SAVE RESULTS (before retrospective so data is preserved if retro crashes) ───
  entry.finishedAt = new Date();
  const runElapsed = entry.startedAt
    ? Math.round((entry.finishedAt.getTime() - entry.startedAt.getTime()) / 1000)
    : 0;
  const elapsedStr = `${Math.floor(runElapsed / 60)}m ${runElapsed % 60}s`;
  saveResults(trialDir, entry, scenarioConfig, usage);

  // ─── RETROSPECTIVE ─── (always runs if we have a build session)
  if (buildSessionId) {
    setStatus("retrospective");
    banner("RETROSPECTIVE (Opus)", "📝", "green");

    try {
      const retroPrompt = loadRetrospectivePrompt();
      const retroResult = await runCopilotProcess(
        [
          `--resume=${buildSessionId}`,
          "-p",
          retroPrompt,
          "--yolo",
          "--model",
          "claude-opus-4.6",
          "--config-dir",
          trialConfigDir,
        ],
        trialDir,
        join(logsDir, "retrospective-events.jsonl"),
        callbacks.onOutput,
        undefined, // no token update
        5 * 60 * 1000, // 5 minute timeout for retrospective
      );
      const retroText = eventsToReadableText(join(logsDir, "retrospective-events.jsonl"));
      writeFileSync(join(logsDir, "retrospective-log.txt"), retroText);

      const retroJson = parseValidationJson(retroText);
      if (retroJson) {
        writeFileSync(
          join(logsDir, "retrospective.json"),
          JSON.stringify(retroJson, null, 2)
        );
        (entry as any)._retroData = retroJson;
        // Re-save results with retrospective data included
        saveResults(trialDir, entry, scenarioConfig, usage);
      }
    } catch (err) {
      log(`  ⚠️ Retrospective failed: ${err}`);
    }
  }

  // ─── CLEANUP ───
  banner("CLEANUP & RESULTS", "✅", "green");
  await cleanupApps();

  // ─── FINALIZE ───
  setStatus(entry.failReason ? "failed" : "done");

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
      const trialDir = join(runDir, e.trialName);
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

      // Analyze token usage from build-events.jsonl
      let tokenAnalysis = "";
      const eventsPath = join(trialDir, "build-events.jsonl");
      if (existsSync(eventsPath)) {
        try {
          const analysisScript = join(repoRoot, "scripts", "analyze-session-tokens.ps1");
          if (existsSync(analysisScript)) {
            const { execSync } = require("child_process");
            const jsonOut = execSync(
              `powershell -NoProfile -File "${analysisScript}" "${eventsPath}" -Json`,
              { encoding: "utf-8", timeout: 15000 }
            ).trim();
            const analysis = JSON.parse(jsonOut);
            const m = analysis.mainAgent;
            const t = analysis.totals;
            tokenAnalysis = `Main agent: ${m.outputTokens} out tokens, ${m.messages} msgs, ${m.toolCalls} tool calls`;
            if (t.subAgentCount > 0) {
              tokenAnalysis += `\n  Sub-agents (${t.subAgentCount}): ${t.subOutputTokens} out tokens`;
              for (const sub of analysis.subAgents) {
                tokenAnalysis += `\n    - ${sub.name} (${sub.status}): ${sub.outputTokens} out, ${sub.messages} msgs, ${sub.durationSec || "?"}s`;
                if (sub.totalTokens) tokenAnalysis += `, ${sub.totalTokens} total tokens`;
              }
            }
            tokenAnalysis += `\n  Total output tokens: ${t.totalOutputTokens}`;
          }
        } catch {}
      }

      return `### ${e.condition} / ${e.model} / ${e.scenario}
- Score: ${e.score ?? "N/A"}/100
- Builds: ${e.builds ?? "N/A"}, Runs: ${e.runs ?? "N/A"}
- Session time: ${e.sessionTime || "N/A"}
- Code changes: ${e.codeChanges || "N/A"}
- Status: ${e.status}${e.failReason ? ` (${e.failReason})` : ""}
- Token usage: ${tokenAnalysis || "N/A"}
- Retrospective: ${retroSummary || "N/A"}`;
    })
    .join("\n\n");

  const prompt = template.replace("{results_data}", resultsData);

  onOutput("Running final summary analysis with Opus...\n");

  const result = await runCopilotProcess(
    ["-p", prompt, "--yolo", "--model", "claude-opus-4.6", "--deny-tool=edit", "--deny-tool=create"],
    runDir,
    join(runDir, "summary-events.jsonl"),
    onOutput,
    undefined, // no token update
    300000, // 5 minute timeout for summary
  );

  writeFileSync(join(runDir, "summary-log.txt"), eventsToReadableText(join(runDir, "summary-events.jsonl")));

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
    scenario: entry.scenarioConfigName,
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
  let appPid: string | undefined;
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
    appPid = launchResult.pid;
  } else {
    banner("LAUNCH APP", "🚀", "cyan");
    const csproj = (entry as any)._csproj as string | undefined;
    if (csproj) {
      const launchResult = await defaultWinappLaunch(
        workDir, appName, csproj, agentConfig.launch_mode, callbacks, log
      );
      entry.runs = launchResult.success;
      appPid = launchResult.pid;
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
    const actualAppProcess = detectMacAppExecutable(workDir) || appName;
    let valPrompt = valTemplate
      .replace(/\{original_prompt\}/g, promptRaw.trim())
      .replace(/\{app_name\}/g, actualAppProcess)
      .replace(/\{app_pid\}/g, appPid || "")
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

    // Point validation at the actual project directory (may be a subdirectory of workDir)
    const revalCsproj = (entry as any)._csproj as string | undefined;
    const revalProjectDir = revalCsproj ? join(revalCsproj, "..") : workDir;
    valPrompt += `\n\n## Project source code location\nThe app source code is at: ${revalProjectDir}\n`;

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
  saveResults(trialDir, entry, scenarioConfig, usage);
}
