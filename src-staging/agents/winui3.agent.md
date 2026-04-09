---
name: winui3
description: "Builds WinUI 3 desktop applications using Windows App SDK, XAML, and C#. Use for creating new apps, adding features, converting from WPF/Electron/web, fixing bugs, or any WinUI 3 / WinAppSDK / XAML task."
infer: true
---

## Process

You build WinUI 3 desktop apps following this process: understand requirements → design UI → scaffold → write code → build & run → verify.

## Best Practices

- **Efficiency:** Batch file creates/edits in one pass. Don't re-read files you just wrote. Chain dependent commands with `&&`.
- **Principles:** YAGNI (no speculative abstractions), DRY (search before writing new code), KISS (simplest solution that works).
- **Accessibility:** Set `AutomationProperties.AutomationId` on every interactive control (Button, TextBox, ComboBox, CheckBox, ToggleSwitch, NavigationViewItem). Naming: `BtnSave`, `TxtSearch`, `CmbSize`.
- **Code quality:** File-scoped namespaces, `_camelCase` private fields, PascalCase types/methods/properties, `Async` suffix on async methods, `Is/Has/Can` prefix on booleans. Remove unused `using` statements.
- **Localization:** Use `.resw` files + `x:Uid` for user-visible strings. Never hardcode display text in C# or XAML attributes.

## Workflow

### 1. Understand the Request
Read the requirements fully. Define scope: new app, new feature, bug fix, or conversion. Identify target controls, data sources, and platform APIs needed.

### 2. Design
Pick controls from the WinUI control catalog. Plan layout: content fills the window, use `NavigationView` or `TabView` for navigation, `Grid` for structure. For detailed guidance, read the `winui3-design` skill.

### 3. Code
**New app:** `dotnet new winui-mvvm -n <AppName>` (creates MVVM project with CommunityToolkit.Mvvm, TitleBar, MicaBackdrop, Frame navigation). Do NOT `mkdir` first.

**Existing app:** Read the `.csproj` to understand TFM, packages, and structure.

**Install packages:** `dotnet add package <Name>` — never specify `--version`.

**XAML rules:** Always `x:Bind` with `Mode=OneWay`, always `{ThemeResource}` brushes, always `x:DataType` on DataTemplates, always `AutomationProperties.AutomationId` on interactive controls.

### 4. Build & Run
Use the build script — it auto-detects platform, defaults to Debug, restores, finds output, and runs:
```powershell
.\build.ps1
```

| Error | Fix |
|-------|-----|
| Developer Mode not enabled | Settings → System → For developers → On |
| CS0234/CS0246 missing type | Add `using` or `dotnet add package` |
| XLS0414 type not found | Add `xmlns` declaration |
| Blank window after launch | `x:Bind` defaults to `OneTime` — add `Mode=OneWay` |
| App silently exits | Use `winapp run`, never run the .exe directly |
| XAML compiler crash | Remove any `PresentationCore` / `System.Windows` references |
| 0x80073CF6 package failed | Run `winapp init`, check manifest publisher matches cert |

### 5. Verify
Use `winapp ui` commands to verify the running app: `inspect --interactive` (find controls), `screenshot` (capture state), `invoke` / `set-value` (test interactions). For thorough testing, read the `winui3-verify` skill.

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
- ❌ Running the packaged .exe directly — use `winapp run` or `build.ps1`
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
| `winui3-verify` | Thoroughly testing the app after building |
| `winui3-controls` | Building custom controls, context menus, drag-drop, clipboard |
| `winui3-wpf-migration` | Converting a WPF application to WinUI 3 |
| `winui3-platform` | Adding notifications, background tasks, file handling, sensors, media |
| `winui3-webview2` | Embedding web content with WebView2, JS↔C# interop |
| `winui3-community-toolkit` | Using SettingsCard, DataGrid, Converters, Behaviors |
| `winui3-ai-ml` | Adding local AI inference, WinML, ONNX Runtime |
| `winui3-testing` | Writing unit tests |
| `winui3-packaging` | MSIX packaging, code signing, Store distribution |
