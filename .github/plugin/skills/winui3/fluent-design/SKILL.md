---
name: fluent-design
description: 'Fluent Design System for WinUI 3 apps — type ramp, spacing, colors, iconography, materials, corner radius, and motion. Use when designing UI layouts, choosing controls, or applying visual polish.'
---

# Fluent Design

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

### Typography — Type Ramp

Use the **built-in TextBlock styles** — never set `FontSize` or `FontWeight` manually. The type ramp uses **Segoe UI Variable** and scales correctly across displays.

| Style | Use for |
|-------|---------|
| `CaptionTextBlockStyle` | Labels, timestamps, metadata |
| `BodyTextBlockStyle` | Body text, descriptions (default) |
| `BodyStrongTextBlockStyle` | Emphasized body text |
| `BodyLargeTextBlockStyle` | Introductory text |
| `SubtitleTextBlockStyle` | Section headings |
| `TitleTextBlockStyle` | Page titles |
| `TitleLargeTextBlockStyle` | Hero headings |
| `DisplayTextBlockStyle` | Splash / display only |

Always reference these `StaticResource` styles — never hardcode font sizes, weights, or line heights.

```xml
<!-- GOOD — use built-in styles -->
<TextBlock Text="Settings" Style="{StaticResource SubtitleTextBlockStyle}" />
<TextBlock Text="Choose your preferences below." Style="{StaticResource BodyTextBlockStyle}" />
<TextBlock Text="Last updated: 3/10/2026" Style="{StaticResource CaptionTextBlockStyle}" />

<!-- BAD — never hardcode font properties -->
<TextBlock Text="Settings" FontSize="20" FontWeight="SemiBold" />
```

**Minimum readable sizes:** 12px Regular for labels, 14px SemiBold for smallest bold text. Never go below 12px.

### Spacing — 4px Grid

All spacing and sizing values must be **multiples of 4px**. This ensures consistent alignment and scaling across DPI settings.

**Standard spacing scale (effective pixels):**

| Value | Use for |
|-------|---------|
| **4px** | Compact spacing between tightly related elements |
| **8px** | Spacing between a control and its label, between grouped controls |
| **12px** | Spacing between a control and its header, surface edge to text |
| **16px** | Padding inside cards and list items |
| **24px** | Spacing between content sections |
| **36px** | Page-level padding (content area margins) |
| **48px** | Spacing between major page sections with titles |

```xml
<!-- GOOD — multiples of 4 -->
<StackPanel Spacing="8">
    <TextBlock Text="Name" Style="{StaticResource BodyStrongTextBlockStyle}" />
    <TextBox PlaceholderText="Enter your name" />
</StackPanel>

<Grid Padding="36" RowSpacing="24" ColumnSpacing="16">
    <!-- Page content with standard padding and section spacing -->
</Grid>

<!-- BAD — arbitrary values -->
<StackPanel Spacing="10" Margin="15,7,15,7" />
```

### Colors — Theme Resources

**Never hardcode colors.** Always use `{ThemeResource}` brushes so your app works in Light, Dark, and High Contrast modes.

**Text brushes:**

| Resource | Use for |
|----------|---------|
| `TextFillColorPrimaryBrush` | Primary text (headings, body) |
| `TextFillColorSecondaryBrush` | Secondary / supporting text |
| `TextFillColorTertiaryBrush` | Pressed state text |
| `TextFillColorDisabledBrush` | Disabled text only |
| `TextOnAccentFillColorPrimaryBrush` | Text on accent-colored backgrounds |
| `AccentTextFillColorPrimaryBrush` | Hyperlinks and accent text |

**Control fill brushes:**

| Resource | Use for |
|----------|---------|
| `ControlFillColorDefaultBrush` | Control rest state |
| `ControlFillColorSecondaryBrush` | Control hover state |
| `ControlFillColorTertiaryBrush` | Control pressed state |
| `ControlFillColorDisabledBrush` | Disabled controls |
| `ControlFillColorInputActiveBrush` | Focused text input fields |

**Background brushes:**

| Resource | Use for |
|----------|---------|
| `CardBackgroundFillColorDefaultBrush` | Card backgrounds |
| `CardBackgroundFillColorSecondaryBrush` | Alternate card rows |
| `LayerFillColorDefaultBrush` | Layered surface backgrounds |
| `SolidBackgroundFillColorBaseBrush` | Opaque page backgrounds |
| `SmokeFillColorDefaultBrush` | Overlay dimming (behind dialogs) |
| `AcrylicBackgroundFillColorBaseBrush` | Acrylic material surfaces |

**Accent fill (for primary action buttons):**

| Resource | Use for |
|----------|---------|
| `AccentFillColorDefaultBrush` | Primary button rest |
| `AccentFillColorSecondaryBrush` | Primary button hover |
| `AccentFillColorTertiaryBrush` | Primary button pressed |
| `AccentFillColorDisabledBrush` | Disabled primary button |

**Stroke / border brushes:**

| Resource | Use for |
|----------|---------|
| `CardStrokeColorDefaultBrush` | Card borders |
| `ControlStrokeColorDefaultBrush` | Control borders |
| `DividerStrokeColorDefaultBrush` | Separators and dividers |

```xml
<!-- GOOD -->
<Border Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"
        BorderBrush="{ThemeResource CardStrokeColorDefaultBrush}"
        BorderThickness="1"
        CornerRadius="{StaticResource OverlayCornerRadius}"
        Padding="16">
    <TextBlock Text="Card content"
               Foreground="{ThemeResource TextFillColorPrimaryBrush}" />
</Border>

<!-- BAD — hardcoded colors break Dark mode and High Contrast -->
<Border Background="#FFFFFF" BorderBrush="#E0E0E0">
    <TextBlock Text="Card content" Foreground="#000000" />
</Border>
```

### Iconography

Use **Segoe Fluent Icons** (Windows 11) via the `SymbolThemeFontFamily` resource, which falls back to **Segoe MDL2 Assets** on Windows 10 automatically.

**Icon types in order of preference:**

| Type | When to use | Example |
|------|-------------|---------|
| `SymbolIcon` | Standard named icons (simplest) | `<SymbolIcon Symbol="Save" />` |
| `FontIcon` | Specific glyph codes from Segoe Fluent Icons | `<FontIcon FontFamily="{StaticResource SymbolThemeFontFamily}" Glyph="&#xE946;" />` |
| `AnimatedIcon` | Interactive states (checkbox, nav, toggle) | Built-in with some controls |
| `ImageIcon` | Custom brand icons or images | `<ImageIcon Source="ms-appx:///Assets/logo.png" />` |
| `PathIcon` | Custom vector shapes | `<PathIcon Data="M 0,0 L 10,10" />` |
| `BitmapIcon` | Legacy bitmap icons | Avoid — prefer `ImageIcon` |

**Standard icon sizes:** 16px (inline/compact), 20px (default control size), 24px (emphasis), 32px (large), 48px (hero/feature).

```xml
<!-- MenuFlyout with icons -->
<MenuFlyoutItem Text="Copy" Icon="{ui:SymbolIcon Symbol=Copy}">
    <MenuFlyoutItem.KeyboardAccelerators>
        <KeyboardAccelerator Key="C" Modifiers="Control" />
    </MenuFlyoutItem.KeyboardAccelerators>
</MenuFlyoutItem>

<!-- NavigationViewItem with icon -->
<NavigationViewItem Content="Settings" Icon="{ui:SymbolIcon Symbol=Setting}" />

<!-- FontIcon for glyphs not in SymbolIcon enum -->
<FontIcon FontFamily="{StaticResource SymbolThemeFontFamily}"
          Glyph="&#xE8C8;"
          FontSize="16" />
```

Browse available icons in the **WinUI Gallery** app → Design guidance → Iconography, or search [Segoe Fluent Icons](https://learn.microsoft.com/windows/apps/design/style/segoe-fluent-icons-font).

### Corner Radius

Use the **built-in theme resources** — never hardcode `CornerRadius` values:

| Resource | Value | Use for |
|----------|-------|---------|
| `ControlCornerRadius` | 4px | In-page controls (buttons, inputs, list items) |
| `OverlayCornerRadius` | 8px | Top-level containers (cards, dialogs, flyouts, app window) |
| 0px | — | Edges that intersect with other straight edges (no resource needed) |

```xml
<!-- GOOD — use theme resources -->
<Button CornerRadius="{StaticResource ControlCornerRadius}" Content="Save" />
<Border CornerRadius="{StaticResource OverlayCornerRadius}" Padding="16">
    <!-- Card content -->
</Border>

<!-- BAD — hardcoded values -->
<Button CornerRadius="4" Content="Save" />
<Border CornerRadius="12" />
```

### Materials — Mica & Acrylic

**Mica** — use for the app's main window background. It samples the desktop wallpaper for a subtle tinted translucency.

**Acrylic** — use for transient surfaces (flyouts, menus, sidebars) layered on top of the main window.

```xml
<!-- Window-level Mica (set in MainWindow.xaml) -->
<Window.SystemBackdrop>
    <MicaBackdrop />
</Window.SystemBackdrop>

<!-- Alternative: Mica Base Alt (slightly different tint) -->
<Window.SystemBackdrop>
    <MicaBackdrop Kind="BaseAlt" />
</Window.SystemBackdrop>

<!-- Acrylic for in-app surfaces -->
<Window.SystemBackdrop>
    <DesktopAcrylicBackdrop />
</Window.SystemBackdrop>
```

| Material | Surface lifetime | Example |
|----------|-----------------|---------|
| **Mica** | Long-lived (app window) | Main window background |
| **Mica Base Alt** | Long-lived (alternate tint) | Secondary window background |
| **Acrylic** | Transient (overlays) | Flyouts, sidebars, command bars |

Materials fall back to solid color on unsupported systems — no code needed.

### Motion & Transitions

**Prefer built-in theme transitions** — they animate automatically and respect user "reduce motion" settings.

```xml
<!-- Implicit transitions — animate property changes automatically -->
<Button Opacity="1">
    <Button.OpacityTransition>
        <ScalarTransition />
    </Button.OpacityTransition>
</Button>

<!-- Page transitions via Frame -->
<Frame x:Name="ContentFrame">
    <Frame.ContentTransitions>
        <TransitionCollection>
            <NavigationThemeTransition />
        </TransitionCollection>
    </Frame.ContentTransitions>
</Frame>
```

**Connected animations** — animate elements between pages (e.g., list item → detail page):

```csharp
// Source page — prepare animation
var service = ConnectedAnimationService.GetForCurrentView();
service.PrepareToAnimate("itemAnimation", sourceElement);
Frame.Navigate(typeof(DetailPage), item);

// Destination page — play animation
var animation = ConnectedAnimationService.GetForCurrentView()
    .GetAnimation("itemAnimation");
animation?.TryStart(destinationElement);
```

Use composition animations (via the **composition-graphics** skill) only when built-in transitions are insufficient.

---

## Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| `FontSize="20" FontWeight="SemiBold"` | Breaks type ramp consistency, won't update with system settings | `Style="{StaticResource SubtitleTextBlockStyle}"` |
| `Margin="15"` or `Padding="10"` | Violates 4px grid, creates misaligned layouts | Use multiples of 4: `Margin="16"` or `Padding="12"` |
| `Background="#FFFFFF"` or `Foreground="#333"` | Breaks Dark mode and High Contrast themes | `Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"` |
| `CornerRadius="6"` or `CornerRadius="10"` | Inconsistent with system controls | `CornerRadius="{StaticResource ControlCornerRadius}"` (4) or `OverlayCornerRadius` (8) |
| Custom icon fonts or PNGs for standard actions | Inconsistent with platform, doesn't scale | `SymbolIcon` or `FontIcon` with `SymbolThemeFontFamily` |
| `Storyboard` for simple property changes | Heavyweight, doesn't respect reduce-motion | `ScalarTransition` or implicit animations |
| Custom background brush for window | Doesn't integrate with desktop wallpaper | `<MicaBackdrop />` or `<DesktopAcrylicBackdrop />` |

---

## Validation

### Verification Checklist

- [ ] All text uses built-in `TextBlockStyle` resources — no hardcoded `FontSize` or `FontWeight`
- [ ] All spacing values (Margin, Padding, Spacing) are multiples of 4px
- [ ] All colors use `{ThemeResource}` brushes — search for `="#` in XAML to find violations
- [ ] Icons use `SymbolIcon` or `FontIcon` with `SymbolThemeFontFamily` — no custom icon fonts for standard actions
- [ ] `CornerRadius` uses `ControlCornerRadius` (4px) or `OverlayCornerRadius` (8px) theme resources
- [ ] App uses `MicaBackdrop` or `DesktopAcrylicBackdrop` for window background
- [ ] UI renders correctly in Light, Dark, and High Contrast themes
- [ ] Page transitions use `NavigationThemeTransition` or connected animations

---

## Must Read & Research

> **Agent Rule:** Before designing any UI layout, choosing colors, or applying visual polish, you **must** fetch and review these references using `fetch_webpage`. Apply what you learn.

| # | Reference | When to consult |
|---|---|---|
| 1 | [WinUI 3 Gallery — Design guidance](https://github.com/microsoft/WinUI-Gallery) | Any visual design decision — run the app for live examples |
| 2 | [Typography in Windows apps](https://learn.microsoft.com/windows/apps/design/style/typography) | Choosing text styles, font sizes, or type hierarchy |
| 3 | [Spacing and sizes](https://learn.microsoft.com/windows/apps/design/style/spacing) | Setting margins, padding, or layout spacing |
| 4 | [Color in Windows apps](https://learn.microsoft.com/windows/apps/design/style/color) | Choosing colors, theme resources, accent colors |
| 5 | [Segoe Fluent Icons](https://learn.microsoft.com/windows/apps/design/style/segoe-fluent-icons-font) | Finding icon glyphs for FontIcon |
| 6 | [Materials in Windows 11](https://learn.microsoft.com/windows/apps/design/style/mica) | Applying Mica or Acrylic backdrops |
| 7 | [Rounded corners in WinUI](https://learn.microsoft.com/windows/apps/design/style/rounded-corner) | Corner radius values and when to apply them |
