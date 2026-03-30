
### Architecture
Plan the structure — keep it as simple as the app requires:
- **Folders**: `Models/`, `ViewModels/`, `Views/`, `Services/` (only if needed)
- **MVVM**: `ObservableObject` + `[ObservableProperty]` partial properties + `[RelayCommand]`
- **Binding**: `x:Bind` with `Mode=OneWay` (NOT `{Binding}`, NOT missing Mode which defaults to OneTime = blank UI)
- **Collections**: never replace `ObservableCollection<T>` — use `.Clear()` + re-add
- **Models**: any class bound to UI that updates after initial binding must extend `ObservableObject`
- **State**: use enums (`PageState.Loading/Ready/Error`) not multiple booleans
- **Navigation**: single page = just `MainWindow`; multi-page = `NavigationView` + `Frame.Navigate()`
- ❌ No DI frameworks unless genuinely needed — simple static services are fine
- ❌ No nested `x:Bind` to nullable properties — crashes at startup
- ❌ No `Window.Current` — pass window reference explicitly

Read the **architecture** skill before moving on to next steps.
