---
name: winui-layout-design
description: "Use when designing or reviewing WinUI 3 page layout, app silhouette, responsive breakpoints, adaptive XAML, title bar composition, content spacing, layout panels, initial window size, or fixing pages that feel cramped, over-carded, fixed-size, clipped, or waste space across small, medium, and large window widths."
---

# WinUI Layout Design

## Overview

Shape the app window before styling the controls. Use this skill to choose the page silhouette, responsive states, title bar layout, layout panels, and initial window size from Microsoft Learn layout guidance.

Keep this skill focused on layout. Use `winui-design` for control selection, theme resources, typography styles, brushes, data binding, and accessibility; use `winui-ui-testing` for runtime UI automation and screenshot validation; use `winui-code-review` for pre-commit quality review.

## When to Use

Use this skill when the task involves:

- Designing a new WinUI page shell, dashboard, settings surface, editor, media view, or multi-pane utility.
- Fixing a page that wastes space, clips content, overuses cards, or feels cramped at different window widths.
- Choosing between top navigation, left navigation, menu bar, or `TabView`.
- Defining small, medium, and large responsive states.
- Selecting layout panels or replacing fixed-size `Canvas`/whole-page `StackPanel` layouts.
- Integrating title bar content such as search, account UI, app icon, or document tabs.
- Deriving an initial window size from the actual layout.

Do not use this skill for isolated control selection, brush names, binding syntax, or post-build code review; use the sibling skills named in the overview.

## Layout Workflow

### 1. Pick the app silhouette

Choose one primary page shell before choosing individual controls:

| App shape | Use | Avoid |
|---|---|---|
| Top navigation | Media, gallery, or document-style apps that need vertical space | Deep section trees |
| Menu bar | Dense editor or utility surfaces where content is the main task | App-wide navigation with many destinations |
| Left navigation | Settings, dashboards, and multi-section tools | Single-purpose pages |
| TabView | Documents, terminals, code editors, or multi-session work | Static app sections that are not documents/sessions |

Do not mix two primary navigation systems unless the product model really has two independent axes, such as app sections plus document tabs.

### 2. Define responsive states

Design against the app window width in effective pixels, not the physical monitor or device class.

| State | Width | Layout decision |
|---|---:|---|
| Small | under 640 epx | Single-column content, collapsed navigation, minimum metadata |
| Medium | 641-1007 epx | Compact side-by-side regions only when the task benefits |
| Large | 1008 epx and wider | Show persistent navigation, detail panes, richer metadata, or extra columns |

For each state, specify what repositions, resizes, reflows, appears, disappears, or changes architecture. If the change is only cosmetic, do not add a breakpoint.

### 3. Choose layout panels intentionally

Use panels for their sizing behavior, not just because they are convenient:

| Panel | Use for | Watch for |
|---|---|---|
| `Grid` | Page skeletons, resizable rows/columns, master-detail layouts | Prefer `Auto`, `*`, `MinWidth`, and `MaxWidth` over fixed page sizes |
| `RelativePanel` | Repositioning related elements across visual states | Do not use it when a simple grid row/column is clearer |
| `StackPanel` | Small local stacks inside a section | Do not use one StackPanel as the whole page shell |
| `VariableSizedWrapGrid` | Wrapping tiles or variable grid items | Set item sizing deliberately |
| `Canvas` | Graphics, diagrams, or small static regions | Do not use it for ordinary app layout |

Use `VisualStateManager` and `AdaptiveTrigger` for major layout changes. Use `Visibility` or `x:Load` when a state hides expensive or secondary UI.

### 4. Set content rhythm

Make content fill the window with meaningful margins; do not center a lone card on an empty background unless the whole app is a narrow dialog-like utility. Keep spacing semantic:

- 8 epx: closely related controls or a button and flyout.
- 12 epx: control-to-label or compact content-region spacing.
- 16 epx: text inside a surface edge, or a control next to an expander action.
- 48 epx: nested expander content indentation.
- 56 epx: large media or highly cohesive content margins, not dense tools.

For dense developer tools, prefer compact margins and stable scanning. For media or gallery surfaces, allow larger margins when they strengthen the content.

### 5. Integrate the title bar

Use the platform title bar model unless there is a specific reason to customize it.

- Standard title bars are 32 px high.
- Use 48 px when the title bar contains global search or account/person UI.
- Keep empty and non-interactive title-bar regions draggable.
- Preserve system menu behavior on icon/right-click/press-and-hold regions.
- Keep caption buttons visible and separate from app commands.
- If tabs are the main app element, integrate `TabView` with title-bar space while preserving caption button placement.

### 6. Derive the initial window size

WinUI 3 does not size the main window to content automatically. Pick an initial size from the layout:

- Width: widest useful row plus horizontal page padding, rounded up.
- Height: title bar plus visible rows, spacing, and vertical page padding, rounded up.
- Small utilities can be narrow; multi-pane tools usually need a wider initial window; document/canvas apps should start wide enough to show the primary work area.
- If you call `AppWindow.Resize`, convert DIPs to physical pixels for the active monitor.

After implementing, verify at small, medium, and large widths. If UI validation is requested, use `winui-ui-testing`; if visual fit is suspect, capture screenshots before claiming the layout is complete.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Fixed `Width`/`Height` on a page root | Use `Grid`, `Auto`, `*`, and min/max constraints |
| One whole-page `StackPanel` | Use a page-level `Grid` and local stacks only inside sections |
| `Canvas` for form or dashboard layout | Use `Grid` or `RelativePanel` |
| Desktop-only design | Define small, medium, and large window states |
| Extra cards inside page sections | Let sections fill the page; reserve cards for repeated items or framed tools |
| Breakpoints by device name | Trigger on available window width |

## References

Read `references/microsoft-layout-guidelines.md` when you need the source-backed Microsoft Learn layout guidance, breakpoint definitions, title-bar rules, panel behavior, or examples of how to map the guidance into XAML layout decisions.
