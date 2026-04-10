---
name: data-layer
description: 'Data binding and persistence for WinUI 3 — x:Bind, ObservableCollection, converters, DataTemplates, LocalSettings, JSON file storage, SQLite, EF Core, and app lifecycle state. Use when implementing data binding, saving settings, persisting data, using databases, or managing app state.'
---

## Quick Reference
- `x:Bind` defaults to **OneTime** — always set `Mode=OneWay` or `Mode=TwoWay` explicitly for live updates
- Never replace an `ObservableCollection<T>` instance — call `.Clear()` and re-add items
- Specify `x:DataType` on every `DataTemplate` for compiled, type-safe bindings
- Packaged apps: `ApplicationData.Current.LocalSettings` (8 KB limit per value); Unpackaged: JSON file in `LocalApplicationData`
- Always use `async/await` for file I/O — never block the UI thread

---

# Data Binding & Persistence

## Key Rules

### Data Binding
- Always `x:Bind` (compiled, type-safe) — reserve `{Binding}` for `Style` setters only
- Set `Mode=` explicitly — defaults to `OneTime`; use `OneWay`/`TwoWay` for live updates
- `x:Bind` auto-converts `bool` ↔ `Visibility`; use function bindings for simple conversions
- Never replace `ObservableCollection<T>` instance — `.Clear()` + re-add
- Always specify `x:DataType` on `DataTemplate`; use `ISupportIncrementalLoading` for large lists

### Persistence
- **Packaged:** `ApplicationData.Current.LocalSettings` (8 KB limit); `RoamingSettings` deprecated
- **Unpackaged:** `ApplicationData` throws — use `System.Text.Json` + source generators + file in `LocalApplicationData`
- **SQLite:** `Microsoft.Data.Sqlite` + `SemaphoreSlim` for thread safety; always dispose
- **EF Core:** `AddDbContext<T>` via DI; prefer `IDbContextFactory`; always dispose `DbContext`
- **Lifecycle:** `EnteredBackground`/`LeavingBackground` + `e.GetDeferral()` for async save

### Anti-patterns

| Don't | Do |
|---|---|
| `{Binding}` when `x:Bind` works | `x:Bind` with explicit `Mode` |
| Replace `ObservableCollection` instance | `.Clear()` + re-add items |
| Store >8 KB in `LocalSettings` | Use file storage |
| `ApplicationData` in unpackaged apps | `LocalApplicationData` path |
| Sync file I/O on UI thread | `async/await` for all I/O |
| Forget to dispose `DbContext` | `using` or `IDbContextFactory` |

## Reference Docs

| File | Contents |
|------|----------|
| [references/binding-patterns.md](references/binding-patterns.md) | x:Bind examples, converter patterns, DataTemplate examples, collection views, incremental loading |
| [references/persistence-patterns.md](references/persistence-patterns.md) | ApplicationData settings, JSON with source generators, SQLite/EF Core setup, suspend/resume state |

## Related Skills

| Topic | Skill |
|-------|-------|
| MVVM & DI architecture | `architecture` |
| Custom controls & menus | `ui-controls` |
| Fluent Design styling | `visual-design` |

## External Resources
- [Data binding](https://learn.microsoft.com/windows/apps/develop/data-binding/) · [x:Bind](https://learn.microsoft.com/windows/uwp/xaml-platform/x-bind-markup-extension)
- [LocalSettings](https://learn.microsoft.com/windows/apps/design/app-settings/store-and-retrieve-app-data) · [SQLite](https://learn.microsoft.com/windows/apps/develop/data-access/sqlite-data-access) · [EF Core](https://learn.microsoft.com/ef/core/get-started/overview/first-app)
