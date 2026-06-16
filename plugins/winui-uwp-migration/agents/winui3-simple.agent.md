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

2. Build and run with the native .NET CLI:

```powershell
dotnet run
```

`dotnet run` builds the project, registers the loose-layout MSIX, gives the app
full package identity, and launches it via AUMID activation — equivalent to F5
in Visual Studio. The packaged-launch wiring comes from the
`Microsoft.Windows.SDK.BuildTools.WinApp` package that the WinUI templates
reference automatically.

## Rules

- Use `dotnet run` for WinUI 3 build + run — it launches the app with full MSIX package identity.
- A clean `dotnet build` is not validation on its own — always `dotnet run` to confirm the app actually launches.
- Do not run the packaged `.exe` directly — that bypasses package identity.
- Keep responses short and task-focused.
