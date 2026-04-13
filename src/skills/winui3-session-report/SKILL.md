---
name: winui3-session-report
description: "Analyze the current or a recent Copilot session and generate a diagnostic report. Use when asking for session feedback, debugging agent behavior, or reviewing what happened during a build session."
allowed-tools: shell
---

### Session Analysis Report

Generate a diagnostic report for a Copilot session by running the `Analyze-Session.ps1` script included with this skill.

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

- After completing a build session — generate a report for feedback
- When debugging why a session went poorly
- When a customer reports issues with the agent or skills
- To compare sessions across different agent configurations
