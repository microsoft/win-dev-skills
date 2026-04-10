# Imaging API Migration: WPF → WinUI 3

## Critical: PresentationCore.dll is Incompatible with WinUI

WPF imaging (`System.Windows.Media.Imaging`) lives in `PresentationCore.dll`. Referencing this assembly in a WinUI 3 project **crashes the XAML compiler** (`XamlCompiler.exe`) silently — builds appear to succeed but produce broken output, or fail with cryptic errors.

This is not a build configuration problem. The WPF and WinUI XAML compilers are fundamentally different runtimes that cannot coexist in the same project. Do not attempt workarounds like `<UseWPF>true</UseWPF>`, conditional references, or multi-targeting.

**Solution:** Replace ALL WPF imaging code with `Windows.Graphics.Imaging` (WinRT) APIs before porting any XAML.

## API Mapping

### Encoding / Saving Images

| WPF | WinUI 3 (WinRT) |
|-----|-----------------|
| `JpegBitmapEncoder` | `BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, stream)` |
| `PngBitmapEncoder` | `BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream)` |
| `TiffBitmapEncoder` | `BitmapEncoder.CreateAsync(BitmapEncoder.TiffEncoderId, stream)` |
| `BmpBitmapEncoder` | `BitmapEncoder.CreateAsync(BitmapEncoder.BmpEncoderId, stream)` |
| `GifBitmapEncoder` | `BitmapEncoder.CreateAsync(BitmapEncoder.GifEncoderId, stream)` |
| `encoder.Frames.Add(frame)` | `encoder.SetSoftwareBitmap(softwareBitmap)` |
| `encoder.Save(stream)` | `await encoder.FlushAsync()` |
| `encoder.QualityLevel = 85` (int 1-100) | `new BitmapPropertySet { { "ImageQuality", new BitmapTypedValue(0.85f, PropertyType.Single) } }` (float 0.0-1.0) |

### Decoding / Loading Images

| WPF | WinUI 3 (WinRT) |
|-----|-----------------|
| `new BitmapImage(uri)` | `new BitmapImage(uri)` (Microsoft.UI.Xaml.Media.Imaging — for XAML display only) |
| `BitmapDecoder.Create(stream)` | `await BitmapDecoder.CreateAsync(stream)` |
| `decoder.Frames[0]` | `await decoder.GetSoftwareBitmapAsync()` |
| `BitmapFrame.Create(source)` | `await decoder.GetFrameAsync(0)` |
| `FormatConvertedBitmap` | `SoftwareBitmap.Convert(bitmap, BitmapPixelFormat.Bgra8)` |

### Pixel Manipulation

| WPF | WinUI 3 (WinRT) |
|-----|-----------------|
| `WriteableBitmap.BackBuffer` | `SoftwareBitmap` + `BitmapBuffer` with `CreateReference()` |
| `bitmap.Lock()` / `Unlock()` | `using (var ref = buffer.CreateReference()) { ... }` |
| `CopyPixels()` | `bitmap.CopyToBuffer()` / `bitmap.CopyFromBuffer()` |
| Pixel dimensions: `int` | Pixel dimensions: `uint` (WinRT uses unsigned) |

### Metadata

| WPF | WinUI 3 (WinRT) |
|-----|-----------------|
| `BitmapMetadata` | `BitmapPropertySet` via `encoder.BitmapProperties` |
| `metadata.SetQuery("/app1/ifd/{ushort=274}", value)` | `await properties.SetPropertiesAsync(new BitmapPropertySet { ... })` |
| `metadata.Clone()` | No direct clone — read properties and set on new encoder |

### Key Differences

| Aspect | WPF | WinRT |
|--------|-----|-------|
| Threading | Synchronous | **Async** (`await` everywhere) |
| Quality values | `int` 1-100 | `float` 0.0-1.0 |
| Pixel sizes | `int` | `uint` (add `u` suffix in tests) |
| Stream type | `System.IO.Stream` | `IRandomAccessStream` (use `stream.AsRandomAccessStream()`) |
| Encoder creation | `new JpegBitmapEncoder()` | `await BitmapEncoder.CreateAsync(JpegEncoderId, stream)` |
| Frame model | `encoder.Frames.Add()` | `encoder.SetSoftwareBitmap()` |

### Common Patterns

**Resize an image (WinRT):**
```csharp
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

async Task ResizeImage(string inputPath, string outputPath, uint width, uint height)
{
    using var inputStream = File.OpenRead(inputPath).AsRandomAccessStream();
    var decoder = await BitmapDecoder.CreateAsync(inputStream);
    
    using var outputStream = File.Create(outputPath).AsRandomAccessStream();
    var encoder = await BitmapEncoder.CreateForTranscodingAsync(outputStream, decoder);
    
    encoder.BitmapTransform.ScaledWidth = width;
    encoder.BitmapTransform.ScaledHeight = height;
    encoder.BitmapTransform.InterpolationMode = BitmapInterpolationMode.Fant;
    
    await encoder.FlushAsync();
}
```

**Save with JPEG quality (WinRT):**
```csharp
var propertySet = new BitmapPropertySet
{
    { "ImageQuality", new BitmapTypedValue(0.85f, Windows.Foundation.PropertyType.Single) }
};
var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, stream, propertySet);
encoder.SetSoftwareBitmap(softwareBitmap);
await encoder.FlushAsync();
```

**Convert between formats:**
```csharp
// Use transcoding encoder for format conversion
using var inputStream = File.OpenRead(input).AsRandomAccessStream();
var decoder = await BitmapDecoder.CreateAsync(inputStream);

using var outputStream = File.Create(output).AsRandomAccessStream();
// Change the encoder ID to change format
var encoder = await BitmapEncoder.CreateForTranscodingAsync(outputStream, decoder);
await encoder.FlushAsync();
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| XAML compiler crashes silently | Remove ALL references to `PresentationCore.dll` and `System.Windows.Media.Imaging` |
| `int` vs `uint` type mismatch | WinRT uses `uint` for pixel dimensions — cast or use `u` suffix |
| `Stream` not accepted | Use `.AsRandomAccessStream()` extension to convert `System.IO.Stream` → `IRandomAccessStream` |
| Quality value wrong | WPF uses int 1-100, WinRT uses float 0.0-1.0 — divide by 100 |
| `async` required everywhere | WinRT imaging is fully async — wrap in `async Task` methods |
| Missing namespace | Add `using Windows.Graphics.Imaging;` and `using Windows.Storage.Streams;` |
