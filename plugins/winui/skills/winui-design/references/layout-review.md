# WinUI layout, typography, and responsive review reference

Load this for page design, responsive behavior, spacing, and text hierarchy.

## Page planning template

Before XAML, write these bullets in your own notes or review:
- Primary user task:
- Secondary tasks:
- Content type/density:
- Navigation structure: flat / hierarchical / hybrid:
- App silhouette: left nav / top nav / tabs / menu+command / list-detail / single-task:
- Breakpoint behavior: small `<640`, medium `641-1007`, large `>=1008` epx:
- Input modes: keyboard, mouse, touch, pen:
- Accessibility risks:

## Responsive techniques

Prefer the least disruptive technique that preserves the task:

| Technique | Use when | Example |
|---|---|---|
| Reposition | Same content fits better elsewhere | Move side details below main content on narrow width. |
| Resize | Same content needs different space | Wider reading column or larger media preview. |
| Reflow | Content sequence can wrap/change columns | One column becomes two columns at large width. |
| Show/hide | Secondary metadata is optional at small widths | Hide avatar/details, keep route to full info. |
| Re-architect | Width changes the usable task model | Single-pane list/detail becomes side-by-side master-detail. |

Breakpoints are app-window effective pixels, not physical screen pixels:
- Small: `<640` epx.
- Medium: `641-1007` epx.
- Large: `>=1008` epx.

## Spacing and density

- Use multiples of 4 epx for layout sizes, margins, and positions.
- Dense utility/editor surfaces can use tighter margins such as 12 epx when task efficiency matters.
- Content/media surfaces can use larger margins such as 56 epx when cohesion and focus matter.
- Keep related controls visually grouped; separate unrelated groups with spacing, headers, or containers.
- Do not fake grouping using color-only backgrounds that fail in themes.

## Typography

Use XAML type ramp resources rather than ad-hoc font sizes:

| Purpose | Style |
|---|---|
| Caption/supplemental | `CaptionTextBlockStyle` |
| Body | `BodyTextBlockStyle` |
| Body emphasis | `BodyStrongTextBlockStyle` |
| Larger body | `BodyLargeTextBlockStyle` |
| Larger body emphasis | `BodyLargeStrongTextBlockStyle` |
| Section/subtitle | `SubtitleTextBlockStyle` |
| Page title | `TitleTextBlockStyle` |
| Large page/hero title | `TitleLargeTextBlockStyle` |
| Display/marketing hero | `DisplayTextBlockStyle` |

Rules:
- Segoe UI Variable is the default system font; avoid forcing custom fonts.
- Use Semibold for emphasis; avoid Bold/Italic as routine UI hierarchy.
- Sentence case for UI text.
- Left-align most text. Center only for short, exceptional compositions such as text below icons.
- Keep body lines around 50-60 characters where possible.
- Plan truncation: wrapping, ellipsis, clipping, tooltip/detail route, or column resize.

## Navigation review

- Can users identify where they are?
- Is the way back/out obvious?
- Are peer pages at the same level, not mixed with children from another subtree?
- Does a hierarchy deeper than two levels provide breadcrumbs or equivalent context?
- Are top-level navigation labels clear without relying on icons?
- Is content reachable without pogo-sticking?

## Empty/loading/error states

Every data-driven page should specify:
- Loading: progress and status text.
- Empty: what happened and what action the user can take.
- Error: cause if known, retry/repair action, non-color-only indication.
- Offline/permission states if applicable.
- Selection states for lists/grids, including keyboard behavior.

## XAML binding design checks

- `x:Bind` mode is explicit when the value changes (`OneWay`/`TwoWay`); remember default is `OneTime`.
- View model exposes mutable state with property change notifications.
- Collections that change after load are observable.
- Visual states derive from view state, not scattered event handlers.
- Converters are simple presentation adapters, not business logic.
