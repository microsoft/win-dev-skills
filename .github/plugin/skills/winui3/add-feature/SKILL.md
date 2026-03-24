---
name: add-feature
description: Complete workflow for adding new functionality to an existing WinUI 3 C# app. Use when asked to add a feature, implement a control, integrate an API, add a button, create a new page, or extend app capabilities. Guides through mandatory spec and sample searching, implementation, and build verification.
---

# Workflow: Add New Feature to a WinUI 3 App

**Trigger:** User wants to add new functionality to an existing WinUI 3 C# application.

## When to Use This Skill

- User wants to add new functionality to an existing WinUI 3 app
- User says "add a button", "implement X feature", "integrate an API", "create a new page"
- An existing WinUI 3 C# project is open in workspace
- User describes specific features to build on top of a working app

## Steps

### Step 1: Create TODO List (do this FIRST)

⚠️ **Before doing anything else**, create ALL workflow todos so nothing is missed:

| TODO ID | Title | Depends On |
|---------|-------|------------|
| `check-prereqs` | Check prerequisites | — |
| `get-context` | Get app context and SDK version | `check-prereqs` |
| `search-specs` | Search API specs (MANDATORY) | `get-context` |
| `search-samples` | Search code samples (MANDATORY) | `get-context` |
| `implement` | Implement the feature | `search-specs`, `search-samples` |
| `build-verify` | Build and verify | `implement` |
| `log-feedback` | Create/update .feedback-session.md with issues | `build-verify` |
| `verify-feedback` | Run Test-Path to confirm .feedback-session.md exists on disk | `log-feedback` |
| `reflection` | Review session feedback + merge to FEEDBACK.md | `verify-feedback` |

Insert these into the `todos` and `todo_deps` tables now. Update status as you complete each step.

### Step 2: Check Prerequisites

Follow the instructions in [check-env skill](../check-env/SKILL.md) if not already done.

### Step 3: Get App Context

Identify the project folder and app name. If unknown, look for a `.csproj` file that references `Microsoft.WindowsAppSDK`.

### Step 4: Identify SDK Version

Identify the release branch based on the project's WindowsAppSDK NuGet package version (e.g., `1.7`, `1.8`, `2.0`).

### Step 5: Break Down Implementation

Outline specific implementation steps based on the feature request.

### Step 6: Implement Each Step

For each implementation step:

#### 6.1 MANDATORY — Search Specs

⚠️ **DO NOT write any feature code before completing this step.**

Follow the instructions in [search-docs skill](../search-docs/SKILL.md) with category `WindowsAppSDK-specs` to find API specifications.

#### 6.2 If AI-related Feature

Follow the instructions in [search-docs skill](../search-docs/SKILL.md) with category `Windows-AI-Docs` for AI/ML guidance.

#### 6.3 MANDATORY — Search Samples

⚠️ **DO NOT write any feature code before completing this step.**

Follow the instructions in [search-docs skill](../search-docs/SKILL.md) with category `WindowsAppSDK-Samples` for code examples. Official samples contain proven patterns and correct API usage.

#### 6.4 Check Past Feedback

Grep `FEEDBACK.md` for known pitfalls related to the APIs or controls you're about to use:

```bash
grep "Keywords:.*<api-or-control-name>" FEEDBACK.md .feedback-session.md
```

If `Reusable: yes` entries exist, apply their `Fix` or avoid their pitfalls.

#### 6.5 Implement the Feature

Implement the feature based on the specs and samples found. Follow the patterns in [winui-best-practices](../winui-best-practices/SKILL.md) for MVVM, XAML, and architecture guidance.

### Step 7: Build and Verify

**Build the complete UI before the first launch** — write all XAML elements, calculate the minimum window size, then launch once. Do not launch with a partial UI and iterate.

```powershell
dotnet run -c Debug
```

**For XAML-only changes** (layout tweaks, styling, margins), use hot-reload instead of a full rebuild to cut iteration time from ~45s to ~2s:

```bash
# Start hot-reload watcher once, in background
raka hot-reload <AppName>\ --app <AppName>
# Edit XAML — changes appear in ~2s
```

Only rebuild with `dotnet run` when you change C# code or add new files.

After launch, **inspect before screenshotting**:

```bash
raka status --app <AppName>
raka inspect -d 3 --from-page --format tree   # verify all expected elements exist and aren't clipped
raka get-property <element> -a                 # read ActualWidth/ActualHeight if clipping is suspected
raka screenshot -f verify.png                  # visual polish only — not for discovering missing elements
```

Use `raka inspect` to confirm elements exist and bounds fit the window before taking a screenshot. This avoids the screenshot→fix loop caused by discovering missing or clipped elements only after launch.

### Step 8: MANDATORY — Log Feedback

⚠️ **DO NOT mark `log-feedback` as done without actually invoking the [log-feedback skill](../log-feedback/SKILL.md) and writing to `.feedback-session.md` on disk.**

Follow the [log-feedback skill](../log-feedback/SKILL.md) to log any issues encountered during implementation. If anything went wrong (build error, retry, workaround, unexpected behavior), append an entry immediately. If nothing went wrong, still create `.feedback-session.md` with a `# Session Feedback` header — the reflection step needs it.

#### 8.1 Verify .feedback-session.md Written (`verify-feedback`)

**Run this command now and paste the output before marking `verify-feedback` done:**

```powershell
Test-Path (Join-Path (Get-Location).Path ".feedback-session.md")
```

- Output is `True` → mark `verify-feedback` done, proceed to reflection
- Output is `False` → **STOP. Go back to Step 8 and write .feedback-session.md now. Do not proceed.**

### Step 9: Reflection and Session Close

Follow the [reflect-session skill](../reflect-session/SKILL.md) to review session feedback, merge valuable entries to `FEEDBACK.md`, and optionally report issues.

---

## Success Criteria

1. Prerequisites verified
2. Specs and samples searched for relevant API patterns
3. Feature implemented following WinUI 3 best practices (MVVM, proper XAML patterns)
4. Build successful with no errors
5. Feature verified visually with `raka screenshot`
