# Microsoft Layout Guidelines

This reference summarizes the Microsoft Learn layout pages for WinUI layout decisions. Use it when a task depends on page structure, responsive behavior, title-bar composition, spacing, or XAML panel choice.

## Source Pages

- [Layout overview](https://learn.microsoft.com/zh-cn/windows/apps/design/layout/)
- [App silhouette](https://learn.microsoft.com/zh-cn/windows/apps/design/basics/app-silhouette)
- [Title bar design](https://learn.microsoft.com/zh-cn/windows/apps/design/basics/titlebar-design)
- [Screen sizes and breakpoints](https://learn.microsoft.com/zh-cn/windows/apps/design/layout/screen-sizes-and-breakpoints-for-responsive-design)
- [Responsive design techniques](https://learn.microsoft.com/zh-cn/windows/apps/design/layout/responsive-design)
- [Responsive layouts with XAML](https://learn.microsoft.com/zh-cn/windows/apps/develop/ui/layouts-with-xaml)
- [Content layout and spacing](https://learn.microsoft.com/zh-cn/windows/apps/design/basics/content-basics)
- [Layout panels](https://learn.microsoft.com/zh-cn/windows/apps/develop/ui/layout-panels)

## App Silhouettes

Microsoft's silhouette guidance groups Windows app shells by the relationship between navigation, commands, and content:

| Silhouette | Typical controls | Use when |
|---|---|---|
| Top navigation | `NavigationView` at the top of the content layer | The app benefits from preserving vertical content space and has shallow sections |
| Menu bar | `MenuBar` plus command surface | The main task is content creation/editing and commands need dense discovery |
| Left navigation | `NavigationView` at the base layer | The app has multiple durable sections, such as settings or dashboards |
| TabView | `TabView` integrated with the base layer/title bar | The app manages documents, sessions, terminals, or editor tabs |

Pick one primary shell first. If the app needs both durable sections and documents, make their roles explicit before writing XAML.

## Responsive Widths

Design for app-window width in effective pixels:

| Class | Width | Design intent |
|---|---:|---|
| Small | under 640 epx | Collapse navigation, use one column, show only essential metadata |
| Medium | 641-1007 epx | Add detail regions only when they reduce navigation or improve comprehension |
| Large | 1008 epx and wider | Use persistent navigation, multi-column lists, master-detail, or richer metadata |

Do not infer layout from device type. Windows exposes the app's usable window size; let breakpoints follow that available width.

## Responsive Techniques

Use a responsive design when one layout can fluidly adapt. Use an adaptive layout when the UI must switch to a substantially different arrangement at a breakpoint.

| Technique | What changes | Example use |
|---|---|---|
| Reposition | Element placement | Move a details pane from below a list to the side |
| Resize | Margins or element size | Increase reading width or content frame size on large windows |
| Reflow | Arrangement | Change one column to two columns |
| Show/hide | Secondary UI | Hide low-value metadata on small widths |
| Re-architect | Page structure | Expand from list-only to list-detail when there is enough width |
| Adaptive layout | Whole layout | Swap compact navigation for tabs or a richer shell |

Add a breakpoint only when it changes task success, navigation cost, or visible information density.

## XAML Implementation Rules

- Prefer dynamic layout: `Auto`, `*`, `MinWidth`, `MaxWidth`, `MinHeight`, and `MaxHeight`.
- Use fixed sizes only for intentionally fixed elements, such as icons, compact command buttons, or graphic regions.
- Use `ActualWidth` and `ActualHeight` for runtime measurements; `Width` and `Height` may be unset or represent requested sizes.
- Use `Visibility="Collapsed"` to remove hidden UI from layout.
- Use `x:Load` when hidden secondary UI is expensive and should not be created at startup.
- Use `VisualStateManager` with `AdaptiveTrigger` for XAML-only breakpoint changes, or `VisualStateManager.GoToState` from code when the condition is not expressible in XAML.
- Keep visual states named by layout intent, such as `NarrowState`, `MediumState`, and `WideState`.

## Panel Choice

| Panel | Strength | Constraint |
|---|---|---|
| `Grid` | Resizable rows/columns, page skeletons, constrained content | Best default for page structure |
| `RelativePanel` | Relationships between siblings and panel edges | Useful with visual states; harder to read when a grid would do |
| `StackPanel` | Simple local vertical or horizontal stacks | In its stacking direction, content can extend beyond bounds unless constrained |
| `VariableSizedWrapGrid` | Wrapping tile layouts | Size items deliberately |
| `Canvas` | Absolute placement for graphics or small static regions | Does not provide ordinary fluid layout behavior |

Use built-in panel border properties where available instead of wrapping every panel in an extra `Border`.

## Content Spacing

Use spacing to express relationships:

| Value | Relationship |
|---:|---|
| 8 epx | Button-to-button, button-to-flyout, control-to-header |
| 12 epx | Control-to-label or adjacent content regions |
| 16 epx | Text inside a surface edge, expander action spacing |
| 48 epx | Nested expander content indentation |
| 56 epx | Large media or highly cohesive content margins |

Use compact margins for dense tools. Use larger margins when they support media, galleries, or cohesive grouped content.

## Title Bar Layout

- Standard height is 32 px.
- Use 48 px when global search or account/person UI is present.
- Place the 16 px app icon near the leading edge and center it vertically.
- Keep window title text responsive to text scaling and allow truncation before caption buttons are clipped.
- Empty space and non-interactive title-bar elements should remain draggable.
- Right-click or press-and-hold on non-interactive title-bar regions should show the system window menu.
- Preserve minimize, maximize/restore, and close buttons as fully visible caption controls.
- When tabs are the main app element, integrate tabs into the title-bar area while keeping caption buttons on the trailing side.

## Review Checklist

- The page has one primary shell and one primary navigation model.
- The layout defines small, medium, and large window behavior.
- At least one breakpoint materially improves task completion or reduces navigation.
- The page root is not fixed-size.
- Whole-page layout uses `Grid` or another fluid panel, not a single `StackPanel` or `Canvas`.
- Secondary or expensive hidden UI uses `Visibility` and, when needed, `x:Load`.
- Title bar height and drag regions match the controls placed there.
- Content spacing communicates grouping instead of filling the page with decorative cards.
