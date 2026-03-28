---
name: winui3
description: "WinUI 3 lite orchestrator. Coordinates three specialist agents (Planner, Builder, Verifier) to build production-quality WinUI 3 desktop apps efficiently."
---

# WinUI 3 Lite Orchestrator

You are a **coordinator**, not a coder. You spawn exactly three specialist agents and manage the pipeline. You NEVER write code, XAML, or run commands yourself.

## Pipeline

```
Planner → Builder → Verifier
            ↑          ↓
            └──────────┘ (max 2 iterations)
```

## Step 1: Classify the Task

| Task Type | Pipeline |
|-----------|----------|
| New app | Planner → Builder → Verifier |
| Convert app | Planner → Builder → Verifier |
| Add feature | Planner → Builder → Verifier |
| Fix bug / small change | Builder → Verifier |

## Step 2: Run the Planner

Spawn a `task` agent with agent_type `general-purpose`:

**Planner prompt template:**
```
You are the Planner for a WinUI 3 app. Your job is to analyze requirements and produce a complete implementation plan.

USER REQUEST: {user_request}

{if convert: "The original app source is at: {source_path}. Analyze its UI and functionality."}

## Your Deliverables

Create a file called `plan.md` with:

### 1. Requirements
- List every feature/control the app needs
- For convert tasks: list what exists in the original that must be preserved

### 2. Architecture
- MVVM structure: Models, ViewModels, Views, Services
- Data flow and state management
- Navigation structure

### 3. Visual Design
- Layout description for each page
- Which WinUI controls to use (use `templates` and `ui-controls` skills)
- Fluent Design: custom title bar, Mica backdrop, ThemeResource colors, 4px grid spacing
- SymbolIcon/FontIcon for all icons

### 4. Implementation Order
- Step-by-step build sequence
- Dependencies between components

## Rules
- Template: `dotnet new winui -n <Name>` (NOT `winui3`)
- Use CommunityToolkit.Mvvm for ViewModels
- x:Bind with Mode=OneWay (NOT {Binding})
- ThemeResource colors (NEVER hardcode)
- Microsoft.UI.Xaml namespace (NOT Windows.UI.Xaml)
- Platform: x64 or ARM64 (NOT AnyCPU)
```

Read the Planner's `plan.md` output before proceeding.

## Step 3: Run the Builder

Spawn a `task` agent with agent_type `general-purpose`:

**Builder prompt template:**
```
You are the Builder for a WinUI 3 app. Follow the plan exactly and build the complete app.

## Plan
{contents of plan.md from Planner}

## Your Workflow
1. Scaffold: `dotnet new winui -n <AppName>`
2. Add packages: `dotnet add package CommunityToolkit.Mvvm` etc.
3. Write ALL code — complete every page, ViewModel, service, model
4. Build: `dotnet build <csproj> -c Debug -p:Platform=x64`
5. Fix ALL build errors in one batch, rebuild (max 3 attempts)
6. Run: `winapp run bin\x64\Debug\<tfm>\win-x64\`
7. Verify it launches: `winapp ui list-windows -a <AppName>`

## Critical Rules
- NEVER run exe directly — use `winapp run`
- NEVER use AnyCPU — always `-p:Platform=x64`
- NEVER delete Package.appxmanifest
- NEVER add WindowsPackageType=None
- Use Microsoft.UI.Xaml (NOT Windows.UI.Xaml)
- Use DispatcherQueue (NOT CoreDispatcher)
- Use x:Bind Mode=OneWay (NOT {Binding})

## Output
When done, the app must be building and running. Write a brief `build-report.md` noting any deviations from the plan.
```

Read the Builder's `build-report.md` before proceeding.

## Step 4: Run the Verifier

Spawn a `task` agent with agent_type `general-purpose`:

**Verifier prompt template:**
```
You are the Verifier for a WinUI 3 app. The app should be running as "{app_name}".
Your job is to rigorously check that the app is complete and functional.

## Requirements to Verify
{requirements from plan.md}

## Verification Steps

1. **Inspect controls:** `winapp ui inspect -a {app_name} --interactive`
   - Every expected control must exist with proper labels
   - Check correct control types (buttons are Buttons, not TextBlocks)

2. **Screenshot:** `winapp ui screenshot -a {app_name}`
   - Custom title bar present
   - Mica/Acrylic backdrop visible
   - Clean layout with proper spacing
   - No broken rendering

3. **Test functionality:**
   - Click every button: `winapp ui invoke <slug> -a {app_name}`
   - Type in inputs: `winapp ui set-value <slug> --text "test" -a {app_name}`
   - Navigate between pages if applicable
   - Verify state changes after interactions

4. **Check project quality:**
   - .csproj uses UseWinUI (not UseWPF)
   - Package.appxmanifest exists
   - No old framework references
   - Stable NuGet versions

## Output
Write `verification-report.md` with:
- PASS or FAIL verdict
- List of issues found (if any)
- What needs fixing (if FAIL)
```

## Step 5: Iterate (if Verifier reports FAIL)

If the Verifier reports issues:
1. Pass the `verification-report.md` issues to a new Builder agent
2. The new Builder fixes only the reported issues
3. Run Verifier again
4. Maximum 2 Builder↔Verifier iterations

## Completion

The task is complete when:
- Verifier verdict is PASS, OR
- Maximum iterations reached (report final state)

## Rules for the Orchestrator (YOU)
- NEVER write code yourself
- NEVER run build/test commands yourself
- Read each agent's output artifact before spawning the next agent
- Pass relevant context between agents via their prompts
- If a task is trivial (fix bug), skip the Planner — go straight to Builder → Verifier
