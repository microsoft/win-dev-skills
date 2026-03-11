---
name: composition-graphics
description: 'Composition API and graphics for WinUI 3 apps — visual layer, animations, effects, and custom rendering. Use when building advanced visual effects or custom rendering beyond XAML.'
---

# Composition API & Graphics for WinUI 3

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

### 1. Visual Layer fundamentals

All composition work lives in `Microsoft.UI.Composition`. The `Compositor` is the factory for every composition object — visuals, animations, brushes, and effects. Obtain it from any XAML element's visual:

```csharp
using Microsoft.UI.Composition;
using Microsoft.UI.Xaml.Hosting;

Visual elementVisual = ElementCompositionPreview.GetElementVisual(myButton);
Compositor compositor = elementVisual.Compositor;
```

Never create a standalone `Compositor` — always retrieve it from the element tree so all objects share the same composition device.

### 2. Composition animations

Use `ScalarKeyFrameAnimation` and `Vector3KeyFrameAnimation` for smooth property animations that run on the compositor thread at 60 fps, independent of the UI thread:

```csharp
var offsetAnim = compositor.CreateVector3KeyFrameAnimation();
offsetAnim.InsertKeyFrame(0f, new Vector3(0, -50, 0));
offsetAnim.InsertKeyFrame(1f, new Vector3(0, 0, 0));
offsetAnim.Duration = TimeSpan.FromMilliseconds(400);

elementVisual.StartAnimation(nameof(Visual.Offset), offsetAnim);
```

Expression animations create dynamic relationships between properties:

```csharp
var expr = compositor.CreateExpressionAnimation("tracker.Position.Y * 0.3");
expr.SetReferenceParameter("tracker", propertySet);
backgroundVisual.StartAnimation("Offset.Y", expr);
```

> **Tip:** For simpler animation scenarios, consider the `AnimationSet` and `AnimationBuilder` helpers from the [Windows Community Toolkit](https://github.com/CommunityToolkit/Windows) — they provide a higher-level API over composition animations.

### 3. Implicit animations

`ImplicitAnimationCollection` automatically animates property changes (offset, opacity, size) without explicit triggers:

```csharp
var implicitAnims = compositor.CreateImplicitAnimationCollection();

var fadeAnim = compositor.CreateScalarKeyFrameAnimation();
fadeAnim.InsertExpressionKeyFrame(1f, "this.FinalValue");
fadeAnim.Duration = TimeSpan.FromMilliseconds(300);
fadeAnim.Target = nameof(Visual.Opacity);

implicitAnims[nameof(Visual.Opacity)] = fadeAnim;
elementVisual.ImplicitAnimations = implicitAnims;
```

After assignment, any change to `Opacity` on that visual automatically animates.

### 4. Effects with CompositionEffectBrush

Build GPU-accelerated effect graphs using `CompositionEffectBrush`:

```csharp
using Microsoft.Graphics.Canvas.Effects;

var blurEffect = new GaussianBlurEffect
{
    Name = "Blur",
    BlurAmount = 10f,
    Source = new CompositionEffectSourceParameter("backdrop")
};

var factory = compositor.CreateEffectFactory(
    blurEffect, new[] { "Blur.BlurAmount" });

CompositionEffectBrush effectBrush = factory.CreateBrush();
effectBrush.SetSourceParameter("backdrop",
    compositor.CreateBackdropBrush());
```

Parameterise animatable properties in `CreateEffectFactory` to animate them later without rebuilding the graph.

### 5. Shadows

**ThemeShadow** — simple drop shadow for XAML elements. Add receivers to the `ThemeShadow.Receivers` collection:

```xml
<Rectangle x:Name="ShadowCaster" Translation="0,0,32">
    <Rectangle.Shadow>
        <ThemeShadow />
    </Rectangle.Shadow>
</Rectangle>
```

> **Tip:** For card-style shadow layouts, the Windows Community Toolkit provides an efficient `AttachedCardShadow` that doesn't require a `ThemeShadow.Receivers` collection and performs better in lists.

**DropShadow** via Composition API — full control over blur radius, offset, color, and mask:

```csharp
DropShadow shadow = compositor.CreateDropShadow();
shadow.BlurRadius = 12f;
shadow.Offset = new Vector3(4, 4, 0);
shadow.Color = Colors.Black;
shadow.Opacity = 0.4f;

var shadowVisual = compositor.CreateSpriteVisual();
shadowVisual.Shadow = shadow;
ElementCompositionPreview.SetElementChildVisual(shadowHost, shadowVisual);
```

### 6. Spring animations

`SpringScalarNaturalMotionAnimation` produces physics-based motion with natural-feeling deceleration:

```csharp
var spring = compositor.CreateSpringScalarAnimation();
spring.DampingRatio = 0.6f;   // underdamped — bouncy
spring.Period = TimeSpan.FromMilliseconds(80);
spring.FinalValue = 1.0f;

elementVisual.StartAnimation(nameof(Visual.Scale) + ".X", spring);
elementVisual.StartAnimation(nameof(Visual.Scale) + ".Y", spring);
```

- `DampingRatio < 1` — oscillates before settling (bouncy).
- `DampingRatio = 1` — critically damped (smooth, no overshoot).
- Adjust `Period` for speed of the spring response.

### 7. Performance guidelines

- Composition animations execute on the **compositor thread** at 60 fps, completely independent of the UI thread. Prefer them over `Storyboard` for any visual animation.
- Batch animation starts together — call `StartAnimationGroup` or start them in the same frame to avoid staggered begins.
- Use `CompositionScopedBatch` to receive completion callbacks without blocking the UI thread:

```csharp
var batch = compositor.CreateScopedBatch(CompositionBatchTypes.Animation);
elementVisual.StartAnimation("Opacity", fadeOut);
batch.End();
batch.Completed += (s, e) => { /* animation finished */ };
```

## Anti-patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Use `Storyboard` / `DoubleAnimation` for offset or opacity transitions | Use `Vector3KeyFrameAnimation` or `ScalarKeyFrameAnimation` on the compositor thread |
| Create `CompositionEffectBrush` without verifying GPU support | Check `CompositionCapabilities.GetForCurrentView().AreEffectsSupported()` |
| Apply `ImplicitAnimationCollection` to hundreds of visuals | Scope implicit animations to elements visible on screen; remove when off-screen |
| Create a new `Compositor` instance manually | Always retrieve from `ElementCompositionPreview.GetElementVisual().Compositor` |

## Validation

### Verification Checklist

- [ ] `Compositor` is obtained from the element visual tree, not constructed directly
- [ ] Composition animations target the correct property name string (e.g., `"Offset"`, `"Opacity"`, `"Scale"`)
- [ ] `CompositionScopedBatch` is used for completion callbacks instead of `Task.Delay` hacks
- [ ] Effect graph animatable properties are declared in `CreateEffectFactory` parameter list
- [ ] `ThemeShadow` receivers are set, or `Translation` Z-value is applied for default shadow projection

## Must Read & Research

> **Agent rule:** Before generating composition or graphics code, look up the latest API surface
> in the references below. Verify class names, method signatures, and namespace locations — the
> Composition API surface has changed between UWP and WinUI 3 / Windows App SDK.

| Topic | Reference |
|-------|-----------|
| Composition visual layer overview | https://learn.microsoft.com/windows/apps/design/visual-layer/visual-layer |
| Composition animations deep-dive | https://learn.microsoft.com/windows/apps/design/motion/composition-animation |
| Spring animations | https://learn.microsoft.com/windows/apps/design/motion/spring-animations |
| Using effects with Composition API | https://learn.microsoft.com/windows/apps/design/visual-layer/using-the-visual-layer-with-xaml |
