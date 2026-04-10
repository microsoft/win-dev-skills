---
skills: [winui3-architecture-tracers]
---

### Architecture
Prior to continuing, design the code structure, select APIs, and create a technical blueprint.

Read the **architecture** skill before moving on for the full MVVM patterns, binding rules, and MANDATORY markers.

Plan the structure — keep it as simple as the app requires:
- **Folders**: `Models/`, `ViewModels/`, `Views/`, `Services/` (only if needed)
- **MVVM**: `ObservableObject` + `[ObservableProperty]` partial properties + `[RelayCommand]`
- **Binding**: `x:Bind` with `Mode=OneWay` (NOT `{Binding}`)
