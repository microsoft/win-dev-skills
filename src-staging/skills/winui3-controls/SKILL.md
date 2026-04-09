---
name: winui3-controls
description: "Custom controls, context menus, keyboard shortcuts, drag-and-drop, clipboard, and composition animations for WinUI 3. Use when building reusable UserControls or TemplatedControls, adding right-click menus, keyboard accelerators, drag-drop interactions, clipboard support, or implicit animations."
---

### UserControl vs TemplatedControl

| Feature | UserControl | TemplatedControl |
|---------|-------------|------------------|
| XAML visual tree | Fixed in .xaml file | Defined in `Generic.xaml`, replaceable |
| DependencyProperties | Optional | Required for all external state |
| Best for | App-specific composite UI | Reusable library controls |
| Complexity | Low | High |

**Rule of thumb:** Use `UserControl` unless you need the control to be re-templated by consumers.

### DependencyProperty Pattern

```csharp
public sealed partial class StatusIndicator : UserControl
{
    public static readonly DependencyProperty StatusProperty =
        DependencyProperty.Register(
            nameof(Status), typeof(string), typeof(StatusIndicator),
            new PropertyMetadata(string.Empty, OnStatusChanged));

    public string Status
    {
        get => (string)GetValue(StatusProperty);
        set => SetValue(StatusProperty, value);
    }

    private static void OnStatusChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        var control = (StatusIndicator)d;
        // React to property change
    }
}
```
- Always use `nameof()` for property name
- PropertyMetadata callback is optional — only add when you need side effects
- Register once per type (static readonly field)

### Context Menus

#### MenuFlyout (simple right-click)
```xml
<ListView>
    <ListView.ContextFlyout>
        <MenuFlyout>
            <MenuFlyoutItem Text="Copy" Command="{x:Bind ViewModel.CopyCommand}"
                            Icon="{ui:FontIcon Glyph=&#xE8C8;}"
                            KeyboardAccelerators="{x:Bind CreateCtrlC()}" />
            <MenuFlyoutItem Text="Delete" Command="{x:Bind ViewModel.DeleteCommand}"
                            Icon="{ui:FontIcon Glyph=&#xE74D;}" />
        </MenuFlyout>
    </ListView.ContextFlyout>
</ListView>
```

#### CommandBarFlyout (rich toolbar on right-click)
Use when you need primary + secondary commands (like a mini toolbar). Set `ShowMode="Transient"` for right-click behavior.

### Keyboard Accelerators

```xml
<Page.KeyboardAccelerators>
    <KeyboardAccelerator Key="S" Modifiers="Control"
                         Invoked="SaveAccelerator_Invoked" />
    <KeyboardAccelerator Key="N" Modifiers="Control"
                         Invoked="NewAccelerator_Invoked" />
</Page.KeyboardAccelerators>
```
Attach to `Page` or `NavigationView`, **not** `Window` (Window is not a UIElement). Common shortcuts: Ctrl+S (save), Ctrl+N (new), Ctrl+Z (undo), F5 (refresh), Delete (remove).

### Drag-and-Drop

#### Enable drop on a target
```xml
<Border AllowDrop="True"
        DragOver="Border_DragOver"
        Drop="Border_Drop"
        Background="Transparent">
```

#### Handle in code-behind
```csharp
private void Border_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Copy;
    e.DragUIOverride.Caption = "Drop file here";
}

private async void Border_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is StorageFile file)
                ViewModel.AddFile(file.Path);
        }
    }
}
```
- Set `Background="Transparent"` on drop target — invisible elements don't receive drag events
- Use `DataPackageOperation.Copy` or `.Move` to indicate intent
- Always check `DataView.Contains()` before accessing data

### Clipboard

```csharp
// Copy to clipboard
var dataPackage = new DataPackage();
dataPackage.SetText(textToCopy);
Clipboard.SetContent(dataPackage);
Clipboard.Flush(); // Persist after app exit

// Read from clipboard
var content = Clipboard.GetContent();
if (content.Contains(StandardDataFormats.Text))
{
    var text = await content.GetTextAsync();
}

// Monitor changes
Clipboard.ContentChanged += (s, e) => { /* react */ };
```
Call `Flush()` if the data should persist after the app exits.

### Composition Animations

#### Implicit Animations (recommended)
```csharp
var compositor = ElementCompositionPreview.GetElementVisual(element).Compositor;
var animation = compositor.CreateVector3KeyFrameAnimation();
animation.InsertExpressionKeyFrame(1.0f, "this.FinalValue");
animation.Duration = TimeSpan.FromMilliseconds(300);

var group = compositor.CreateImplicitAnimationCollection();
group["Offset"] = animation;
ElementCompositionPreview.GetElementVisual(element).ImplicitAnimations = group;
```

#### ThemeShadow
```xml
<Border Translation="0,0,32"
        CornerRadius="{StaticResource OverlayCornerRadius}">
    <Border.Shadow>
        <ThemeShadow />
    </Border.Shadow>
    <!-- Content -->
</Border>
```
Add 12px padding on parent to prevent shadow clipping. Prefer `ThemeShadow` over composition drop shadows.

### References

For detailed patterns, see `references/` directory.