---
name: winui-dev-workflow
description: "Build and run workflow for WinUI 3 apps — project creation, BuildAndRun.ps1 script, winapp run, error diagnosis, and prerequisites. Use when building, running, or fixing build errors in a WinUI 3 project."
---

### Create or Open a Project

**New app** — scaffold with a template:
```powershell
dotnet new winui-mvvm -n <AppName>
cd <AppName>
```
Creates an MVVM project with CommunityToolkit.Mvvm, TitleBar, MicaBackdrop, and Frame navigation. Do NOT `mkdir` first — `-n` creates the folder.

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

**Invoke the script with `mode: "async"`.** The script stays attached to the running app so a `mode: "sync"` call blocks your turn for the entire lifetime of the app. The output contains the PID of the running app once the app starts, which looks like this:
```
✅ <pkg> launched (PID: 12345)
```

What the script does automatically:
1. Checks Developer Mode is enabled (fails fast if not)
2. Finds the `.csproj` in the current directory
3. Auto-detects platform (x64 or ARM64)
4. Builds with `dotnet build` (or Visual Studio MSBuild if you pass `-UseMSBuild`)
5. Finds the build output folder
6. Launches with `winapp run --debug-output`

**Options:**
```powershell
.\BuildAndRun.ps1                          # auto-find csproj, build, run (should use async invocation)
.\BuildAndRun.ps1 MyApp.csproj             # explicit project
.\BuildAndRun.ps1 -Detach                  # run in detached mode, no debug output or exceptions (safe to use mode: "sync")
.\BuildAndRun.ps1 -SkipRun                 # build only (safe to use mode: "sync")
.\BuildAndRun.ps1 -Symbols                 # build + run, adding --symbols (optional Symbol Server fallback)
.\BuildAndRun.ps1 /p:Configuration=Release # override defaults
```

**If build fails:** Read ALL errors, batch-fix them in one pass, then run `BuildAndRun.ps1` again.

**If the app crashes on launch:** `read_powershell` the shell — first-chance exceptions appear in the output. See the crash-diagnosis section below for WinUI stowed-exception triage.

### Diagnosing Crashes with `winapp run`

For WinUI apps, `--debug-output` (the `BuildAndRun.ps1` default) runs a **stowed-exception triage** on crash, surfacing the real WinUI/XAML error behind an opaque `0x8000FFFF` / `E_FAIL` — plus a fully symbolicated native dispatch stack (symbols auto-download, so `--debug-output` alone is enough). The **first** crash also downloads debugger components and can take a few minutes — it looks like a hang but it's caching; point `WINAPP_DBGTOOLS_DIR` at an existing *Debugging Tools for Windows* install to skip it. Later runs use the cache.

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
| App crashes with opaque `0x8000FFFF` / `E_FAIL` | Run under `--debug-output` (BuildAndRun.ps1 default) — WinUI stowed-exception triage surfaces the real XAML error + symbolicated native stack. `-Symbols` optional, not required |
| XAML compiler crashes silently | Remove any `PresentationCore.dll` / `System.Windows` references |
| MSB3073 / `XamlCompiler.exe ... exited with code 1`, no `.xaml` named | Old WindowsAppSDK XAML-compiler bug — update `Microsoft.WindowsAppSDK` NuGet to latest (≥ 2.1.3, or ≥ 1.8 on the 1.x line) |
| 0x80073CF6 package install failed | Run `winapp init`, check manifest publisher matches cert |
| 0x8007000B bad image format | Wrong platform target — use x64 or ARM64, not AnyCPU |

### Prerequisites

| Requirement | Minimum | Recommended (fresh installs) | Install command |
|-------------|---------|------------------------------|-----------------|
| Windows 10 v1903+ | — | — | — |
| Developer Mode | enabled | enabled | Settings → Advanced → Developer Mode → On |
| .NET SDK | 8.0 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| winapp CLI | 0.3 | latest | `winget install Microsoft.WinAppCLI` |
| WinUI templates | any | latest | `dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` |

If any of these are missing when you try to access them — `winapp` or `dotnet` not recognized, the WinUI templates aren't installed, Developer Mode is off — **do not try to install them yourself and do not try to work around it**. Stop and tell the user the prerequisite is missing and ask them to run `/winui-setup` (a user-invoked skill that installs and verifies everything). Once they've finished, retry the failed command.

### Critical Rules

- ❌ NEVER run the packaged .exe directly — always use `winapp run` or `BuildAndRun.ps1`
- ❌ NEVER add `<WindowsPackageType>None` to work around launch issues
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER use `AnyCPU` — always x64 or ARM64

### References

- `BuildAndRun.ps1` — included with this skill, handles build + run automatically
