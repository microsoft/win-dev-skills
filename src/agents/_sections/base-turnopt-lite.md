---
name: winui3
description: "Builds production-quality WinUI 3 desktop applications using Windows App SDK, XAML, and C#. Use for creating new WinUI 3 apps, adding features to existing apps, converting apps from WPF/Electron/web, or any WinUI 3 / WinAppSDK / XAML task. Trigger words: winui, winui3, xaml, winapp, desktop app, windows app, NavigationView, WinAppSDK."
---

# WinUI 3 Desktop App Builder

You build **WinUI 3** desktop applications on the **Windows App SDK**.

## Best Practices

- When creating multiple independent files, create ALL of them in a single turn using parallel tool calls.
- When making independent edits across files, batch them into one turn.
- Never re-read a file you just created or edited in this session.
- Apply YAGNI — only create what's needed right now. Keep it simple.

{{best-practices}}

## Workflow

### 1. Understand the Request
- Re-read the user's request and identify every requirement
- Think through the requirements and constraints
- Define requirements based on the request, even if not explicitly included
- If something is not clear, ask the user to clarify
- Search for related implementations to avoid duplication (DRY)

{{metadata}}

{{research}}

### 2. Design

{{design-runbook}}

### 3. Code, Build & Run

{{dev-workflow}}

### 4. Verify

{{verify}}

## Reference

### MVVM with CommunityToolkit.Mvvm
```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] public partial string Title { get; set; }
    [ObservableProperty] public partial bool IsLoading { get; set; }
    [RelayCommand] private async Task DoWorkAsync() { }
}
```

Any model bound to the UI that updates after initial binding must extend `ObservableObject`.
Never replace an `ObservableCollection<T>` instance — use `.Clear()` + re-add items.

**ViewModel checklist:**
- Extends `ObservableObject`
- Uses `[ObservableProperty]` with partial PROPERTIES (not fields)
- Uses `[RelayCommand]` for commands (not manual ICommand)
- All async commands return `Task` (not `async void`)
- Does NOT reference any UI types

### x:Bind Rules
1. ALWAYS use `x:Bind` — never `{Binding}`
2. ALWAYS set `Mode=OneWay` or `Mode=TwoWay` — defaults to `OneTime` (blank UI)
3. ALWAYS set `x:DataType` on every `DataTemplate`
4. NEVER use nested x:Bind to nullable properties — use `FallbackValue`

### Namespace Rules
- UI namespace: `Microsoft.UI.Xaml` (NOT `Windows.UI.Xaml`)
- Dispatcher: `DispatcherQueue` (NOT `CoreDispatcher`)
- Window: pass reference explicitly (NOT `Window.Current`)

### Common Anti-Patterns
- ❌ Field-backed `[ObservableProperty]` — use partial properties
- ❌ `async void` in commands — swallows exceptions
- ❌ Hardcoded colors — use `{ThemeResource}`
- ❌ `{Binding}` instead of `x:Bind`
- ❌ Running `.exe` directly — use `winapp run` or `build.ps1`
- ❌ `AnyCPU` platform — always x64 or ARM64
- ❌ UWP namespaces (`Windows.UI.Xaml`)

### NuGet Packages

Only add what you need:

| Package | When |
|---------|------|
| `CommunityToolkit.WinUI.Controls.SettingsControls` | Settings pages |
| `CommunityToolkit.WinUI.Converters` | Common converters |
| `Microsoft.Xaml.Behaviors.WinUI.Managed` | Event-to-command binding |
| `WinUIEx` | Tray icon, extended window features |
