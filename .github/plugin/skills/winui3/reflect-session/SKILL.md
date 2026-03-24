---
name: reflect-session
description: Closes out a development session. Reviews session feedback, merges valuable entries into FEEDBACK.md, clears the session temp file, and optionally reports issues to GitHub.
---

# Workflow: Reflect and Report

**Trigger:** All work is finished and completion validation has passed — or the user explicitly requests issue reporting.

## When to Use This Skill

Use at the end of every workflow (create-app, add-feature, fix-errors), or when the user explicitly requests issue reporting.

## Steps (must be added to TODO list)

### Step 1: Read Session Feedback

Check if `.feedback-session.md` exists in the project root.

- **File does not exist or is empty:** No issues were logged. Mark the reflection todo as completed and **stop here**.
- **File has entries:** Continue.

### Step 2: Process Entries One by One

For each entry in `.feedback-session.md`, do all of the following before moving to the next entry:

1. **Valuable?** (`Reusable: yes`, or you judge it useful for future sessions) → append it to `FEEDBACK.md` (create with `# Feedback` header if missing)
2. **Reportable?** (documentation error, API bug, template issue, SDK/tooling bug — regardless of whether it was resolved) → append a one-line summary to a running reportable list (keep in memory)
3. **Remove** this entry from `.feedback-session.md`

A single entry can be both valuable and reportable. After all entries are processed, `.feedback-session.md` should be empty.

### Step 3: Evaluate Whether to Report

**Check user preference first:** Read `.github/.agent-config.json` in the project root. If `report-issues` is `false`, **stop here** — unless the user explicitly requested to file an issue.

If the file does not exist or `report-issues` is `true` (or absent), continue.

Decision:
- **No reportable entries and no explicit request**: **Stop here.**
- **Reportable entries found**: Ask the user whether they want to file an issue. If they decline, stop here.
- **User explicitly requested**: Proceed to Step 4.

### Step 4: Collect Diagnostic Context

**All reportable entries are combined into a single GitHub issue.**

For each reportable entry, gather:

- **Error message / symptom** (required)
- **Steps attempted** and their outcomes (required)
- **Workaround applied** (if any)
- **Resolution status** — `unresolved`, `workaround-applied`, `docs-gap`, or `api-discrepancy`

Also gather once for the issue:

- **Windows App SDK version** from `.csproj` (required)
- **OS version** — `[System.Environment]::OSVersion` (required)
- **raka / winapp version** (if available)
- **Category** — pick the primary root cause: `Docs` | `API` | `Template` | `Build` | `TSG` | `Runtime`

### Step 5: Redact Sensitive Information

**Before formatting the issue body, you MUST scan all collected data and redact the following:**

| Sensitive Data | Example | Redact To |
|---------------|---------|-----------|
| **Windows user profile paths** | `C:\Users\johndoe\source\...` | `C:\Users\<USER>\source\...` |
| **API keys / tokens / secrets** | `Authorization: Bearer eyJhbG...` | `Authorization: Bearer <REDACTED>` |
| **Connection strings** | `Server=mydb.corp.net;Password=abc123` | `Server=<REDACTED>;Password=<REDACTED>` |
| **Email addresses** | `john.doe@company.com` | `<EMAIL>` |
| **Internal hostnames / IPs** | `\\corpfs01\share`, `10.0.1.50` | `\\<INTERNAL_HOST>\share`, `<INTERNAL_IP>` |
| **UNC / network paths** | `\\team-share\project\secret` | `\\<NETWORK_PATH>\...` |
| **Environment variable values** | Secrets from `$env:MY_SECRET` | `<REDACTED>` |
| **Certificate / key material** | `-----BEGIN PRIVATE KEY-----` | `<REDACTED_KEY>` |
| **Absolute user-specific paths** | `D:\MyPrivateProjects\client-app` | Replace with relative or generic path |

**Rules:**
- **File paths**: Replace the username segment in any path under `C:\Users\` with `<USER>`. For other absolute paths, keep only the project-relevant portion (e.g., `<PROJECT_ROOT>\src\MainWindow.xaml`).
- **Error messages**: Scan error output for embedded paths, credentials, or internal URLs before including.
- **Code snippets**: Strip any hardcoded credentials, connection strings, or personal identifiers.
- **Preserve diagnostic value**: Only redact the sensitive portion — keep the structure intact so the issue remains useful. For example, keep the error code and message but mask the path: `File not found: C:\Users\<USER>\...\MyFile.cs`.

⚠️ **When in doubt, redact.** It is better to over-redact and lose some diagnostic detail than to leak personal or corporate information into a public GitHub issue.

### Step 6: Format the Issue Body

Compose the issue using the following Markdown template:

```markdown
## Summary

{One-sentence description of the problem}

**Category:** {primary category}

## Environment

- **Windows App SDK version**: {version}
- **OS**: {Windows version and build}
- **raka version**: {version, if known}
- **winapp version**: {version, if known}
- **Project type**: {Packaged / Sparse / Unpackaged}
- **Language**: C#

## Issues

{For each reportable entry, write a subsection:}

### 1. {Short title}

**Status:** {unresolved | workaround-applied | docs-gap | api-discrepancy}

{Description of the problem}

**Attempted solutions:**
| # | What was tried | Outcome |
|---|----------------|---------|
| 1 | {description} | {result} |

**Workaround:** {workaround or "None"}

{Repeat for each reportable entry}

## Additional Context

{Any relevant code snippets, links to docs that may be incorrect, or related GitHub issues}

---
*This issue was auto-generated by the WinUI 3 Builder agent.*
```

### Step 7: Generate Pre-filled Issue Link

Write the formatted issue body (from Step 6) to a temporary `.md` file, then run:

```powershell
pwsh -ExecutionPolicy Bypass -File "<path-to-this-skill-folder>\scripts\generate-issue-url.ps1" `
  -Title "[Agent Report] {brief description}" `
  -BodyFile "{path to temp .md file}" `
  -Repo "microsoft/WindowsAppSdkResources"
```

### Step 8: Present Link to User

Present the generated URL as a clickable link. Remind the user:
- The link opens a **pre-filled** GitHub issue page — nothing is submitted until they click "Submit"
- Sensitive information has been redacted, but they should double-check before submitting

**Cleanup:** Delete the temporary `.md` file after presenting the link.