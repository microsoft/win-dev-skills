# WinUI control selection reference

Load this when the UI task is mostly "which control/pattern should I use?" or when reviewing an existing choice.

## First action

Run `winui-search.exe search "<scenario>"` before writing sample XAML. Use `get <id>` for the nearest Gallery/Toolkit example. This reference gives selection rules; the tool gives runnable code.

## Navigation and structure

| Scenario | Use | Notes |
|---|---|---|
| Multi-page app with stable sections | `NavigationView` + `Frame` | Left nav for broad app sections; top nav when options are few and content needs horizontal space. |
| User can open/close/reorder documents or workspaces | `TabView` | Think browser/editor tabs, not app-section navigation. |
| Deep hierarchy/location | `BreadcrumbBar` | Especially if users need to escape >2 levels. |
| Hierarchical data | `TreeView` | Avoid for flat page navigation unless hierarchy is the real task. |
| Master-detail content | List/details pattern | Collapse to single-pane navigation on narrow widths. |
| Dense editor/utility commands | `MenuBar` + `CommandBar` | Suitable for document/editing apps. |

Navigation heuristics:
- Flat/lateral structure fits pages viewable in any order and fewer than about 8 clear peers.
- Hierarchical structure fits ordered tasks, parent/child relationships, or many pages.
- Avoid deep navigation and pogo-sticking; if users compare siblings often, keep related content adjacent.

## Input controls

| User need | Prefer | Why / cautions |
|---|---|---|
| Immediate action | `Button` | Use clear verb text. Primary action should be visually obvious. |
| Action with menu variants | `DropDownButton` / `SplitButton` | Use split only when default action is safe and common. |
| Binary setting | `ToggleSwitch` | Best for persistent on/off settings. |
| Independent selection | `CheckBox` | Good for multiple independent options. |
| Mutually exclusive small set | `RadioButtons` | Keeps all options visible. |
| Mutually exclusive larger/compact set | `ComboBox` | Do not hide critical choices if comparison matters. |
| Continuous value | `Slider` | Provide numeric value if precision matters. |
| Text entry | `TextBox`, `NumberBox`, `PasswordBox`, `RichEditBox` | Always provide visible label and validation. |
| Date/time | `CalendarDatePicker`, `DatePicker`, `TimePicker` | Prefer specialized pickers to freeform text. |

## Collections

| Scenario | Prefer | Avoid |
|---|---|---|
| Standard selectable vertical list | `ListView` | Custom ItemsRepeater with missing selection/focus. |
| Visual grid of items | `GridView` / `ItemsView` | Hand-laid WrapPanel-like grids. |
| Primitive virtualized custom layout | `ItemsRepeater` | Use only when you accept more responsibility for interaction/accessibility. |
| Paginated position indicator | `PipsPager` | Page-number UI when exact numbers are irrelevant. |
| Swipe actions on touch list items | `SwipeControl` | Hidden destructive actions with no non-touch route. |
| Pull refresh | `RefreshContainer` / pull-to-refresh pattern | Refresh gesture without visible command fallback. |

Review collection states: empty, loading, error, selection, multiselect, keyboard navigation, virtualization, item accessible names.

## Dialogs, flyouts, and teaching

| Need | Use | Caution |
|---|---|---|
| User must decide before continuing | `ContentDialog` | Keep rare and focused. |
| Contextual lightweight choices | `Flyout` / `MenuFlyout` | Should be dismissible and keyboard reachable. |
| Teach a feature or call out new UI | `TeachingTip` | Do not block routine workflows. |
| Context commands near selection | `CommandBarFlyout`, context menu | Include keyboard/menu alternatives. |

## Commands

- Put primary commands where the task happens; do not scatter icon-only buttons.
- Use `CommandBar` when commands need overflow behavior.
- Destructive commands need confirmation or undo depending on severity.
- Icons need text labels, tooltips, or accessible names; ambiguous icons need visible text.

## When to choose custom UI

Only after all are true:
1. No platform control or Gallery/Toolkit pattern matches the task.
2. You can implement keyboard, focus, UI Automation, theme resources, High Contrast, and responsive behavior.
3. You have explicit visual/interaction specs for states: default, hover, pressed, disabled, selected, focused, error.
4. You tested with keyboard and contrast themes.
