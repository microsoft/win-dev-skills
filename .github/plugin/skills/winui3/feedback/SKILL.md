---
name: feedback
description: Logs issues and friction to a session temp file (.feedback-session.md) during development. At session end, reusable entries are merged into the permanent knowledge base (FEEDBACK.md) and the temp file is cleared.
---

# Workflow: Feedback Logging

**This skill is referenced by other skills. Follow its instructions at the points where they call it.**

---

## Recovery

At the start of any workflow, if `.feedback-session.md` exists and is non-empty, a previous session was interrupted. Merge its `Reusable: yes` entries into `FEEDBACK.md`, then clear `.feedback-session.md`.

---

## Log an Entry

**Target file:** `.feedback-session.md` in the project root (create if missing).

**When to log** — stop and append to `FEEDBACK.md` immediately when any of the following occur:

- **Build error or retry** — a command failed and you tried something different
- **Workaround** — couldn't do something the right way and found an alternative
- **Rework** — had to redo something because a tool/template/skill gave bad guidance
- **Unexpected behavior** — something didn't work as expected from the docs or skills
- **Missing feature** — wished a tool could do something it can't
- **Misleading instructions** — a skill or doc told you to do something that was wrong
- **Template issue** — missing files, wrong defaults, outdated patterns in generated code
- **Unclear docs** — Microsoft docs that were confusing, outdated, or incorrect
- **API surprise** — an API that didn't work as documented or had undocumented requirements
- **Framework quirk** — WinUI 3 controls that don't behave as expected, XAML bugs, theming issues
- **User correction** — the user asked you to change something, meaning you got it wrong
- **Raka issue** — a raka command failed, returned confusing output, couldn't find an element, connection dropped, screenshot was wrong
- **Raka workflow friction** — needed multiple raka commands for something that should be simpler
- **Layout iteration** — needed multiple screenshot→fix cycles to get layout right

**If you retried a command, that's feedback. If you had to deviate from the instructions, that's feedback. Log it.**

**Before writing:** Check if `.feedback-session.md` exists in the project root. If not, create it with a `# Session Feedback` header.

**Format:**

```markdown
## [CATEGORY] Short title
- **Keywords:** comma-separated greppable terms (error codes, API names, control names, commands)
- **What happened:** One sentence — the problem
- **Fix:** The fix or `none` if unresolved
- **Status:** resolved | workaround | unresolved
- **Reusable:** yes | no
- **Suggestion:** What would have made this better *(optional — only if you have a concrete idea)*

---
```

**Field rules:**

| Field | Required | Purpose |
|-------|----------|--------|
| `Keywords` | Yes | Greppable terms for future lookup. Include error codes, API/control names, CLI commands. |
| `What happened` | Yes | One sentence. Merges the old When + What happened. |
| `Fix` | Yes | The solution (one line or command). Write `none` if unresolved. |
| `Status` | Yes | `resolved` = fixed, `workaround` = partial fix, `unresolved` = no fix found |
| `Reusable` | Yes | `yes` = useful next time same issue appears. `no` = one-off (env-specific, user preference) |
| `Suggestion` | No | Only write if you have a specific improvement idea for a tool, doc, or skill |

**Querying past entries:** Before diagnosing an error or implementing a feature, grep both files for related Keywords:

```bash
grep "Keywords:.*<term>" FEEDBACK.md .feedback-session.md
```

If a matching `Reusable: yes` entry with a `Fix` exists, apply it directly instead of re-diagnosing.

**Categories:**

| Tag | What it covers |
|-----|---------------|
| `RAKA` | Raka CLI — failed commands, confusing output, connection issues, screenshot problems, elements not found, hot-reload issues |
| `WINAPP` | winapp CLI — init issues, manifest problems, package identity, build errors |
| `TEMPLATE` | WinUI project templates — missing files, wrong defaults, outdated patterns |
| `SKILL` | Plugin skills — wrong instructions, missing info, misleading guidance |
| `AGENT` | Agent instructions — workflow issues, wrong tool paths, bad defaults |
| `NUGET` | NuGet packages — version conflicts, missing packages, source issues |
| `DOTNET` | .NET CLI / SDK — build errors, runtime issues, compatibility problems |
| `WINUI` | WinUI 3 framework — controls not working as expected, XAML quirks, theming bugs |
| `DOCS` | Microsoft docs — unclear, outdated, incorrect, or missing documentation |
| `API` | WinAppSDK / Platform APIs — APIs that don't work as documented, undocumented requirements |
| `USER` | User corrections — the user asked to redo or change something you built |
| `GENERAL` | Anything else — setup issues, UX friction, feature requests |
