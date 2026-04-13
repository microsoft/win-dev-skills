#!/usr/bin/env node
/**
 * Analyze a Copilot CLI session from its events.jsonl file.
 * Produces a structured markdown report covering:
 * - Session overview (prompt, model, duration, tokens)
 * - Skills loaded and invoked
 * - Turn-by-turn breakdown with categorization
 * - Build attempts and errors
 * - BuildAndRun.ps1 usage analysis
 * - Stuck patterns and token sinks
 * - Tooling improvement opportunities
 *
 * Usage:
 *   node Analyze-Session.js <events.jsonl>
 *   node Analyze-Session.js <session-id>
 *   node Analyze-Session.js <events.jsonl> --json    (output raw JSON)
 */

const fs = require("fs");
const path = require("path");

// ── Resolve input ──
let eventsFile = process.argv[2];
const jsonOutput = process.argv.includes("--json");

if (!eventsFile) {
  console.error("Usage: node Analyze-Session.js <events.jsonl | session-id>");
  process.exit(1);
}

// If it looks like a session ID (UUID), find the events file
if (/^[0-9a-f-]{36}$/i.test(eventsFile)) {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidate = path.join(home, ".copilot", "session-state", eventsFile, "events.jsonl");
  if (fs.existsSync(candidate)) {
    eventsFile = candidate;
  } else {
    console.error(`Session not found: ${candidate}`);
    process.exit(1);
  }
}

if (!fs.existsSync(eventsFile)) {
  console.error(`File not found: ${eventsFile}`);
  process.exit(1);
}

// ── Parse events ──
const lines = fs.readFileSync(eventsFile, "utf8").split("\n").filter(l => l.trim());
const events = [];
for (const line of lines) {
  try { events.push(JSON.parse(line)); } catch {}
}

// ── Extract data ──

// Session info
const userMsg = events.find(e => e.type === "user.message");
const resultEvent = events.find(e => e.type === "result");
const skillsLoaded = events.find(e => e.type === "session.skills_loaded");

const prompt = userMsg?.data?.content || "(no prompt found)";
const sessionId = resultEvent?.sessionId || "(unknown)";
const exitCode = resultEvent?.exitCode;
const usage = resultEvent?.usage || {};

// Timestamps
const firstEvent = events[0];
const lastEvent = events[events.length - 1];
const sessionStart = firstEvent?.timestamp ? new Date(firstEvent.timestamp) : null;
const sessionEnd = lastEvent?.timestamp ? new Date(lastEvent.timestamp) : null;
const durationMs = sessionStart && sessionEnd ? sessionEnd - sessionStart : 0;
const durationMin = Math.round(durationMs / 60000 * 10) / 10;

// Available skills
const availableSkills = skillsLoaded?.data?.skills?.map(s => s.name) || [];

// ── Turn analysis ──
const turns = [];
let currentTurn = null;
const toolStarts = {};

for (const ev of events) {
  switch (ev.type) {
    case "assistant.turn_start":
      currentTurn = {
        turnNum: turns.length + 1,
        timestamp: ev.timestamp,
        tools: [],
        outputTokens: 0,
        textSnippets: [],
        skillInvocations: [],
      };
      break;

    case "assistant.message":
      if (currentTurn) {
        currentTurn.outputTokens = ev.data?.outputTokens || 0;
        if (ev.data?.toolRequests) {
          for (const tr of ev.data.toolRequests) {
            currentTurn.tools.push({
              name: tr.name,
              args: tr.arguments,
              callId: tr.id || tr.toolCallId,
            });
          }
        }
      }
      break;

    case "assistant.message_delta":
      if (currentTurn && ev.data?.deltaContent) {
        currentTurn.textSnippets.push(ev.data.deltaContent);
      }
      break;

    case "tool.execution_start":
      toolStarts[ev.data?.toolCallId] = {
        name: ev.data?.toolName,
        args: ev.data?.arguments || {},
        timestamp: ev.timestamp,
      };
      break;

    case "tool.execution_complete": {
      const start = toolStarts[ev.data?.toolCallId];
      if (start && currentTurn) {
        const result = ev.data?.result;
        const resultText = typeof result === "string" ? result :
          result?.textResultForLlm || result?.content || JSON.stringify(result || "");

        // Track skill invocations
        if (start.name === "skill") {
          const skillName = start.args?.skill || "(unknown)";
          currentTurn.skillInvocations.push(skillName);
        }

        // Attach result summary to matching tool
        for (const t of currentTurn.tools) {
          if (t.callId === ev.data?.toolCallId || t.name === start.name) {
            t.resultLength = resultText.length;
            t.hasError = /error|FAILED|SyntaxError/i.test(resultText);
            t.errorSummary = t.hasError ?
              resultText.split(/\n/).filter(l => /error|FAILED|SyntaxError/i.test(l)).slice(0, 3).map(l => l.trim().slice(0, 120)) :
              [];
            break;
          }
        }
      }
      break;
    }

    case "assistant.turn_end":
      if (currentTurn) {
        turns.push(currentTurn);
        currentTurn = null;
      }
      break;
  }
}

// ── Categorize turns ──
function categorizeTurn(turn) {
  const toolNames = turn.tools.map(t => t.name);
  const text = turn.textSnippets.join("");
  const hasSkill = turn.skillInvocations.length > 0;
  const hasBuild = turn.tools.some(t => {
    if (t.name !== "powershell") return false;
    const cmd = t.args?.command || "";
    return cmd.includes("dotnet build") || cmd.includes("MSBuild") || cmd.includes("BuildAndRun") || cmd.includes("msbuild");
  });
  const hasRun = turn.tools.some(t => {
    if (t.name !== "powershell") return false;
    const cmd = t.args?.command || "";
    return cmd.includes("winapp run") || (cmd.includes("BuildAndRun") && !cmd.includes("-SkipRun"));
  });
  const hasCreate = toolNames.includes("create");
  const hasEdit = toolNames.includes("edit");
  const hasView = toolNames.includes("view");
  const hasGit = turn.tools.some(t => t.name === "powershell" && (t.args?.command || "").includes("git "));
  const hasBuildError = turn.tools.some(t => t.hasError && t.name === "powershell");
  const hasScaffold = turn.tools.some(t => {
    const cmd = t.args?.command || "";
    return cmd.includes("dotnet new") || cmd.includes("New-Item");
  });

  if (hasSkill && toolNames.length <= 2) return "skill-load";
  if (hasGit && !hasBuild) return "git";
  if (hasBuild && hasBuildError) return "build-fix";
  if (hasBuild && !hasBuildError) return "build-ok";
  if (hasRun) return "run";
  if (hasScaffold) return "scaffold";
  if (hasCreate && !hasEdit) return "code-create";
  if (hasEdit) return "code-edit";
  if (hasView && !hasEdit && !hasCreate) return "explore";
  if (toolNames.length === 0) return "thinking";
  return "other";
}

for (const turn of turns) {
  turn.category = categorizeTurn(turn);
}

// ── Build analysis ──
const buildTurns = turns.filter(t => t.category === "build-ok" || t.category === "build-fix");
const buildAttempts = buildTurns.length;
const buildFailures = turns.filter(t => t.category === "build-fix").length;
const buildSuccesses = turns.filter(t => t.category === "build-ok").length;

// Extract specific build errors
const buildErrors = [];
for (const turn of turns) {
  for (const tool of turn.tools) {
    if (tool.hasError && tool.name === "powershell") {
      const cmd = tool.args?.command || "";
      if (cmd.includes("build") || cmd.includes("Build") || cmd.includes("MSBuild")) {
        buildErrors.push({
          turn: turn.turnNum,
          errors: tool.errorSummary,
        });
      }
    }
  }
}

// ── BuildAndRun.ps1 analysis ──
const buildAndRunUsed = turns.some(t =>
  t.tools.some(tool => tool.name === "powershell" && (tool.args?.command || "").includes("BuildAndRun"))
);

const rawDotnetBuildCount = turns.filter(t =>
  t.tools.some(tool => {
    const cmd = tool.args?.command || "";
    return tool.name === "powershell" && cmd.includes("dotnet build") && !cmd.includes("BuildAndRun");
  })
).length;

const buildAndRunTurns = turns.filter(t =>
  t.tools.some(tool => tool.name === "powershell" && (tool.args?.command || "").includes("BuildAndRun"))
);

let buildScriptAnalysis;
if (buildAndRunUsed && rawDotnetBuildCount === 0) {
  buildScriptAnalysis = { status: "good", detail: "Agent used BuildAndRun.ps1 for all builds" };
} else if (buildAndRunUsed && rawDotnetBuildCount > 0) {
  buildScriptAnalysis = {
    status: "mixed",
    detail: `Agent used raw 'dotnet build' ${rawDotnetBuildCount}x and BuildAndRun.ps1 ${buildAndRunTurns.length}x`,
    rawBuilds: rawDotnetBuildCount,
  };
} else if (rawDotnetBuildCount > 0) {
  buildScriptAnalysis = {
    status: "not-used",
    detail: `Agent used raw 'dotnet build' ${rawDotnetBuildCount}x and never used BuildAndRun.ps1`,
    rawBuilds: rawDotnetBuildCount,
  };
} else {
  buildScriptAnalysis = { status: "no-builds", detail: "No build commands detected" };
}

// ── Skill timeline ──
const skillTimeline = [];
for (const turn of turns) {
  for (const skill of turn.skillInvocations) {
    skillTimeline.push({ turn: turn.turnNum, skill });
  }
}

// ── Token analysis ──
const totalOutputTokens = turns.reduce((sum, t) => sum + t.outputTokens, 0);
const categoryTokens = {};
for (const turn of turns) {
  categoryTokens[turn.category] = (categoryTokens[turn.category] || 0) + turn.outputTokens;
}

// ── Stuck pattern detection ──
const stuckPatterns = [];

// Repeated file reads
const fileReads = {};
for (const turn of turns) {
  for (const tool of turn.tools) {
    if (tool.name === "view" && tool.args?.path) {
      const file = path.basename(tool.args.path);
      fileReads[file] = (fileReads[file] || 0) + 1;
    }
  }
}
const excessiveReads = Object.entries(fileReads).filter(([, count]) => count >= 3);
if (excessiveReads.length > 0) {
  stuckPatterns.push({
    type: "repeated-reads",
    detail: excessiveReads.map(([file, count]) => `${file} (${count}x)`).join(", "),
  });
}

// Build-fix loops (3+ consecutive build failures)
let consecutiveFailures = 0;
let maxConsecutive = 0;
for (const turn of turns) {
  if (turn.category === "build-fix") {
    consecutiveFailures++;
    maxConsecutive = Math.max(maxConsecutive, consecutiveFailures);
  } else if (turn.category === "build-ok") {
    consecutiveFailures = 0;
  }
}
if (maxConsecutive >= 3) {
  stuckPatterns.push({
    type: "build-loop",
    detail: `${maxConsecutive} consecutive build failures before success`,
  });
}

// Obj directory clean attempts
const objCleans = turns.filter(t =>
  t.tools.some(tool => (tool.args?.command || "").includes("Remove-Item") && (tool.args?.command || "").includes("obj"))
).length;
if (objCleans >= 2) {
  stuckPatterns.push({
    type: "obj-clean-loop",
    detail: `Cleaned obj/ directory ${objCleans} times (suggests stale XAML compiler state)`,
  });
}

// ── Tooling improvement opportunities ──
const toolingIssues = [];

if (buildScriptAnalysis.status === "not-used" || buildScriptAnalysis.status === "mixed") {
  toolingIssues.push({
    area: "BuildAndRun.ps1",
    issue: buildScriptAnalysis.detail,
    suggestion: "Strengthen agent guidance to always use BuildAndRun.ps1 instead of raw dotnet build",
  });
}

if (buildErrors.some(e => e.errors.some(err => err.includes("MSB3073")))) {
  toolingIssues.push({
    area: "XAML Compiler",
    issue: "XamlCompiler.exe crashed (MSB3073) — agent couldn't diagnose from error output",
    suggestion: "Add MSB3073 guidance to skills: clean obj/ first, fix XAML before C#. CS0103 for x:Name elements is a side-effect.",
  });
}

if (buildErrors.some(e => e.errors.some(err => err.includes("CS0103")))) {
  const cs0103Count = buildErrors.reduce((sum, e) => sum + e.errors.filter(err => err.includes("CS0103")).length, 0);
  if (cs0103Count >= 3) {
    toolingIssues.push({
      area: "Code-behind errors",
      issue: `${cs0103Count} CS0103 errors (name not found) — likely XAML compiler didn't generate .g.cs files`,
      suggestion: "Analyzer could detect CS0103 for x:Name elements and suggest fixing XAML + cleaning obj/ first",
    });
  }
}

const devWorkflowLoadedLate = skillTimeline.find(s => s.skill === "winui3-dev-workflow");
if (devWorkflowLoadedLate && rawDotnetBuildCount > 0) {
  const firstBuildTurn = turns.findIndex(t => t.category === "build-fix" || t.category === "build-ok") + 1;
  if (devWorkflowLoadedLate.turn > firstBuildTurn) {
    toolingIssues.push({
      area: "Skill timing",
      issue: `dev-workflow skill loaded at turn ${devWorkflowLoadedLate.turn} but first build was turn ${firstBuildTurn}`,
      suggestion: "Agent should load dev-workflow before first build, not after",
    });
  }
}

// ── Assemble report ──
const categoryCounts = {};
for (const turn of turns) {
  categoryCounts[turn.category] = (categoryCounts[turn.category] || 0) + 1;
}

const report = {
  session: {
    id: sessionId,
    eventsFile: path.resolve(eventsFile),
    prompt: prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""),
    duration: `${durationMin} min`,
    durationMs,
    turns: turns.length,
    exitCode,
    model: events.find(e => e.type === "session.tools_updated")?.data?.model || "(unknown)",
  },
  tokens: {
    totalOutput: totalOutputTokens,
    premiumRequests: usage.premiumRequests,
    apiTimeMs: usage.totalApiDurationMs,
    byCategory: categoryTokens,
  },
  codeChanges: usage.codeChanges || {},
  skills: {
    available: availableSkills,
    invoked: skillTimeline,
    notInvoked: availableSkills.filter(s => !skillTimeline.some(st => st.skill === s)),
  },
  turnBreakdown: categoryCounts,
  builds: {
    attempts: buildAttempts,
    failures: buildFailures,
    successes: buildSuccesses,
    errors: buildErrors,
    scriptUsage: buildScriptAnalysis,
  },
  stuckPatterns,
  toolingIssues,
  turnDetail: turns.map(t => ({
    turn: t.turnNum,
    category: t.category,
    outputTokens: t.outputTokens,
    tools: t.tools.map(tool => {
      const name = tool.name;
      let summary = "";
      if (name === "powershell") summary = (tool.args?.command || "").split("\n")[0].slice(0, 80);
      else if (name === "view" || name === "create" || name === "edit") summary = path.basename(tool.args?.path || "");
      else if (name === "skill") summary = tool.args?.skill || "";
      else if (name === "grep" || name === "glob") summary = tool.args?.pattern || "";
      return { name, summary, error: tool.hasError || false };
    }),
    skills: t.skillInvocations.length > 0 ? t.skillInvocations : undefined,
  })),
};

// ── Output ──
if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  // Markdown output
  const md = [];
  md.push("# Session Analysis Report");
  md.push("");
  md.push("## Overview");
  md.push("");
  md.push(`| Field | Value |`);
  md.push(`|-------|-------|`);
  md.push(`| Session ID | \`${report.session.id}\` |`);
  md.push(`| Model | ${report.session.model} |`);
  md.push(`| Duration | ${report.session.duration} |`);
  md.push(`| Turns | ${report.session.turns} |`);
  md.push(`| Output tokens | ${totalOutputTokens.toLocaleString()} |`);
  md.push(`| Premium requests | ${report.tokens.premiumRequests || "N/A"} |`);
  md.push(`| Exit code | ${report.session.exitCode} |`);
  md.push(`| Lines added | ${report.codeChanges.linesAdded || "N/A"} |`);
  md.push(`| Files modified | ${(report.codeChanges.filesModified || []).length} |`);
  md.push("");

  md.push("## Prompt");
  md.push("");
  md.push("```");
  md.push(report.session.prompt);
  md.push("```");
  md.push("");

  md.push("## Turn Breakdown");
  md.push("");
  md.push("| Category | Turns | Output Tokens |");
  md.push("|----------|------:|--------------:|");
  const categoryLabels = {
    "skill-load": "Skill loading",
    "explore": "Reading/exploring",
    "scaffold": "Scaffolding",
    "code-create": "Creating files",
    "code-edit": "Editing code",
    "build-ok": "Build (success)",
    "build-fix": "Build (failed)",
    "run": "Running app",
    "git": "Git operations",
    "thinking": "Thinking (no tools)",
    "other": "Other",
  };
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    const label = categoryLabels[cat] || cat;
    const tokens = (categoryTokens[cat] || 0).toLocaleString();
    md.push(`| ${label} | ${count} | ${tokens} |`);
  }
  md.push("");

  md.push("## Skills");
  md.push("");
  if (skillTimeline.length > 0) {
    md.push("**Invoked:**");
    for (const s of skillTimeline) {
      md.push(`- Turn ${s.turn}: \`${s.skill}\``);
    }
  } else {
    md.push("_No skills were invoked during this session._");
  }
  md.push("");
  if (report.skills.notInvoked.length > 0) {
    md.push(`**Available but not invoked:** ${report.skills.notInvoked.map(s => `\`${s}\``).join(", ")}`);
    md.push("");
  }

  md.push("## Build Analysis");
  md.push("");
  md.push(`- **Attempts:** ${buildAttempts} (${buildSuccesses} success, ${buildFailures} failed)`);
  md.push(`- **BuildAndRun.ps1:** ${buildScriptAnalysis.detail}`);
  md.push("");
  if (buildErrors.length > 0) {
    md.push("**Build errors encountered:**");
    md.push("");
    for (const be of buildErrors) {
      md.push(`Turn ${be.turn}:`);
      for (const err of be.errors) {
        md.push(`- \`${err}\``);
      }
    }
    md.push("");
  }

  if (stuckPatterns.length > 0) {
    md.push("## Stuck Patterns");
    md.push("");
    for (const sp of stuckPatterns) {
      md.push(`- **${sp.type}**: ${sp.detail}`);
    }
    md.push("");
  }

  if (toolingIssues.length > 0) {
    md.push("## Tooling Improvement Opportunities");
    md.push("");
    for (const ti of toolingIssues) {
      md.push(`### ${ti.area}`);
      md.push(`- **Issue:** ${ti.issue}`);
      md.push(`- **Suggestion:** ${ti.suggestion}`);
      md.push("");
    }
  }

  md.push("## Turn Detail");
  md.push("");
  md.push("| # | Category | Tokens | Tools |");
  md.push("|--:|----------|-------:|-------|");
  for (const t of report.turnDetail) {
    const toolStr = t.tools.map(tool => {
      const err = tool.error ? " ❌" : "";
      return tool.summary ? `${tool.name}(${tool.summary})${err}` : `${tool.name}${err}`;
    }).join(", ");
    const skills = t.skills ? ` 📚${t.skills.join(",")}` : "";
    md.push(`| ${t.turn} | ${t.category} | ${t.outputTokens.toLocaleString()} | ${toolStr}${skills} |`);
  }

  console.log(md.join("\n"));
}
