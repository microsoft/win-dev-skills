# WinUI theming and accessibility reference

Load this before adding custom brushes, styles, templates, visual states, custom controls, or High Contrast support.

## Theme resources

Rules:
- Use `{ThemeResource}` for visible UI values that must update when theme changes at runtime.
- Use `{StaticResource}` for values that are resolved once and for references inside `ThemeDictionaries`, except system/accent resources.
- Custom visible resources should usually define `Light`, `Dark`, and `HighContrast` dictionaries explicitly.
- Resource names should be semantic (`CardBackgroundBrush`, `DangerTextBrush`), not chromatic (`BlueBrush`).
- Prefer built-in WinUI brushes before defining custom ones.

Minimal pattern:

```xml
<ResourceDictionary.ThemeDictionaries>
  <ResourceDictionary x:Key="Light">
    <SolidColorBrush x:Key="CardBackgroundBrush" Color="#FFFFFFFF" />
  </ResourceDictionary>
  <ResourceDictionary x:Key="Dark">
    <SolidColorBrush x:Key="CardBackgroundBrush" Color="#FF1F1F1F" />
  </ResourceDictionary>
  <ResourceDictionary x:Key="HighContrast">
    <SolidColorBrush x:Key="CardBackgroundBrush" Color="{ThemeResource SystemColorWindowColor}" />
  </ResourceDictionary>
</ResourceDictionary.ThemeDictionaries>
```

Apply with:

```xml
<Grid Background="{ThemeResource CardBackgroundBrush}" />
```

## High Contrast / contrast themes

Do:
- Treat contrast themes as separate from Light/Dark.
- Use `SystemColor...` resources in HighContrast dictionaries.
- Pair foreground/background resources correctly.
- Test with Windows Settings > Accessibility > Contrast themes.

Pairings:

| Background | Foreground |
|---|---|
| `SystemColorWindowColor` | `SystemColorWindowTextColor` |
| `SystemColorHighlightColor` | `SystemColorHighlightTextColor` |
| `SystemColorButtonFaceColor` | `SystemColorButtonTextColor` |

Common uses:
- `SystemColorWindowColor`: pages, panes, popups, windows.
- `SystemColorWindowTextColor`: headings, body, list text, non-interactive UI.
- `SystemColorHotlightColor`: hyperlinks.
- `SystemColorGrayTextColor`: inactive/disabled UI.
- `SystemColorHighlightColor`/`HighlightTextColor`: selected, hover/pressed, progress or highlighted states.
- `SystemColorButtonFaceColor`/`ButtonTextColor`: buttons and interactable UI.

Avoid:
- Branding colors that override user contrast choices.
- `HighContrastAdjustment="None"` unless the app already supplies correct system-aware brushes and you intentionally want your contrast styling to flow through.
- Hard-coded fills/strokes in icons that disappear in contrast themes.

## Accessible names and semantics

Checklist:
- Interactive controls have accessible names from visible text or `AutomationProperties.Name`.
- Icon-only buttons have name + tooltip/flyout text where appropriate.
- Decorative images are not exposed as meaningful controls; informative images have alternatives.
- Form fields have visible labels, not placeholder-only labels.
- Error text is associated with the field and not only colored red.
- Custom controls expose correct automation peer/patterns or are replaced with native controls.

## Keyboard and focus

- Every feature reachable by pointer must be reachable by keyboard.
- Tab order follows visual/task order; avoid positive TabIndex hacks unless absolutely necessary.
- Arrow-key behavior should match the control type; prefer native list/grid controls for collections.
- Focus indication must be visible in Light, Dark, and High Contrast.
- Flyouts/dialogs must trap/restore focus appropriately according to platform behavior.

## Color and state

- Never encode status with color alone. Add text, icon shape, pattern, or position.
- Check red/green distinctions for color blindness; provide another differentiator.
- Accent color should emphasize important interactive state, not decorate large surfaces.
- Disabled state must remain legible enough to identify, while not appearing interactive.

## Acrylic and shadow specifics

Two non-obvious composite rules when drawing custom acrylic surfaces or elevating with `ThemeShadow`:

- On a bordered acrylic surface, set `BackgroundSizing="InnerBorderEdge"` or the material will bleed past the stroke.
- For `ThemeShadow`, set `Translation="0,0,32"` on the casting element **and** give its parent ≥ 12 px padding so the shadow has room to render. Without the padding, the shadow gets clipped silently.
- Acrylic pairings: flyouts/menus/tooltips use `AcrylicBackgroundFillColorDefaultBrush` with `SurfaceStrokeColorFlyoutBrush`; in-app sidebars/command bars use `AcrylicBackgroundFillColorBaseBrush` with `SurfaceStrokeColorDefaultBrush`.

Pull a complete worked sample with `winui-search.exe search "acrylic flyout" "theme shadow"`.

## TextBox two-way binding (`UpdateSourceTrigger`)

When binding `TextBox.Text` two-way with `x:Bind`, **always add `UpdateSourceTrigger=PropertyChanged`**:

```xml
<TextBox Text="{x:Bind ViewModel.Name, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />
```

The default trigger is `LostFocus`, which means (a) keystrokes don't flow to the view model until focus leaves the field, and (b) UI Automation `set-value` calls (used by automated tests and assistive tech) don't commit to the view model at all. This is a silent test-breaker.

## Attached properties from C#

WinUI attached properties use static setter methods, **not** object-initializer syntax. The initializer form compiles but doesn't do what it looks like:

```csharp
using Microsoft.UI.Xaml.Automation; // for AutomationProperties

// ❌ WRONG — the initializer reads-then-mutates a transient instance
var btn = new Button { AutomationProperties = { AutomationId = "BtnSave" } };

// ✅ CORRECT
var btn = new Button { Content = "Save" };
AutomationProperties.SetAutomationId(btn, "BtnSave");
AutomationProperties.SetName(btn, "Save button");
Grid.SetRow(btn, 1);
Grid.SetColumn(btn, 0);
ToolTipService.SetToolTip(btn, "Save the current document");
```

## Media and dynamic content

- Media requires play/pause/stop controls and captions or alternative audio when relevant.
- Loading and progress states need accessible text/status, not only animation.
- Live updates should avoid stealing focus; announce only when needed.
