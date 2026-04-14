---
name: winui3
description: "Builds WinUI 3 desktop applications using Windows App SDK, XAML, and C#. Use for creating new apps, adding features, converting from WPF/Electron/web, fixing bugs, or any WinUI 3 / WinAppSDK / XAML task."
user-invocable: true
---

## Process

You build WinUI 3 desktop apps following this process: understand requirements → design UI → scaffold → write code → build & run. The user might ask you to use other steps defined by skills such as `winui3-ui-testing` for UI validation or `winui3-code-review` for quality checks.

## Best Practices

- **Efficiency:** Batch file creates/edits in one pass. Don't re-read files you just wrote. Chain dependent commands with `&&`.
- **ReadEfficiently:** Read files efficiently. Avoid reading the same file multiple times. Use caching or batch operations when possible.
- **Principles:** YAGNI (no speculative abstractions), DRY (search before writing new code), KISS (simplest solution that works).
- **Accessibility:** Set `AutomationProperties.AutomationId` on every interactive control (Button, TextBox, ComboBox, CheckBox, ToggleSwitch, NavigationViewItem). Use unique naming for each control.
- **Code quality:** File-scoped namespaces, `_camelCase` private fields, PascalCase types/methods/properties, `Async` suffix on async methods, `Is/Has/Can` prefix on booleans. Remove unused `using` statements.

## Workflow

### 1. Understand the Request
Read the requirements fully. Define scope: new app, new feature, bug fix, or conversion. Identify target controls, data sources, and platform APIs needed.

### 2. Design

Before coding, plan the UI:

**Pick an anchor app** — reference a real Windows 11 app as your design model:

| App Type | Anchor | Navigation Pattern |
|----------|--------|-------------------|
| Settings/config | Windows Settings | NavigationView Left + SettingsCards |
| Document/editor | Windows Terminal / Notepad | TabView + full-width content |
| File browser | File Explorer | TreeView + ListView + BreadcrumbBar |
| Developer tool | Dev Home | NavigationView + card dashboard |
| Utility | Calculator | Mode switcher + compact grid |

**Map requirements to controls:**
- Navigation: `NavigationView` + `Frame` · Tabs: `TabView` · Breadcrumbs: `BreadcrumbBar`
- Lists: `ListView` (never StackPanel for dynamic items) · Tables: `ListView` with column headers · Trees: `TreeView`
- Text: `TextBox` / `RichEditBox` · Numbers: `NumberBox` · Search: `AutoSuggestBox`
- Boolean: `ToggleSwitch` · Pick 1 of 2-3: `RadioButtons` · Pick 1 of 4+: `ComboBox`
- Decisions: `ContentDialog` · Status: `InfoBar` · Quick action: `Flyout`

**Layout rules:**
- Content fills the window — no centered floating cards
- `Grid` for structure, `StackPanel` only for simple stacking
- Sidebar: fixed 300-360px + flexible main — not 50/50

**Fluent Design:**
- Typography: `TitleTextBlockStyle` (28px), `SubtitleTextBlockStyle` (20px), `BodyTextBlockStyle` (14px), `CaptionTextBlockStyle` (12px) — never hardcode `FontSize`
- Spacing: 4px grid (4, 8, 12, 16, 24, 32, 48) — no odd values
- Colors: `{ThemeResource}` only — never `#FF0000` or `Color="Blue"`
- Corner radius: `ControlCornerRadius` (4px) for controls, `OverlayCornerRadius` (8px) for overlays
- Materials: `MicaBackdrop` for main window
- Icons: `SymbolIcon` or `FontIcon` (Segoe Fluent Icons)

**Anti-patterns:** ❌ Custom pill/tab switcher · ❌ Theme toggle in title bar · ❌ ScrollViewer around ListView · ❌ Custom ControlTemplate for standard controls

For deeper design guidance (theming rules, High Contrast, XAML review), read the `winui3-design` skill.

### 3. Code

**New app:** `dotnet new winui-mvvm -n <AppName>` (creates MVVM project with CommunityToolkit.Mvvm, TitleBar, MicaBackdrop, Frame navigation). Do NOT `mkdir` first. Other templates: `winui-navview`, `winui-tabview`, `winui` (blank).

**Existing app:** Read the `.csproj` to understand TFM, packages, and structure. Follow the patterns already established.

**Install packages:** `dotnet add package <Name>` — never specify `--version` (gets latest stable).

**XAML rules:**
- Always `x:Bind` with `Mode=OneWay` — never `{Binding}`
- Always `{ThemeResource}` brushes — never hardcoded colors
- Always `x:DataType` on every `DataTemplate`
- Always `AutomationProperties.AutomationId` on interactive controls
- Use built-in text styles (`TitleTextBlockStyle`, etc.) — never raw `FontSize`

**When converting from another framework:**

| Source Pattern | WinUI 3 Equivalent |
|---------------|-------------------|
| Centered card on gradient | Full-width content, 24-36px padding |
| CSS tab/pill buttons | `NavigationView` Top or `SelectorBar` |
| `<select>` dropdown | `ComboBox` |
| Floating action button | `CommandBar` or `AppBarButton` |
| Toast/snackbar | `InfoBar` (in-app) |
| WPF `DataGrid` | `ListView` with Grid column headers |
| WPF `WrapPanel` | `ItemsRepeater` + `UniformGridLayout` |
| WPF `TabControl` | `TabView` |

### 4. Build & Run

**Before your first build, load the `winui3-dev-workflow` skill.** It provides `BuildAndRun.ps1` which is the only supported way to build WinUI 3 apps. Do NOT use `dotnet build` — it has a broken XAML compiler that silently fails without showing error details, causing hours of wasted debugging.

`BuildAndRun.ps1` handles platform detection, NuGet restore, MSBuild invocation, code analyzers, and app launching with crash detection. Use it for every build:

```powershell
.\BuildAndRun.ps1                    # Build + run (preferred — blocking but shows crashes and exceptions - PID available in output)
.\BuildAndRun.ps1 -SkipRun           # Build only
.\BuildAndRun.ps1 -Detach            # Build + run in background (returns PID JSON)
```

**Prerequisites:** Windows 10 v1903+ · Developer Mode enabled · .NET SDK 10+ · winapp CLI

**Critical rules:**
- ❌ NEVER use `dotnet build` — it hides XAML compiler errors behind `MSB3073` with no details
- ❌ NEVER run the packaged .exe directly — always use `winapp run` or `BuildAndRun.ps1`
- ❌ NEVER add `<WindowsPackageType>None` to work around launch issues
- ❌ NEVER delete `Package.appxmanifest`

**Common errors:**

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| XLS0414 type not found | Add `xmlns` declaration |
| XDG0062 binding path missing | Check `x:Bind` property exists on ViewModel |
| Blank window after launch | `x:Bind` defaults to `OneTime` — add `Mode=OneWay` |
| App silently exits | Use `winapp run`, never run the .exe directly |
| XAML compiler crash | Remove any `PresentationCore` / `System.Windows` references |
| 0x80073CF6 package failed | Run `winapp init`, check manifest publisher matches cert |

### 5. Ensure everything builds and runs correctly
After building, verify the app works — check that it launches. If the user has asked to validate the app, use the `winui3-ui-testing` skill to generate and run batch UI tests, and/or the `winui3-code-review` skill for a quality review.

## Reference

### MVVM with CommunityToolkit.Mvvm
```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] public partial string Title { get; set; }
    [ObservableProperty] public partial bool IsLoading { get; set; }

    [RelayCommand]
    private async Task LoadDataAsync()
    {
        IsLoading = true;
        try { /* async work */ }
        finally { IsLoading = false; }
    }
}
```

**ViewModel checklist:** extends `ObservableObject` · partial properties not fields · `[RelayCommand]` not `ICommand` · `async Task` not `async void` · no UI types in ViewModels · never replace `ObservableCollection<T>` — use `.Clear()` + re-add.

### x:Bind Rules
1. Always `{x:Bind}` — never `{Binding}`
2. Always `Mode=OneWay` (or `TwoWay` for input) — default `OneTime` causes blank UI
3. Always `x:DataType` on `DataTemplate`
4. Never nested nullable paths (e.g., `ViewModel.Selected.Name`) — use `FallbackValue`

### Namespace Rules
- `Microsoft.UI.Xaml` not `Windows.UI.Xaml`
- `DispatcherQueue` not `CoreDispatcher`
- No `Window.Current` — pass window reference explicitly

### Anti-Patterns
- ❌ Field-backed `[ObservableProperty]` — use partial properties
- ❌ `async void` except event handlers
- ❌ Hardcoded colors (`#FF0000`, `Color="Blue"`) — use `{ThemeResource}`
- ❌ `{Binding}` — always `{x:Bind}`
- ❌ Running the packaged .exe directly — use `winapp run` or `BuildAndRun.ps1`
- ❌ `AnyCPU` platform — always x64 or ARM64
- ❌ UWP namespaces (`Windows.UI.Xaml`, `CoreDispatcher`, `Window.Current`)

### NuGet Packages
| Package | Use |
|---------|-----|
| `CommunityToolkit.WinUI.Controls.SettingsControls` | SettingsCard, SettingsExpander |
| `CommunityToolkit.WinUI.Converters` | BoolToVisibility, StringFormatter |
| `Microsoft.Xaml.Behaviors.WinUI.Managed` | EventTriggerBehavior, InvokeCommandAction |
| `WinUIEx` | Extended window features, tray icon |

## Available Skills

| Skill | Use when... |
|-------|-------------|
| `winui3-design` | Designing new UI pages, converting from other frameworks, reviewing XAML |
| `winui3-architecture` | Structuring a complex multi-page app, setting up DI, navigation |
| `winui3-ui-testing` | Running automated UI tests after building |
| `winui3-code-review` | Reviewing code quality before committing |
| `winui3-controls` | Building custom controls, context menus, drag-drop, clipboard |
| `winui3-wpf-migration` | Converting a WPF application to WinUI 3 |
| `winui3-platform` | Adding notifications, background tasks, file handling, sensors, media |
| `winui3-webview2` | Embedding web content with WebView2, JS↔C# interop |
| `winui3-community-toolkit` | Using SettingsCard, Converters, Behaviors |
| `winui3-ai-ml` | Adding local AI inference, WinML, ONNX Runtime |
| `winui3-testing` | Writing unit tests |
| `winui3-packaging` | MSIX packaging, code signing, Store distribution |
| `winui3-session-report` | Generating a diagnostic report after a session for feedback |
