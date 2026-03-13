---
name: win2d
description: 'Win2D 2D graphics rendering — CanvasControl, drawing, effects, shaders, and performance patterns. Use when implementing custom 2D graphics, charts, or visual effects in WinUI 3.'
---

# Win2D — 2D Graphics for WinUI 3

Win2D is an easy-to-use Windows Runtime API for immediate-mode 2D graphics rendering with GPU acceleration. It wraps Direct2D and integrates with WinUI 3 XAML. Use it for custom charts and data visualizations, drawing-canvas apps, particle systems, real-time animations, image processing and filters, and rendering thousands of sprites in a single draw call.

---

## 1. Setup

Add the Win2D NuGet package:

```powershell
dotnet add package Microsoft.Graphics.Win2D
```

For custom pixel shaders, also add:

```powershell
dotnet add package ComputeSharp.D2D1.WinUI
```

---

## 2. Choosing the right control

Win2D provides three XAML controls. Choose based on your scenario:

| Control | Ease of use | Target use case | Rendering model |
|---------|-------------|-----------------|-----------------|
| **CanvasControl** | Easiest — single `Draw` event | Static or infrequently updated content (charts, diagrams, icons) | On-demand — call `Invalidate()` to trigger redraw |
| **CanvasAnimatedControl** | Moderate — `Update` + `Draw` loop | Continuous animation, games, real-time visualizations | Fixed-timestep game loop with `TargetElapsedTime` |
| **CanvasSwapChainPanel** | Advanced — manual draw + `Present()` | High-frequency rendering where you need full control over frame timing | Manual — you create the `CanvasSwapChain`, draw, and call `Present()` yourself |
| **CanvasVirtualControl** | Advanced — region-based invalidation | Very large or infinite canvases (maps, documents) | Only draws visible regions on demand |

### XAML usage

```xml
xmlns:canvas="using:Microsoft.Graphics.Canvas.UI.Xaml"

<!-- Static content -->
<canvas:CanvasControl Draw="OnCanvasDraw" />

<!-- Animated content -->
<canvas:CanvasAnimatedControl Draw="OnAnimatedDraw"
                              Update="OnAnimatedUpdate"
                              TargetElapsedTime="0:0:0.016"
                              IsFixedTimeStep="True" />

<!-- Manual swap chain (advanced) -->
<canvas:CanvasSwapChainPanel x:Name="swapChainPanel" />
```

For `CanvasSwapChainPanel`, you create and manage the swap chain yourself:

```csharp
private void Page_Loaded(object sender, RoutedEventArgs e)
{
    var swapChain = new CanvasSwapChain(
        CanvasDevice.GetSharedDevice(),
        (float)swapChainPanel.ActualWidth,
        (float)swapChainPanel.ActualHeight,
        96);
    swapChainPanel.SwapChain = swapChain;
}

private void DrawFrame()
{
    using (var ds = swapChainPanel.SwapChain.CreateDrawingSession(Colors.White))
    {
        ds.DrawCircle(200, 150, 80, Colors.Red, 4);
    }
    swapChainPanel.SwapChain.Present();
}

private void SwapChainPanel_SizeChanged(object sender, SizeChangedEventArgs e)
{
    swapChainPanel.SwapChain?.ResizeBuffers(e.NewSize);
}
```

### WinUI features you must handle manually

Win2D renders directly to a GPU surface, bypassing the XAML visual tree. This means several WinUI features do **not** work automatically:

| Feature | What you lose | What to do |
|---------|--------------|------------|
| **Accessibility** | No `AutomationPeer`, no UIA tree, screen readers cannot see Win2D content | Implement `AutomationPeer` on the hosting control, expose content via UIA properties, or overlay invisible XAML elements for screen reader access |
| **Theming** | No automatic light/dark theme colors | Subscribe to `ActualThemeChanged` on the hosting `FrameworkElement` and re-read theme resources (`Application.Current.Resources`) to update your drawing colors |
| **Hit testing** | No built-in pointer-to-element mapping | Implement coordinate math in `PointerPressed`/`PointerMoved` on the hosting control, mapping pixel positions to your logical objects |
| **High contrast** | Win2D does not respond to system high-contrast settings | Detect high-contrast mode via `AccessibilitySettings.HighContrast` and switch to high-contrast color palettes |
| **Keyboard focus** | No focus rings or tab navigation for drawn elements | Draw custom focus indicators and handle `KeyDown`/`GotFocus` on the hosting control; map keys to your logical objects |
| **Text selection** | Text drawn with `DrawText`/`DrawTextLayout` cannot be selected or copied | Implement custom selection tracking with pointer events and copy to clipboard via `DataPackage` |
| **Live regions** | Narrator cannot announce changes to drawn content | Use `AutomationPeer.RaiseAutomationEvent` or overlay a hidden XAML `TextBlock` with `AutomationProperties.LiveSetting` |

Other XAML features that do not apply to drawn content: tooltips, context menus, drag-and-drop, data binding, storyboard animations, and control templates. Implement these manually or overlay XAML elements when needed.

---

## 3. Basic rendering

### Shapes and text

```csharp
private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    var ds = args.DrawingSession;

    // Clear background
    ds.Clear(Colors.White);

    // Draw filled shapes
    ds.FillRectangle(20, 20, 200, 100, Colors.CornflowerBlue);
    ds.FillEllipse(300, 70, 80, 50, Colors.Coral);
    ds.FillRoundedRectangle(420, 20, 150, 100, 12, 12, Colors.MediumSeaGreen);

    // Draw outlines
    ds.DrawRectangle(20, 20, 200, 100, Colors.Navy, 2);
    ds.DrawLine(20, 150, 580, 150, Colors.Gray, 1);

    // Draw text
    ds.DrawText("Hello Win2D", 20, 170, Colors.Black);
}
```

### Using brushes

```csharp
private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    var ds = args.DrawingSession;

    // Linear gradient brush
    using var gradient = new CanvasLinearGradientBrush(sender, Colors.Blue, Colors.Cyan)
    {
        StartPoint = new Vector2(0, 0),
        EndPoint = new Vector2(400, 0)
    };
    ds.FillRectangle(20, 20, 400, 100, gradient);

    // Image brush for textured fills
    // (requires a CanvasBitmap loaded in CreateResources)
    using var imageBrush = new CanvasImageBrush(sender, loadedBitmap)
    {
        ExtendX = CanvasEdgeBehavior.Wrap,
        ExtendY = CanvasEdgeBehavior.Wrap
    };
    ds.FillEllipse(300, 200, 80, 80, imageBrush);
}
```

---

## 4. Lifecycle and CanvasDevice

### CreateResources — load GPU resources

Use the `CreateResources` event to load bitmaps and create GPU-dependent objects. This event fires when the control is first loaded and whenever the device is recovered after a loss:

```csharp
CanvasBitmap? texture;

private void OnCreateResources(CanvasControl sender, CanvasCreateResourcesEventArgs args)
{
    args.TrackAsyncAction(CreateResourcesAsync(sender).AsAsyncAction());
}

private async Task CreateResourcesAsync(CanvasControl sender)
{
    texture = await CanvasBitmap.LoadAsync(sender, new Uri("ms-appx:///Assets/texture.png"));
}
```

### Device lost handling

The GPU device can be lost at any time (driver update, hardware reset, resource exhaustion). Always handle this:

```csharp
public static T RunWithDeviceRecovery<T>(Func<CanvasDevice, T> action, int maxRetries = 3)
{
    for (int attempt = 0; attempt < maxRetries; attempt++)
    {
        var device = CanvasDevice.GetSharedDevice();
        try
        {
            return action(device);
        }
        catch (Exception ex) when (device.IsDeviceLost(ex.HResult))
        {
            device.RaiseDeviceLost();
        }
    }

    throw new InvalidOperationException($"GPU device could not be recovered after {maxRetries} attempts.");
}
```

### Disposal

Win2D controls hold GPU resources and **must** be explicitly cleaned up:

```csharp
private void Page_Unloaded(object sender, RoutedEventArgs e)
{
    canvasControl.RemoveFromVisualTree();
    canvasControl = null;

    // For CanvasSwapChainPanel, also dispose the swap chain
    swapChainPanel?.SwapChain?.Dispose();
    swapChainPanel?.RemoveFromVisualTree();
    swapChainPanel = null;
}
```

---

## 5. Performance patterns

### CanvasTextLayout — cached text measurement

Calling `DrawText` every frame recalculates layout each time. For repeated text, pre-create a `CanvasTextLayout`:

```csharp
private CanvasTextLayout? cachedLayout;

private void OnCreateResources(CanvasControl sender, CanvasCreateResourcesEventArgs args)
{
    var format = new CanvasTextFormat
    {
        FontSize = 24,
        FontFamily = "Segoe UI",
        WordWrapping = CanvasWordWrapping.Wrap
    };
    cachedLayout = new CanvasTextLayout(sender, "Cached text content", format, maxWidth: 400, maxHeight: 200)
    {
        TrimmingGranularity = CanvasTextTrimmingGranularity.Character,
        TrimmingSign = CanvasTrimmingSign.Ellipsis
    };
}

private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    args.DrawingSession.DrawTextLayout(cachedLayout, 20, 20, Colors.Black);
}
```

### CanvasRenderTarget — off-screen caching

Render complex sub-trees once to an off-screen surface, then draw the cached result each frame:

```csharp
private CanvasRenderTarget? cachedScene;

private void RebuildCache(ICanvasResourceCreator creator, float width, float height)
{
    cachedScene?.Dispose();
    cachedScene = new CanvasRenderTarget(creator, width, height);

    using var ds = cachedScene.CreateDrawingSession();
    ds.Clear(Colors.Transparent);
    // draw complex content once...
    ds.FillRectangle(0, 0, width, height, Colors.LightGray);
    ds.DrawText("Cached", 10, 10, Colors.Black);
}

private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    if (cachedScene != null)
        args.DrawingSession.DrawImage(cachedScene);
}
```

### CanvasSpriteBatch — mass rendering

When drawing thousands of identical or similar sprites, use `CanvasSpriteBatch` for a single GPU draw call:

```csharp
private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    using var batch = args.DrawingSession.CreateSpriteBatch(
        CanvasSpriteSortMode.None,
        CanvasImageInterpolation.Linear,
        CanvasSpriteOptions.ClampToSourceRect);

    var sourceRect = new Rect(0, 0, spriteSheet.SizeInPixels.Width, spriteSheet.SizeInPixels.Height);

    for (int i = 0; i < items.Count; i++)
    {
        var item = items[i];
        batch.DrawFromSpriteSheet(
            spriteSheet,
            new Rect(item.X, item.Y, item.Width, item.Height),
            sourceRect,
            new Vector4(item.R / 255f, item.G / 255f, item.B / 255f, item.Opacity));
    }
}
```

---

## 6. Custom shaders with ComputeSharp

Win2D supports custom GPU pixel shaders via the `ComputeSharp.D2D1.WinUI` package. This enables effects beyond the built-in set.

### Best practices

| Rule | Details |
|------|---------|
| **Struct shape** | Must be `readonly partial struct` implementing `ID2D1PixelShader` |
| **Required attributes** | Always add `[D2DInputCount(N)]`, `[D2DInputSimple(n)]` (or `[D2DInputComplex(n)]`), and `[D2DGeneratedPixelShaderDescriptor]` |
| **C# ⊂ HLSL** | Only the HLSL-compatible subset of C# is allowed in `Execute()` — no LINQ, no strings, no exceptions. Use `Hlsl.*` intrinsics for math |
| **Alpha handling** | Win2D uses pre-multiplied alpha internally; D2D shaders expect straight alpha. Always chain `UnPremultiplyEffect` → shader → `PremultiplyEffect` |
| **Effect graph registration** | Every node in a `CanvasEffect` graph must be registered (named or anonymous) so disposal is managed automatically |
| **Property invalidation** | Use `SetPropertyAndInvalidateEffectGraph` for property setters — never plain auto-properties |
| **Allocation** | Create `PixelShaderEffect<T>` once and reuse — do not allocate per frame |

Key references for custom shaders:
- [ComputeSharp wiki](https://github.com/Sergio0694/ComputeSharp/wiki) — full API docs and shader authoring guide
- [ComputeSharp GitHub](https://github.com/Sergio0694/ComputeSharp) — source, WinUI 3 sample app, and D2D1 pixel shader examples
- [Custom effects guide (MS Learn)](https://learn.microsoft.com/en-us/windows/apps/develop/win2d/custom-effects) — building `CanvasEffect` subclasses, effect graph registration, property invalidation

### Defining a pixel shader

Define a `readonly partial struct` implementing `ID2D1PixelShader` with a C# `Execute()` method. ComputeSharp transpiles the C# to HLSL at compile time:

```csharp
using ComputeSharp;
using ComputeSharp.D2D1;

[D2DInputCount(1)]
[D2DInputSimple(0)]
[D2DGeneratedPixelShaderDescriptor]
internal readonly partial struct GrayscaleShader : ID2D1PixelShader
{
    public float4 Execute()
    {
        float4 color = D2D.GetInput(0);
        float gray = Hlsl.Dot(color.RGB, new float3(0.299f, 0.587f, 0.114f));
        return new float4(gray, gray, gray, color.A);
    }
}
```

### Building the effect graph

Subclass `CanvasEffect` to wire the shader into an effect graph. Key rules:
- **Register every node** in the graph (named or anonymous) so disposal is managed automatically.
- Use `SetPropertyAndInvalidateEffectGraph` for property setters so the graph re-configures when inputs change.
- Chain through `UnPremultiplyEffect` → shader → `PremultiplyEffect` because Win2D uses pre-multiplied alpha internally, but D2D shaders expect straight alpha.

```csharp
using ComputeSharp.D2D1.WinUI;
using Microsoft.Graphics.Canvas;
using Microsoft.Graphics.Canvas.Effects;

public sealed class GrayscaleEffect : CanvasEffect
{
    private static readonly CanvasEffectNode<UnPremultiplyEffect> UnPremultiplyNode = new();
    private static readonly CanvasEffectNode<PixelShaderEffect<GrayscaleShader>> ShaderNode = new();

    private readonly UnPremultiplyEffect unpremultiply = new();
    private readonly PremultiplyEffect premultiply = new();
    private readonly PixelShaderEffect<GrayscaleShader> shader = new();

    private ICanvasImage? _source;

    public ICanvasImage? Source
    {
        get => _source;
        set => SetPropertyAndInvalidateEffectGraph(ref _source, value);
    }

    protected override void BuildEffectGraph(CanvasEffectGraph graph)
    {
        shader.Sources[0] = unpremultiply;
        premultiply.Source = shader;

        graph.RegisterNode(UnPremultiplyNode, unpremultiply);
        graph.RegisterNode(ShaderNode, shader);
        graph.RegisterOutputNode(premultiply);
    }

    protected override void ConfigureEffectGraph(CanvasEffectGraph graph)
    {
        graph.GetNode(UnPremultiplyNode).Source = _source;
    }
}
```

### Using the effect

Create the effect once and reuse it — do not allocate a new instance per frame:

```csharp
private GrayscaleEffect? grayscaleEffect;

private void OnCreateResources(CanvasControl sender, CanvasCreateResourcesEventArgs args)
{
    grayscaleEffect = new GrayscaleEffect();
}

private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    grayscaleEffect!.Source = loadedBitmap;
    args.DrawingSession.DrawImage(grayscaleEffect, 0, 0);
}
```

---

## 7. Other interop

### Composition API

Win2D surfaces can be used with `Microsoft.UI.Composition` for advanced animation and effects outside the canvas:

```csharp
using Microsoft.Graphics.Canvas.UI.Composition;
using Microsoft.UI.Xaml.Hosting;

// Obtain the compositor from a XAML element (WinUI 3 pattern)
var visual = ElementCompositionPreview.GetElementVisual(myElement);
var compositor = visual.Compositor;

var compositionDevice = CanvasComposition.CreateCompositionGraphicsDevice(
    compositor, CanvasDevice.GetSharedDevice());

var surface = compositionDevice.CreateDrawingSurface(
    new Size(400, 300), DirectXPixelFormat.B8G8R8A8UIntNormalized, DirectXAlphaMode.Premultiplied);

using (var ds = CanvasComposition.CreateDrawingSession(surface))
{
    ds.Clear(Colors.Transparent);
    ds.FillRectangle(0, 0, 400, 300, Colors.SkyBlue);
}
```

### Printing

Use `CanvasPrintDocument` to set up the document content. This example shows the Win2D document setup only — you must also register a `PrintTask` via the WinUI 3 print manager interop to trigger actual printing. See the [Win2D printing sample](https://github.com/Microsoft/Win2D-Samples) for the full registration flow.

```csharp
var printDoc = new CanvasPrintDocument();
printDoc.PrintTaskOptionsChanged += (sender, args) =>
{
    sender.SetPageCount(1);
};
printDoc.Print += (sender, args) =>
{
    using var ds = args.CreateDrawingSession();
    ds.DrawText("Printed from Win2D", 100, 100, Colors.Black);
};
```

### SVG

Load and render vector graphics with `CanvasSvgDocument`:

```csharp
CanvasSvgDocument? svgDoc;

private async Task LoadSvgAsync(ICanvasResourceCreator creator)
{
    var file = await StorageFile.GetFileFromApplicationUriAsync(new Uri("ms-appx:///Assets/icon.svg"));
    using var stream = await file.OpenReadAsync();
    svgDoc = await CanvasSvgDocument.LoadAsync(creator, stream);
}

private void OnCanvasDraw(CanvasControl sender, CanvasDrawEventArgs args)
{
    if (svgDoc != null)
        args.DrawingSession.DrawSvg(svgDoc, new Size(200, 200));
}
```

---

## Common Pitfalls

| Mistake | Fix |
|---------|-----|
| Not disposing `CanvasControl` on page unload | Call `RemoveFromVisualTree()` in `Page.Unloaded`; set the control reference to `null` |
| Calling `DrawText` every frame with the same string | Pre-create a `CanvasTextLayout` and call `DrawTextLayout` instead |
| Ignoring device lost exceptions | Wrap device operations with `IsDeviceLost` check and retry after `RaiseDeviceLost` |
| Creating `CanvasRenderTarget` every frame | Create once, cache, and only recreate when size or content changes |
| Forgetting pre-multiplied alpha in custom shaders | Chain through `UnPremultiplyEffect` → shader → `PremultiplyEffect` |
| Drawing thousands of items with individual draw calls | Use `CanvasSpriteBatch` for batch rendering |
| Using Win2D without accessibility fallbacks | Add `AutomationPeer` or overlay invisible XAML elements for screen reader content |
| Not handling theme changes | Subscribe to `ActualThemeChanged` and update drawing colors |

### Verification Checklist

- [ ] `Microsoft.Graphics.Win2D` NuGet package is referenced in the project
- [ ] Win2D controls are disposed in the page `Unloaded` event via `RemoveFromVisualTree()`
- [ ] GPU resources (bitmaps, render targets, text layouts) are created in `CreateResources`, not in `Draw`
- [ ] Device lost is handled with retry logic when using `CanvasDevice` directly
- [ ] `CanvasTextLayout` is used instead of `DrawText` for repeated text
- [ ] `CanvasRenderTarget` caching is used for complex sub-trees that don't change every frame
- [ ] Custom shaders use the UnPremultiply → Shader → Premultiply chain for correct alpha
- [ ] Custom effect properties use `SetPropertyAndInvalidateEffectGraph` — never plain auto-properties
- [ ] Accessibility is addressed: either `AutomationPeer` is implemented or invisible XAML overlays provide screen reader content (see the **accessibility** skill for full guidance)
- [ ] Theme changes are handled: colors update when light/dark mode switches

## Must Read & Research

> **Agent Rule:** Before generating Win2D code — especially custom shaders or Composition API interop — you **must** fetch and review the relevant references below using `fetch_webpage`. Apply what you learn — do not guess API shapes from memory alone.

| # | Reference | When to consult |
|---|-----------|-----------------|
| 1 | [Win2D documentation (WinUI 3)](https://microsoft.github.io/Win2D/WinUI3/html/Introduction.htm) | Any Win2D feature — verify API signatures and behavior |
| 2 | [Win2D GitHub repository](https://github.com/Microsoft/Win2D) | Source code, issues, latest changes |
| 3 | [Win2D samples (WinUI 3)](https://github.com/Microsoft/Win2D-Samples) | Working examples for all Win2D features — search before implementing |
| 4 | [ComputeSharp GitHub](https://github.com/Sergio0694/ComputeSharp) | Custom shader API, `CanvasEffect`, `D2DGeneratedPixelShaderDescriptor` usage |
| 5 | [Custom effects guide (Microsoft)](https://learn.microsoft.com/en-us/windows/apps/develop/win2d/custom-effects) | Building `CanvasEffect` subclasses, effect graph registration, property invalidation |
| 6 | [CanvasControl reference](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasControl.htm) | CanvasControl API details, events, properties |
| 7 | [CanvasAnimatedControl reference](https://microsoft.github.io/Win2D/WinUI3/html/T_Microsoft_Graphics_Canvas_UI_Xaml_CanvasAnimatedControl.htm) | Game loop, Update/Draw events, TargetElapsedTime |
| 8 | [Win2D on Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/develop/win2d/) | General overview, tutorials, and getting-started guidance |
