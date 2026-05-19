---
name: winui-design
description: "WinUI 3 UI design and XAML correctness — layout planning, control selection, Fluent Design, theming (Light/Dark/HighContrast), typography styles, spacing, brushes, accessibility, data binding review. Use when designing new pages, converting from WPF/Electron/web, reviewing XAML, fixing theme issues, or applying Fluent Design."
---

### UI Planning

> **Before picking controls, search the catalogue.** This skill ships `winui-search.exe` alongside this `SKILL.md`. It indexes 100+ WinUI Gallery controls, every Windows Community Toolkit scenario, and a curated set of platform integration patterns (JumpList, Share, file pickers, drag-drop). Use it to ground every control choice in a real shipping sample **before writing any XAML** — this is the difference between guessing property names and copying canonical code.
>
> ```powershell
> .\winui-search.exe search "<feature description>"   # shortlist of matching scenarios
> .\winui-search.exe get <id>                          # full XAML + C# + pitfall notes
> .\winui-search.exe list                              # browse everything
> .\winui-search.exe update                            # refresh embedded snapshots from GitHub
> ```
>
> **Workflow:** batch every search you need for the current page or feature → pick the best ID from each shortlist → `get` the full code for each → then write XAML using those samples as reference. **Do NOT interleave searching with coding.** Search **one feature per query** — the BM25 scoring rewards focused queries.

#### Step 1: Identify App Type and Anchor Control
| App Type | Anchor Control | Reference App |
|----------|---------------|---------------|
| Settings / config tool | `NavigationView` Left + `SettingsCard` | Windows Settings |
| Document / session editor | `TabView` + full-width content | Windows Terminal, Notepad |
| Hierarchical browser | `TreeView` + `ListView` + `BreadcrumbBar` | File Explorer |
| Developer tool / dashboard | `NavigationView` + card layout | Dev Home |
| Single-purpose utility | Mode switcher + compact grid | Calculator |

#### Step 2: Map Requirements to Controls
**Navigation:** 2-7 sections → `NavigationView`; document tabs → `TabView`; breadcrumb trail → `BreadcrumbBar`; 2-3 modes → `SelectorBar`.

**Data display:** Vertical list → `ListView`; tiles/grid → `GridView` or `ItemsRepeater` + `UniformGridLayout`; hierarchy → `TreeView`; tabular → `ListView` with Grid column headers; master-detail → `ListView` + detail `Grid`.

**Input:** Text → `TextBox`; number → `NumberBox`; search → `AutoSuggestBox`; date → `CalendarDatePicker`; boolean → `ToggleSwitch`; pick one from 2-3 → `RadioButtons`; pick one from 4+ → `ComboBox`.

**Feedback:** Blocking decision → `ContentDialog`; contextual action → `Flyout`/`MenuFlyout`; onboarding → `TeachingTip`; inline status → `InfoBar`; system notification → `AppNotification`.

#### Step 3: Plan Layout
- **Content fills the window** — no floating cards on empty backgrounds
- `Grid` for structure, `StackPanel` only for simple stacking of few items
- Sidebar: fixed 300-360px width; main content: `Width="*"` with 24px padding
- Status bar: `Grid` row at bottom; toolbar: `CommandBar` or title bar buttons

#### Step 4: Size the Window to the App

> **WinUI 3 has no `SizeToContent`.** A `Window` is a Win32 `HWND` and, if you don't set a size, Windows hands it a generic ~1024×768 default — which makes utilities and forms look comically oversized (unlike SwiftUI, which auto-fits). **Every new app must explicitly size its main window** in `MainWindow`'s constructor. **Do not skip this step**, and **do not fall back to the OS default** "to be safe".

**Reason from the layout you just designed — don't guess, and don't reach for a generic number.** You just chose the anchor control, the columns, the rows, and the typography. Use them.

**Sizing rubric:**

1. **Inventory every row of your layout.** Before estimating, list every row that will appear in the window: title bar, mode selector, hero element, action buttons, expander rows, toggle rows, status text, etc. Sizing is driven by the **widest row** and the **sum of all row heights** — not the "average" or the "main" content.

2. **Estimate width from the widest row.** The window must comfortably fit the widest single row without truncation. For each row, sum:
   - Fixed sidebars / nav panes (e.g. `NavigationView` left pane ≈ 320)
   - Inline labels + controls + value text on the same row (e.g. "Auto-start next session" label + `ToggleSwitch` + "On/Off" state text ≈ 280–340; three `NumberBox`es side-by-side with labels ≈ 360–440; a 3-option `RadioButtons` row ≈ 320–400 depending on label length)
   - Hero controls (timer ring ≈ diameter + 64; chart ≈ its natural width)
   - Outer padding (24 on each side is typical)
   Take the **max across all rows**, not the average. If you're unsure a label will fit, add 40px headroom — clipped text is a far worse failure than a slightly-too-wide window.

3. **Estimate height by summing every row.** Title bar (~32) + each content row's natural height + spacing between rows (8–16 each) + outer padding (24 top + 24 bottom). For a hero element like a timer display, give it its full intended height (don't let it overlap the row above). For scrollable lists, pick a height that shows ~6–10 rows without scrolling.

4. **Round up to the nearest 20.** Always round **up**, never down — rounding down is how content clips. Multiples of 20 (or the 4px grid × 5) feel intentional.

5. **Sanity-check against scale anchors** (these are ranges, not targets — derive your own from steps 1–3):
   - Single-purpose utilities (one job, one screen) → typically **~440–560 wide**
   - Forms, dialogs, single-page tools → typically **~600–800 wide, ~640–800 tall**
   - Multi-pane apps (nav + content, list + detail, tabs) → typically **~1100–1300 wide, ~720–840 tall**
   - Document/canvas/media editors → as wide as your default canvas needs, often **1280+**
   If your derived number is well below these ranges, you probably missed a row in step 1 — go back and re-check.

6. **Compactness vs. clipping — pick clipping-free every time.** A utility should feel utility-sized, but **not at the cost of truncated labels, cropped controls, or content overflowing the window**. Between two sizes, prefer the smaller — but only if both fit the content with breathing room. If in doubt, add 20–40px on the side you're uncertain about.

7. **Aspect ratio follows the layout.** Tall content (lists, timers, forms) → portrait-ish. Wide content (tabs, code, media, multi-column) → landscape-ish. Don't default to landscape out of habit.

8. **Validate after running.** After `BuildAndRun`, capture a screenshot via the `winui-ui-testing` skill and apply the visual checklist in `winui-ui-testing` Step 3.5 — if any symptom appears (clipped labels, cropped hero elements, controls cut off at the edge, overlapping rows, unintended scrollbars), grow on the affected axis by 40–80px and rebuild. This validation step is **mandatory**, not optional. The rubric is an estimate; the running app is the source of truth.

**Schematic:** widest row `W` → `+48` padding (24 each side) → round up to nearest 20 = **window width**. Σ(row heights) + Σ(spacing between rows) + 32 (titlebar) + 48 (top/bottom padding) → round up = **window height**. See `references/window-sizing-examples.md` for a fully worked focus-timer derivation (460 × 860) plus a same-app anti-pattern walkthrough.

**Pattern — apply the size you derived.** `AppWindow.Resize` takes **physical pixels**, not DIPs — on a 1.25× monitor (the default scale on many Windows laptops), `Resize(new SizeInt32(460, 860))` without scaling becomes only ~368 × 688 DIPs of usable space, guaranteed to clip a 460-DIP-wide rubric. Multiply your DIP-based rubric numbers by the monitor's DPI scale:

```csharp
// MainWindow.xaml.cs — framework-only, no third-party NuGet, works in the constructor.
using Microsoft.UI;            // for Win32Interop
using Microsoft.UI.Windowing;  // for AppWindow
using System.Runtime.InteropServices;
using Windows.Graphics;        // for SizeInt32

public sealed partial class MainWindow : Window
{
    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    public MainWindow()
    {
        InitializeComponent();

        var hwnd  = Win32Interop.GetWindowFromWindowId(AppWindow.Id);
        var scale = GetDpiForWindow(hwnd) / 96.0;
        AppWindow.Resize(new SizeInt32(
            (int)(460 * scale),   // ← width  in DIPs from the rubric
            (int)(860 * scale))); // ← height in DIPs from the rubric
    }
}
```

Why this shape: `XamlRoot.RasterizationScale` (the managed WinUI 3 API for DPI) is `null` in the constructor, stale after `AppWindow.Move`, and only correct post-layout — so it doesn't fit a "set the size before first paint" use case. The single-line `[DllImport]` works at construction time, on any monitor, with no NuGet dependency.

**Anti-patterns:**
- ❌ Leaving `MainWindow` without an `AppWindow.Resize(...)` call → app launches at OS default ~1024×768 regardless of content
- ❌ Setting `Width`/`Height` on the root `Grid` to "force" a window size — it doesn't size the window, just clips/letterboxes content
- ❌ Reaching for a generic "safe" size instead of deriving from the layout
- ❌ Defaulting to landscape when the content is clearly portrait (or vice versa)
- ❌ Picking the smallest size that "probably fits" — clipped labels/controls are a bug, not a style choice
- ❌ Skipping the post-build validation in step 8 — the running app is the source of truth, not your estimate

#### Step 5: Design Anti-Patterns
| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Centered floating card on background | Content fills window with padding |
| Custom pill/segment tab switcher | `NavigationView` Top or `SelectorBar` |
| Equal-width 50/50 column split | Fixed sidebar (300-360px) + flexible main |
| Hardcoded colors (`#FF0000`) | `{ThemeResource}` brushes |
| `ScrollViewer` around `ListView` | ListView has built-in scrolling |
| Custom ControlTemplate for standard controls | Built-in controls with style overrides |

### XAML Correctness

#### Theming Rules
- **`{ThemeResource BrushName}`** at usage sites — updates on theme change
- **`{StaticResource}`** with `ResourceKey` redirects inside theme dictionaries — zero allocation
- **`ResourceKey` must end in `Brush`** (target the `SolidColorBrush`, not the `Color`)
- Always define all three variants: `x:Key="Light"`, `x:Key="Dark"`, `x:Key="HighContrast"` — never use `x:Key="Default"`
- Verify runtime theme switching: `{ThemeResource}` updates; `{StaticResource}` does not

```xml
<!-- Correct: StaticResource redirect in theme dictionary -->
<StaticResource x:Key="MyBrush" ResourceKey="ControlFillColorDefaultBrush" />

<!-- Wrong: inline SolidColorBrush allocates new object -->
<SolidColorBrush x:Key="MyBrush" Color="{StaticResource ControlFillColorDefault}" />
```

#### High Contrast
Only 8 system color brushes allowed in HC dictionaries:

| Background | Foreground | Use Case |
|------------|------------|----------|
| `SystemColorWindowColorBrush` | `SystemColorWindowTextColorBrush` | General content |
| `SystemColorHighlightColorBrush` | `SystemColorHighlightTextColorBrush` | Selected/hover |
| `SystemColorButtonFaceColorBrush` | `SystemColorButtonTextColorBrush` | Buttons |
| `SystemColorWindowColorBrush` | `SystemColorHotlightColorBrush` | Hyperlinks |
| `SystemColorWindowColorBrush` | `SystemColorGrayTextColorBrush` | Disabled content |

**HC prohibitions:** No hardcoded colors, no opacity, no accent colors, no regular WinUI brushes, no `SystemColor*` in Light/Dark dicts. Use empty HC dict when WinUI defaults suffice. Set `HighContrastAdjustment = None` at app level.

#### Typography — Use Styles, Not Raw FontSize
| Style | Size | Weight | Use For |
|-------|------|--------|---------|
| `CaptionTextBlockStyle` | 12px | Regular | Small labels, timestamps |
| `BodyTextBlockStyle` | 14px | Regular | Body text (default — don't set explicitly) |
| `BodyStrongTextBlockStyle` | 14px | Semibold | Emphasized body text |
| `SubtitleTextBlockStyle` | 20px | Semibold | Section headers, card titles |
| `TitleTextBlockStyle` | 28px | Semibold | Page titles |
| `TitleLargeTextBlockStyle` | 40px | Semibold | Large feature titles |
| `DisplayTextBlockStyle` | 68px | Semibold | Hero text |

Use `SemiBold`, never `Bold`. Minimum 12px. `BasedOn` styles must not re-declare inherited properties.

#### Spacing and Layout
- **4px grid:** margins, padding, sizes must be multiples of 4 (4, 8, 12, 16, 24, 32, 48)
- `ControlCornerRadius` (4px) for controls, `OverlayCornerRadius` (8px) for overlays — never hardcode
- `RowSpacing`/`ColumnSpacing` instead of spacer elements
- `MinHeight`/`MinWidth` instead of fixed sizing
- No negative margins

#### Remove Defaults
Don't set WinUI default values — blocks future updates:
- `BodyTextBlockStyle` on TextBlock, `TextFillColorPrimaryBrush` foreground, `TextWrapping="NoWrap"`, `Padding="0"`, `Margin="0"`

#### Acrylic Pairings
| Surface | Background | Border |
|---------|-----------|--------|
| Flyouts, tooltips | `AcrylicBackgroundFillColorDefaultBrush` | `SurfaceStrokeColorFlyoutBrush` |
| UI surfaces | `AcrylicBackgroundFillColorBaseBrush` | `SurfaceStrokeColorDefaultBrush` |

Use `BackgroundSizing="InnerBorderEdge"` on bordered acrylic. `ThemeShadow` requires `Translation="0,0,32"` and 12px parent padding.

#### Data Binding
- `{x:Bind}` over `{Binding}`, explicit `Mode=OneWay`/`TwoWay`, `x:DataType` on `DataTemplate`
- **TextBox `x:Bind TwoWay` — always add `UpdateSourceTrigger=PropertyChanged`** so the ViewModel updates on each keystroke instead of waiting for `LostFocus`. Without it, UIA automation (`set-value`) and programmatic changes won't commit to the ViewModel.
  ```xml
  <TextBox Text="{x:Bind ViewModel.Name, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />
  ```
- Commands over Click/Tapped handlers (MVVM)
- `VisualStateManager` for visual property changes, not code-behind
- No `IValueConverter` — prefer `x:Bind` with functions

**Bool negation and Visibility functions** — define static methods in code-behind:
```csharp
// In code-behind (e.g., MainPage.xaml.cs)
public static Visibility BoolToVisibility(bool value) =>
    value ? Visibility.Visible : Visibility.Collapsed;
public static Visibility InvertBoolToVisibility(bool value) =>
    value ? Visibility.Collapsed : Visibility.Visible;
public static bool IsNotBusy(bool isLoading) => !isLoading;
```
```xml
<!-- Usage in XAML -->
Visibility="{x:Bind local:MainPage.BoolToVisibility(ViewModel.IsLoading), Mode=OneWay}"
IsEnabled="{x:Bind local:MainPage.IsNotBusy(ViewModel.IsLoading), Mode=OneWay}"
```
❌ NEVER use `Converter={x:Null}` — it crashes at runtime.

#### Accessibility
- `AutomationProperties.Name` on icon-only controls
- `AutomationProperties.AutomationId` on all interactive controls
- Semantic controls (`Button`, `HyperlinkButton`) — not clickable `Border`/`TextBlock`
- `DividerStrokeColorDefaultBrush` for dividers

**Setting attached properties in code-behind** — WinUI attached properties use static methods, NOT object initializer syntax:
```csharp
using Microsoft.UI.Xaml.Automation; // required for AutomationProperties

// ❌ WRONG — object initializer doesn't work for attached properties
var btn = new Button { AutomationProperties = { AutomationId = "BtnSave" } };

// ✅ CORRECT — static setter method
var btn = new Button { Content = "Save" };
AutomationProperties.SetAutomationId(btn, "BtnSave");
AutomationProperties.SetName(btn, "Save button");
Grid.SetRow(btn, 1);
Grid.SetColumn(btn, 0);
ToolTipService.SetToolTip(btn, "Save the current document");
```

#### Formatting
- Self-closing tags for childless elements
- Styles referenced with `{StaticResource}` not `{ThemeResource}`
- No `px` suffix on numeric values, no commented-out XAML
- Consistent attribute order: x:Name, AutomationProperties, layout, content, style

### References

| File | Read when... |
|------|-------------|
| `references/approved-brushes.md` | Looking up correct WinUI brush names and usage rules |
| `references/theme-aware-resources.md` | Implementing ThemeResource/StaticResource, High Contrast, acrylic pairings |
| `references/code-review-checklist.md` | Reviewing XAML changes for correctness |
| `references/pr-review-patterns.md` | Applying concrete review fixes and patterns |
| `references/control-styles.md` | Customizing built-in control styles |
| `references/typography-and-spacing.md` | Detailed type ramp, spacing grid, and sizing examples |
| `references/colors-and-materials.md` | Theme brush catalog, Mica/Acrylic surface pairings, material usage |
| `references/iconography-and-motion.md` | Icon guidelines, animation patterns, connected animations |
| `references/window-sizing-examples.md` | Fully worked applications of the Step 4 sizing rubric |
