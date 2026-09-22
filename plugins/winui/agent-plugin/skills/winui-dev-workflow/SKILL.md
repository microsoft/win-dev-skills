---
name: winui-dev-workflow
description: "Build and run workflow for WinUI 3 apps with WinApp CLI 0.7+ — project creation with winapp new, per-app NuGet analyzer setup, project-mode winapp run, Native AOT publish runs, crash diagnosis, and prerequisites. Use when creating, building, running, or fixing build errors in a WinUI 3 project."
---

Requires **WinApp CLI 0.7+** and the published `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer` NuGet package. If either is unavailable, stop and report the prerequisite; do not silently skip analyzer coverage.

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

### Add or Check the Per-App Analyzer

Check **each app project's** package references; do not assume a template includes the analyzer. If missing, add the latest stable package:
```powershell
dotnet add .\MyApp.csproj package Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer
```

On the added reference, set `PrivateAssets="all"` while retaining the resolved version. If centrally managed, keep the version in `Directory.Packages.props` and omit `Version` on the app reference:
```xml
<!-- Replace VERSION_RESOLVED_BY_DOTNET with the version added above. -->
<PackageReference Include="Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer"
                  Version="VERSION_RESOLVED_BY_DOTNET" PrivateAssets="all" />
```

Use a prerelease only when the user explicitly requests a particular **published** prerelease; specify that version rather than guessing one. A failed restore or unavailable package is a blocker, not permission to omit it. Normal restore/build now loads the analyzer in `dotnet build`, Visual Studio, CI, and project-mode `winapp run`; WinApp CLI does not inject it. Keep its diagnostics enabled and address findings.

For other packages, prefer the latest stable unless the project has a version policy or the user requests a specific version. Before coding API assumptions, use the restored project's `winapp find-api` lookups in [winui-design](../winui-design/SKILL.md).

### Build & Run (JIT Development)

Prefer Sandbox for UI runs:
```powershell
winapp run . --on sandbox --detach --json
```
This builds on the host and launches in the guest. Preserve the returned `UiTargetArgs` (`--on sandbox -a GUESTPID`) for UI tools; the PID alone loses guest scope. See [winui-ui-testing](../winui-ui-testing/SKILL.md) for the full Sandbox workflow and prerequisites.

For attached diagnostics:
```powershell
# Packaged app: diagnostic launch in the guest
winapp run . --on sandbox --debug-output
# Host diagnostics only when explicitly requested
winapp run . --debug-output
```

**Invoke attached runs with `mode: "async"`.** Read the same shell for diagnostics; do not block synchronously for the app's lifetime. `--debug-output` cannot combine with `--json` or `--no-launch`. Guest unpackaged `--debug-output` is unsupported: stop and explain, never silently fall back to a host launch.

Ordinary `winapp run` uses the build/JIT path, **even with `-c Release`**; it does not validate Native AOT. The CLI handles restore/build, runtime setup, output discovery, and package registration/launch. Use an explicit `.csproj` when project selection is ambiguous; use `winapp run --help` for selection and diagnostic options.

**If build fails:** Read all errors, batch-fix them in one pass, then rerun the same command. **If the app crashes:** read the attached shell's output and use the crash-diagnosis guidance below.

### Native AOT Publish Runs

For intended AOT deployment, prefer persistent `<PublishAot>true</PublishAot>` in the app project: it also enables analysis during development. Choose the architecture for the actual host/guest execution environment: **the published architecture must be runnable on the Sandbox guest**. The ARM64 examples below assume an ARM64 guest; substitute `--arch x64` for an x64 guest rather than using ARM64 universally.

With the native prerequisites below, use `winapp run . --aot -c Release --arch arm64 --on sandbox --detach --json`. For an explicit opt-in trial without persisting the property:
```powershell
winapp run . --aot -c Release --arch arm64 -p PublishAot=true --on sandbox --detach --json
```
`--aot` invokes **publish**, not build, and requires effective `PublishAot=true`. Use x64 or arm64, not x86. It requires an SDK project (a directory resolving to that project is fine), not a prebuilt folder or `.cs` input; it rejects `--manifest` and `--no-build`. Fix IL/CsWinRT warnings rather than suppressing them. See [AOT/source-generator patterns](../winui-packaging/references/sourcegen-patterns.md) before relying on a successful JIT run.

### Diagnosing Crashes with `winapp run`

For WinUI apps, `--debug-output` runs a **stowed-exception triage** on crash, surfacing the real WinUI/XAML error behind an opaque `0x8000FFFF` / `E_FAIL`. The first crash downloads debugger components and can take a few minutes; point `WINAPP_DBGTOOLS_DIR` at an existing *Debugging Tools for Windows* install for offline/locked-down environments. Add `--symbols` for richer native frames. Keep the requested host/guest scope.

### Common Errors

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| NETSDK1136 platform required | Target a Windows TFM (for example `net10.0-windows10.0.26100.0`); use `-f <windows-tfm>` when the project already multi-targets |
| XLS0414 XAML type not found | Add `xmlns` declaration |
| XDG0062 binding path missing | Check `x:Bind` property exists on ViewModel |
| Dynamic bound value does not update | Check effective mode, including inherited `x:DefaultBindMode`; use `OneWay`/`TwoWay` and change notifications where needed |
| App silently exits | Use project-mode `winapp run`; don't bypass packaged activation by running the .exe directly |
| App crashes with opaque `0x8000FFFF` / `E_FAIL` | Use attached `--debug-output` in a supported, requested scope for WinUI stowed-exception triage; `--symbols` is optional |
| XAML compiler crashes silently | Remove any `PresentationCore.dll` / `System.Windows` references |
| MSB3073 / `XamlCompiler.exe ... exited with code 1`, no `.xaml` named | Old WindowsAppSDK XAML-compiler bug — update `Microsoft.WindowsAppSDK` NuGet to latest (≥ 2.1.3, or ≥ 1.8 on the 1.x line) |
| 0x80073CF6 package install failed | Check the manifest publisher and Developer Mode; apps from `winapp new` need no separate `winapp init` |
| 0x80073CF9 / "Failed to reach state Staged" on a deeply nested project | For a packaged app, rerun with `--output-appx-directory "$env:LOCALAPPDATA\winapp-layout\<app>-<config>-<arch>"`, or move the repo closer to the drive root. Keep the directory unique per configuration and architecture — a registered development package holds a live reference to it, so Debug and Release must not share one — and empty it before reuse so payload files dropped since the last build do not linger |
| 0x8007000B bad image format | Wrong platform target — use x64 or ARM64, not AnyCPU |

### Prerequisites

| Requirement | Required for this workflow |
|-------------|----------------------------|
| Windows | Windows 10 v1903+ and the app's OS requirements |
| Developer Mode | Enabled for development deployment |
| .NET SDK | 8.0.100 minimum **plus the SDK required by the app's TFM** (e.g., .NET 10 for `net10.0-windows…`) |
| WinApp CLI | 0.7+ |
| Analyzer | Published `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`, referenced per app with `PrivateAssets="all"` |
| Native AOT only | MSVC/native build tools from Visual Studio's **Desktop development with C++** workload, including target-architecture tools; additional to SDK-only normal builds |

If a prerequisite is missing, **do not install it ad hoc or work around it**. Report it and ask the user to run `/winui-setup` for the normal toolchain, or arrange the [Native AOT prerequisites](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/) when needed. `winapp new` manages the WinUI template pack itself.

### Critical Rules

- Keep **packaged** as the default and use project-mode `winapp run` for activation.
- Only for an **explicitly requested unpackaged/debug experiment**, set `WindowsPackageType=None`; package-identity-dependent APIs may fail and runtime requirements still apply. Do not use this as a silent launch workaround. Preserve the manifest and restore the original packaged setting after the experiment.
- Do not delete `Package.appxmanifest`.
- ❌ NEVER use `AnyCPU` — always x64 or ARM64

### References

- [winui-packaging](../winui-packaging/SKILL.md) — release packaging directly from the project; no development registration required.
