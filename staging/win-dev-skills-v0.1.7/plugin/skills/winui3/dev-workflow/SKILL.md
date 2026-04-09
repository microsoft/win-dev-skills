---
name: dev-workflow
description: 'Master workflow for all WinUI 3 C# desktop app tasks — environment checks, project creation, feature implementation, building, running, and error fixing. READ THIS BEFORE ANY WinUI 3 TASK.'
---

## Quick Reference

- **Prerequisites:** .NET SDK 10+, `winapp` CLI, Windows 10 1903+. Visual Studio NOT required.
- **New app:** `dotnet new winui -n <Name>` → build → `winapp run`
- **Existing app:** Read `.csproj` for SDK version/TFM; check `.github/copilot-instructions.md`.
- **Build:** `dotnet build <proj> -c Debug -p:Platform=x64` (AnyCPU won't work)
- **Run packaged:** `winapp run bin\x64\Debug\<tfm>\win-x64\` — NEVER run exe directly.
- **Errors:** Read ALL errors → batch-fix → rebuild once.
- **See also:** `templates` for scaffolding, `testing` before submitting.

---

## Key Rules

### 1. Environment

| Requirement | Minimum | Install |
|-------------|---------|---------|
| Windows | 10 v1903 | Upgrade OS |
| Developer Mode | Enabled | Settings → System → For developers → Developer Mode → On |
| .NET SDK | 10.0+ | `winget install Microsoft.DotNet.SDK.10 --source winget` |
| winapp CLI | Latest | `winget install Microsoft.WinAppCLI --source winget` |

Verify Developer Mode: `Get-WindowsDeveloperLicense` — must return `IsValid: True`.

### 2. New App Creation

1. **Template is `winui`, NOT `winui3`** — `dotnet new winui -n <AppName>`
2. `-n` creates the subfolder — do NOT `mkdir` first
3. Preserve template-generated MainWindow.xaml — insert content, don't rewrite
4. Metadata defaults: publisher=`TestDeveloper`, directory=`$PWD\{AppName}`
5. In autopilot (no `askQuestions` tool) — infer aggressively, use defaults, proceed immediately

### 3. Existing App Context

1. Find `.csproj` referencing `Microsoft.WindowsAppSDK`
2. Read `<TargetFramework>` for TFM (e.g., `net10.0-windows10.0.26100.0`)
3. Read WindowsAppSDK version for spec/sample search (`1.7`, `1.8`, `2.0`)

### 4. Adding Features

**⚠️ MANDATORY before writing feature code:**
1. Search specs via `search-docs` → `WindowsAppSDK-specs`
2. Search samples via `search-docs` → `WindowsAppSDK-Samples`
3. For AI features: also search `Windows-AI-Docs`

Then: break down steps → build complete UI before launch → verify with screenshots → log issues to `FEEDBACK.md`.

### 5. Building

```powershell
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }
dotnet build <project.csproj> -c Debug -p:Platform=$arch
```

Output: `bin\<Platform>\<Config>\<TFM>\win-<platform>\`. Clean stale XAML: `Remove-Item obj -Recurse -Force`.

### 6. Running

- **Packaged** (has `Package.appxmanifest`): `winapp run bin\x64\Debug\<tfm>\win-x64\`
- **Unpackaged** (`WindowsPackageType=None`): `dotnet run --project <proj> -p:Platform=x64`

❌ NEVER run packaged exe directly — silently exits
❌ NEVER add `<WindowsPackageType>None` to work around launch issues
❌ NEVER delete `Package.appxmanifest`

### 7. Error Diagnosis — Batch Fix

Read ALL errors → group by root cause → fix in one pass → rebuild once.

| Code | Meaning | Fix |
|------|---------|-----|
| 0x80073CF6 | Package install failed | `winapp init`, check manifest |
| 0x8007000B | Bad image format | Check platform target |
| CS0234/CS0246 | Missing type/namespace | Add `using` or `dotnet add package` |
| NETSDK1136 | Platform required | Add `-p:Platform=x64` |
| XLS0414 | XAML type not found | Add `xmlns` declaration |
| XDG0062 | Binding path missing | Check `x:Bind` property on ViewModel |
| MC1000 | XAML syntax | `using:` not `clr-namespace:`, `ThemeResource` not `DynamicResource` |

| XAML Compiler Issue | Fix |
|---------------------|-----|
| XAML compiler crashes silently (build "succeeds" but no output) | Remove ALL `PresentationCore.dll` / `System.Windows.Media.Imaging` references — they are incompatible with WinUI. See `wpf-migration` skill. |
| XAML compiler hangs or produces cryptic errors | Bisect: comment out half the XAML, rebuild. Check `obj\` for `input.json` to see what the compiler received. |
| Build succeeds but app crashes on launch | Check for conflicting assembly references (`System.Windows.*` mixed with `Microsoft.UI.Xaml.*`) |

| Launch Issue | Fix |
|-------------|-----|
| Silently exits | Use `winapp run`, not exe directly |
| Blank window | `x:Bind` defaults `OneTime` — set `Mode=OneWay` |
| Blank window | DataContext not set or wrong namespace |

### 8. Verification

```powershell
winapp ui screenshot -a <appname>   # delete after use
winapp ui inspect -a <appname>
```

---

## Related Skills

| Skill | Use for |
|-------|---------|
| `templates` | Control selection, scaffolding, settings page |
| `testing` | Unit tests for ViewModels/services |
| `windowing` | AppWindow API, multi-window, title bars |
| `aot-sourcegen` | Trimming, source generators |
| `search-docs` | Specs, samples, troubleshooting notes |
| `ui-automation` | Inspect/interact with running UI |
| `wpf-migration` | Migrating WPF to WinUI 3 |

## External Resources

| Resource | URL |
|----------|-----|
| WinUI 3 Overview | https://learn.microsoft.com/windows/apps/winui/winui3/ |
| Windows App SDK API | https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/ |
| Controls Gallery | https://learn.microsoft.com/windows/apps/design/controls/ |
| CommunityToolkit.Mvvm | https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/ |
