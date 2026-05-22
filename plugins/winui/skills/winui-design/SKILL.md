---
name: winui-design
description: "Use when designing, reviewing, or fixing WinUI 3 / Windows App SDK UI: layout planning, control choice, Fluent Design alignment, Light/Dark/High Contrast theming, typography, spacing, brushes, accessibility, and XAML data-binding design. Load before authoring new XAML, reviewing UI PRs, migrating desktop UI to WinUI, or choosing between WinUI controls/patterns."
---

# WinUI 3 UI design skill

This skill adds a **WinUI-specific decision discipline**. It does not replace docs or samples: use `winui-search.exe` for runnable XAML/C# and Microsoft Learn for API details.

## Non-negotiable workflow

1. **State the UI job first**: primary user task, secondary tasks, content density, expected window widths, input modes, and accessibility risks.
2. **Search the local catalogue before inventing XAML.** This skill ships `winui-search.exe` alongside this `SKILL.md` (≈100 WinUI Gallery controls, every Windows Community Toolkit scenario, curated platform-integration patterns; full XAML + C# + pitfall notes per result).
   ```powershell
   .\winui-search.exe search "<feature 1>" "<feature 2>" ...   # batch one focused query per feature (BM25 rewards focused phrasing)
   .\winui-search.exe get <id 1> <id 2> ...                     # batch up to 3 IDs — full XAML + C# + pitfall notes
   .\winui-search.exe list                                       # browse all patterns (heavy — prefer search)
   .\winui-search.exe update                                     # force cache refresh
   ```
   **Workflow:** in **one** `search` call, list every feature you need for the current page → from each shortlist pick the best ID → grab full code with `get` (batch up to 3 per call) → then write XAML using those samples as reference. **Do NOT interleave searching with coding** — front-load lookups, then code.
3. **Design in effective pixels**, not physical pixels. Layout sizes, margins, and positions should generally be multiples of **4 epx**.
4. **Use platform controls before custom UI.** Custom visuals must preserve keyboard, UI Automation, focus, contrast themes, and theme switching.
5. **Review in four modes before calling it done**: Light, Dark, High Contrast/Contrast themes, and keyboard-only + screen reader names.

## What to load on demand

- `references/control-selection.md` — when selecting controls/patterns or reviewing whether a chosen control is appropriate.
- `references/theme-accessibility.md` — before adding brushes, theme dictionaries, visual states, custom controls, or High Contrast support.
- `references/layout-review.md` — when designing pages, navigation, responsive behavior, spacing, or typography hierarchy.
- `references/brushes-and-icons.md` — when looking up a specific brush key, deciding which icon type to use, or referencing the full WinUI brush catalogue.

If a task is small, keep those references unloaded and use the checklists below.

## App-shape anchors

Pick the closest shipping Windows app as a mental model before laying out a new page. The anchor tells you which silhouette and what density to aim for.

| App type | Anchor controls | Reference app |
|----------|-----------------|---------------|
| Settings / config tool | `NavigationView` Left + `SettingsCard` | Windows Settings |
| Document / session editor | `TabView` + full-width content | Windows Terminal, Notepad |
| Hierarchical browser | `TreeView` + `ListView` + `BreadcrumbBar` | File Explorer |
| Developer tool / dashboard | `NavigationView` + card layout | Dev Home |
| Single-purpose utility | Mode switcher + compact grid | Calculator |

## Fast design triage

Ask and answer these before writing XAML:

| Question | Good answer | Red flag |
|---|---|---|
| What is the page's primary action or decision? | One obvious task; commands support it. | Equal visual weight for everything. |
| Which app silhouette fits? | Left nav, top nav, tabbed/document, menu/command-focused, list-detail, or single-task form. | Navigation chosen because it is familiar, not because structure demands it. |
| What happens below 640 epx, 641-1007 epx, and 1008+ epx? | Reposition, resize, reflow, show/hide, or re-architect is specified. | Fixed desktop-only layout. |
| What content can truncate? | Text has wrapping/trimming strategy and accessible full value if needed. | Clipped labels, unreadable columns, hidden required info. |
| What is custom-colored? | Semantic brush resources with Light/Dark/HighContrast behavior. | Hard-coded foreground/background colors. |
| How does keyboard traversal work? | Logical tab order, focus visible, shortcuts documented where useful. | Pointer-only affordances. |

## Layout rules that prevent most WinUI design defects

- Use a **standard silhouette** unless the product has a specific reason not to: `NavigationView` for app sections, `TabView` for user-managed documents/workspaces, `Frame` for multi-page navigation, `BreadcrumbBar` for deep hierarchy.
- Keep top-level navigation shallow. More than ~7 peer pages or clear parent/child relationships usually needs hierarchy; avoid deep hierarchies unless breadcrumbs or equivalent escape routes exist.
- Avoid pogo-sticking: if users repeatedly go up one level then down another to compare related content, use list-detail, tabs, split view, filters, or adjacent panes.
- Prefer responsive changes in this order: **reflow/reposition** content, then **show/hide** secondary metadata, then **re-architect** only when the task changes materially by width.
- Do not confuse monitor pixels with XAML effective pixels. Breakpoints are based on app-window width: small `<640`, medium `641-1007`, large `>=1008` epx.
- Use multiples of 4 epx for layout measurements. Use smaller margins only for dense utility/editor surfaces; use larger margins for content/media surfaces where cohesion matters.

## Control choice: default biases

Use native controls for semantics, accessibility, and theme behavior. If unsure, search samples:

```powershell
winui-search.exe search "navigationview settings layout"
winui-search.exe search "list details responsive"
winui-search.exe search "high contrast custom brush"
```

| Need | Prefer | Avoid |
|---|---|---|
| App sections | `NavigationView` left or top | Hand-built nav lists. |
| User-opened documents/workspaces | `TabView` | NavigationView tabs for closeable documents. |
| Hierarchical location | `BreadcrumbBar`, `TreeView` | Deep hidden back-stack only. |
| Primary page commands | `CommandBar`, buttons in clear command area | Random icon buttons without labels/tooltips. |
| One-of-many choice | `RadioButtons` / radio group | ComboBox when all options should be visible. |
| Many options, compact | `ComboBox` | Radio group with long scrolling list. |
| On/off setting | `ToggleSwitch` | Checkbox for persistent binary settings where switch semantics are clearer. |
| Select multiple independent options | `CheckBox` | ToggleSwitch grid when options are not settings. |
| Collections | `ListView`/`GridView`/`ItemsView` | ItemsRepeater unless you need primitive layout control. |
| Forms | labeled inputs, validation, submit affordance | Placeholder-only labels. |
| Contextual teaching | `TeachingTip` sparingly | Modal dialog for non-blocking education. |
| Blocking decision | `ContentDialog` | Dialogs for routine information. |

## Theming and brushes

- Use `{ThemeResource ...}` for values that must update when Light/Dark/HighContrast changes at runtime.
- Use existing WinUI theme brushes and type ramp resources before defining new resources.
- For custom semantic colors, define resources by **purpose**, not hue: `WarningTextBrush`, `ChartProfitBrush`, `CardBackgroundBrush`; not `OrangeBrush`.
- Custom theme dictionaries should explicitly cover `Light`, `Dark`, and `HighContrast` when the resource affects visible UI.
- In `ThemeDictionaries`, use `{StaticResource}` for theme-local resource definitions; exception: system/accent resources such as `SystemAccentColor` and `SystemColor...` may be `{ThemeResource}`.
- Do not override system contrast colors to preserve branding. Respect user contrast choices.
- Accent color is for emphasis/interactive state, not decoration. Never rely on color alone to communicate status.

High Contrast rule of thumb: backgrounds pair with their matching foregrounds. Examples: `SystemColorWindowColor` + `SystemColorWindowTextColor`; `SystemColorHighlightColor` + `SystemColorHighlightTextColor`; `SystemColorButtonFaceColor` + `SystemColorButtonTextColor`.

## Typography

- Default font should be Segoe UI Variable via WinUI defaults; do not force a custom app font without product need.
- Use the XAML type ramp resources: `CaptionTextBlockStyle`, `BodyTextBlockStyle`, `BodyStrongTextBlockStyle`, `BodyLargeTextBlockStyle`, `BodyLargeStrongTextBlockStyle`, `SubtitleTextBlockStyle`, `TitleTextBlockStyle`, `TitleLargeTextBlockStyle`, `DisplayTextBlockStyle`.
- Use Semibold rather than Bold for emphasis in the Windows type ramp.
- Use sentence case for UI text.
- Body text should normally be left aligned; center alignment is exceptional, such as short labels under icons.
- Keep readable text lines roughly 50-60 characters when possible; avoid very narrow or very long measures.
- Do not make normal UI text smaller than 12 px regular or 14 px semibold.

## Accessibility review

A WinUI screen is not done until these pass:

- Every meaningful interactive element has an accessible name. Do not rely on icon shape or color.
- Keyboard-only users can reach and operate every feature in a logical order. `ListView`/`GridView` already provide arrow-key patterns; custom controls must match expected keyboard behavior.
- Focus visuals are visible in Light, Dark, and High Contrast.
- Text, icons, states, and charts do not use color as the only differentiator.
- Media has play/pause/stop controls and captions or alternative audio when relevant.
- Custom controls expose appropriate UI Automation peers/patterns or are replaced with native controls.
- Validation errors are announced or associated with fields, not only painted red.
- Hit targets and spacing work for touch, pen, mouse, and keyboard; do not optimize only for pointer precision.

## Data binding and MVVM design

- Prefer binding UI state to view-model state instead of code-behind toggling visual properties.
- For WinUI 3, use `x:Bind` when compile-time checking and performance matter, and ordinary `{Binding}` where dynamic DataContext scenarios require it.
- Ensure `x:Bind` default mode is understood: it is `OneTime` unless set otherwise. Use `Mode=OneWay` or `TwoWay` intentionally.
- Use `INotifyPropertyChanged` for mutable displayed state and observable collections for dynamic lists.
- Do not put business logic in converters or code-behind event handlers; converters should be small presentation adapters.
- For design review, verify empty/loading/error states are represented in the view model and visible in UI.

### x:Bind functions instead of converters

Prefer static functions over `IValueConverter` for the common bool→Visibility / negation cases. Declare them once in code-behind:

```csharp
// In code-behind, e.g. MainPage.xaml.cs
public static Visibility BoolToVisibility(bool value) =>
    value ? Visibility.Visible : Visibility.Collapsed;
public static Visibility InvertBoolToVisibility(bool value) =>
    value ? Visibility.Collapsed : Visibility.Visible;
public static bool Not(bool value) => !value;
```

```xml
<TextBlock Visibility="{x:Bind local:MainPage.BoolToVisibility(ViewModel.IsLoading), Mode=OneWay}" />
<Button   IsEnabled="{x:Bind local:MainPage.Not(ViewModel.IsLoading), Mode=OneWay}" />
```

**Never write `Converter={x:Null}`** to "skip" a converter — it throws at runtime. If you don't want a converter, just leave the property off entirely.

## Review output format

When reviewing a WinUI UI change, return findings grouped as:

1. **Blocking** — likely broken accessibility, theme failure, unusable layout, wrong control semantics.
2. **Should fix** — inconsistent Fluent/WinUI pattern, responsive gap, weak typography hierarchy, avoidable custom UI.
3. **Polish** — spacing, content density, command placement, labels.
4. **Need sample/doc check** — cases where `winui-search.exe` or Microsoft Learn should be consulted before coding.

For each finding include: issue, user impact, concrete fix, and sample search query if applicable.

## Window sizing (WinUI 3 specifics)

> **WinUI 3 has no `SizeToContent`.** Without an explicit size, Windows defaults the main window to ~1024×768 — oversized for most utilities. Size the window in `MainWindow`'s constructor; derive from the layout, not a generic.

**Rubric.** Width = widest row + 48 padding (24 each side), rounded **up** to nearest 20. Height = 32 (titlebar) + Σ(row heights) + Σ(spacing) + 48 padding, rounded up to 20. Round up — clipped content is a worse failure than a slightly-wide window.

**Sanity ranges** (derive yours from the rubric, these are not targets):
- Single-purpose utility → ~440–560 wide
- Form / single-page tool → ~600–800 wide, ~640–800 tall
- Multi-pane (nav + content) → ~1100–1300 wide, ~720–840 tall
- Document / canvas / media editor → 1280+ wide

`AppWindow.Resize` takes **physical pixels**, not DIPs — multiply by the monitor's DPI scale. `XamlRoot.RasterizationScale` is null in the constructor and stale after `AppWindow.Move`, so `[DllImport] GetDpiForWindow` is the cleanest path:

```csharp
using Microsoft.UI;
using Microsoft.UI.Windowing;
using System.Runtime.InteropServices;
using Windows.Graphics;

public sealed partial class MainWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public MainWindow()
    {
        InitializeComponent();
        var hwnd  = Win32Interop.GetWindowFromWindowId(AppWindow.Id);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        AppWindow.Resize(new SizeInt32((int)(460 * scale), (int)(860 * scale)));
    }
}
```

Don't try to size the window by setting `Width`/`Height` on the root `Grid` — that clips content, not the window.

## Anti-patterns

| ❌ Don't | ✅ Do instead |
|---------|--------------|
| Centered floating card on an empty background | Content fills the window with consistent padding |
| Custom pill / segmented tab switcher built by hand | `NavigationView` Top or `SelectorBar` |
| Equal-width 50/50 column split for nav + content | Fixed sidebar (300–360 px) + flexible main pane |
| Hard-coded color literals (`#RRGGBB`, `White`) | `{ThemeResource}` brushes by semantic name |
| `ScrollViewer` wrapped around a `ListView` / `GridView` | The collection control already scrolls — just give it a constrained height |
| Custom `ControlTemplate` for a standard control | Built-in control + lightweight styling overrides |
| Web/mobile layout conventions copied without adaptation | Translate to Windows windowing, keyboard, and input expectations |
| Placeholder text used as the only field label | Always provide a visible label |
| Required commands hidden at small widths with no alternate route | Overflow menu, secondary surface, or a responsive promotion rule |
| Modal `ContentDialog` for non-blocking hints | `TeachingTip`, `InfoBar`, or inline status |
| Custom list control when `ListView` / `GridView` / `ItemsView` fits | Use the platform collection + virtualisation |
| Assuming Light/Dark support means High Contrast works | Test in at least one Contrast theme separately |
| Designing only at full-screen desktop width | Specify behaviour at small (`<640`), medium (`641–1007`), and large (`≥1008`) epx |
