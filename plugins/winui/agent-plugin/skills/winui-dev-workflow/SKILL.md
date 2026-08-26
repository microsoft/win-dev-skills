---
name: winui-dev-workflow
description: "Build and run workflow for WinUI 3 apps with WinApp CLI 0.6+ — project creation with winapp new, project-mode winapp run, BuildAndRun.ps1 analyzer integration, crash diagnosis, and prerequisites. Use when creating, building, running, or fixing build errors in a WinUI 3 project."
---

### Create or Open a Project

**New app** — let WinApp CLI install/update the official templates and scaffold:
```powershell
winapp new --name <AppName> --template winui-mvvm --template-version latest --use-defaults
cd <AppName>
```
Run `winapp new --list` to discover the currently installed template short names. Do not install the template pack separately and do not create the output directory first.

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

WinApp CLI 0.6+ builds a `.csproj` and launches it directly:

```powershell
winapp run . --debug-output
winapp run .\MyApp.csproj -c Release --arch arm64
```

For normal development, prefer the included `BuildAndRun.ps1` wrapper. It invokes project-mode `winapp run`, injects the bundled `Microsoft.WindowsAppSDK.Analyzers`, and turns on `--debug-output` by default:

```powershell
.\BuildAndRun.ps1
```

**Invoke attached runs with `mode: "async"`.** The command stays attached while the app is open, so a synchronous call blocks for the app's lifetime. The output contains the running app's PID.

The wrapper only adds repository-specific analyzer and debug defaults. WinApp CLI handles:
1. Project restore and build
2. Configuration, architecture, runtime, and framework selection
3. Packaged versus unpackaged detection
4. Build-output and executable discovery
5. Windows App Runtime setup
6. Package registration and launch

**Options and forwarded WinApp arguments:**
```
.\BuildAndRun.ps1                              # one top-level csproj; attached diagnostics
.\BuildAndRun.ps1 .\MyApp.csproj               # explicit project
.\BuildAndRun.ps1 .\MyApp.csproj -c Release    # forwarded to winapp run
.\BuildAndRun.ps1 .\MyApp.csproj --arch arm64  # forwarded to winapp run
.\BuildAndRun.ps1 . --detach --json             # return after launch; emit PID as JSON
.\BuildAndRun.ps1 . --symbols                   # add Symbol Server-backed native symbols
.\BuildAndRun.ps1 --args "--flag value"         # pass application arguments
```

The wrapper accepts the same `.csproj`, `.sln`/`.slnx`, directory, and `--project` inputs as `winapp run`.

**If build fails:** Read all errors, batch-fix them in one pass, then rerun the same command.

**If the app crashes on launch:** `read_powershell` the shell — first-chance exceptions appear in the output. See the crash-diagnosis section below for WinUI stowed-exception triage.

### Diagnosing Crashes with `winapp run`

For WinUI apps, `--debug-output` (the wrapper default) runs a **stowed-exception triage** on crash, surfacing the real WinUI/XAML error behind an opaque `0x8000FFFF` / `E_FAIL`. The first crash downloads debugger components and can take a few minutes; point `WINAPP_DBGTOOLS_DIR` at an existing *Debugging Tools for Windows* install for offline/locked-down environments. Add `--symbols` for richer native frames.

### Common Errors

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| NETSDK1136 platform required | Target a Windows TFM (for example `net10.0-windows10.0.26100.0`); use `-f <windows-tfm>` when the project already multi-targets |
| XLS0414 XAML type not found | Add `xmlns` declaration |
| XDG0062 binding path missing | Check `x:Bind` property exists on ViewModel |
| Blank window after launch | `x:Bind` defaults to `OneTime` — add `Mode=OneWay` |
| App silently exits | Use `winapp run`, never run the .exe directly |
| App crashes with opaque `0x8000FFFF` / `E_FAIL` | Run under `--debug-output` (BuildAndRun.ps1 default) — WinUI stowed-exception triage surfaces the real XAML error + symbolicated native stack. `--symbols` is optional |
| XAML compiler crashes silently | Remove any `PresentationCore.dll` / `System.Windows` references |
| MSB3073 / `XamlCompiler.exe ... exited with code 1`, no `.xaml` named | Old WindowsAppSDK XAML-compiler bug — update `Microsoft.WindowsAppSDK` NuGet to latest (≥ 2.1.3, or ≥ 1.8 on the 1.x line) |
| 0x80073CF6 package install failed | Check the manifest publisher and Developer Mode; apps from `winapp new` need no separate `winapp init` |
| 0x80073CF9 / "Failed to reach state Staged" on a deeply nested project | For a packaged app, rerun with `--output-appx-directory "$env:LOCALAPPDATA\winapp-layout\<app>-<config>-<arch>"`, or move the repo closer to the drive root. Keep the directory unique per configuration and architecture — a registered development package holds a live reference to it, so Debug and Release must not share one — and empty it before reuse so payload files dropped since the last build do not linger |
| 0x8007000B bad image format | Wrong platform target — use x64 or ARM64, not AnyCPU |

### Prerequisites

| Requirement | Minimum | Recommended (fresh installs) | Install command |
|-------------|---------|------------------------------|-----------------|
| Windows 10 v1903+ | — | — | — |
| Developer Mode | enabled | enabled | Settings → Advanced → Developer Mode → On |
| .NET SDK | 8.0.100 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| WinApp CLI | 0.6.0 | latest | `/winui-setup` |

If `winapp`/`dotnet` is missing or too old, or Developer Mode is off, **do not install it ad hoc or work around it**. Ask the user to run `/winui-setup`, then retry. `winapp new` manages the WinUI template pack itself.

### Critical Rules

- ❌ NEVER run the packaged .exe directly — always use project-mode `winapp run` or `BuildAndRun.ps1`
- ❌ NEVER add `<WindowsPackageType>None` to work around launch issues
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER use `AnyCPU` — always x64 or ARM64

### References

- `BuildAndRun.ps1` — included with this skill; adds the bundled analyzer and diagnostic defaults to `winapp run`
