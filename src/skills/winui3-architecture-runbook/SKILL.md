---
name: winui3-architecture-runbook
description: 'EXECUTE this skill when designing WinUI 3 app architecture. Step-by-step runbook for project structure, MVVM setup, data binding, and navigation. Do NOT skip steps.'
---

# WinUI 3 Architecture Runbook

When you need to design app architecture, you MUST execute these steps IN ORDER before writing code.

## STOP — Execute Step 1: Create the Folder Structure

Create these folders in the project:
```
Models/       → Data classes (ObservableObject if UI-bound)
ViewModels/   → One per page (ObservableObject + RelayCommand)
Views/        → XAML pages and windows
Services/     → Business logic (simple static or singleton classes)
Converters/   → IValueConverter implementations
```

Do NOT add folders you don't need. Apply YAGNI — only create what's needed right now.

## STOP — Execute Step 2: Set Up MVVM with CommunityToolkit.Mvvm

For EVERY ViewModel you create, follow this exact pattern:

```csharp
public partial class [Name]ViewModel : ObservableObject
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

**Checklist for every ViewModel:**
- [ ] Extends `ObservableObject`
- [ ] Uses `[ObservableProperty]` with partial PROPERTIES (NOT fields)
- [ ] Uses `[RelayCommand]` for commands (NOT manual ICommand)
- [ ] All async commands return `Task` (NOT `async void`)
- [ ] Does NOT reference any UI types (no `Page`, `Frame`, `Window`, `ContentDialog`)
- [ ] State modeled with enums (`PageState.Loading/Ready/Error`) NOT scattered booleans

**Anti-patterns to REJECT immediately:**
- ❌ Field-backed `[ObservableProperty]` — use partial properties
- ❌ `async void` in commands (swallows exceptions)
- ❌ DI containers for simple apps — KISS
- ❌ ViewModel referencing another ViewModel directly

## STOP — Execute Step 3: Configure Data Binding

For EVERY binding in XAML, apply these rules:

1. **ALWAYS use `x:Bind`** — NEVER `{Binding}`
2. **ALWAYS set `Mode=OneWay` or `Mode=TwoWay`** explicitly — `x:Bind` defaults to `OneTime` which means blank UI if you forget
3. **ALWAYS set `x:DataType`** on every `DataTemplate`
4. **Models that update after binding MUST extend `ObservableObject`**
5. **NEVER replace an `ObservableCollection<T>`** — use `.Clear()` + re-add
6. **NEVER use nested x:Bind to nullable properties** (e.g., `ViewModel.SelectedItem.Title`) — crashes if null. Use `FallbackValue` or bind through a guaranteed non-null property.

## STOP — Execute Step 4: Plan Navigation

Choose the navigation pattern:

**Single page app:**
- MainWindow hosts a Frame containing MainPage
- All content in MainPage (retains UIElement features)

**Multi-page app:**
- `NavigationView` + `Frame` — call `Frame.Navigate(typeof(Page))`
- Pass data via navigation parameters, NOT global state
- Each page has its own ViewModel

## STOP — Execute Step 5: Handle Windows & Dialogs Correctly

These are the most common crash sources. MEMORIZE these rules:

1. **Window is NOT a UIElement:**
   - ❌ `Window.DataContext` — set on `(FrameworkElement)window.Content`
   - ❌ `Window.Resources` — use `App.xaml` or `Page.Resources`
   - ❌ `Window.KeyboardAccelerators` — attach to `NavigationView` or `Page`
   - Get XamlRoot from `Content.XamlRoot`, not Window

2. **ContentDialog:**
   - ALWAYS set `dialog.XamlRoot = element.XamlRoot` — crashes without it
   - Only ONE ContentDialog per XamlRoot at a time

3. **File pickers:**
   - MUST call `InitializeWithWindow(hwnd)` before `PickSingleFileAsync()`

4. **NEVER use `Window.Current`** — pass window reference explicitly

## STOP — Execute Step 6: Apply Async Rules

1. `async void` ONLY for event handlers — `async Task` for everything else
2. XAML objects have thread affinity — NEVER create `SolidColorBrush`, `BitmapImage`, etc. on background thread
3. Use `DispatcherQueue.GetForCurrentThread()` — there is NO `Application.Current.Dispatcher` in WinUI 3

## Execute Step 7: Select NuGet Packages

Only add packages you actually need:

| Package | When to Use |
|---------|-------------|
| `CommunityToolkit.Mvvm` | ALWAYS |
| `CommunityToolkit.WinUI.Controls.SettingsControls` | If app has settings page |
| `CommunityToolkit.WinUI.Converters` | If you need common converters |
| `Microsoft.Xaml.Behaviors.WinUI.Managed` | If binding events to commands |
| `WinUIEx` | If you need tray icon or extended window features |

**Output your architecture decisions** before writing code:
1. Folder structure
2. List of ViewModels and their responsibilities
3. Navigation pattern
4. NuGet packages with rationale
5. Any services needed

## Quick Troubleshooting Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank UI | `x:Bind` defaults to OneTime | Add `Mode=OneWay` |
| UI doesn't update | Model not ObservableObject | Extend ObservableObject |
| Crash on startup | Nested x:Bind to null | Use FallbackValue |
| Crash on startup | XamlRoot not set | Set `dialog.XamlRoot` |
| File picker crash | Missing HWND init | Call `InitializeWithWindow` |
| CS0104 ambiguous | FileAttributes conflict | Fully qualify namespace |
