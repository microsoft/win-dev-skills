---
name: winui-session-report
description: "Analyze the current or a recent agent session (GitHub Copilot CLI or Claude Code) and generate a diagnostic report. Use only when the user explicitly asks for session feedback, agent debugging, or a review of what happened during a build session. Do not inspect session data automatically."
---

### Session Analysis Report

Generate a diagnostic report for an agent session by running the `Analyze-Session.ps1` script included with this skill. The script auto-detects whether the current session was produced by GitHub Copilot CLI or Claude Code from environment variables and on-disk file format, and dispatches to the appropriate parser. If neither harness can be detected, the script exits with a clear error.

> [!IMPORTANT]
> Run this skill only when the user explicitly asks for session analysis or a report. If it is loaded without an explicit request, do not inspect session data; explain what the report contains and wait for confirmation.

### Privacy and sensitivity — surface this guidance to the user

`Analyze-Session.ps1` always:

1. **Embeds a "Privacy and sensitivity" section at the top of the generated `session-report.md`** (right above the Overview table), and
2. **Prints a yellow PRIVACY NOTICE banner to the console** when it finishes writing the file.

**You (the agent) must surface this guidance to the user in your response — do not let it stay buried in script output the user might not have read.** When you finish running the script and reporting the findings, include a short privacy reminder in your reply to the user, in plain second-person language. Use this template, adapting wording as needed:

> ⚠️ **Heads-up before you share `session-report.md`** — this file contains your unredacted session transcript: file contents and paths the agent read or edited, your prompts verbatim (including any secrets you may have pasted), tool output, environment values, and local paths under `C:\Users\<you>\…`. You're responsible for what you share — please open the file in your editor and read it end-to-end before attaching it to a public issue, posting it in chat, or sending it outside your organization. Redact anything sensitive. If you only need to share the high-level metrics, ask me to summarize the file instead of attaching it.

If the user only wants the high-level metrics (turn counts, skill usage, build success rate) without the per-turn detail, summarize the report and share the summary instead of the file — and tell the user that's what you're doing so they don't have to read it themselves to confirm.

### Steps

1. **Run the analysis script** to generate the report:

```powershell
# Analyze the most recent session (auto-detects harness) and save report
.\Analyze-Session.ps1 -OutputFile session-report.md

# Or analyze a specific session by ID (searched in both harness locations)
.\Analyze-Session.ps1 -SessionId "<session-id>" -OutputFile session-report.md

# Or analyze a transcript file directly (format sniffed from content)
.\Analyze-Session.ps1 -EventsFile '.\transcript.jsonl' -OutputFile session-report.md

# Force a specific format if auto-detection picks the wrong harness
.\Analyze-Session.ps1 -Format ClaudeCode -OutputFile session-report.md

# Skip subagent transcripts (Claude Code only) for a parent-only view
.\Analyze-Session.ps1 -SkipSubagents -OutputFile session-report.md
```

Detection rules:
- The current session is preferred when an explicit ID is available: `COPILOT_AGENT_SESSION_ID` (Copilot CLI) or `CLAUDE_SESSION_ID` (Claude Code) take priority over "most recently modified" so a parallel session in another terminal can't shadow the one the skill was invoked from.
- Environment first: `CLAUDECODE=1` or `CLAUDE_CODE_ENTRYPOINT` -> Claude Code; `COPILOT_*` env vars -> Copilot.
- For Claude Code, the most-recent JSONL whose `cwd` matches the current working directory is preferred.
- For an explicit `-EventsFile`, the format is sniffed from the first events.
- If neither harness is detected, the script exits with a non-zero status and a message naming both supported locations.

2. **Review the generated report** — read `session-report.md` and summarize key findings for the user:
   - How many turns, how long, token usage
   - What skills were loaded and when
   - Build/run workflow and command-failure pattern
   - Any stuck patterns or tooling issues detected

3. **Add your own observations** — append a section to the report with any additional context:
   - Was the final app working? What's missing?
   - Quality assessment of the generated code
   - Suggestions specific to what went wrong

4. Include any tooling improvements or recommendations based on the analysis.
   - Are there rules that need to be added to the Roslyn analyzer to prevent common mistakes detected during the session?
   - Were there bugs or issues with `winapp new`, project-mode `winapp run` / `winapp package`, `dotnet build` / `dotnet publish`, or `winapp find-ui`? `BuildAndRun.ps1` is recognized for historical transcripts, not recommended for new work.
   - For WinApp CLI 0.7 Sandbox workflows, separate host build failures from guest startup/readiness, deployment, input, or evidence-delivery failures. Check `--on sandbox` on every UI command (including picker HWNDs), guest `ProcessId` / `UiTargetArgs`, fresh-guest invalidation, and a shared `WINAPP_UI_WORKFLOW_ID` for cooperating commands. Input/capture requires an unlocked host and a connected, nonminimized Sandbox client; successful tree reads alone do not establish readiness.
   - Did the agent preserve delivered host screenshots/recordings and recovery paths before a consented Windows Sandbox shutdown? Local execution after explaining unavailable Windows Sandbox is valid unless the user explicitly requested it. Flag silent switches, reuse of guest IDs on the host, or host app-data checks presented as guest evidence.
   - Are there features that could be added to lower the number of turns required to complete a task?

### What the Report Covers

| Section | Details |
|---------|---------|
| Overview | Harness, session ID, model, duration, turns, tokens (incl. cache tokens for Claude Code) |
| Prompt | The original user request |
| Turn Breakdown | Turns and tokens by category (building, coding, exploring, subagent dispatch, etc.) |
| Skills | Which were invoked and when, including from inside subagent transcripts |
| Subagents | (Claude Code only) Per-agent breakdown of dispatched subagents and their work |
| Build Analysis | Build/publish-capable workflow attempts and command errors: dotnet build/publish, project-mode winapp run (including --aot), explicit .csproj winapp package/pack, and historical BuildAndRun.ps1. Folder/manifest packaging and --no-build invocations are not builds |
| Sandbox Execution | When present: Sandbox command usage/error counts and focused checks for host/guest scope, input readiness, workflow coordination, and evidence delivery |
| Stuck Patterns | Build loops, repeated file reads, obj/ clean cycles |
| Tooling Issues | Auto-detected improvement opportunities |
| Turn Detail | Every turn with tools used and errors flagged, parent and subagent transcripts shown separately |

Build classification uses transcript text, not the current filesystem: `winapp run .` / omitted input and explicit project/solution inputs are recognized; other directory run inputs are ambiguous. Prefer explicit `.csproj` inputs in report examples. NuGet-delivered analyzers participate in ordinary `dotnet build` / `dotnet publish`; direct dotnet usage is not a missing-analyzer finding. `--no-build` affects its own invocation, not a preceding build in the same shell call. A failed build-capable command may fail during deployment or launch instead of compilation.

### When to Use

- When the user asks for a session report to understand what happened during an agent session.
