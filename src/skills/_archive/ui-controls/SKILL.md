---
name: ui-controls
description: 'Custom controls, context menus, drag-and-drop, and clipboard for WinUI 3 — UserControl vs TemplatedControl, DependencyProperty, MenuFlyout, CommandBarFlyout, KeyboardAccelerator, drag sources/drop targets, and DataPackage clipboard operations. Use when creating custom controls, adding right-click menus, implementing drag-and-drop, or working with the clipboard.'
---

## Quick Reference
- **UserControl** for composite views; **TemplatedControl** (derive from `Control`) for reusable/styleable controls
- Always set `AllowDrop="True"` on drop targets AND set `e.AcceptedOperation` in `DragOver`
- Use `ContextFlyout` property (not `ShowAt()`) — it handles right-click, long-press, and Shift+F10 automatically
- Always check `DataView.Contains()` before calling `Get*Async()` on clipboard or drop data
- `Clipboard.Flush()` after `SetContent()` when data must persist after app exit

---

# UI Controls, Menus, Drag-Drop & Clipboard

## Key Rules

### Custom Controls
- **UserControl** for composite views; **TemplatedControl** for reusable/styleable; **ContentControl** for wrappers
- Every bindable property must be a `DependencyProperty` — incorrect owner type = **silent failure**
- TemplatedControls: `DefaultStyleKey` + `Themes/Generic.xaml` + null-check parts in `OnApplyTemplate`
- Use `{ThemeResource}` for all colors; set `AutomationProperties.Name` for accessibility

### Context Menus & Keyboard
- **MenuFlyout** for simple menus; **CommandBarFlyout** for rich menus with icon buttons
- Attach via `ContextFlyout` — handles right-click, long-press, Shift+F10 automatically
- Always add `KeyboardAccelerator` for standard actions; `AccessKey` for Alt navigation

### Drag-Drop & Clipboard
- Drop: `AllowDrop="True"` + set `AcceptedOperation` in `DragOver` + process in `Drop`
- Drag: `CanDrag="True"` + populate `DataPackage` in `DragStarting`
- Clipboard: always `Contains()` before `Get*Async()`; `Flush()` to persist after exit
- Wrap `SetContent` in try/catch for `CLIPBRD_E_CANT_OPEN`

### Anti-patterns

| Don't | Do |
|---|---|
| `UserControl` for redistributable controls | `TemplatedControl` with `Generic.xaml` |
| Hardcode colors | `{ThemeResource}` brushes |
| Missing `AcceptedOperation` in `DragOver` | Always set — drops rejected without it |
| `Get*Async()` without `Contains()` check | Check format before every retrieval |

## Reference Docs

| File | Contents |
|------|----------|
| [references/control-patterns.md](references/control-patterns.md) | DependencyProperty boilerplate, TemplatedControl Generic.xaml setup, MenuFlyout/CommandBarFlyout XAML, KeyboardAccelerator, drag source/drop target code, DataPackage clipboard operations |

## Related Skills

| Topic | Skill |
|-------|-------|
| MVVM & DI architecture | `architecture` |
| Data binding patterns | `data-layer` |
| Fluent Design styling | `visual-design` |

## External Resources
- [WinUI 3 Gallery](https://github.com/microsoft/WinUI-Gallery) · [Custom controls](https://learn.microsoft.com/windows/apps/design/controls/custom-controls-overview)
- [Drag and drop](https://learn.microsoft.com/windows/apps/design/input/drag-and-drop) · [Clipboard](https://learn.microsoft.com/windows/apps/design/input/clipboard) · [Keyboard accelerators](https://learn.microsoft.com/windows/apps/design/input/keyboard-accelerators)
