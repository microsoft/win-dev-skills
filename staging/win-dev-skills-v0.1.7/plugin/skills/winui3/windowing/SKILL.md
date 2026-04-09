---
name: windowing
description: 'AppWindow API, multi-window management, custom title bars, presenter types, DPI-aware sizing, and cross-window communication for WinUI 3 apps.'
---

## Quick Reference

- **Get `AppWindow`:** `WindowNative.GetWindowHandle()` → `Win32Interop.GetWindowIdFromWindow()` → `AppWindow.GetFromWindowId()`. Cache it.
- **`Resize()`/`Move()` use physical pixels** — scale by `GetDpiForWindow / 96.0`.
- **Prefer built-in `TitleBar` control** — handles drag regions, caption buttons, theming automatically.
- **Set `ContentDialog.XamlRoot`** to `targetWindow.Content.XamlRoot`, never global/static.
- **Never use `Window.Current`** — doesn't exist in WinUI 3. Pass explicit references.

---

## Rules

### AppWindow Retrieval
Cache per window — don't look up repeatedly in hot paths.

### Multi-Window Management
Track all windows in a singleton `WindowService` using `Dictionary<WindowId, Window>`. Clean up via `appWindow.Destroying`. Never store `Window` in static fields without cleanup.

### Presenter Types
`OverlappedPresenter.Create()` for configurable chrome. `FullScreen`, `CompactOverlay`, `Default` via `AppWindowPresenterKind`. Always provide user-accessible exit.

### DPI-Aware Sizing
Scale by `GetDpiForWindow(hwnd) / 96.0`. Use `DisplayArea.GetFromWindowId()` for safe multi-monitor positioning.

### Custom Title Bar
Prefer built-in `TitleBar` control — set `ExtendsContentIntoTitleBar = true` + `SetTitleBar(AppTitleBar)`. Manual fallback only for layout beyond `TitleBar` control.

### Window Events
`Closing` (cancel/prompt save), `Changed` (size/position/presenter), `Destroying` (cleanup).

### Modal Dialogs
Set `ContentDialog.XamlRoot = targetWindow.Content.XamlRoot`. Never global `XamlRoot`.

### Cross-Window Communication
Use events or a `WindowMessenger` singleton — never static mutable state.

---

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| `Window.Current` | Pass explicit `Window` refs or `WindowService` |
| Static `Window` without cleanup | Track in `WindowService` with `Destroying` |
| Ignoring DPI in `Resize()`/`Move()` | Scale by `GetDpiForWindow / 96.0` |
| Not unregistering handlers on close | Unregister in `Destroying` |
| Single `XamlRoot` for all dialogs | Use `targetWindow.Content.XamlRoot` |
| Assuming single monitor | Validate against `DisplayArea` bounds |

---

## Verification Checklist

- [ ] Windows create/resize/close without exceptions
- [ ] No memory leaks from unclosed window references
- [ ] `ContentDialog` targets correct window's `XamlRoot`
- [ ] Presenter switching works and is reversible
- [ ] DPI-aware sizing correct at 100%, 150%, 200% scale
- [ ] Cross-window messaging works without stale references

## References

- [Detailed windowing patterns and code examples](references/windowing-patterns.md)

## External Resources

- [AppWindow class](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.windowing.appwindow)
- [Windowing overview](https://learn.microsoft.com/windows/apps/windows-app-sdk/windowing/windowing-overview)
- [Title bar customization](https://learn.microsoft.com/windows/apps/develop/title-bar)
