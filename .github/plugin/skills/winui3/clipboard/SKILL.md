---
name: clipboard
description: 'Clipboard operations for WinUI 3 apps — copy, paste, format handling, and clipboard monitoring. Use when implementing clipboard interactions.'
---

# Clipboard Integration for WinUI 3

Implement clipboard copy, paste, format handling, and monitoring in Windows App SDK / WinUI 3 desktop applications using `Windows.ApplicationModel.DataTransfer`.

---

## Rules

### Copy to Clipboard

Use `DataPackage` to set content, then `Clipboard.SetContent()` to push it:

```csharp
using Windows.ApplicationModel.DataTransfer;

// Text
var package = new DataPackage();
package.SetText("Hello, clipboard!");
Clipboard.SetContent(package);

// HTML (always include plain text fallback)
var htmlPkg = new DataPackage();
htmlPkg.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat("<b>Bold</b>"));
htmlPkg.SetText("Bold");
Clipboard.SetContent(htmlPkg);

// Bitmap
var bmpPkg = new DataPackage();
bmpPkg.SetBitmap(RandomAccessStreamReference.CreateFromUri(new Uri("ms-appx:///Assets/img.png")));
Clipboard.SetContent(bmpPkg);

// Files
var filePkg = new DataPackage();
var file = await StorageFile.GetFileFromPathAsync(@"C:\Users\Public\example.txt");
filePkg.SetStorageItems(new[] { file });
Clipboard.SetContent(filePkg);
```

### Paste from Clipboard

Retrieve content with `Clipboard.GetContent()` returning a `DataPackageView`. Check `Contains()` before accessing — retrieval is async:

```csharp
var view = Clipboard.GetContent();

if (view.Contains(StandardDataFormats.Text))
{
    string text = await view.GetTextAsync();
    MyTextBox.Text = text;
}
if (view.Contains(StandardDataFormats.Bitmap))
{
    var bitmapRef = await view.GetBitmapAsync();
    using var stream = await bitmapRef.OpenReadAsync();
    var bitmap = new BitmapImage();
    await bitmap.SetSourceAsync(stream);
    MyImage.Source = bitmap;
}
if (view.Contains(StandardDataFormats.StorageItems))
{
    var items = await view.GetStorageItemsAsync();
    foreach (var item in items) { /* process file */ }
}
```

### Format Handling

Use `StandardDataFormats` for built-in types and `SetData`/`GetDataAsync` for custom formats:

```csharp
// Copy with custom format
var package = new DataPackage();
package.SetData("MyApp.CustomFormat", mySerializedObject);
Clipboard.SetContent(package);

// Paste custom format
var view = Clipboard.GetContent();
if (view.Contains("MyApp.CustomFormat"))
    var data = await view.GetDataAsync("MyApp.CustomFormat");
```

Standard format constants: `StandardDataFormats.Text`, `.Html`, `.Rtf`, `.Bitmap`, `.StorageItems`, `.Uri`.

### Rich Content with Multiple Formats

Set multiple formats on a `DataPackage` so paste targets choose the best one:

```csharp
var package = new DataPackage();
package.SetText("Summary: Q3 revenue grew 12%");
package.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat(
    "<table><tr><td>Q3 Revenue</td><td>+12%</td></tr></table>"));
package.SetRtf(@"{\rtf1 Summary: Q3 revenue grew 12%}");
Clipboard.SetContent(package);
```

### Clipboard Changed Event

Monitor clipboard changes with `Clipboard.ContentChanged`. Dispatch UI updates via `DispatcherQueue`:

```csharp
Clipboard.ContentChanged += async (s, e) =>
{
    var view = Clipboard.GetContent();
    if (view.Contains(StandardDataFormats.Text))
    {
        string text = await view.GetTextAsync();
        DispatcherQueue.TryEnqueue(() =>
        {
            ClipboardPreviewText.Text = text;
        });
    }
};
```

### Clipboard History

Access clipboard history. Requires the `clipboardHistory` capability in the app manifest:

```csharp
var result = await Clipboard.GetHistoryItemsAsync();
if (result.Status == ClipboardHistoryItemsResultStatus.Success)
{
    foreach (var item in result.Items)
    {
        if (item.Content.Contains(StandardDataFormats.Text))
        {
            string text = await item.Content.GetTextAsync();
        }
    }
}
```

### Error Handling

`Clipboard.SetContent` throws when the clipboard is locked by another app. Use a retry pattern:

```csharp
public static async Task<bool> TrySetClipboardContentAsync(DataPackage package, int maxRetries = 3)
{
    for (int i = 0; i < maxRetries; i++)
    {
        try
        {
            Clipboard.SetContent(package);
            Clipboard.Flush();
            return true;
        }
        catch (Exception ex) when (ex.HResult == unchecked((int)0x800401D0))
        {
            if (i < maxRetries - 1) await Task.Delay(100 * (i + 1));
        }
    }
    return false;
}
```

Call `Clipboard.Flush()` after `SetContent` when data must persist after app exit.

## Anti-patterns

- ❌ **Accessing data without checking format** — calling `GetTextAsync()` without `Contains(StandardDataFormats.Text)` first throws an exception.
- ❌ **Synchronous clipboard access on the UI thread** — `GetTextAsync`, `GetBitmapAsync`, and other retrieval methods are async; blocking on them freezes the UI.
- ❌ **Ignoring clipboard lock exceptions** — another app may hold the clipboard open; always handle or retry `CLIPBRD_E_CANT_OPEN`.
- ❌ **Exposing sensitive data without user intent** — never copy passwords, tokens, or PII to the clipboard programmatically unless the user explicitly requested it. Consider clearing sensitive data after a timeout.
- ❌ **Forgetting `Clipboard.Flush()`** — without `Flush()`, clipboard content is lost when the source app closes.

## Validation

### Verification Checklist

1. ✅ Every `GetTextAsync` / `GetBitmapAsync` / `GetStorageItemsAsync` call is preceded by a `Contains()` check for the matching `StandardDataFormats` value.
2. ✅ `Clipboard.SetContent()` calls are wrapped in try/catch handling `CLIPBRD_E_CANT_OPEN` (HResult `0x800401D0`).
3. ✅ `Clipboard.Flush()` is called when clipboard data must survive app exit.
4. ✅ `Clipboard.ContentChanged` handlers dispatch UI updates via `DispatcherQueue.TryEnqueue`.
5. ✅ Multi-format `DataPackage` includes a plain-text fallback alongside rich formats (HTML, RTF, bitmap).
6. ✅ Sensitive data copied to clipboard is cleared after a reasonable timeout or on app suspension.

## Must Read & Research

- [Clipboard — Windows App SDK](https://learn.microsoft.com/en-us/windows/apps/design/input/clipboard)
- [DataPackage Class — WinRT API](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.datatransfer.datapackage)
- [DataPackageView Class — WinRT API](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.datatransfer.datapackageview)
- [StandardDataFormats Class — WinRT API](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.datatransfer.standarddataformats)
- [Clipboard.GetHistoryItemsAsync — WinRT API](https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.datatransfer.clipboard.gethistoryitemsasync)

---

## Related Skills

- **drag-and-drop** — both use `DataPackage` for data transfer
