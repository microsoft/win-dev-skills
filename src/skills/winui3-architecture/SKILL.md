---
name: winui3-architecture
description: "WinUI 3 app architecture — MVVM deep patterns with CommunityToolkit.Mvvm, project structure, DI with Microsoft.Extensions.DependencyInjection, navigation, data binding, persistence (LocalSettings/JSON/SQLite), windowing (AppWindow/multi-window/DPI), async patterns. Use when structuring a complex multi-page app, setting up dependency injection, or solving navigation and windowing problems."
---

### Project Structure

```
Models/       → Data classes (ObservableObject if UI-bound)
ViewModels/   → One per page (ObservableObject + RelayCommand)
Views/        → XAML pages and windows
Services/     → Business logic behind interfaces
Converters/   → IValueConverter implementations (prefer x:Bind functions)
```

### MVVM Deep Patterns

#### WeakReferenceMessenger
Decouple ViewModels without direct references:
```csharp
// Send from any ViewModel
WeakReferenceMessenger.Default.Send(new ItemSelectedMessage(item));

// Receive in another ViewModel (register in constructor)
WeakReferenceMessenger.Default.Register<ItemSelectedMessage>(this, (r, m) =>
{
    ((MyViewModel)r).SelectedItem = m.Value;
});
```
Always unregister on cleanup: `WeakReferenceMessenger.Default.UnregisterAll(this);`

#### ObservableValidator for Forms
```csharp
public partial class SettingsViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required(ErrorMessage = "Name is required")]
    [MinLength(3)]
    public partial string UserName { get; set; }

    [RelayCommand]
    private void Save()
    {
        ValidateAllProperties();
        if (HasErrors) return;
        // persist
    }
}
```

#### State Modeling
Use enums for page state — not multiple booleans:
```csharp
public enum PageState { Loading, Ready, Error, Empty }

[ObservableProperty] public partial PageState State { get; set; }
```
Bind visibility with `x:Bind` functions that return `Visibility` (not `bool` — the XAML compiler generates broken code for `bool` → `Visibility` auto-cast):

```csharp
public Visibility IsReady(PageState state) => state == PageState.Ready
    ? Visibility.Visible : Visibility.Collapsed;
```
```xml
Visibility="{x:Bind ViewModel.IsReady(ViewModel.State), Mode=OneWay}"
```

### Dependency Injection

For complex apps, use `Microsoft.Extensions.DependencyInjection`:
```csharp
// In App.xaml.cs
public IServiceProvider Services { get; }

public App()
{
    Services = new ServiceCollection()
        .AddSingleton<ISettingsService, SettingsService>()
        .AddTransient<MainViewModel>()
        .BuildServiceProvider();
}
```
Access: `((App)Application.Current).Services.GetRequiredService<MainViewModel>()`. For simple apps, skip DI — use static/singleton services directly.

### Navigation

- **Single page:** Host content in `MainPage` within a `Frame` in `MainWindow`
- **Multi-page:** `NavigationView` + `Frame.Navigate(typeof(PageType), parameter)`
- Pass data via navigation parameters, not global state
- Receive parameters in `OnNavigatedTo(NavigationEventArgs e)` — cast `e.Parameter`
- Set `NavigationView.SelectedItem` after items load, not in constructor

### Data Binding Deep Patterns

- **Function bindings:** `Text="{x:Bind local:Converters.FormatDate(ViewModel.Date), Mode=OneWay}"` — static methods, no IValueConverter needed
- **CollectionViewSource:** Group and sort without modifying the source collection
- Always set `x:DataType` on `DataTemplate` — required for compiled `x:Bind`
- Never replace `ObservableCollection<T>` — use `.Clear()` + re-add

### Persistence

| Approach | Limit | Use For |
|----------|-------|---------|
| `ApplicationData.Current.LocalSettings` | 8KB per value | Simple key-value preferences |
| JSON + `System.Text.Json` source-gen | File size | Structured config, user data |
| SQLite (`Microsoft.Data.Sqlite`) | Unlimited | Large datasets, queries |
| EF Core + SQLite | Unlimited | Complex relational data |

For JSON, use `[JsonSerializable]` source generators for AOT compatibility and performance.

### Windowing

- **`Window` is NOT a UIElement** — no `DataContext`, no `Resources`, no `KeyboardAccelerators` on Window
- Set DataContext on `(FrameworkElement)window.Content`, put resources in `App.xaml` or `Page.Resources`
- **AppWindow API:** `AppWindow.GetFromWindowId()` for title, size, position. Use `AppWindow.Resize()` for explicit sizing
- **Multi-window:** Each window needs its own `DispatcherQueue`. Create via `new Window()`
- **DPI:** Use `XamlRoot.RasterizationScale` for DPI-aware calculations
- **ContentDialog:** Always set `dialog.XamlRoot = element.XamlRoot` before `ShowAsync()`. Only one per XamlRoot at a time
- **File pickers:** Require HWND — `InitializeWithWindow(WindowNative.GetWindowHandle(window))`

### Async Patterns

- `async void` **only** for event handlers — use `async Task` for everything else
- XAML objects have thread affinity — never create `SolidColorBrush`, `BitmapImage` on background threads
- `DispatcherQueue.GetForCurrentThread()` — no `Application.Current.Dispatcher` in WinUI 3
- Marshal UI updates: `dispatcherQueue.TryEnqueue(() => { Status = "Done"; });`
- ❌ `.Result` / `.GetAwaiter().GetResult()` — deadlocks the UI thread

### References

| File | Read when... |
|------|-------------|
| `references/binding-patterns.md` | Implementing complex data binding, function bindings, CollectionViewSource grouping, incremental loading |
| `references/persistence-patterns.md` | Adding settings storage (LocalSettings, JSON), SQLite, EF Core, or app lifecycle state save/restore |
| `references/windowing-patterns.md` | Working with AppWindow API, multiple windows, presenter types, DPI-aware sizing, custom title bars |