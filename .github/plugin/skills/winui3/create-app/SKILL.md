---
name: create-app
description: Creates a new WinUI 3 C# desktop application from scratch using dotnet new winui + winapp init. Use when asked to create a new app, start a new project, scaffold a WinUI 3 application, or make a Windows desktop app.
---

# Workflow: Create a New WinUI 3 C# App

**Trigger:** User wants to create a new WinUI 3 desktop application.

## When to Use This Skill

- User says "create a new app", "start a new project", "scaffold a WinUI 3 app"
- No existing project in workspace, or user wants a fresh project
- User describes an app idea and expects a working starting point

## Steps

### Step 1: Create TODO List (do this FIRST)

⚠️ **Before doing anything else**, create ALL workflow todos so nothing is missed:

| TODO ID | Title | Depends On |
|---------|-------|------------|
| `check-prereqs` | Check prerequisites | — |
| `gather-metadata` | Gather app metadata | `check-prereqs` |
| `create-project` | Create the project | `gather-metadata` |
| `project-setup` | One-time project setup | `create-project` |
| `build-run` | Build and run | `project-setup` |
| `verify-app` | Verify app is running | `build-run` |
| `ready-features` | Check for feature requirements | `verify-app` |
| `log-feedback` | Create/update .feedback-session.md with issues | `ready-features` |
| `verify-feedback` | Run Test-Path to confirm .feedback-session.md exists on disk | `log-feedback` |
| `reflection` | Review session feedback + merge to FEEDBACK.md | `verify-feedback` |

Insert these into the `todos` and `todo_deps` tables now. Update status as you complete each step.

### Step 2: Check Prerequisites

Follow the instructions in [check-env skill](../check-env/SKILL.md) to verify the development environment.

### Step 3: Gather App Metadata

Follow the instructions in [collect-app-info skill](../collect-app-info/SKILL.md) to collect:
- App display name
- Publisher name
- App description
- Target directory

### Step 4: Create the Project

Use the WinUI dotnet template. The `-n` flag creates the subfolder — do **NOT** `mkdir` first:

```powershell
dotnet new winui -n <AppName>
Set-Location <AppName>
```

### Step 5: One-Time Project Setup

Initialize package identity and manifest:

```powershell
winapp init --use-defaults
```

Add Raka for live UI inspection (Debug only, stripped from Release):

```powershell
dotnet add package Raka.DevTools
```

> `winapp init` only needs to run once per project. After that, `dotnet run -c Debug` automatically builds and launches with package identity.

### Step 6: Build and Run

```powershell
dotnet run -c Debug
```

### Step 7: Verify

After launch, verify the app is running:

```bash
raka status --app <AppName>
raka screenshot -f initial.png
```

### Step 8: Ready for Features

After successful build, check whether the user's original request includes feature requirements.

**If the user described any features, IMMEDIATELY proceed to [add-feature skill](../add-feature/SKILL.md).** Do NOT implement features inline — the add-feature workflow ensures specs and samples are searched first, which prevents incorrect API usage.

> **Tip:** The WinUI template creates a `.github/instructions/` folder inside the app with WinUI 3 development best practices. Read these — they complement the skills available to you.

### Step 9: MANDATORY — Log Feedback

**Skip this step if Step 8 triggered the add-feature skill** — add-feature already handles feedback and reflection at the end of its own workflow.

⚠️ **DO NOT mark `log-feedback` as done without actually invoking the [log-feedback skill](../log-feedback/SKILL.md) and writing to `.feedback-session.md` on disk.**

Follow the [log-feedback skill](../log-feedback/SKILL.md) to log any issues encountered. If nothing went wrong, still create `.feedback-session.md` with a `# Session Feedback` header — the reflection step needs it.

#### 9.1 Verify .feedback-session.md Written (`verify-feedback`)

**Run this command now and paste the output before marking `verify-feedback` done:**

```powershell
Test-Path (Join-Path (Get-Location).Path ".feedback-session.md")
```

- Output is `True` → mark `verify-feedback` done, proceed to reflection
- Output is `False` → **STOP. Go back to Step 9 and write .feedback-session.md now. Do not proceed.**

### Step 10: Reflection and Issue Reporting

**Skip this step if Step 8 triggered the add-feature skill.**

Otherwise, follow the [reflect-session skill](../reflect-session/SKILL.md) to review session feedback, merge valuable entries to `FEEDBACK.md`, and optionally report issues.

---

## Key Rules

1. **Template name is `winui`, NOT `winui3`** — use `dotnet new winui -n <AppName>`
2. **`-n` creates the subfolder** — do NOT `mkdir` first
3. **Preserve template-generated files** — the template creates MainWindow.xaml with TitleBar, SystemBackdrop, and layout. Insert your content into the existing structure — do NOT rewrite the entire file.
4. **Always build with `-c Debug`** — Raka.DevTools is stripped from Release builds.

---

## Success Criteria

1. Prerequisites verified via check-env skill
2. App metadata collected (name, publisher, description)
3. Project created with `dotnet new winui`
4. `winapp init --use-defaults` and `dotnet add package Raka.DevTools` succeeded
5. Initial build successful with `dotnet run -c Debug`
6. App verified running via `raka status` and `raka screenshot`
