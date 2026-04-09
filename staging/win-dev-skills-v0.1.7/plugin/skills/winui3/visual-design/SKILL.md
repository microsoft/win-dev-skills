---
name: visual-design
description: 'Fluent Design System and Composition API for WinUI 3 — typography, spacing, colors, materials, corner radius, iconography, motion, implicit animations, spring animations, and visual effects. Use when designing UI layouts, choosing colors, applying visual polish, or building advanced animations and effects.'
---

## Quick Reference
- Use `TextBlockStyle` resources (e.g., `SubtitleTextBlockStyle`) — never hardcode `FontSize` or `FontWeight`
- All spacing must be multiples of **4px** (4, 8, 12, 16, 24, 36, 48)
- Never hardcode colors — use `{ThemeResource}` brushes for Light/Dark/High Contrast
- Use `ControlCornerRadius` (4px) for controls, `OverlayCornerRadius` (8px) for containers
- Use `MicaBackdrop` for main window, `DesktopAcrylicBackdrop` for transient surfaces

---

# Fluent Design & Composition Graphics

## Key Rules

### Typography

- Use built-in `TextBlockStyle` resources: `TitleTextBlockStyle`, `SubtitleTextBlockStyle`, `BodyTextBlockStyle`, `CaptionTextBlockStyle`
- Type ramp uses **Segoe UI Variable** — minimum readable size: 12px
- See [typography-and-spacing.md](./references/typography-and-spacing.md) for the complete type ramp

### Spacing

- All values on the **4px grid**: 4, 8, 12, 16, 24, 36, 48
- Common values: 8px between controls, 16px card padding, 24px section spacing, 36px page margins
- See [typography-and-spacing.md](./references/typography-and-spacing.md) for the full spacing grid

### Colors & Materials

- Always use `{ThemeResource}` brushes — key text: `TextFillColorPrimaryBrush`; key background: `CardBackgroundFillColorDefaultBrush`
- **Mica** (`MicaBackdrop`) — main window. **Acrylic** (`DesktopAcrylicBackdrop`) — transient surfaces
- Materials fall back to solid color on unsupported systems
- See [colors-and-materials.md](./references/colors-and-materials.md) for all tokens

### Iconography

- `SymbolIcon` for standard icons, `FontIcon` with `SymbolThemeFontFamily` for specific glyphs
- Sizes: 16px (compact), 20px (default), 24px (emphasis), 32px (large)
- See [iconography-and-motion.md](./references/iconography-and-motion.md) for reference

### Corner Radius

- `ControlCornerRadius` (4px) — in-page controls
- `OverlayCornerRadius` (8px) — top-level containers, dialogs
- Never hardcode `CornerRadius` values — always use theme resources

### Motion & Transitions

- Use built-in theme transitions (`ScalarTransition`, `NavigationThemeTransition`) — they respect "reduce motion"
- Connected animations for list-to-detail transitions
- Composition animations only when built-in transitions are insufficient

### Composition API

Obtain `Compositor` from the element tree — never create standalone:

```csharp
Visual elementVisual = ElementCompositionPreview.GetElementVisual(myElement);
Compositor compositor = elementVisual.Compositor;
```

### Implicit Animations

Assign `ImplicitAnimationCollection` to a visual — property changes animate automatically without explicit triggers. Create with `compositor.CreateImplicitAnimationCollection()`, add keyed animations, set `elementVisual.ImplicitAnimations`.

### Spring Animations

Physics-based motion with natural-feeling deceleration:

```csharp
var spring = compositor.CreateSpringScalarAnimation();
spring.DampingRatio = 0.6f;   // < 1 bouncy, = 1 smooth
spring.Period = TimeSpan.FromMilliseconds(80);
spring.FinalValue = 1.0f;
elementVisual.StartAnimation("Scale.X", spring);
```

### Performance

- Composition animations run on the **compositor thread** at 60fps — prefer over `Storyboard`
- Use `CompositionScopedBatch` for completion callbacks — never `Task.Delay`
- Scope `ImplicitAnimationCollection` to visible elements; remove when off-screen

### Anti-patterns

| Don't | Do |
|---|---|
| `FontSize="20"` | `Style="{StaticResource SubtitleTextBlockStyle}"` |
| `Margin="15"` or `Padding="10"` | Multiples of 4px |
| `Background="#FFFFFF"` | `{ThemeResource CardBackgroundFillColorDefaultBrush}` |
| `CornerRadius="6"` | `{ThemeResource ControlCornerRadius}` |
| `Storyboard` for opacity/offset | Composition `ScalarKeyFrameAnimation` |
| New `Compositor` instance | `ElementCompositionPreview.GetElementVisual().Compositor` |
| Custom icon fonts for standard actions | `SymbolIcon` or `FontIcon` |

### Validation

- [ ] Text uses `TextBlockStyle` resources — no hardcoded `FontSize`
- [ ] Spacing values are multiples of 4px
- [ ] Colors use `{ThemeResource}` — search for `="#` to find violations
- [ ] `CornerRadius` uses theme resources
- [ ] Window uses `MicaBackdrop` or `DesktopAcrylicBackdrop`
- [ ] UI renders in Light, Dark, and High Contrast themes

## Related Skills

| Topic | Skill |
|-------|-------|
| MVVM & project structure | `architecture` |
| Custom controls & menus | `ui-controls` |
| Data binding patterns | `data-layer` |

## External Resources
- [Typography](https://learn.microsoft.com/windows/apps/design/style/typography) — type ramp
- [Spacing](https://learn.microsoft.com/windows/apps/design/style/spacing) — layout spacing
- [Color](https://learn.microsoft.com/windows/apps/design/style/color) — theme resources
- [Composition animations](https://learn.microsoft.com/windows/apps/design/motion/composition-animation) — visual layer
- [WinUI 3 Gallery](https://github.com/microsoft/WinUI-Gallery) — visual reference
