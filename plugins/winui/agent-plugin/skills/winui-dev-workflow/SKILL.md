---
name: winui-dev-workflow
description: "Build and run workflow for WinUI 3 apps with WinApp CLI 0.7+ — project creation with winapp new, per-app NuGet analyzer setup, project-mode winapp run, Native AOT publish runs, crash diagnosis, and prerequisites. Use when creating, building, running, or fixing build errors in a WinUI 3 project."
---

Requires **WinApp CLI 0.7+**. Recommend the latest `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer` NuGet package, but continue if it is unavailable and tell the user that its checks for potential runtime issues were not run.

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

Recommend the latest stable analyzer package; do not assume a template includes it. If missing:
```powershell
dotnet add .\MyApp.csproj package Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer
```

Keep `PrivateAssets="all"` on the reference. If the package is unavailable, move on with a clear notice that analyzer checks were not available to flag potential runtime issues. Undo only an incomplete reference added by this attempt so it does not break restore; do not remove existing project references or conceal other restore failures. When installed, the package loads in normal CLI, IDE, and CI builds; WinApp CLI does not inject it.

For other packages, prefer the latest stable unless the project has a version policy or the user requests a specific version. Before coding API assumptions, use the restored project's `winapp find-api` lookups in [winui-design](../winui-design/SKILL.md).

### Build & Run (JIT Development)

Prefer **Windows Sandbox when available** for UI runs:
```powershell
winapp run . --on sandbox --detach --json
```
This builds on the host and launches in the guest. If Windows Sandbox is unavailable, tell the user and run locally with `winapp run . --detach --json`, pointing to [enablement guidance](../winui-setup/SKILL.md). **If the user explicitly requested Windows Sandbox, stop instead of falling back.** Preserve the returned `UiTargetArgs` (`--on sandbox -a GUESTPID`) for guest UI tools; a local launch needs its own host PID. See [winui-ui-testing](../winui-ui-testing/SKILL.md) for target selection and prerequisites.

For attached diagnostics:
```powershell
# Packaged app: diagnostic launch in the guest
winapp run . --on sandbox --debug-output
# Local diagnostics when Windows Sandbox is unavailable or local execution is requested
winapp run . --debug-output
```

**Invoke attached runs with `mode: "async"`.** Read the same shell for diagnostics; do not block synchronously for the app's lifetime. `--debug-output` cannot combine with `--json` or `--no-launch`. Guest unpackaged `--debug-output` is unsupported: explain the limitation and use local diagnostics unless Windows Sandbox was explicitly requested; in that case, keep the requested scope and report the diagnostic limitation.

Ordinary `winapp run` uses the build/JIT path, **even with `-c Release`**; it does not validate Native AOT. The CLI handles restore/build, runtime setup, output discovery, and package registration/launch. Use an explicit `.csproj` when project selection is ambiguous; use `winapp run --help` for selection and diagnostic options.

**If build fails:** Read all errors, batch-fix them in one pass, then rerun the same command. **If the app crashes:** read the attached shell's output and use the crash-diagnosis guidance below.

### Native AOT Publish Runs

For intended AOT deployment, prefer persistent `<PublishAot>true</PublishAot>` in the app project: it also enables analysis during development. Choose an architecture runnable on the selected host or guest. The ARM64 examples below assume an ARM64 Windows Sandbox guest; substitute `--arch x64` for x64, and omit `--on sandbox` when using the local path above.

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
| Analyzer (recommended) | Latest `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`, with `PrivateAssets="all"`; if unavailable, continue and disclose missing analyzer checks |
| Native AOT only | MSVC/native build tools from Visual Studio's **Desktop development with C++** workload, including target-architecture tools; additional to SDK-only normal builds |

If a required toolchain prerequisite is missing, **do not install it ad hoc or work around it**. Report it and ask the user to run `/winui-setup` for the normal toolchain, or arrange the [Native AOT prerequisites](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/) when needed. The recommended analyzer and Windows Sandbox follow the non-blocking policies above. `winapp new` manages the WinUI template pack itself.

### Critical Rules

- Keep **packaged** as the default and use project-mode `winapp run` for activation.
- Only for an **explicitly requested unpackaged/debug experiment**, set `WindowsPackageType=None`; package-identity-dependent APIs may fail and runtime requirements still apply. Do not use this as a silent launch workaround. Preserve the manifest and restore the original packaged setting after the experiment.
- Do not delete `Package.appxmanifest`.
- ❌ NEVER use `AnyCPU` — always x64 or ARM64

### References

- [winui-packaging](../winui-packaging/SKILL.md) — release packaging directly from the project; no development registration required.
