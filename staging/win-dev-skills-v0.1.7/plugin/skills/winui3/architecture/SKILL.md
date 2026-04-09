---
name: architecture
description: 'WinUI 3 architecture, MVVM with CommunityToolkit.Mvvm, dependency injection, project structure, and SOLID/DRY/KISS/YAGNI design principles. Use when building app structure, creating ViewModels, wiring DI, refactoring, or designing new components.'
---

## Quick Reference
- Use `[ObservableProperty]` + `[RelayCommand]` source generators — never write manual INPC boilerplate
- Folder structure: `Models/` `ViewModels/` `Views/` `Services/` `Converters/` `Helpers/` `Controls/`
- Register all services/ViewModels in `Microsoft.Extensions.DependencyInjection` — avoid `Ioc.Default`
- ViewModels must never touch UI types — abstract dialogs/navigation behind interfaces
- Apply YAGNI: only implement what is explicitly needed right now

---

# Architecture & Design Principles

## Key Rules

### Project Structure & DI
- Folders: `Models/` `ViewModels/` `Views/` `Services/` `Converters/` `Helpers/` `Controls/`
- Separate Models/ViewModels into own class library to prevent UI type leakage
- Wire DI in `App.xaml.cs` via `ServiceCollection`; use constructor injection everywhere

### CommunityToolkit.Mvvm
- Use `[ObservableProperty]`, `[RelayCommand]`, `[NotifyCanExecuteChangedFor]` source generators
- `[RelayCommand(IncludeCancelCommand = true)]` for cancellable async; `ObservableValidator` for forms

### Messenger & State
- `WeakReferenceMessenger` + `ObservableRecipient` + `IRecipient<T>` — call `OnDeactivated()` for cleanup
- Model page states with enums (`PageState { Loading, Loaded, Error, Empty }`) — not scattered booleans

### Services & Principles
- Abstract `ContentDialog`/`Frame.Navigate` behind `IDialogService`/`INavigationService`
- **DRY** — extract shared logic · **KISS** — simplest approach · **SRP** — one reason to change
- **OCP** — extend, don't modify · **ISP** — small interfaces · **DIP** — depend on abstractions · **YAGNI** — no speculative code

### Anti-patterns

| Don't | Do |
|---|---|
| Direct ViewModel-to-ViewModel refs | `WeakReferenceMessenger` or shared services |
| ViewModel touching View types | `IDialogService` / `INavigationService` |
| Scattered boolean flags | Single `PageState` enum |
| Sync I/O in commands | `async Task` with `[RelayCommand]` |
| `Ioc.Default` | `Microsoft.Extensions.DependencyInjection` |

## Reference Docs

| File | Contents |
|------|----------|
| [references/mvvm-patterns.md](references/mvvm-patterns.md) | Source generator examples, Messenger pattern, behaviors, composite ViewModels, state management, validation, DI registration code |

## Related Skills

| Topic | Skill |
|-------|-------|
| Data binding & x:Bind | `data-layer` |
| Fluent Design & composition | `visual-design` |
| Custom controls & menus | `ui-controls` |

## External Resources
- [CommunityToolkit.Mvvm docs](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/) — source generators, messenger, validation
- [.NET Design Guidelines](https://learn.microsoft.com/dotnet/standard/design-guidelines/) — naming, type design, API conventions
- [WinUI 3 Overview](https://learn.microsoft.com/windows/apps/winui/winui3/) — platform fundamentals
