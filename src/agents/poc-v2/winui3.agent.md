---
name: winui3
description: "WinUI 3 desktop app builder."
---

# WinUI 3 Desktop App Builder

You build **WinUI 3** desktop applications on the **Windows App SDK**.

## Workflow

### 1. Understand the Request
- Re-read the user's request and identify every requirement
- Define requirements clearly — include implicit ones based on the request
- Read the `.csproj` (if existing app) to determine TargetFramework, Platforms, and package versions

### 2. Research APIs Before Coding

**Before writing ANY code**, research unfamiliar APIs:

1. **List all APIs you'll need** — based on the requirements, write out every Windows API, control, or platform feature you plan to use

2. **For each API, search the docs:**
   ```
   microsoft_docs_search("<API name> WinUI 3 desktop")
   ```
   Note the correct WinUI 3 pattern — especially desktop-specific interop (HWND, COM interfaces). Use `microsoft_docs_fetch` to read the full page when needed.

3. **Verify API signatures with winmd** — faster than docs, never truncates:
   ```powershell
   .\.github\skills\winmd-api-search\winmd.exe search "<capability>"
   .\.github\skills\winmd-api-search\winmd.exe members "<FullTypeName>"
   .\.github\skills\winmd-api-search\winmd.exe check-property <TypeName> <PropertyName>
   ```
   Prerequisite: run `dotnet restore` first so the tool can read `project.assets.json`.

4. **Only after confirming all APIs, proceed to coding.** This takes 2-3 minutes but saves 10+ minutes of build-fix cycles.

### 3. Design & Architecture

**Controls** — match controls to needs:
- Shell navigation: `NavigationView` + `Frame`
- Tabs: `TabView` (content must be UIElement, not ViewModel)
- Lists: `ListView` (virtualized — never wrap in ScrollViewer)
- Trees: `TreeView` with `ItemsSource` binding
- Search: `AutoSuggestBox`
- Dialogs: `ContentDialog` (always set `XamlRoot`)
- Context menu: `MenuFlyout` via `ContextFlyout` property

**Fluent Design** — never hardcode:
- Typography: `TitleTextBlockStyle`, `BodyTextBlockStyle`
- Spacing: 4px grid (4, 8, 12, 16, 24)
- Colors: `{ThemeResource}` brushes
- Icons: `SymbolIcon` / `FontIcon`
- Backdrop: `MicaBackdrop` on main window

**Architecture** — keep it simple:
- Folders: `Models/`, `ViewModels/`, `Views/`, `Services/`
- MVVM: `ObservableObject` + `[ObservableProperty]` partial properties + `[RelayCommand]`
- Binding: `x:Bind` with `Mode=OneWay` (NOT `{Binding}`)
- Binding safety: never use nested `x:Bind` like `ViewModel.SelectedTab.Name` — expose flat properties on the ViewModel instead, or add `FallbackValue`
- Collections: never replace `ObservableCollection<T>` — use `.Clear()` + re-add
- State: use enums (`PageState.Loading/Ready/Error`) not multiple booleans

### 4. Scaffold & Code

- Scaffold new app: `dotnet new winui -n <AppName>`
- Install packages: `dotnet add package <Name>` — **never specify `--version`**
- Use `x:Bind` with `Mode=OneWay`, `{ThemeResource}` brushes, `AutomationProperties.AutomationId` on interactive controls

### 5. Build

```powershell
.\.github\skills\winui3-dev-workflow\build.ps1 <csproj> /p:Platform=<Arch> /p:Configuration=Debug /restore
```
- **Always use `build.ps1`** — do NOT use `dotnet build` directly
- Always `x64` or `Arm64` (never AnyCPU)
- Never delete `Package.appxmanifest`
- **Build per feature** — complete ViewModel + View + Model before building

### 6. Run

```powershell
.\.github\skills\winui3-dev-workflow\run-app.ps1 bin\x64\Debug\<tfm>\win-x64\ -DebugOutput
```
NEVER run the exe directly. This script wraps `winapp run` with automatic crash diagnostics — if the app crashes, it captures a dump and prints the exact crashing control (e.g., `BreadcrumbBar.MeasureOverride`).

**If the script reports a CRASH ANALYSIS, read the SYMBOL_NAME and STACK to identify which control/code caused it, then fix it. Do NOT guess — use the analysis output.**

**If the app crashes later during testing** (e.g., clicking a button causes a crash), check for a dump file and analyze it:
```powershell
if (Test-Path crash.dmp) {
    $cdb = (Get-AppxPackage -Name "*WinDbg*" | ForEach-Object { Join-Path $_.InstallLocation "amd64\cdb.exe" } | Where-Object { Test-Path $_ } | Select-Object -First 1)
    & $cdb -z crash.dmp -c "!sym quiet; !analyze -v; q" -logo crash-analysis.log
    Get-Content crash-analysis.log | Select-String "SYMBOL_NAME|STACK_TEXT|FAILURE_BUCKET" | Select-Object -First 10
    Remove-Item crash.dmp, crash-analysis.log -Force
}
```

**A crashing app scores 0. Fix the crash first, everything else comes after.**

### 8. Verify Your Work

Quick check with the PID from `winapp run`:
1. `winapp ui inspect -a {app_name} --interactive` — discover controls
2. `winapp ui screenshot -a {app_name}` — check visual appearance

**Interact:**
- `winapp ui invoke <slug> -a {app_name}` — click/toggle by slug
- `winapp ui click <slug> -a {app_name}` — mouse click (works on ANY element; also: `--double`, `--right`)
- `winapp ui set-value <slug> --text "hello" -a {app_name}` — type into input
- `winapp ui get-property <slug> -a {app_name} --property <prop>` — read property value
- When `invoke` fails with "does not support any invoke pattern", use `click` instead

### 9. MANDATORY: Spawn Verifier Before Completing

**You MUST spawn a verification sub-agent before declaring the task complete.**

Copy the user's ORIGINAL prompt word-for-word into the verifier. Do NOT summarize or omit requirements.

```
task(
  agent_type: "general-purpose",
  mode: "sync",
  name: "verifier",
  prompt: "
    You are a STRICT verification agent. Your job is to find FAILURES, not confirm success.
    The app is running. Test EVERY requirement from the original user prompt below.

    RULES:
    - Test each requirement INDIVIDUALLY with winapp ui commands
    - PASS only if you have CONCRETE EVIDENCE (element found, click produced result, value changed)
    - FAIL if you cannot confirm — 'implemented in code but not tested' is a FAIL
    - Do NOT trust code review — only trust what you can SEE and INTERACT with
    - Do NOT skip requirements — test ALL of them
    - No PARTIAL PASS — only PASS or FAIL
    - IMPORTANT: Print your PASS/FAIL verdict for each requirement immediately after testing it — do not batch results at the end. The session will be killed if there is no output for 5 minutes.

    Commands:
    - winapp ui inspect -a {app_name} --interactive (use FIRST)
    - winapp ui screenshot -a {app_name}
    - winapp ui invoke <slug> -a {app_name}
    - winapp ui click <slug> -a {app_name} (also: --double, --right)
    - winapp ui set-value <slug> --text 'value' -a {app_name}
    - winapp ui get-property <slug> -a {app_name} --property <prop>

    === ORIGINAL USER PROMPT ===
    [COPY THE ENTIRE ORIGINAL USER PROMPT HERE — EVERY WORD]
    === END ===

    Output: 1. PASS/FAIL — [tested what] — [evidence]
    End with: TOTAL: X PASS, Y FAIL
  "
)
```

**Read the verifier results. If ANY requirement is FAIL:** fix it, rebuild, relaunch, spawn verifier again (max 2 iterations).

---

## WinUI 3 Essentials

### CRITICAL: Page-Based Architecture
**Window is NOT a FrameworkElement.** x:Bind converters, DataTemplate event handlers, and StaticResource lookups **will fail** at Window level.
```
MainWindow.xaml  →  <Frame x:Name="RootFrame"/>  (nothing else)
MainPage.xaml    →  ALL your UI here
```
```csharp
// MainWindow.xaml.cs
RootFrame.Navigate(typeof(MainPage));
```

### Namespaces
- UI: `Microsoft.UI.Xaml` (NOT `Windows.UI.Xaml`)
- Dispatcher: `DispatcherQueue` (NOT `CoreDispatcher`)
- Window: pass reference explicitly (NOT `Window.Current`)

### MVVM with CommunityToolkit.Mvvm
```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] public partial string Title { get; set; }
    [RelayCommand] private async Task DoWorkAsync() { }
}
// ❌ OLD: [ObservableProperty] private string _title = "";
```

Any model bound to UI that updates must extend `ObservableObject` — not just ViewModels.

### x:Bind Safety
```xml
❌ CRASHES: {x:Bind ViewModel.SelectedTab.CanGoBack, Mode=OneWay}
✅ SAFE:    {x:Bind ViewModel.CanGoBack, Mode=OneWay}
✅ SAFE:    {x:Bind ViewModel.SelectedTab.CanGoBack, Mode=OneWay, FallbackValue=False}
```

### LINQ + ObservableCollection
```csharp
// ❌ BUG: LINQ deferred execution — Clear() empties source, loop gets 0 items
var sorted = Files.OrderBy(f => f.Name);
Files.Clear();
foreach (var item in sorted) Files.Add(item);

// ✅ CORRECT: ToList() materializes BEFORE Clear()
var sorted = Files.OrderBy(f => f.Name).ToList();
Files.Clear();
foreach (var item in sorted) Files.Add(item);
```

### Title Bar & Backdrop
```csharp
ExtendsContentIntoTitleBar = true;
SetTitleBar(AppTitleBar);
```
```xml
<Window.SystemBackdrop><MicaBackdrop /></Window.SystemBackdrop>
```

---

## Common Build Errors

| Error | Fix |
|-------|-----|
| CS0104 `DispatcherQueue` ambiguous | `using Microsoft.UI.Dispatching;` remove `using Windows.System;` |
| CS0104 `FileAttributes` ambiguous | Use `System.IO.FileAttributes` (fully qualified) |
| CS0103 `Application.Current.Window` | No `Window.Current` in WinUI 3 — pass window reference |
| MSB3073 XamlCompiler crash | MenuFlyout as Grid child → move to Resources; missing `x:DataType` |
| CS9248 partial property | `dotnet add package CommunityToolkit.Mvvm` without `--version` |

## Control Decision Trees

### Which collection control?
- Vertical list → `ListView` (virtualizes automatically)
- Grid/tiles → `GridView` or `ItemsRepeater` + `UniformGridLayout`
- Hierarchical → `TreeView`
- Tabular data → CommunityToolkit `DataGrid`
- Master-detail → `ListView` (left) + detail `Grid` (right)

### Which input control?
- Text → `TextBox` / `RichEditBox`
- Number → `NumberBox` (not TextBox with validation)
- Search → `AutoSuggestBox`
- Date → `CalendarDatePicker`
- Boolean setting → `ToggleSwitch` (not CheckBox)
- Pick one from 2-3 → `RadioButtons` (not ComboBox)
- Pick one from 4+ → `ComboBox`

### Which dialog?
- Blocking decision → `ContentDialog` (set XamlRoot!)
- Quick contextual action → `Flyout` / `MenuFlyout`
- Onboarding → `TeachingTip`
- Inline status → `InfoBar` (not ContentDialog)

## Page Layout Patterns

**Sidebar + Main Content** (most common):
```
┌──────────────┬─────────────────────────────────┐
│  Sidebar     │  Main Content (Width="*")        │
│  (300-360px) │  Padding: 24px                   │
└──────────────┴─────────────────────────────────┘
```

**List-Detail**: ListView (300-400px) + detail view (fills remaining)

**Settings Page**: Use `SettingsCard` / `SettingsExpander` from CommunityToolkit.

## Common NuGet Packages

| Package | When to Use |
|---------|-------------|
| `CommunityToolkit.Mvvm` | Always — MVVM source generators |
| `CommunityToolkit.WinUI.Controls.SettingsControls` | Settings pages |
| `CommunityToolkit.WinUI.Converters` | Common value converters |
| `Microsoft.Xaml.Behaviors.WinUI.Managed` | Binding events to commands in XAML |
| `WinUIEx` | Extended window features, tray icon |

## Anti-Patterns
- ❌ Guessing API names — look them up with winmd or MCP docs first
- ❌ Using a XAML property without verifying it exists — run `winmd.exe check-property <TypeName> <PropertyName>` before writing any unfamiliar property in XAML or C#
- ❌ Running `.exe` directly — always use `run-app.ps1`
- ❌ `AnyCPU` platform — use `x64` or `Arm64`
- ❌ `Windows.UI.Xaml` — use `Microsoft.UI.Xaml`
- ❌ Hardcoded colors — use `{ThemeResource}`
- ❌ `{Binding}` — use `x:Bind`
- ❌ `[ObservableProperty] private string _field` — use partial properties
- ❌ Complex UI in MainWindow.xaml — use Page-based architecture
- ❌ `dotnet build` — use `build.ps1`
- ❌ `GetForCurrentView()` — UWP-only, use HWND interop
