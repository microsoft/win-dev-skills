---
name: dev-workflow
description: 'Build and run workflow for WinUI 3 apps. Use build.ps1 for one-command build+run. Covers project creation, building, running, and error fixing.'
---

# WinUI 3 Development Workflow

## Step 1: Create or Open a Project

**New app** — scaffold with the MVVM template:
```powershell
dotnet new winui-mvvm -n <AppName>
```
This creates a ready-to-build project with MVVM structure, CommunityToolkit.Mvvm, TitleBar, MicaBackdrop, and Frame navigation. Do NOT `mkdir` first — `-n` creates the folder.

Other templates available: `winui` (blank), `winui-navview` (NavigationView), `winui-tabview` (TabView).

**Existing app** — read the `.csproj` to understand:
- `<TargetFramework>` (e.g., `net10.0-windows10.0.26100.0`)
- `<PackageReference>` versions (WindowsAppSDK, CommunityToolkit)
- Project structure and established patterns

## Step 2: Write Code

Implement features following the patterns in the design and architecture sections. Key rules:
- Use `x:Bind` with `Mode=OneWay` (never `{Binding}`)
- Use `{ThemeResource}` brushes (never hardcoded colors)
- Add `AutomationProperties.AutomationId` on every interactive control
- Install packages with `dotnet add package <Name>` — never specify `--version`

## Step 3: Build & Run

Use the build script — it handles everything automatically:

```powershell
.\.github\skills\winui3-dev-workflow\build.ps1
```

What it does:
1. Checks Developer Mode is enabled (fails fast if not)
2. Finds the `.csproj` in the current directory
3. Auto-detects platform (x64 or ARM64)
4. Builds with MSBuild (or falls back to dotnet build)
5. Finds the build output folder
6. Launches with `winapp run --debug-output`

**Options:**
```powershell
.\build.ps1                          # auto-find csproj, build, run
.\build.ps1 MyApp.csproj             # explicit project
.\build.ps1 -SkipRun                 # build without launching
.\build.ps1 /p:Configuration=Release # override defaults
```

**If build fails**, read ALL errors, batch-fix them in one pass, then run `build.ps1` again.

**If the app crashes on launch**, the `--debug-output` flag shows first-chance exceptions — read them to diagnose.

## Common Errors

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → Developer Mode → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| NETSDK1136 platform required | build.ps1 handles this automatically |
| XLS0414 XAML type not found | Add `xmlns` declaration |
| XDG0062 binding path missing | Check `x:Bind` property exists on ViewModel |
| Blank window after launch | `x:Bind` defaults to `OneTime` — add `Mode=OneWay` |
| App silently exits | Use `winapp run`, never run the .exe directly |
| XAML compiler crashes silently | Remove any `PresentationCore.dll` / `System.Windows` references |
| 0x80073CF6 package install failed | Run `winapp init`, check manifest publisher matches cert |

## Prerequisites

| Requirement | Install |
|-------------|---------|
| Windows 10 v1903+ | — |
| Developer Mode | Settings → For developers → On |
| .NET SDK 10+ | `winget install Microsoft.DotNet.SDK.10` |
| winapp CLI | `winget install Microsoft.WinAppCLI` |

## Critical Rules

- ❌ NEVER run the packaged .exe directly — always use `winapp run` or `build.ps1`
- ❌ NEVER add `<WindowsPackageType>None` to work around launch issues
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER use `AnyCPU` — always x64 or ARM64
