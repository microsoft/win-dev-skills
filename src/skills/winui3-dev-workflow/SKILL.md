---
name: winui3-dev-workflow
description: "Build and run workflow for WinUI 3 apps — project creation, BuildAndRun.ps1 script, winapp run, error diagnosis, and prerequisites. Use when building, running, or fixing build errors in a WinUI 3 project."
allowed-tools: shell
---

### Build & Run

Run `BuildAndRun.ps1` from this skill's directory — it builds and launches the app:

```powershell
.\BuildAndRun.ps1                    # Build + run (blocks while app runs, shows debug output)
.\BuildAndRun.ps1 -Detach            # Build + run in background (returns immediately)
.\BuildAndRun.ps1 -SkipRun           # Build only
.\BuildAndRun.ps1 MyApp.csproj       # Explicit project
```

**Default behavior:** The script blocks while the app is running and shows debug output and exceptions in the terminal. Close the app to return to the terminal. Use `-Detach` if you need the script to return immediately.

### Create or Open a Project

**New app** — scaffold with a template:
```powershell
dotnet new winui-mvvm -n <AppName>
```
Creates an MVVM project with CommunityToolkit.Mvvm, TitleBar, MicaBackdrop, and Frame navigation. Do NOT `mkdir` first — `-n` creates the folder.

Other templates: `winui-navview` (NavigationView), `winui-tabview` (TabView), `winui` (blank).

**Existing app** — read the `.csproj` to understand:
- `<TargetFramework>` (e.g., `net10.0-windows10.0.26100.0`)
- `<PackageReference>` versions (WindowsAppSDK, CommunityToolkit)
- Project structure and established patterns

### Install Packages

```powershell
dotnet add package <Name>
```
Never specify `--version` — omitting it gets the latest stable and avoids outdated API mismatches.

### Build & Run

Use the `BuildAndRun.ps1` script (included with this skill) — it handles everything:

```powershell
.\BuildAndRun.ps1
```

What it does automatically:
1. Checks Developer Mode is enabled (fails fast if not)
2. Finds the `.csproj` in the current directory
3. Auto-detects platform (x64 or ARM64)
4. Builds with MSBuild (or falls back to `dotnet build`)
5. Finds the build output folder
6. Launches with `winapp run --debug-output`

**Options:**
```powershell
.\BuildAndRun.ps1                          # auto-find csproj, build, run
.\BuildAndRun.ps1 MyApp.csproj             # explicit project
.\BuildAndRun.ps1 -SkipRun                 # build only
.\BuildAndRun.ps1 /p:Configuration=Release # override defaults
```

**If build fails:** Read ALL errors, batch-fix them in one pass, then run `BuildAndRun.ps1` again.

**If the app crashes on launch:** The `--debug-output` flag shows first-chance exceptions — read them to diagnose.

### Common Errors

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| NETSDK1136 platform required | BuildAndRun.ps1 handles this automatically |
| XLS0414 XAML type not found | Add `xmlns` declaration |
| XDG0062 binding path missing | Check `x:Bind` property exists on ViewModel |
| Blank window after launch | `x:Bind` defaults to `OneTime` — add `Mode=OneWay` |
| App silently exits | Use `winapp run`, never run the .exe directly |
| XAML compiler crashes silently | Remove any `PresentationCore.dll` / `System.Windows` references |
| 0x80073CF6 package install failed | Run `winapp init`, check manifest publisher matches cert |
| 0x8007000B bad image format | Wrong platform target — use x64 or ARM64, not AnyCPU |

### Prerequisites

| Requirement | Install |
|-------------|---------|
| Windows 10 v1903+ | — |
| Developer Mode | Settings → For developers → On |
| .NET SDK 10+ | `winget install Microsoft.DotNet.SDK.10` |
| winapp CLI | `winget install Microsoft.WinAppCLI` |

### Critical Rules

- ❌ NEVER run the packaged .exe directly — always use `winapp run` or `BuildAndRun.ps1`
- ❌ NEVER add `<WindowsPackageType>None` to work around launch issues
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER use `AnyCPU` — always x64 or ARM64

### References

- `BuildAndRun.ps1` — included with this skill, handles build + run automatically
- See `winui3-verify` skill for post-build app validation
