# Interop Patterns — Detailed Reference

Detailed patterns for Win32 interop, CsWin32, P/Invoke, COM, and WinRT bridging in WinUI 3.

---

## Window Handle (HWND) Interop

Every WinUI 3 app needs HWND access for file pickers, dialogs, and Win32 APIs. Always retrieve the handle through `WindowNative`:

```csharp
using WinRT.Interop;

// Get HWND from a WinUI 3 Window
IntPtr hwnd = WindowNative.GetWindowHandle(this);

// Initialize a picker with the window handle
var picker = new FileOpenPicker();
InitializeWithWindow.Initialize(picker, hwnd);
var file = await picker.PickSingleFileAsync();
```

Cache the HWND at window creation if you call Win32 APIs frequently. Never store it across window lifetimes.

---

## CsWin32 Source Generator

Use `Microsoft.Windows.CsWin32` to generate type-safe P/Invoke wrappers automatically instead of writing them by hand.

**Setup:**

```xml
<!-- .csproj -->
<PackageReference Include="Microsoft.Windows.CsWin32" Version="0.3.*">
  <PrivateAssets>all</PrivateAssets>
</PackageReference>
```

Add a `NativeMethods.txt` file at the project root listing the functions you need:

```text
FlashWindowEx
SetWindowPos
Shell_NotifyIcon
ReadDirectoryChangesW
RegGetValue
```

**Usage:**

```csharp
using Windows.Win32;
using Windows.Win32.UI.WindowsAndMessaging;

var flashInfo = new FLASHWINFO
{
    cbSize = (uint)Marshal.SizeOf<FLASHWINFO>(),
    hwnd = (Windows.Win32.Foundation.HWND)hwnd,
    dwFlags = FLASHWINFO_FLAGS.FLASHW_ALL,
    uCount = 3,
    dwTimeout = 0
};
PInvoke.FlashWindowEx(in flashInfo);
```

### Common Win32 APIs via CsWin32

Add these to `NativeMethods.txt` and call through the generated `PInvoke` class:

- **Set window position:** `PInvoke.SetWindowPos(hwnd, …, SWP_NOMOVE | SWP_NOSIZE)`
- **System tray icon:** `PInvoke.Shell_NotifyIcon(NIM_ADD, ref notifyData)`
- **File system watcher (low-level):** `PInvoke.ReadDirectoryChangesW(…)`
- **Registry access:** `PInvoke.RegGetValue(…)` — prefer `Microsoft.Win32.Registry` for simple reads
- **Flash taskbar:** `PInvoke.FlashWindowEx(in flashInfo)` as shown above

---

## Manual P/Invoke

When CsWin32 does not cover an API, declare the import manually. Prefer `LibraryImport` (.NET 7+) over `DllImport` for AOT compatibility:

```csharp
// Preferred — AOT-compatible, source-generated marshaling
[LibraryImport("user32.dll", SetLastError = true)]
[return: MarshalAs(UnmanagedType.Bool)]
private static partial bool ShowWindow(IntPtr hWnd, int nCmdShow);

// Legacy — avoid in new code
[DllImport("user32.dll", SetLastError = true)]
private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
```

For string parameters, specify marshaling explicitly:

```csharp
[LibraryImport("user32.dll", StringMarshalling = StringMarshalling.Utf16, SetLastError = true)]
private static partial int MessageBox(IntPtr hWnd, string text, string caption, uint type);
```

---

## COM Interop Patterns

Several WinUI 3 APIs require COM interop interfaces to associate with a window.

**File Pickers — `IInitializeWithWindow`:**

```csharp
var picker = new FolderPicker();
InitializeWithWindow.Initialize(picker, hwnd);
var folder = await picker.PickSingleFolderAsync();
```

**Share Contract — `IDataTransferManagerInterop`:**

```csharp
var interop = DataTransferManager.As<IDataTransferManagerInterop>();
Guid riid = typeof(DataTransferManager).GetInterface("IDataTransferManager")!.GUID;
var manager = DataTransferManager.FromAbi(interop.GetForWindow(hwnd, riid));
interop.ShowShareUIForWindow(hwnd);
```

**Print Manager — `IPrintManagerInterop`:**

```csharp
var interop = PrintManager.As<IPrintManagerInterop>();
Guid riid = new Guid("ff2a5b5f-1b7f-483b-962d-ffc1fc11bba3");
var printManager = PrintManager.FromAbi(interop.GetForWindow(hwnd, riid));
```

Always release COM references when done. Use `Marshal.ReleaseComObject` or wrap in `using` scopes where possible.

---

## WinRT Interop (AppWindow)

Bridge between Win32 handles and WinRT types using `Microsoft.UI.Win32Interop`:

```csharp
using Microsoft.UI;
using Microsoft.UI.Windowing;

IntPtr hwnd = WindowNative.GetWindowHandle(this);
WindowId windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
AppWindow appWindow = AppWindow.GetFromWindowId(windowId);

// Configure the title bar, size, position via AppWindow
appWindow.Title = "My App";
appWindow.Resize(new Windows.Graphics.SizeInt32(1200, 800));

// Icon interop
IconId iconId = Win32Interop.GetIconIdFromIcon(iconHandle);
appWindow.SetIcon(iconId);
```

---

## Unsafe Code Patterns

Enable `unsafe` only when pointer arithmetic or fixed buffers are unavoidable:

```xml
<!-- .csproj -->
<PropertyGroup>
  <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
</PropertyGroup>
```

Keep unsafe blocks as small as possible and wrap them in safe public APIs:

```csharp
public static ReadOnlySpan<byte> GetBufferData(IntPtr nativeBuffer, int length)
{
    unsafe
    {
        return new ReadOnlySpan<byte>((void*)nativeBuffer, length);
    }
}
```

Pin managed objects before passing to unmanaged code:

```csharp
byte[] data = GetData();
fixed (byte* ptr = data)
{
    NativeApi.ProcessBuffer(ptr, data.Length);
}
```

---

## Anti-patterns

- ❌ **Writing manual P/Invoke when CsWin32 can generate it** — adds maintenance burden and risks incorrect signatures.
- ❌ **Using `DllImport` instead of `LibraryImport`** on .NET 7+ — `DllImport` is not AOT-compatible and uses runtime code generation.
- ❌ **Forgetting to release COM objects** — causes handle leaks. Call `Marshal.ReleaseComObject` or use `ComWrappers`.
- ❌ **Not checking HRESULT return codes** — Win32 and COM APIs signal errors through HRESULT. Always check `Marshal.ThrowExceptionForHR(hr)`.
- ❌ **Passing managed objects to unmanaged code without pinning** — the GC can relocate them. Use `fixed`, `GCHandle.Alloc`, or `Span<T>`.
- ❌ **Caching HWND across window re-creation** — the handle is only valid for the lifetime of that window instance.

## Verification Checklist

1. **HWND retrieval** — Every call to a Win32 API or COM interop uses a freshly retrieved or cached-per-lifetime HWND from `WindowNative.GetWindowHandle`.
2. **CsWin32 over manual** — Any Win32 function listed in the Windows SDK metadata uses CsWin32 instead of hand-written `DllImport`/`LibraryImport`.
3. **LibraryImport preferred** — All new manual P/Invoke declarations use `LibraryImport` with `partial` methods, not `DllImport`.
4. **COM cleanup** — COM objects obtained via interop interfaces are released deterministically; no leaked RCWs.
5. **HRESULT checking** — Every native call that returns an HRESULT is checked with `Marshal.ThrowExceptionForHR` or explicit success validation.
6. **Pinning for unmanaged calls** — Managed buffers passed to native code are pinned with `fixed` or `GCHandle` for the duration of the call.
