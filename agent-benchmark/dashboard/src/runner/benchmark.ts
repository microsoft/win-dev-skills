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
  loadValidationPrompt,
  loadRetrospectivePrompt,
  loadSummaryPrompt,
  validateCandidateScripts,
} from "./config.js";
import type { RunEntry, ScenarioConfig, CandidateConfig } from "../types.js";

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

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput(text);
      resetSilenceTimer();

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
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput(text);
      resetSilenceTimer();
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

function parseValidationJson(output: string): any | null {
  // Try ```json block first
  let m = output.match(/```json\s*(\{.+?\})\s*```/s);
  if (!m) m = output.match(/(\{[^{}]*"project_score"[^}]*\})/s);
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

export async function runBenchmark(
  entry: RunEntry,
  runDir: string,
  opts: { maxBuildMinutes: number; maxContinues: number },
  callbacks: BenchmarkCallbacks
): Promise<void> {
  const globalConfig = loadGlobalConfig();
  const scenarioConfig: ScenarioConfig = JSON.parse(
    readFileSync(join(entry.scenarioPath, "scenario.json"), "utf-8")
  );
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

  if (entry.conditionType === "starter") {
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
    const configPath = join(entry.pluginPath, "config.json");
    let candidateConfig: CandidateConfig | undefined;

    // Read candidate config
    if (existsSync(configPath)) {
      candidateConfig = JSON.parse(readFileSync(configPath, "utf-8")) as CandidateConfig;
    }

    // ── Run candidate setup scripts (before agent/skills/MCP installation) ──
    if (candidateConfig?.scripts && candidateConfig.scripts.length > 0) {
      let resolvedScripts;
      try {
        resolvedScripts = validateCandidateScripts(
          entry.condition.replace(/^candidate-/, ""),
          candidateConfig.scripts
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

        const scriptResult = await runProcess(
          "powershell",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script.entryPoint],
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
            BENCH_CANDIDATE_NAME: entry.condition.replace(/^candidate-/, ""),
            BENCH_CANDIDATE_DIR: entry.pluginPath!,
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

      // Store setup_scripts results so they can be included in final results.json
      (entry as any)._setupScriptResults = setupScriptResults;
    }

    // Install candidate agent, skills, and MCP (after scripts, so .github is clean)
    const targetGh = join(workDir, ".github");
    mkdirSync(join(targetGh, "skills"), { recursive: true });
    mkdirSync(join(targetGh, "agents"), { recursive: true });

    if (candidateConfig) {
      const parsedConfig = candidateConfig;
      const srcSkillsDir = join(repoRoot, "src", "skills");
      const srcMcpDir = join(repoRoot, "src", "mcp");

      // Copy or assemble agent file
      const agentFile = join(entry.pluginPath, "winui3.agent.md");
      const sectionsDir = join(repoRoot, "src", "agents", "_sections");
      if ((parsedConfig as any).sections && existsSync(sectionsDir)) {
        // Slot-based assembly: base.md has {{slot_name}} placeholders
        // Each section in config fills its matching slot; unfilled slots are removed
        const sections: string[] = (parsedConfig as any).sections;
        const baseFile = join(sectionsDir, "base.md");
        let template = existsSync(baseFile) ? readFileSync(baseFile, "utf-8") : "";

        // Fill slots with matching section content
        for (const section of sections) {
          if (section === "base") continue; // base is the template itself
          const sectionFile = join(sectionsDir, `${section}.md`);
          if (existsSync(sectionFile)) {
            const content = readFileSync(sectionFile, "utf-8").trim();
            template = template.replace(`{{${section}}}`, content);
          }
        }

        // Remove any unfilled slots
        template = template.replace(/\{\{[a-z_-]+\}\}\n?/g, "");

        // Inline skill content into agent.md if configured
        if ((parsedConfig as any).inline_skills) {
          const srcSkillsDir2 = join(repoRoot, "src", "skills");
          let inlinedSkills: string[] = [];
          for (const section of sections) {
            const depsFile2 = join(sectionsDir, `${section}.deps.json`);
            if (existsSync(depsFile2)) {
              try {
                const deps2 = JSON.parse(readFileSync(depsFile2, "utf-8"));
                // Only inline skills listed in "inline_skills", not regular "skills"
                const toInline = deps2.inline_skills || [];
                for (const skill of toInline) {
                  if (inlinedSkills.includes(skill)) continue;
                  const skillMd = join(srcSkillsDir2, skill, "SKILL.md");
                  if (existsSync(skillMd)) {
                    const skillContent = readFileSync(skillMd, "utf-8")
                      .replace(/^---[\s\S]*?---\s*/m, ""); // strip YAML frontmatter
                    template += "\n\n" + skillContent.trim() + "\n";
                    inlinedSkills.push(skill);
                  }
                }
              } catch {}
            }
          }
          if (inlinedSkills.length > 0) {
            log(`  Inlined ${inlinedSkills.length} skill(s): ${inlinedSkills.join(", ")}`);
          }
        }

        writeFileSync(join(targetGh, "agents", "winui3.agent.md"), template);
        log(`  Assembled agent with slots: ${sections.filter(s => s !== "base").join("+") || "(base only)"}`);

        // Auto-resolve section dependencies (skills + mcp from .deps.json files)
        for (const section of sections) {
          const depsFile = join(sectionsDir, `${section}.deps.json`);
          if (existsSync(depsFile)) {
            try {
              const deps = JSON.parse(readFileSync(depsFile, "utf-8"));
              if (deps.skills) {
                if (!parsedConfig.skills.include) parsedConfig.skills.include = [];
                for (const s of deps.skills) {
                  if (!parsedConfig.skills.include.includes(s)) {
                    parsedConfig.skills.include.push(s);
                  }
                }
              }
              // inline_skills also need to be installed (for tools like winmd.exe)
              if (deps.inline_skills) {
                if (!parsedConfig.skills.include) parsedConfig.skills.include = [];
                for (const s of deps.inline_skills) {
                  if (!parsedConfig.skills.include.includes(s)) {
                    parsedConfig.skills.include.push(s);
                  }
                }
              }
              if (deps.mcp) {
                if (!parsedConfig.mcp) parsedConfig.mcp = {};
                if (!parsedConfig.mcp.include) parsedConfig.mcp.include = [];
                for (const m of deps.mcp) {
                  if (!parsedConfig.mcp.include.includes(m)) {
                    parsedConfig.mcp.include.push(m);
                  }
                }
              }
            } catch {}
          }
        }
      } else if (existsSync(agentFile)) {
        copyFileSync(agentFile, join(targetGh, "agents", "winui3.agent.md"));
      }

      // Resolve skills list
      let skillsToInstall: string[];
      if (parsedConfig.skills.include) {
        skillsToInstall = parsedConfig.skills.include;
      } else if (parsedConfig.skills.exclude) {
        skillsToInstall = existsSync(srcSkillsDir)
          ? readdirSync(srcSkillsDir).filter(d =>
              statSync(join(srcSkillsDir, d)).isDirectory() &&
              !parsedConfig.skills.exclude!.includes(d))
          : [];
      } else {
        // all: true — include everything
        skillsToInstall = existsSync(srcSkillsDir)
          ? readdirSync(srcSkillsDir).filter(d => statSync(join(srcSkillsDir, d)).isDirectory())
          : [];
      }

      // Copy selected skills from src/skills/
      let skillCount = 0;
      for (const skill of skillsToInstall) {
        const skillSrc = join(srcSkillsDir, skill);
        if (existsSync(skillSrc)) {
          copyDirRecursive(skillSrc, join(targetGh, "skills", skill));
          skillCount++;
        }
      }
      log(`  Installed ${skillCount} skills from src/`);

      // Resolve MCP servers
      if (parsedConfig.mcp) {
        let mcpServers: string[];
        if (parsedConfig.mcp.include) {
          mcpServers = parsedConfig.mcp.include;
        } else if (parsedConfig.mcp.exclude) {
          mcpServers = existsSync(srcMcpDir)
            ? readdirSync(srcMcpDir)
                .filter(f => f.endsWith(".json"))
                .map(f => f.replace(".json", ""))
                .filter(n => !parsedConfig.mcp.exclude!.includes(n))
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

    promptAddendum = `IMPORTANT: A WinUI 3 project has already been scaffolded in ${workDir}. Do NOT run 'dotnet new winui' — the project structure (csproj, App.xaml, MainWindow, appxmanifest) is already in place. Build your app on top of the existing project. A build.ps1 script is available at .github/skills/winui3-dev-workflow/build.ps1 that uses MSBuild instead of dotnet build for more reliable XAML compilation.`;
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
  banner(`COPILOT BUILD: ${entry.model}${agentFlag ? " --agent winui3" : ""}`, "🤖", "yellow");

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
  if (scenarioConfig.test_assets && scenarioConfig.test_assets.length > 0) {
    prompt += "\n\n## Test Assets\nThe following test assets are available:\n";
    for (const asset of scenarioConfig.test_assets) {
      prompt += `\n- **${asset.name}**: \`${asset.path}\``;
      if (asset.description) prompt += `\n  ${asset.description}`;
    }
  }
  if (promptAddendum) prompt += `\n\n${promptAddendum}`;

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
  if (agentFlag) copilotArgs.push("--agent", "winui3");
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

  // ─── DOTNET BUILD ───
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
    // Prefer build.ps1 (MSBuild) — gives better XAML compiler diagnostics than dotnet build
    const buildScript = join(repoRoot, "src", "skills", "winui3-dev-workflow", "build.ps1");
    let buildCmd: string;
    if (existsSync(buildScript)) {
      buildCmd = `powershell -NoProfile -File "${buildScript}" "${csproj}" /p:Platform=x64 /p:Configuration=Debug /restore`;
      log(`  Using MSBuild via build.ps1`);
    } else {
      buildCmd = (globalConfig.build.fallback_command || globalConfig.build.command)
        .replace(/\{csproj\}/g, `"${csproj}"`);
      log(`  Using dotnet build (build.ps1 not found)`);
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
    // Check if packaged
    const hasManifest =
      readdirSync(outputFolder).some((f) =>
        f.toLowerCase().includes("appxmanifest")
      ) ||
      readdirSync(workDir).some(
        (f) => f === "Package.appxmanifest"
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
    entry.score = entry.builds ? 10 : 0;
    banner("App didn't run — skipping validation", "⏭️", "yellow");
  }
  } // end if (entry.builds) for launch

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
    let assetSection = "\n## Test Assets\n";
    for (const asset of scenarioConfig.test_assets) {
      assetSection += `\n- **${asset.name}**: \`${asset.path}\``;
      if (asset.description) assetSection += `\n  ${asset.description}`;
    }
    valPrompt += assetSection;
  }

  valPrompt += `\n\n## Project source code location\nThe app source code is at: ${workDir}\n`;

  const valResult = await runProcess(
    "copilot",
    ["-p", valPrompt, "--yolo", "--model", entry.model],
    trialDir,
    callbacks.onOutput,
    undefined,
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

    const reqPassed = Array.isArray(validation.requirements_passed)
      ? validation.requirements_passed.length
      : 0;
    const reqFailed = Array.isArray(validation.requirements_failed)
      ? validation.requirements_failed.length
      : 0;
    const reqTotal = reqPassed + reqFailed;
    const reqPoints =
      reqTotal > 0 ? Math.round((50 * reqPassed) / reqTotal * 10) / 10 : 0;

    entry.score = Math.round(10 + generalPoints + reqPoints);
    // Store breakdown for display: quality = base + general, func = reqPoints
    entry.qualityBreakdown = `${Math.round(10 + generalPoints)}:${Math.round(reqPoints)}`;
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
    },
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
  let scenarioConfig: ScenarioConfig;
  try {
    scenarioConfig = JSON.parse(
      readFileSync(join(entry.scenarioPath, "scenario.json"), "utf-8")
    );
  } catch {
    scenarioConfig = { name: entry.scenarioConfigName, description: "", type: "new" };
  }

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

  // ─── DOTNET BUILD ───
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
  if (!entry.runs) { entry.score = entry.builds ? 10 : 0; }

  // ─── VALIDATION ───
  if (entry.runs) {
    setStatus("validating");
    banner("VALIDATION", "🔍", "magenta");

    const promptRaw = existsSync(join(entry.scenarioPath, "prompt.md"))
      ? readFileSync(join(entry.scenarioPath, "prompt.md"), "utf-8") : "";
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
      const reqPassed = Array.isArray(validation.requirements_passed) ? validation.requirements_passed.length : 0;
      const reqFailed = Array.isArray(validation.requirements_failed) ? validation.requirements_failed.length : 0;
      const reqTotal = reqPassed + reqFailed;
      const reqPoints = reqTotal > 0 ? Math.round((50 * reqPassed) / reqTotal * 10) / 10 : 0;
      entry.score = Math.round(10 + generalPoints + reqPoints);
      entry.qualityBreakdown = `${Math.round(10 + generalPoints)}:${Math.round(reqPoints)}`;
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