---
name: winui-design
description: "Use when designing, reviewing, or fixing WinUI 3 / Windows App SDK UI: layout planning, control choice, Fluent Design alignment, Light/Dark/High Contrast theming, typography, spacing, brushes, accessibility, and XAML data-binding design. Load before authoring new XAML, reviewing UI PRs, migrating desktop UI to WinUI, or choosing between WinUI controls/patterns."
---

# WinUI 3 UI design skill

This skill is **the sharp-edges expert** for WinUI 3 — landmines that bite, conventions that aren't obvious, and a sample-search tool. Trust your own training for the basics (NavigationView vs TabView, the type ramp, generic accessibility); load this for what the basics don't tell you.

## Search samples before writing XAML

This skill ships `winui-search.exe` alongside this `SKILL.md` (≈100 WinUI Gallery controls, every Windows Community Toolkit scenario, curated platform-integration patterns; each result returns full XAML + C# + pitfall notes). **Front-load lookups, then code** — don't interleave.

```powershell
.\winui-search.exe search "<feature 1>" "<feature 2>" ...   # batch one focused query per feature (BM25 likes focused phrasing)
.\winui-search.exe get <id 1> <id 2> ...                     # batch up to 3 IDs — full XAML + C# + pitfall notes
.\winui-search.exe list                                       # browse all patterns (heavy — prefer search)
.\winui-search.exe update                                     # force cache refresh
```

## App-shape anchors

Pick the closest shipping app silhouette before laying out a page:

| App type | Anchor controls | Reference app |
|----------|-----------------|---------------|
| Settings / config tool | `NavigationView` Left + `SettingsCard` / `SettingsExpander` | Windows Settings |
| Document / session editor | `TabView` + full-width content | Windows Terminal, Notepad |
| Hierarchical browser | `TreeView` + `ListView` + `BreadcrumbBar` | File Explorer |
| Developer tool / dashboard | `NavigationView` + card layout | Dev Home |
| Single-purpose utility | Mode switcher + compact grid | Calculator |

`SettingsCard` and `SettingsExpander` are **not in WinUI itself** — install `CommunityToolkit.WinUI.Controls.SettingsControls` and add `xmlns:tk="using:CommunityToolkit.WinUI.Controls"`.

## Sidebar skeleton (Settings-style page)

```xml
<NavigationView PaneDisplayMode="Left"
                IsBackButtonVisible="Collapsed"
                IsSettingsVisible="False"
                OpenPaneLength="280"
                CompactPaneLength="48">
  <NavigationView.MenuItems>
    <NavigationViewItem Content="General" Icon="Setting" Tag="general" />
    <NavigationViewItem Content="Appearance" Icon="Brush"  Tag="appearance" />
  </NavigationView.MenuItems>

  <ScrollViewer Padding="36,24,36,36">
    <StackPanel Spacing="4" MaxWidth="1064">
      <tk:SettingsCard Header="Theme" Description="Pick the app appearance.">
        <ComboBox SelectedIndex="0">
          <ComboBoxItem>Use system setting</ComboBoxItem>
          <ComboBoxItem>Light</ComboBoxItem>
          <ComboBoxItem>Dark</ComboBoxItem>
        </ComboBox>
      </tk:SettingsCard>
    </StackPanel>
  </ScrollViewer>
</NavigationView>
```

`PaneDisplayMode` options: `Left` (sidebar), `LeftCompact` (icons-only), `Top` (horizontal), `Auto` (adapts to width). Pick `Left` for settings/utility apps; `Auto` only if the page is genuinely width-flexible.

## Mica / SystemBackdrop wiring (in `MainWindow`)

```csharp
this.SystemBackdrop = new MicaBackdrop { Kind = MicaKind.Base };
// or MicaKind.BaseAlt for tabbed shells; or new DesktopAcrylicBackdrop()
```

The content layer on Mica picks up `LayerFillColorDefaultBrush`; on Mica Alt, `LayerOnMicaBaseAltFillColorDefaultBrush`. Don't paint the root with a solid colour or the backdrop won't show through.

## Window sizing (WinUI 3 specifics)

> **WinUI 3 has no `SizeToContent`.** Without an explicit size, Windows defaults the main window to ~1024×768 — oversized for most utilities. Size it in `MainWindow`'s constructor.

**Rubric.** Width = widest row + 48 padding, rounded up to nearest 20. Height = 32 (titlebar) + Σ(row heights) + Σ(spacing) + 48 padding, rounded up to 20. Round up — clipped content is a worse failure than a slightly-wide window. Sanity ranges (derive yours from the rubric):

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

Don't size the window by setting `Width`/`Height` on the root `Grid` — that clips content, not the window.

## XAML landmines (the things you'll otherwise ship broken)

### `x:Bind` defaults to `OneTime`

```xml
<!-- ❌ silently never updates -->
<TextBlock Text="{x:Bind Vm.Status}" />
<!-- ✅ -->
<TextBlock Text="{x:Bind Vm.Status, Mode=OneWay}" />
```

### `TextBox` two-way needs `UpdateSourceTrigger=PropertyChanged`

```xml
<TextBox Text="{x:Bind Vm.Name, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />
```

Default trigger is `LostFocus`, which (a) doesn't push keystrokes to the VM until focus leaves and (b) **silently breaks UI Automation `set-value` calls** used by automated tests and assistive tech.

### Attached properties from C# use static setters, not initializers

```csharp
using Microsoft.UI.Xaml.Automation;

// ❌ WRONG — initializer reads-then-mutates a transient instance; compiles, does nothing
var btn = new Button { AutomationProperties = { AutomationId = "BtnSave" } };

// ✅ CORRECT
var btn = new Button { Content = "Save" };
AutomationProperties.SetAutomationId(btn, "BtnSave");
AutomationProperties.SetName(btn, "Save button");
Grid.SetRow(btn, 1);
ToolTipService.SetToolTip(btn, "Save the current document");
```

### `Converter={x:Null}` throws at runtime

Don't try to "no-op" a binding that way. If you don't want a converter, leave the property off.

### Prefer `x:Bind` static functions over `IValueConverter`

```csharp
// MainPage.xaml.cs
public static Visibility BoolToVisibility(bool v) => v ? Visibility.Visible : Visibility.Collapsed;
public static Visibility InvertBoolToVisibility(bool v) => v ? Visibility.Collapsed : Visibility.Visible;
public static bool Not(bool v) => !v;
```
```xml
<TextBlock Visibility="{x:Bind local:MainPage.BoolToVisibility(Vm.IsLoading), Mode=OneWay}" />
<Button   IsEnabled="{x:Bind local:MainPage.Not(Vm.IsLoading), Mode=OneWay}" />
```

### Acrylic and `ThemeShadow` rendering rules

- Bordered acrylic surface → set `BackgroundSizing="InnerBorderEdge"` or the material bleeds past the stroke.
- `ThemeShadow` requires `Translation="0,0,32"` on the caster **and** ≥ 12 px padding on the parent, or the shadow silently clips.

## Theming rules (short version)

- `{ThemeResource ...}` at usage sites (updates on theme switch). `{StaticResource}` inside `ThemeDictionaries` for theme-local definitions; `SystemAccentColor` / `SystemColor*` are the exceptions and stay `{ThemeResource}`.
- Custom theme dictionaries cover `Light`, `Dark`, **and** `HighContrast` explicitly — never `Default`.
- Name resources by purpose (`CardBackgroundBrush`, `DangerTextBrush`), not hue.
- Light/Dark working ≠ High Contrast working. Test in a Contrast theme separately.
- Never set `HighContrastAdjustment="None"` unless your app already supplies system-aware brushes throughout.

## Anti-patterns

| ❌ Don't | ✅ Do instead |
|---------|--------------|
| Centered floating card on an empty background | Content fills the window with consistent padding |
| Custom pill / segmented tab switcher built by hand | `NavigationView` Top or `SelectorBar` |
| Equal-width 50/50 column split for nav + content | Fixed sidebar (280–360 px) + flexible main pane |
| Hard-coded color literals (`#RRGGBB`, `White`) | `{ThemeResource}` brushes by semantic name |
| `ScrollViewer` wrapped around a `ListView` / `GridView` | The collection control already scrolls — give it a constrained height |
| Custom `ControlTemplate` for a standard control | Built-in control + lightweight style overrides |
| Placeholder text used as the only field label | Always provide a visible label |
| Required commands hidden at small widths with no route | Overflow menu, secondary surface, or a responsive promotion rule |
| Modal `ContentDialog` for non-blocking hints | `TeachingTip`, `InfoBar`, or inline status |
| Custom list control when `ListView` / `GridView` fits | Use the platform collection + virtualisation |

Build custom UI **only when all are true**: no platform/Gallery/Toolkit control fits; you'll implement keyboard, focus, UI Automation, theme resources, High Contrast, and responsive behaviour; you have specs for default/hover/pressed/disabled/selected/focused/error states; you've tested with keyboard and a contrast theme.

## References (load on demand)

| File | Load when… |
|------|-----------|
| `references/brushes-and-icons.md` | Looking up a brush key by purpose, picking between `Icon` / `IconSource` slots, choosing among `FontIcon` / `SymbolIcon` / `PathIcon` / etc. |
| `references/theme-accessibility.md` | Authoring theme dictionaries, custom brushes/styles/templates, or High Contrast support. |
| `references/layout-review.md` | Reviewing responsive behaviour, breakpoints, or empty/loading/error coverage on a data-driven page. |
