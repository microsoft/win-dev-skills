---
name: interop-webview
description: 'Win32 interop (CsWin32, HWND, P/Invoke) and WebView2 integration for WinUI 3. Use when calling native APIs from managed code, initializing pickers/dialogs with window handles, or embedding web content with JavaScript↔C# communication.'
---

# Interop & WebView2

## Quick Reference

1. **Use CsWin32 over manual P/Invoke** — add `Microsoft.Windows.CsWin32` NuGet + `NativeMethods.txt`.
2. **Get HWND via `WindowNative.GetWindowHandle()`** — required for file pickers, dialogs, Win32 APIs.
3. **`InitializeWithWindow` on all pickers** — pickers/dialogs crash without it.
4. **Await `EnsureCoreWebView2Async()` before `CoreWebView2`** — handle init errors.
5. **Validate origins in `WebMessageReceived`** — check `args.Source` before processing.

---

## Key Rules

### HWND & InitializeWithWindow

- Retrieve via `WindowNative.GetWindowHandle(this)` — cache per window lifetime, never across re-creation.
- Every picker/dialog MUST call `InitializeWithWindow.Initialize(picker, hwnd)`.

### CsWin32

- Add NuGet (`<PrivateAssets>all</PrivateAssets>`), list functions in `NativeMethods.txt`, call via `PInvoke.Fn()`.
- Fallback: `LibraryImport` (.NET 7+, AOT-compatible) over `DllImport`.

### COM & WinRT Interop

- Pickers: `IInitializeWithWindow`. Share: `IDataTransferManagerInterop`. Print: `IPrintManagerInterop`.
- Release COM refs — `Marshal.ReleaseComObject`. Check HRESULT returns.
- Bridge HWND↔WinRT: `Win32Interop.GetWindowIdFromWindow()` → `AppWindow.GetFromWindowId()`.

### WebView2

- `await EnsureCoreWebView2Async()` before any access. Handle `CoreWebView2Initialized` errors.
- Filter navigation in `NavigationStarting`. **C#→JS:** `ExecuteScriptAsync()` — serialize input via `JsonSerializer`.
- **JS→C#:** `WebMessageReceived` + `postMessage` — validate `args.Source`. Host objects only for trusted content.
- Lazy-init (~150 MB). `MemoryUsageTargetLevel = Low` when hidden. Disable `AreDevToolsEnabled`/`IsScriptEnabled` for untrusted content.

---

## Detailed References

| Reference | Contents |
|---|---|
| [`references/interop-patterns.md`](references/interop-patterns.md) | CsWin32 setup, NativeMethods.txt, HWND code, LibraryImport, COM patterns, WinRT bridging, unsafe code |
| [`references/webview2-patterns.md`](references/webview2-patterns.md) | WebView2 init, navigation, JS↔C# interop, virtual host mapping, cookies, config, performance |

## Related Skills

| Skill | When to use |
|---|---|
| `media-files` | File pickers requiring `InitializeWithWindow` |
| `platform-apis` | Finding the right Windows API namespace |
| `quality` | Security rules for WebView2, input validation |

## External Resources

| Topic | Link |
|---|---|
| CsWin32 | [github.com/microsoft/CsWin32](https://github.com/microsoft/CsWin32) |
| Retrieve HWND | [Retrieve a window handle](https://learn.microsoft.com/windows/apps/develop/ui-input/retrieve-hwnd) |
| Win32 interop | [Call Win32 APIs](https://learn.microsoft.com/windows/apps/develop/platform/csharp-interop) |
| LibraryImport | [P/Invoke source generation](https://learn.microsoft.com/dotnet/standard/native-interop/pinvoke-source-generation) |
| WebView2 docs | [microsoft-edge/webview2/](https://learn.microsoft.com/microsoft-edge/webview2/) |
| JS interop | [Use JavaScript in WebView2](https://learn.microsoft.com/microsoft-edge/webview2/how-to/javascript) |
| WebView2 security | [Security best practices](https://learn.microsoft.com/microsoft-edge/webview2/concepts/security) |
