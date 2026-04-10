---
name: winui3-architecture
description: 'WinUI 3 app architecture — simple MVVM with CommunityToolkit.Mvvm, project structure, data binding, and common pitfalls.'
---

# Architecture

## Project Structure
```
Models/       → Data classes (ObservableObject if UI-bound)
ViewModels/   → One per page (ObservableObject + RelayCommand)
Views/        → XAML pages and windows
Services/     → Business logic (simple static or singleton classes)
Converters/   → IValueConverter implementations
```

## MVVM — Keep It Simple
Use `CommunityToolkit.Mvvm` source generators. No DI frameworks needed for most apps.

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

- Model state with enums (`PageState.Loading/Ready/Error`) not multiple booleans
- ViewModels should not reference UI types directly
- ❌ Field-backed `[ObservableProperty]` — use partial properties
- ❌ Sync I/O in commands — always `async Task`
- ❌ Over-engineering with DI containers, factories, or abstractions for simple apps

## Data Binding
- `x:Bind` with explicit `Mode=OneWay` or `TwoWay` (defaults to `OneTime` — blank UI if you forget)
- Always set `x:DataType` on `DataTemplate` for compiled bindings
- **Any model that updates after initial binding must extend `ObservableObject`** — not just ViewModels
- Never replace an `ObservableCollection<T>` — use `.Clear()` + re-add items
- ❌ `{Binding}` — always use `x:Bind`
- ❌ Nested `x:Bind` to nullable properties (e.g. `ViewModel.SelectedTab.Title`) — crashes if null. Bind through a guaranteed non-null property or use `FallbackValue`

## Navigation
- Single page apps: implement code in the MainPage hosted by a frame in the MainWindow to retain all UIElement features of page
- Multi-page: `NavigationView` + `Frame` — call `Frame.Navigate(typeof(Page))`
- Pass data via navigation parameters, not global state

## Windowing & Dialogs
- **Window is NOT a UIElement** — no `Window.DataContext`, no `Window.Resources`, no `Window.KeyboardAccelerators`
  - Set DataContext on `(FrameworkElement)window.Content`, not the Window
  - Put resources in `App.xaml` or `Page.Resources`
  - Attach KeyboardAccelerators to `NavigationView` or `Page`, not Window
  - Get XamlRoot from `Content.XamlRoot`, not Window
- Always set `ContentDialog.XamlRoot = element.XamlRoot` before `ShowAsync()` — crashes without it
- Only one `ContentDialog` per XamlRoot at a time — queue or dismiss existing dialogs
- File pickers need HWND: call `InitializeWithWindow(hwnd)` before `PickSingleFileAsync()`
- ❌ `Window.Current` — pass window reference explicitly

## Async Rules
- `async void` only for event handlers — use `async Task` for commands (async void swallows exceptions)
- XAML objects have thread affinity — never create `SolidColorBrush`, `BitmapImage`, etc. on background thread
- Use `DispatcherQueue.GetForCurrentThread()` — there is no `Application.Current.Dispatcher` in WinUI 3

## Common NuGet Packages
| Package | When to Use |
|---------|-------------|
| `CommunityToolkit.Mvvm` | Always — MVVM source generators |
| `CommunityToolkit.WinUI.Controls.SettingsControls` | Settings pages (SettingsCard, SettingsExpander) |
| `CommunityToolkit.WinUI.Converters` | Common value converters |
| `Microsoft.Xaml.Behaviors.WinUI.Managed` | Binding events to commands in XAML |
| `WinUIEx` | Extended window features, tray icon |

## Common Pitfalls
| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank UI | `x:Bind` defaults to OneTime | Add `Mode=OneWay` |
| UI doesn't update | Model not ObservableObject | Extend ObservableObject, use [ObservableProperty] |
| App crash on startup | Nested x:Bind to null property | Use FallbackValue or null-safe binding path |
| App crash on startup | ContentDialog.XamlRoot not set | Set `dialog.XamlRoot = element.XamlRoot` |
| File picker crash | Missing HWND initialization | Call `InitializeWithWindow(hwnd)` first |
| CS0104 ambiguous type | FileAttributes in two namespaces | Fully qualify: `System.IO.FileAttributes` |
| Silent XAML error | Invalid XAML compiles in C# but crashes XamlCompiler | Simplify XAML, build incrementally |
| NavigationView doesn't select | SelectedItem set too early | Set after items are loaded, not in constructor |
