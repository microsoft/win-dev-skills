---
name: winui-session-report
description: "Analyze the current or a recent Copilot session and generate a diagnostic report. Use when asking for session feedback, debugging agent behavior, or reviewing what happened during a build session."
disable-model-invocation: true
---

### Session Analysis Report

Generate a diagnostic report for a Copilot session by running the `Analyze-Session.ps1` script included with this skill.

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
# Analyze the most recent session and save report to the project directory
.\Analyze-Session.ps1 -OutputFile session-report.md

# Or analyze a specific session by ID
.\Analyze-Session.ps1 -SessionId "<session-id>" -OutputFile session-report.md

# Or analyze from an events.jsonl file directly
.\Analyze-Session.ps1 -EventsFile <path-to-events.jsonl> -OutputFile session-report.md
```

2. **Review the generated report** — read `session-report.md` and summarize key findings for the user:
   - How many turns, how long, token usage
   - What skills were loaded and when
   - Build success/failure pattern
   - Any stuck patterns or tooling issues detected

3. **Add your own observations** — append a section to the report with any additional context:
   - Was the final app working? What's missing?
   - Quality assessment of the generated code
   - Suggestions specific to what went wrong

4. Include any tooling improvements or recommendations based on the analysis.
   - Are there rules that need to be added to the Roslyn analyzer to prevent common mistakes detected during the session?
   - Were there bugs or issues with winapp run or the BuildAndRun.ps1 script?
   - Are there features that could be added to lower the number of turns required to complete a task?

### What the Report Covers

| Section | Details |
|---------|---------|
| Overview | Session ID, model, duration, turns, tokens, lines of code |
| Prompt | The original user request |
| Turn Breakdown | Turns and tokens by category (building, coding, exploring, etc.) |
| Skills | Which were invoked and when, which were available but unused |
| Build Analysis | Build attempts, failures, errors, whether BuildAndRun.ps1 was used |
| Stuck Patterns | Build loops, repeated file reads, obj/ clean cycles |
| Tooling Issues | Auto-detected improvement opportunities |
| Turn Detail | Every turn with tools used and errors flagged |

### When to Use

- When the user asks for a session report to understand what happened during a Copilot session.
