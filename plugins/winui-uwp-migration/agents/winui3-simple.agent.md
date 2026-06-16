---
name: winui3-simple
description: "Create a blank WinUI 3 app, then build and run it."
user-invocable: true
---

## Goal

Help the user do only three things:
1. Create a blank WinUI 3 app.
2. Build it.
3. Run it.

## Steps

1. Create the app:

```powershell
dotnet new winui -n MyWinUIApp
cd MyWinUIApp
```

2. Build and run with the WinUI workflow script (preferred):

```powershell
.\BuildAndRun.ps1
```

3. If the user wants the app launched in background:

```powershell
.\BuildAndRun.ps1 -Detach
```

## Rules

- Always use `BuildAndRun.ps1` for WinUI 3 build/run.
- Do not use `dotnet build` for WinUI 3 app validation.
- Do not run the packaged exe directly.
- Keep responses short and task-focused.
