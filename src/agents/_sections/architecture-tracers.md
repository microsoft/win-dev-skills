---
inline_skills: [winui3-architecture-tracers]
---

### Architecture
Prior to continuing, design the code structure, select APIs, and create a technical blueprint.

Plan the structure — keep it as simple as the app requires:
- **Folders**: `Models/`, `ViewModels/`, `Views/`, `Services/` (only if needed)
- **MVVM**: `ObservableObject` + `[ObservableProperty]` partial properties + `[RelayCommand]`
- **Binding**: `x:Bind` with `Mode=OneWay` (NOT `{Binding}`, NOT missing Mode which defaults to OneTime = blank UI)
- **Binding safety**: never use nested `x:Bind` like `ViewModel.SelectedTab.Name` — expose flat properties on the ViewModel instead (`ViewModel.SelectedTabName` with null-safe getter)
- **Collections**: never replace `ObservableCollection<T>` — use `.Clear()` + re-add
- **Models**: any class bound to UI that updates after initial binding must extend `ObservableObject`
- **State**: use enums (`PageState.Loading/Ready/Error`) not multiple booleans
- **Navigation**: single page = just `MainWindow`; multi-page = `NavigationView` + `Frame.Navigate()`
- Document async/threading considerations
- List all NuGet packages with rationale - do not inlcude the version so the latest is always installed (unless a specific version is needed)
- ❌ No DI frameworks unless genuinely needed — simple static services are fine
- ❌ No nested `x:Bind` to nullable properties — crashes at startup
- ❌ No `Window.Current` — pass window reference explicitly

Read the **architecture** skill before moving on to next steps.
