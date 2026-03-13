---
name: drag-and-drop
description: 'Drag and drop support for WinUI 3 apps — drag sources, drop targets, visual feedback, and file handling. Use when implementing drag-and-drop interactions.'
---

# Drag and Drop in WinUI 3

Implement drag-and-drop interactions in WinUI 3 desktop apps using `UIElement` drag/drop APIs, `DataPackage` for data transfer, and `DragUI` for visual feedback. Covers drop targets, drag sources, file handling, ListView reordering, and cross-app scenarios.

---

## Rules

### Simple List Reordering

Enable in-place reorder by setting `CanReorderItems` and `AllowDrop` on a `ListView` or `GridView`:

```xml
<ListView ItemsSource="{x:Bind Items}"
          CanReorderItems="True"
          AllowDrop="True" />
```

No additional code-behind is needed for basic reorder — the items collection is updated automatically when the source is an `ObservableCollection<T>`.

### Drop Targets

Set `AllowDrop="True"` on the target element. Handle `DragOver` to accept operations and `Drop` to process data:

```xml
<Border AllowDrop="True"
        DragOver="Target_DragOver"
        Drop="Target_Drop"
        Width="300" Height="200">
    <TextBlock x:Name="DropStatus" Text="Drop files here" HorizontalAlignment="Center" VerticalAlignment="Center"/>
</Border>
```

```csharp
private void Target_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Copy;
    e.DragUIOverride.Caption = "Drop to add";
    e.DragUIOverride.IsCaptionVisible = true;
    e.DragUIOverride.IsGlyphVisible = true;
}

private async void Target_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.Text))
    {
        string text = await e.DataView.GetTextAsync();
        DropStatus.Text = text;
    }
}
```

### Drag Sources

Set `CanDrag="True"` and handle `DragStarting` to populate the `DataPackage`:

```xml
<TextBlock Text="Drag me" CanDrag="True" DragStarting="Source_DragStarting"/>
```

```csharp
private void Source_DragStarting(UIElement sender, DragStartingEventArgs args)
{
    args.Data.SetText("Hello from drag source");
    args.Data.RequestedOperation = DataPackageOperation.Copy;
}
```

`DataPackage` supports multiple formats — set text, HTML, URIs, bitmaps, or storage items on the same package for maximum interop.

### File Drag-Drop

Use `GetStorageItemsAsync()` to receive files dropped from Explorer or other apps:

```csharp
private void FileDrop_DragOver(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
        e.DragUIOverride.Caption = "Drop files";
    }
    else
    {
        e.AcceptedOperation = DataPackageOperation.None;
    }
}

private async void FileDrop_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is StorageFile file)
            {
                // Process file asynchronously — never block here
                var contents = await FileIO.ReadTextAsync(file);
                ProcessFileContents(file.Name, contents);
            }
        }
    }
}
```

### Visual Feedback

Customize drag visuals via `DragUIOverride` in `DragOver` or `DragUI` in `DragStarting`:

```csharp
private void Target_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Move;
    e.DragUIOverride.Caption = "Move here";
    e.DragUIOverride.IsContentVisible = true;
    e.DragUIOverride.SetContentFromBitmapImage(new BitmapImage(new Uri("ms-appx:///Assets/drop-icon.png")));
}
```

Use `AcceptedOperation` values intentionally: `Copy`, `Move`, `Link`, or `None` to reject.

### ListView and GridView Reordering

Enable built-in reorder with `CanReorderItems` and `AllowDrop`. Add `CanDragItems="True"` only when items need to be dragged **out** of the list to other drop targets — omit it for simple in-place reorder:

```xml
<ListView ItemsSource="{x:Bind Items}"
          CanReorderItems="True"
          CanDragItems="True"
          AllowDrop="True"
          DragItemsStarting="ListView_DragItemsStarting"
          DragItemsCompleted="ListView_DragItemsCompleted"/>
```

```csharp
private void ListView_DragItemsStarting(object sender, DragItemsStartingEventArgs e)
{
    // Optionally restrict which items can be dragged
    if (e.Items.FirstOrDefault() is MyItem item && !item.IsDraggable)
    {
        e.Cancel = true;
    }
}

private void ListView_DragItemsCompleted(ListViewBase sender, DragItemsCompletedEventArgs args)
{
    // Persist new order after reorder completes
    SaveItemOrder(Items.ToList());
}
```

### Cross-App Drag-Drop

Use `StandardDataFormats` for interop with other apps. Set multiple formats so the receiver can pick the best one:

```csharp
private void CrossApp_DragStarting(UIElement sender, DragStartingEventArgs args)
{
    args.Data.SetText("Plain text fallback");
    args.Data.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat("<b>Rich content</b>"));
    args.Data.SetUri(new Uri("https://example.com/item/42"));
    args.Data.RequestedOperation = DataPackageOperation.Copy;
}
```

### Custom Drag Visuals

Set a custom bitmap as the drag visual in `DragStarting`:

```csharp
private void CustomVisual_DragStarting(UIElement sender, DragStartingEventArgs args)
{
    args.Data.SetText("Custom visual drag");
    args.DragUI.SetContentFromBitmapImage(
        new BitmapImage(new Uri("ms-appx:///Assets/drag-preview.png")));
}
```

For dynamic visuals, render to a `SoftwareBitmap` and call `DragUI.SetContentFromSoftwareBitmap()`.

---

## Anti-patterns

- **Missing `AcceptedOperation` in `DragOver`** — without it the drop target rejects all drops and shows the "not allowed" cursor. Always set `e.AcceptedOperation` explicitly.
- **Blocking the UI thread in `Drop`** — file I/O and network calls must be `await`ed, not run synchronously. Mark the handler `async void` and `await` every async call.
- **Forgetting `AllowDrop="True"` on the target** — `DragOver` and `Drop` events never fire without this property.
- **Not handling async file access** — `GetStorageItemsAsync()` returns a deferred result. Failing to `await` it causes silent failures or crashes.
- **Using `DragEnter` instead of `DragOver` for acceptance** — `DragOver` fires continuously while hovering; use it for `AcceptedOperation`. `DragEnter` fires only once on entry.

---

## Validation

### Verification Checklist

1. Every drop target element has `AllowDrop="True"` set in XAML or code-behind.
2. `DragOver` handler sets `e.AcceptedOperation` to an appropriate `DataPackageOperation` value.
3. `Drop` handler checks `e.DataView.Contains()` before calling `Get*Async()` methods.
4. All `Get*Async()` calls in `Drop` are properly `await`ed in an `async void` handler.
5. File drops use `GetStorageItemsAsync()` and verify each item type before processing.
6. ListView/GridView reorder sets both `CanReorderItems="True"` and `AllowDrop="True"`.
7. Custom drag visuals use `DragUI` methods in `DragStarting`, not in `DragOver`.

---

## Must Read & Research

- [Drag and drop overview — Windows App SDK](https://learn.microsoft.com/en-us/windows/apps/design/input/drag-and-drop)
- [UIElement.AllowDrop Property — WinUI 3 API reference](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.uielement.allowdrop)
- [DataPackage Class — WinRT API reference](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.datatransfer.datapackage)
- [ListView reordering — Windows App SDK samples](https://github.com/microsoft/WinUI-Gallery)
- [DragStartingEventArgs.DragUI — WinUI 3 API reference](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.dragstartingeventargs.dragui)

---

## Related Skills

- **clipboard** — both use `DataPackage` for data transfer
