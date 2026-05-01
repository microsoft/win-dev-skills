---
name: winui-session-report
description: "Analyze the current or a recent Copilot session and generate a diagnostic report. Use when asking for session feedback, debugging agent behavior, or reviewing what happened during a build session."
disable-model-invocation: true
---

> [!NOTE]
> **Preview skill** — output is unredacted local data — see the Privacy and sensitivity section before sharing. Subject to change without notice; pin to a specific commit if you need stability.

### Session Analysis Report

Generate a diagnostic report for a Copilot session by running the `Analyze-Session.ps1` script included with this skill.

### Privacy and sensitivity — read before sharing

The generated `session-report.md` is built from your live session transcript. It can include any of the following, depending on what happened during the session:

- **File contents and paths** the agent read or edited — including code, configuration, secrets accidentally pasted into prompts, internal URLs, customer data, or any file the agent was asked about.
- **User prompts verbatim** — anything the user typed, including credentials, tokens, identifiers, or proprietary information.
- **Tool output** — including `git` history, environment variables echoed by failing commands, build logs containing machine names, paths under `C:\Users\<you>\…`, and similar local context.
- **Error messages** that may quote source code or stack traces from third-party libraries.

The script does not redact or sanitize any of this content — it copies the events as-is into a Markdown file optimized for human review.

> **You are responsible for the contents of any session report you share.** Open the report in your editor and read it end-to-end before attaching it to a public issue, posting it in chat, or sending it outside your organization. Redact anything sensitive (paths, names, secrets, business logic). When in doubt, share excerpts rather than the whole file.

If you only want the high-level metrics (turn counts, skill usage, build success rate) without the per-turn detail, ask the agent to summarize the report and share the summary instead of the file.

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
