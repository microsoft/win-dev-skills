# WinUI layout and responsive review reference

Load this when reviewing responsive behaviour, breakpoints, or state coverage on a data-driven page. SKILL.md already covers theming, control choice, and XAML landmines — don't duplicate.

## Page planning template

Fill these in before writing XAML or reviewing a page:

- Primary user task:
- Secondary tasks:
- Content type / density:
- Navigation structure: flat / hierarchical / hybrid:
- App silhouette: left nav / top nav / tabs / menu+command / list-detail / single-task:
- Breakpoint behaviour at small (`<640`), medium (`641–1007`), large (`≥1008`) epx:
- Input modes covered: keyboard, mouse, touch, pen:

## Responsive techniques (least to most disruptive)

Pick the lightest change that preserves the task:

| Technique | Use when | Example |
|---|---|---|
| **Reposition** | Same content fits better elsewhere | Side details move below main on narrow widths |
| **Resize** | Same content needs different space | Wider reading column at large widths |
| **Reflow** | Sequence can wrap or change columns | One column becomes two at `≥1008` epx |
| **Show/hide** | Secondary metadata is optional at small widths | Hide avatar/details, keep a route to full info |
| **Re-architect** | Width changes the task model | Single-pane list-detail becomes side-by-side |

Breakpoints are **app-window effective pixels**, not physical screen pixels. The window can be `<640` epx on a 4K monitor.

## State coverage for any data-driven page

Every collection, fetch, or async-bound surface should explicitly handle:

- **Loading** — progress text or skeleton; not just a spinner with no context
- **Empty** — what happened and what the user can do (call-to-action, not just "no items")
- **Error** — cause if known + a retry/repair affordance; never colour-only
- **Offline / permission denied** — separate from generic error if the recovery path differs
- **Selection** — including keyboard arrow-key behaviour and multi-select where relevant

If any of these aren't represented in the view model, the page isn't done.

## Sidebar / content sizing rules of thumb

- Sidebar: fixed `280–360` px (`NavigationView.OpenPaneLength`); content: `Width="*"` with `24–36` px padding.
- Content max-width for readable text or settings cards: `~1064` px (matches Windows Settings).
- Spacing between stacked cards: `4–8` px; between section groups: `24–32` px.
- All measurements are multiples of 4 epx; tighter (12 epx) only for dense editor surfaces, looser (56 epx) only for media/marketing.
