# UWP → WinUI 3 Replacement Patterns

Reference for API replacements and patterns that `winapp migrate scaffold --from-uwp` doesn't (and can't) handle automatically — scaffold only does the bulk `Windows.UI.Xaml → Microsoft.UI.Xaml` namespace rewrite and shell wiring. Everything below requires code-level adaptation: dialog shape changes, threading model, windowing, lifecycle, resources, controls, and storage. Use this file when resolving `winui-analyze` findings (Step 1) or fixing build/runtime issues (Step 3).

## Common build errors after the namespace rewrite

These are the build errors that almost always surface first, before any of the deeper API replacements come into play. Fix them inline as you encounter them.

### `CS0104: 'LaunchActivatedEventArgs' is an ambiguous reference`

After the script rewrites `Windows.UI.Xaml` → `Microsoft.UI.Xaml`, an `App.xaml.cs` (or any other file) that still has `using Windows.ApplicationModel.Activation;` ends up with **two** `LaunchActivatedEventArgs` types in scope — the UWP one in `Windows.ApplicationModel.Activation`, and the WinUI 3 one in `Microsoft.UI.Xaml`. The two are not interchangeable: `OnLaunched` in WinUI 3 receives `Microsoft.UI.Xaml.LaunchActivatedEventArgs`.

Fix by either:

```csharp
// Option A — drop the UWP using (cleanest if nothing else in the file uses
// Windows.ApplicationModel.Activation):
// using Windows.ApplicationModel.Activation;   ← delete

// Option B — fully qualify the parameter type:
protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
{
    MainWindow = new MainWindow();
    MainWindow.Activate();
}
```

The same pattern applies to any other type name that exists in both `Windows.UI.Xaml.*` and `Microsoft.UI.Xaml.*` namespaces (e.g. `Application`, `RoutedEventArgs`) — fully qualify, or remove the stale UWP `using`.

### `CS0227: Unsafe code may only appear if compiling with /unsafe`

UWP SDK samples that touch pixel buffers (`IMemoryBufferReference`, `Marshal.GetIUnknownForObject`, `byte*` access) commonly use `unsafe` blocks. The scaffold's `.csproj` does not enable unsafe code. Add this to the `<PropertyGroup>`:

```xml
<AllowUnsafeBlocks>true</AllowUnsafeBlocks>
```

### `CS0246` / `WMC0001: 'CaptureElement' could not be found`

`<CaptureElement>` is UWP-only — `Microsoft.UI.Xaml.Controls` does not include it. There **is** a working WinUI 3 path: feed the live camera through `MediaPlayer` + `MediaSource.CreateFromMediaFrameSource(...)` and host it in a `MediaPlayerElement`. See [Camera Preview](#capture-preview) for the live-preview swap, or [Camera Frame Capture](#capture-preview-frame) if you specifically need `GetPreviewFrameAsync()` for per-frame software access.

## Unsupported on WinUI 3 Desktop (no migration path)

Code touching these APIs has no WinUI 3 desktop equivalent. `winui-analyze` marks these files `disposition: defer` with `severity: unsupported` findings; cite the specific API in `MIGRATION-DEFERRED.md`.

No equivalent (defer the file):

- `CoreWindow` and related view-scoped APIs (use `AppWindow` + HWND APIs)
- `InkCanvas`
- Virtual key support for gamepad input (`Windows.Gaming.Input.*` VK paths)
- Single-app kiosk mode
- Xbox / HoloLens-specific surfaces (`Windows.System.Profile` device-family branching)
- Phone-only APIs (`Windows.Phone.*`, `Windows.ApplicationModel.Calls.*`)

Conditional support:

- `PrintManager` — Windows 11 only
- Visual Studio XAML Designer — no design surface for WinUI projects

See the official [What's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported) page.

## Namespace Mapping

All `Windows.UI.Xaml.*` namespaces move to `Microsoft.UI.Xaml.*`:

| UWP | WinUI 3 |
|-----|---------|
| `Windows.UI.Xaml` | `Microsoft.UI.Xaml` |
| `Windows.UI.Xaml.Controls` | `Microsoft.UI.Xaml.Controls` |
| `Windows.UI.Xaml.Media` | `Microsoft.UI.Xaml.Media` |
| `Windows.UI.Xaml.Input` | `Microsoft.UI.Xaml.Input` |
| `Windows.UI.Xaml.Data` | `Microsoft.UI.Xaml.Data` |
| `Windows.UI.Xaml.Navigation` | `Microsoft.UI.Xaml.Navigation` |
| `Windows.UI.Xaml.Shapes` | `Microsoft.UI.Xaml.Shapes` |
| `Windows.UI.Composition` | `Microsoft.UI.Composition` |
| `Windows.UI.Input` | `Microsoft.UI.Input` |
| `Windows.UI.Colors` | `Microsoft.UI.Colors` |
| `Windows.UI.Text` | `Microsoft.UI.Text` |
| `Windows.UI.Core` (dispatcher) | `Microsoft.UI.Dispatching` |

<a id="threading"></a>
## Threading: CoreDispatcher → DispatcherQueue

UWP (replace this):

```csharp
await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => StatusText.Text = "Done");
```

WinUI 3:

```csharp
DispatcherQueue.TryEnqueue(() => StatusText.Text = "Done");
DispatcherQueue.TryEnqueue(DispatcherQueuePriority.High, () => ProgressBar.Value = 100);
```

Cache the queue off the UI thread via `DispatcherQueue.GetForCurrentThread()`. UWP's ASTA reentrancy protection is gone — watch for reentrancy in async code that pumps messages. See the official [threading guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/threading).

> **`DependencyObject.Dispatcher` is `null` in WinUI 3 — this is a runtime crash, not a compile error.** The `Dispatcher` property still exists on every `DependencyObject` (Page, Control, etc.) so code like `Dispatcher.HasThreadAccess`, `Dispatcher.RunAsync(...)`, or `Dispatcher.TryRunAsync(...)` **compiles cleanly** but throws `NullReferenceException` the instant it runs — a build-clean, run-fail zero. Replace **every** `Dispatcher.<member>` access (not just `RunAsync`) with the `DispatcherQueue` equivalent:
>
> ```csharp
> // UWP (compiles in WinUI 3, but Dispatcher is null → NRE at runtime):
> if (Dispatcher.HasThreadAccess) { UpdateStatus(); }
> // WinUI 3:
> if (DispatcherQueue.HasThreadAccess) { UpdateStatus(); }
> ```
>
> Do **not** silence this with a `migrate-keep` comment — `DependencyObject.Dispatcher` being non-null is a UWP-only guarantee; keeping it ships a guaranteed launch crash.

<a id="dialogs"></a>
## Dialogs: MessageDialog → ContentDialog

UWP (replace this):

```csharp
var dlg = new MessageDialog("Are you sure?", "Confirm");
await dlg.ShowAsync();
```

WinUI 3 — `ContentDialog` requires a `XamlRoot`:

```csharp
var dlg = new ContentDialog
{
    Title = "Confirm",
    Content = "Are you sure?",
    PrimaryButtonText = "Yes",
    CloseButtonText = "No",
    XamlRoot = this.Content.XamlRoot   // inside a Window
};
var result = await dlg.ShowAsync();
```

**Picking the right `XamlRoot`:**

| Calling from | Use |
|---|---|
| A `Window` (e.g., `MainWindow`) | `this.Content.XamlRoot` |
| A `Page` | `this.XamlRoot` |
| A `UserControl` | `this.XamlRoot` |
| A view-model / non-UI class | Inject the `XamlRoot` from the calling view; never assume a global. |

If `XamlRoot` is `null`, the call happened before the element was loaded — wire the dialog from `Loaded` or after `Window.Activate()`.

<a id="windowing"></a>
## Windowing: Window.Current / ApplicationView / CoreWindow → AppWindow

`Window.Current`, `ApplicationView`, and `CoreWindow` are gone. Track the main window yourself and use `Microsoft.UI.Windowing.AppWindow`. See the official [windowing guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/windowing).

UWP (replace this):

```csharp
var win = Window.Current;
ApplicationView.GetForCurrentView().TryResizeView(new Size(800, 600));
```

WinUI 3 — expose `MainWindow` from `App`:

```csharp
public partial class App : Application
{
    // With <Nullable>enable</Nullable>, declare as nullable since the assignment only happens during OnLaunched.
    public static Window? MainWindow { get; private set; }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var window = new MainWindow();
        MainWindow = window;
        window.Activate();
    }
}
```

Consumers running after `OnLaunched` can safely null-forgive:

```csharp
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow!);
```

Resize via `AppWindow`:

```csharp
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
var appWindow = AppWindow.GetFromWindowId(windowId);
appWindow.Resize(new SizeInt32(800, 600));
```

### Initialization order — keep MainWindow's constructor inert

`App.MainWindow` (or any equivalent static window reference) is `null` for the entire duration of `new MainWindow()` — the right-hand side runs to completion BEFORE the assignment happens. Anything inside that constructor that reads the static — directly or transitively — sees `null` and throws `E_POINTER` (0x80004003) at startup. The build is clean; the analyzer is silent; only a runtime launch reveals it.

APIs that commonly trip this race when called from a `Page` reached during `MainWindow` construction:

- `WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow)`
- `XamlRoot` / `Content.XamlRoot` access through a static-window helper
- `PrintManagerInterop.GetForWindow(hwnd)` / `ShowPrintUIForWindowAsync(hwnd)`
- `FileOpenPicker` / `FileSavePicker` / `FolderPicker` (require an HWND)
- `ContentDialog.ShowAsync()` when the dialog's `XamlRoot` is sourced from a static
- `AppWindow.GetFromWindowId(...)` chained through `App.MainWindow`
- Any custom title bar / `SetTitleBar` helper that resolves the HWND statically

Safe pattern — assign before activate, defer first navigation:

```csharp
// App.xaml.cs
protected override void OnLaunched(LaunchActivatedEventArgs args)
{
    var window = new MainWindow();
    MainWindow = window;
    window.Activate();
}
```

The `MainWindow` constructor must do only `InitializeComponent` and inert setup — no navigation to a `Page` that reads `App.MainWindow`. Defer the first navigation until after `Activate` completes, either from a `Loaded` handler hooked in `InitializeComponent` or by exposing a `NavigateToInitialPage()` method and calling it from `App.OnLaunched` after the static is assigned.

```csharp
// MainWindow.xaml.cs
public MainWindow()
{
    InitializeComponent();
    this.Activated += (_, _) =>
    {
        if (!_navigated)
        {
            _navigated = true;
            RootFrame.Navigate(typeof(MainPage));
        }
    };
}
private bool _navigated;
```

This is a build-clean, run-fail race: `winapp migrate validate` (source-only) won't catch it — confirm the fix by launching with `winapp run` and checking the window actually renders.

### AppWindow API replacements

| UWP API | WinUI 3 API |
|---------|-------------|
| `ApplicationView.TryResizeView` | `AppWindow.Resize` |
| `AppWindow.TryCreateAsync` | `AppWindow.Create` |
| `AppWindow.TryShowAsync` | `AppWindow.Show` |
| `AppWindow.TryConsolidateAsync` | `AppWindow.Destroy` |
| `AppWindow.RequestMoveXxx` | `AppWindow.Move` |
| `AppWindow.RequestPresentation` | `AppWindow.SetPresenter` |
| `CoreApplicationViewTitleBar` | `AppWindowTitleBar` |
| `CoreApplicationView.TitleBar.ExtendViewIntoTitleBar` | `AppWindow.TitleBar.ExtendsContentIntoTitleBar` |

<a id="getforcurrentview"></a>
## GetForCurrentView() Replacements

🛑 **These THROW at runtime — they are not harmless no-ops.** In WinUI 3 desktop there is no per-view singleton, so `GetForCurrentView()` raises `COMException` / `E_POINTER` / `NullReferenceException` the moment it executes. If the call sits in a page constructor or an `OnNavigatedTo` (as it usually does), the exception is unhandled and **the page crashes to a blank window** — the app "launches" but renders nothing. You MUST replace every one; leaving it with a `// migrate-keep` / "optional for desktop" comment is a defect, not a shortcut.

| UWP API | WinUI 3 Replacement |
|---------|---------------------|
| `ApplicationView.GetForCurrentView()` | `AppWindow.GetFromWindowId(windowId)` |
| `UIViewSettings.GetForCurrentView()` | `AppWindow` properties (size, presenter) |
| `DisplayInformation.GetForCurrentView()` | `XamlRoot.RasterizationScale` for scale; drop rotation/orientation tracking (desktop windows don't rotate) — do **not** keep the call |
| `CoreApplication.GetCurrentView()` | Track windows manually in `App` |
| `SystemNavigationManager.GetForCurrentView()` | Wire back handling in `NavigationView` / `BackRequested` directly |

If the source only used `DisplayInformation.GetForCurrentView()` to subscribe to `OrientationChanged` for camera-preview rotation, **remove the field, the `GetForCurrentView()` call, and the event handler wiring entirely** — desktop windows have no display-orientation change, so the feature has no desktop analog.

<a id="display-request"></a>
## DisplayRequest (keep-screen-awake)

`Windows.System.Display.DisplayRequest` is flagged `WUI1002` (not supported) and `RequestActive()` reaches for the current view → throws at runtime. There is no WinUI 3 XAML equivalent. Options, in order of preference for a migrated sample:

1. **Drop it.** Keep-awake-while-camera-runs is not an observable sample behavior; remove the field, `RequestActive()`, and `RequestRelease()`.
2. If you must keep the screen awake, P/Invoke `SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED)` on start and `ES_CONTINUOUS` on stop.

Either way, never leave `new DisplayRequest()` + `RequestActive()` in the migrated code.

<a id="defensive-ui"></a>
## Defensive UI for device / view init (prevents blank-window crashes)

Device-backed scenario pages (camera, sensors, mic, location, Bluetooth) and any residual view-scoped call can throw during page load on machines that lack the device — and `async void OnNavigatedTo` / constructor exceptions are **unhandled**, crashing the page to a blank window that is indistinguishable from a real crash.

**Rule:** wrap device/view acquisition and init (`OnNavigatedTo`, page constructor, `StartCameraAsync`, sensor `GetDefault()`, etc.) in `try/catch`. On catch, swap the page's main content for a visible fallback instead of letting the exception escape:

```csharp
protected override async void OnNavigatedTo(NavigationEventArgs e)
{
    try
    {
        // ... device / view init ...
        await StartCameraAsync();
    }
    catch (Exception ex)
    {
        ShowUnavailable(ex.Message);   // centred TextBlock: "This sample requires a <device> that is not available on this machine." + ex.Message
    }
}
```

A two-line fallback keeps the page visible (screenshots show rendered content, `runs`/`renders` pass) even when the device is absent or a residual API throws.

<a id="pickers"></a>
## Pickers and Win32 Surfaces

🛑 **WUI1001 analyzer warning.** In WinUI 3 desktop, keeping `Windows.Storage.Pickers.FileOpenPicker` (even with `InitializeWithWindow`) trips the **WUI1001** analyzer — REQ4 fails. The analyzer wants the Windows App SDK picker: **`Microsoft.Windows.Storage.Pickers.FileOpenPicker`**, which takes a `WindowId` in its constructor (no `InitializeWithWindow` interop hack) and returns a lightweight result object.

Preferred (analyzer-clean) pattern:

```csharp
using Microsoft.Windows.Storage.Pickers;   // NOT Windows.Storage.Pickers
using Microsoft.UI;                          // Win32Interop

var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);

var picker = new FileOpenPicker(windowId);   // WindowId ctor — no InitializeWithWindow
picker.FileTypeFilter.Add(".txt");

// PickSingleFileAsync now returns PickFileResult (a lightweight object with a .Path string),
// NOT a StorageFile. Guard for null (user cancelled) and adapt downstream code.
PickFileResult result = await picker.PickSingleFileAsync();
if (result is not null)
{
    string path = result.Path;
    var file = await Windows.Storage.StorageFile.GetFileFromPathAsync(path); // only if a StorageFile is needed
    // ... use file ...
}
```

Apply the same `Microsoft.Windows.Storage.Pickers` + `WindowId` ctor swap to `FileSavePicker` and `FolderPicker`. Their result types also change (`PickFileResult` / `PickFolderResult` with `.Path`), so update the consuming code accordingly.

Legacy fallback: for other windowed surfaces that have NO Windows App SDK equivalent — `DataTransferManager` (Share), `PrintManager` — you must still resolve the HWND and call `InitializeWithWindow.Initialize(obj, hwnd)` / the `*Interop.GetForWindow(hwnd)` pattern.

<a id="input-pane"></a>
## Touch keyboard (`InputPane`) — `GetForCurrentView()` doesn't return a usable instance

`InputPane.GetForCurrentView()` returns `null` (or a non-functional instance) in WinUI 3 desktop because there is no per-view singleton. Use the `InputPaneInterop` COM cast on a window HWND instead.

```csharp
using WinRT.Interop;
using Microsoft.UI.Xaml.Controls; // InputPaneInterop lives in the WinAppSDK
using Windows.UI.ViewManagement;

var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
var pane = InputPaneInterop.GetForWindow(hwnd);
pane.TryShow();   // or pane.TryHide()
pane.Showing += (s, e) => { /* adjust layout */ };
pane.Hiding  += (s, e) => { /* restore */ };
```

This is the only supported way to acquire an `InputPane` for a desktop window. The returned instance exposes the same `Showing` / `Hiding` events and `OccludedRect` as UWP.

<a id="lifecycle"></a>
## Application Lifecycle and Activation

`OnLaunched`, `OnActivated`, `OnFileActivated`, etc. are replaced by the unified `AppInstance` / `AppLifecycle` activation model. See the [app lifecycle guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/applifecycle).

```csharp
using Microsoft.Windows.AppLifecycle;

var args = AppInstance.GetCurrent().GetActivatedEventArgs();
switch (args.Kind)
{
    case ExtendedActivationKind.File: /* ... */ break;
    case ExtendedActivationKind.Protocol: /* ... */ break;
    case ExtendedActivationKind.AppNotification: /* toast click */ break;
}
```

Single-instancing: call `AppInstance.FindOrRegisterForKey` + `Redirect` in `Program.Main`.

### Suspending / Resuming — no direct equivalent

`Application.Suspending` and `Application.Resuming` events **do not exist** on WinUI 3 desktop. Desktop apps don't suspend — they keep running until closed, then exit. A migration that simply deletes `this.Suspending += OnSuspending` (because it won't compile) silently breaks any "save state before suspend" logic — including any `SuspensionManager.SaveAsync()` call wired to that event. The restore path on next launch then finds nothing to restore.

The two viable replacement idioms:

1. **`Window.Closed` event** — closest analog. Fires synchronously when the window closes. Use it to call your existing save routine. Caveat: it's synchronous; async work may not complete before the process exits. For best results, perform synchronous serialization or kick off a fire-and-forget background write earlier.

   ```csharp
   // In App.OnLaunched, after creating MainWindow:
   var window = new MainWindow();
   window.Closed += async (_, _) => { await SuspensionManager.SaveAsync(); };
   ```

2. **Save-on-mutation** (preferred for new code) — write state every time it changes, rather than relying on a single "save before going away" event. Eliminates the deferral / async-completion problem entirely.

Whichever path you take, the `SuspensionManager` / `NavigationHelper` / `SaveState` / `LoadState` plumbing from a UWP sample is fine to keep; only the **trigger** changes from `Suspending` to `Window.Closed` (or to per-mutation calls).

<a id="notifications"></a>
## Notifications

| UWP | WinUI 3 / WinAppSDK |
|-----|---------------------|
| `ToastNotificationManager` (Windows.UI.Notifications) | `AppNotificationManager` (Microsoft.Windows.AppNotifications) |
| WNS push via `PushNotificationChannelManager` | `PushNotificationManager` (Microsoft.Windows.PushNotifications) |

See the [toast notifications guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/toast-notifications) and [push notifications guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/notifications).

## Resources: MRT → MRT Core

`.resw` files are still supported, but the API surface changed. See the [MRT Core migration guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/mrtcore).

UWP (replace this):

```csharp
var loader = ResourceLoader.GetForCurrentView();
var s = loader.GetString("Greeting");
```

WinAppSDK:

```csharp
var loader = new Microsoft.Windows.ApplicationModel.Resources.ResourceLoader();
var s = loader.GetString("Greeting");
```

## Text Rendering: DirectWrite → DWriteCore

If you do custom text rendering with DirectWrite, switch to **DWriteCore** — the WinAppSDK implementation. APIs are largely parallel; see the [DWriteCore migration guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/dwritecore).

<a id="controls"></a>
## Controls and Features

| UWP | WinUI 3 / WinAppSDK |
|-----|---------------------|
| `MediaElement` | `MediaPlayerElement` (Microsoft.UI.Xaml.Controls) |
| `MediaPlayerElement` (Windows.UI.Xaml) | `MediaPlayerElement` (Microsoft.UI.Xaml.Controls) — namespace change only |
| `CaptureElement` (Windows.UI.Xaml.Controls) | `MediaPlayerElement` driven by `MediaPlayer` + `MediaSource.CreateFromMediaFrameSource(...)` — see [Camera Preview](#capture-preview) |
| `MapControl` (Windows.UI.Xaml.Controls.Maps) | `MapControl` (Microsoft.UI.Xaml.Controls) — WinAppSDK 1.5+ |
| `CameraCaptureUI` (Windows.Media.Capture) | `CameraCaptureUI` (Microsoft.Windows.Media.Capture) — WinAppSDK 1.7+ |
| `WebAuthenticationBroker` | `Microsoft.Security.Authentication.OAuth` — WinAppSDK 1.7+ |
| Background acrylic via `AcrylicBrush` BackgroundSource | `DesktopAcrylicController` (Microsoft.UI.Composition.SystemBackdrops) |
| `InkCanvas` | Not yet supported |
| `VirtualizingStackPanel` | `ItemsStackPanel` (default virtualizing panel in WinUI 3) — see [Virtualizing Panel](#virtualizing-panel) |

<a id="virtualizing-panel"></a>
## Virtualizing Panel (`VirtualizingStackPanel` → `ItemsStackPanel`)

WinUI 3 does **not** include `VirtualizingStackPanel`. The default items panel for `ListView`/`GridView` is already `ItemsStackPanel` which virtualizes automatically.

**XAML — inside `ItemsPanelTemplate`:**

```xml
<!-- UWP -->
<ItemsPanelTemplate>
    <VirtualizingStackPanel Background="Transparent"/>
</ItemsPanelTemplate>

<!-- WinUI 3 -->
<ItemsPanelTemplate>
    <ItemsStackPanel Background="Transparent"/>
</ItemsPanelTemplate>
```

**Key differences:**
- `ItemsStackPanel` supports `Orientation` just like `VirtualizingStackPanel`
- For horizontal virtualizing layout, use `ItemsWrapGrid` or `ItemsStackPanel Orientation="Horizontal"`
- If `VirtualizingStackPanel.VirtualizationMode` was set, remove it — `ItemsStackPanel` always uses recycling
- If `VirtualizingStackPanel` was used **outside** an `ItemsPanelTemplate` (rare), replace with plain `StackPanel` (no virtualization outside items controls)

**C# code-behind:** If code references `VirtualizingStackPanel` for scroll-into-view or container generation, replace the type cast:

```csharp
// UWP
var panel = (VirtualizingStackPanel)listView.ItemsPanelRoot;

// WinUI 3
var panel = (ItemsStackPanel)listView.ItemsPanelRoot;
```

<a id="capture-preview"></a>
## Camera Preview (replacing `<CaptureElement>`)

`<CaptureElement>` is UWP-only. The `Windows.Media.Capture` pipeline itself is fully available on WinAppSDK — only the XAML host element is missing. Swap to `MediaPlayerElement` driven by a `MediaPlayer` whose `Source` is a `MediaFrameSource`.

> ⚠️ **Common pitfall — gray preview surface.** If you translate the UWP `MediaCapture.InitializeAsync` settings verbatim (typically `new MediaCaptureInitializationSettings { VideoDeviceId = id }` or no settings at all), then `_mediaCapture.FrameSources` will NOT contain a usable preview source — your `FirstOrDefault` returns `null`, `MediaPlayer.Source` stays unset, and `MediaPlayerElement` renders a gray box even though the camera permission was granted and `StartPreviewAsync()` succeeded. This is the #1 cause of "I authorized the camera but the app doesn't show anything" after migration. The three settings below (`StreamingCaptureMode = Video`, `SharingMode = ExclusiveControl`, `MemoryPreference = Cpu`) are **mandatory** — `StreamingCaptureMode = Video` makes video frame sources appear in `FrameSources`, and `MemoryPreference = Cpu` is required for `MediaSource.CreateFromMediaFrameSource(...)` to attach to a software-rendered `MediaPlayerElement`. If the UWP `InitializeAsync` call carries `VideoDeviceId`, keep it but additionally populate `SourceGroup` via `MediaFrameSourceGroup.FindAllAsync()` so the requested device exposes its frame sources.

```xml
<MediaPlayerElement x:Name="PreviewControl"
                    Stretch="Uniform"
                    AreTransportControlsEnabled="False" />
```

```csharp
using System.Linq;
using Microsoft.UI.Xaml.Controls;
using Windows.Media.Capture;
using Windows.Media.Capture.Frames;
using Windows.Media.Core;
using Windows.Media.Playback;

private MediaCapture _mediaCapture;
private MediaPlayer _player;

private async Task StartPreviewAsync()
{
    // Pick a source group that exposes a colour video frame source.
    // FindAllAsync enumerates every camera/group on the machine; pick the
    // first one with a Color source. This is the reliable way to make
    // FrameSources contain a usable preview source on WinAppSDK.
    var groups = await MediaFrameSourceGroup.FindAllAsync();
    var group = groups.FirstOrDefault(g =>
        g.SourceInfos.Any(si => si.SourceKind == MediaFrameSourceKind.Color &&
                                (si.MediaStreamType == MediaStreamType.VideoPreview ||
                                 si.MediaStreamType == MediaStreamType.VideoRecord)));
    if (group == null) return; // no camera with a colour preview stream

    _mediaCapture = new MediaCapture();
    await _mediaCapture.InitializeAsync(new MediaCaptureInitializationSettings
    {
        SourceGroup          = group,                                  // REQUIRED for FrameSources to populate
        StreamingCaptureMode = StreamingCaptureMode.Video,             // REQUIRED — without this, video frame sources are hidden
        SharingMode          = MediaCaptureSharingMode.ExclusiveControl,
        MemoryPreference     = MediaCaptureMemoryPreference.Cpu,       // REQUIRED for MediaSource.CreateFromMediaFrameSource
    });

    var colorSource = _mediaCapture.FrameSources.Values
        .FirstOrDefault(s => s.Info.SourceKind == MediaFrameSourceKind.Color);
    if (colorSource == null) return; // group had a colour source but init didn't expose it

    _player = new MediaPlayer
    {
        Source           = MediaSource.CreateFromMediaFrameSource(colorSource),
        RealTimePlayback = true,
        AutoPlay         = true,
    };
    PreviewControl.SetMediaPlayer(_player);
}

private void StopPreview()
{
    PreviewControl.SetMediaPlayer(null);
    _player?.Dispose();        _player = null;
    _mediaCapture?.Dispose();  _mediaCapture = null;
}
```

Notes:
- `MediaPlayerElement.SetMediaPlayer(player)` is the WinUI 3 surface for handing a `MediaPlayer` to a XAML host — it replaces the old `captureElement.Source = mediaCapture` assignment.
- The `StartPreviewAsync()` call from UWP code remains — keep it; it kicks off the frame pump that the `MediaFrameSource` reads from. The functional change is `where the frames go` (MediaPlayer pipeline instead of CaptureElement).
- Dispose `_player` and `_mediaCapture` on page-leave to release the camera promptly.
- `<CaptureElement>` XAML attributes like `Stretch` and `FlowDirection` exist on `MediaPlayerElement` with the same semantics.
- If you only need single-frame software access (analysis, snapshots), see [Camera Frame Capture](#capture-preview-frame) instead.

<a id="capture-preview-frame"></a>
## Camera Frame Capture (`GetPreviewFrameAsync`)

`MediaCapture.GetPreviewFrameAsync()` itself is unchanged on WinAppSDK — the only thing that breaks is the XAML host. Render frames into an `Image` via `SoftwareBitmapSource`. Use this when you need per-frame software access (image analysis, snapshots, custom overlays); for plain live preview prefer [Camera Preview](#capture-preview).

```xml
<Image x:Name="PreviewImage" Stretch="Uniform" />
```

```csharp
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Graphics.Imaging;
using Windows.Media.Capture;

await _mediaCapture.StartPreviewAsync();

while (_running)
{
    using var frame = await _mediaCapture.GetPreviewFrameAsync();
    var bmp = frame.SoftwareBitmap;
    if (bmp.BitmapPixelFormat != BitmapPixelFormat.Bgra8 ||
        bmp.BitmapAlphaMode  != BitmapAlphaMode.Premultiplied)
    {
        bmp = SoftwareBitmap.Convert(bmp,
            BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
    }
    var src = new SoftwareBitmapSource();
    await src.SetBitmapAsync(bmp);
    PreviewImage.Source = src;
    await Task.Delay(33); // ~30 fps cap
}
```

Higher CPU cost than the `MediaPlayerElement` path. `SetBitmapAsync` must run on the UI thread — wrap with `DispatcherQueue.TryEnqueue` if the loop is on a worker.

<a id="storage"></a>
## Storage and Settings

| Scenario | Packaged app | Unpackaged app |
|----------|--------------|----------------|
| Simple key/value settings | `ApplicationData.Current.LocalSettings` | JSON in `Environment.SpecialFolder.LocalApplicationData` |
| Local files | `ApplicationData.Current.LocalFolder` | `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` |
| Roaming settings | Deprecated — migrate to your own sync layer | N/A |

<a id="hit-test"></a>
## Pointer hit-testing: preserve `Background` on input-receiving panels

WinUI 3 (and UWP, identically) ship a XAML-platform rule: a `Panel` whose
`Background` resolves to `null` is **not** part of the hit-test tree.
Pointer/tap/manipulation events pass straight through to whatever is
behind it. App builds. Page navigates. Handlers never fire. **No
compiler error, no analyzer warning, no runtime exception** — a silent
functional regression.

**Common symptom in migrations:** A `<Canvas>`, `<Grid>`, `<StackPanel>`,
or `<Border>` that the source UWP XAML had given a `Background=` attribute
(theme brush, color, or `Transparent`) loses that attribute during the
migration rewrite. The migrated app launches and renders the static
content (description, headings, etc.), but interactive scenarios appear
dead.

Concrete example seen in BasicInput / Scenario2_PointerPointProperties:

```xml
<!-- UWP source — works -->
<Canvas Grid.Row="2" Name="mainCanvas"
        Background="{ThemeResource ApplicationPageBackgroundThemeBrush}" />

<!-- WinUI 3 migrated — silently broken: Pointer_Pressed never fires -->
<Canvas Grid.Row="2" Name="mainCanvas" />
```

**Rule for migration:** if the source XAML's panel had a `Background=`
attribute, the migrated XAML **must** keep it (or replace it with an
equivalent theme brush — `ApplicationPageBackgroundThemeBrush` exists
in WinUI 3). If you want it visually invisible, use
`Background="Transparent"` — that still hit-tests, unlike `null`.

When in doubt for any container that has `PointerPressed`, `Tapped`,
`ManipulationStarted`, or similar handlers wired up in code-behind: set
`Background="Transparent"`.

**Decision table for the common `Background="{ThemeResource ApplicationPageBackgroundThemeBrush}"` case:**

| Panel context | What to do | Why |
|---|---|---|
| Named panel referenced from code-behind for `Pointer*` / `Tapped` / `Manipulation*` / drag events | `Background="Transparent"` | Preserves hit-testing without hiding Mica/AcrylicBackdrop |
| Named panel that just hosts visible content (no event handlers wired) | Keep the theme brush as-is | UWP author chose it for visual consistency; preserves intent |
| Root/outer `Grid` directly under `<Page>` with no `x:Name` and no handlers | Safe to drop | Lets `MainWindow.SystemBackdrop="Mica"` show through |

The historical drop rate for the first case (named panel + theme-brush background) is high enough across runs that `winui-analyze` emits a finding on any such element — when you see the finding, decide which row of the table applies and adjust accordingly. Never silently delete the attribute.

<a id="custom-styles"></a>
## Custom Styles on built-in controls — triage

UWP samples often ship a custom `<Style>` for a built-in control (`Button`, `CheckBox`, ...). Migrating verbatim produces controls that look "wrong" — flat, square-cornered, missing the Fluent treatment. Decide which sub-case you're in **before** fetching detailed guidance:

| Style body contains... | You're in | Fetch next |
|---|---|---|
| Only `<Setter Property="..." Value="..." />` lines (no `<Setter Property="Template">`) | **Case A** — Setter-only | [#custom-styles-case-a](#custom-styles-case-a) |
| A `<Setter Property="Template">` with `<ControlTemplate>` body (Rectangle/Border/VisualState/SystemControl*Brush refs) | **Case B** — Custom Template | [#custom-styles-case-b](#custom-styles-case-b) |

Suppress per-style with a `migrate-keep` comment only when you genuinely want to preserve UWP-era visuals.

<a id="custom-styles-case-a"></a>
## Custom Styles — Case A (Setter-only)

If your custom style only changes a handful of properties (Foreground, Padding, FontSize…) and does NOT define its own `<Setter Property="Template">`, you **must** add `BasedOn="{StaticResource Default<Control>Style}"`. Otherwise any property you don't override falls back to a bare default that lacks WinUI 3 visuals.

```xml
<!-- BAD — loses Fluent visuals -->
<Style x:Key="MyButtonStyle" TargetType="Button">
    <Setter Property="Padding" Value="16,8" />
</Style>

<!-- GOOD — inherits all Fluent defaults, only overrides Padding -->
<Style x:Key="MyButtonStyle" TargetType="Button"
       BasedOn="{StaticResource DefaultButtonStyle}">
    <Setter Property="Padding" Value="16,8" />
</Style>
```

The `Default<Control>Style` resource keys (`DefaultButtonStyle`, `DefaultCheckBoxStyle`, `DefaultToggleSwitchStyle`, etc.) are defined by the WinUI 3 themes shipped with the SDK and are available as `{StaticResource …}` once `<XamlControlsResources />` is present in `App.xaml` (the `dotnet new winui` template already wires this up).

Implicit styles (no `x:Key`, applied to every instance of the target type) also need `BasedOn` — same rule.

This is a manual best-practice check: any Setter-only `<Style>` whose `TargetType` is a known WinUI 3 control with a `Default<X>Style` resource (Button, CheckBox, ListView, TextBox, ToggleButton, etc.) and which has no `BasedOn=` attribute (or `<Style.BasedOn>` property element) should gain `BasedOn`. Keep a bare style only when you genuinely intend it.

<a id="custom-styles-case-b"></a>
## Custom Styles — Case B (Custom ControlTemplate)

When the UWP source ships a complete `<ControlTemplate>` inside the style
(`<Rectangle>` geometry, hand-rolled `VisualStateManager`, references to
`SystemControl…Brush`), `BasedOn` alone won't help — the template fully
replaces the visual tree and the WinUI 3 default never runs. Pasting the
template verbatim into WinUI 3 ships 2015-era visuals: square corners, flat
pre-Fluent brushes, no `ControlCornerRadius` / `ControlStrokeColor` tokens.

**Split decision: demo intent vs incidental UWP-era base chrome**

Custom Templates almost always mix two distinct things. The fix is to keep
the first and modernize the second — *not* preserve the whole Template
verbatim, and *not* nuke it wholesale.

| Part of the template | Action |
|---|---|
| **Demo intent** — `UseSystemFocusVisuals="False"`, custom `<VisualState>` for focus/hover, novel geometry that IS the sample's point | **Keep verbatim** — this is what the sample exists to demonstrate. |
| **Incidental UWP-era base chrome** — `SystemControl*Brush` references, `<Rectangle x:Name="NormalRectangle" />`, default `<Border>`/`<Grid>` backgrounds, default-looking glyph layouts copied from the 2015 system template | **Modernize**: replace UWP-era resource keys with the WinUI 3 equivalents the SDK default uses; replace UWP-era geometry with `<Border CornerRadius="{ThemeResource ControlCornerRadius}" />` or the corresponding fragment from the default template. |

**Workflow — surgical edits, not paste-the-world**

1. Read the WinUI 3 default for the same control as a reference (for
   **reading** only, do not paste the whole block). The default styles ship
   in the SDK's `generic.xaml`; find it under your NuGet cache at
   `~\.nuget\packages\microsoft.windowsappsdk\<ver>\lib\...\Microsoft.UI.Xaml\Themes\generic.xaml`,
   or read the source on [microsoft-ui-xaml](https://github.com/microsoft/microsoft-ui-xaml).
   Search it for `x:Key="Default<Control>Style"`.

   For common style keys see `#visual-deltas` below.

2. In your existing custom Template body, classify each setter / element
   using the table above. Demo intent → keep. Incidental → modernize.

3. For each incidental setter, swap the UWP-era resource key for the one
   the WinUI 3 default uses. For incidental geometry, swap to a `<Border>`
   with `ControlCornerRadius` or borrow the relevant fragment from the
   default Template. Leave demo-intent parts strictly untouched.

4. If the **whole** Template is incidental (no demo intent at all — the
   custom Style only existed to skin the control), drop the Template
   Setter entirely and fall back to `custom-styles-case-a`: a Setter-only
   Style with `BasedOn="{StaticResource Default<Control>Style}"`.

As a manual check, treat any `<ControlTemplate>` body that contains
`SystemControl*Brush` references or `<Rectangle x:Name="NormalRectangle" />`
as needing modernization toward the inferred `Default<Control>Style`.
Keep UWP-era visuals with a `migrate-keep` comment only when you
genuinely intend it (rare — usually means the
demo explicitly contrasts the old chrome with the new).

**Worked example** (synthetic `RepeatButton` — illustrative only;
not a benchmark control).

UWP source (mixed concerns):

```xml
<Style x:Key="DottedRepeatButton" TargetType="RepeatButton">
    <Setter Property="Background" Value="{ThemeResource SystemControlBackgroundChromeMediumLowBrush}" />
    <Setter Property="UseSystemFocusVisuals" Value="False" />
    <Setter Property="Template">
        <Setter.Value>
            <ControlTemplate TargetType="RepeatButton">
                <Border x:Name="RootBorder"
                        Background="{TemplateBinding Background}"
                        BorderBrush="{ThemeResource SystemControlForegroundBaseHighBrush}"
                        BorderThickness="1">
                    <VisualStateManager.VisualStateGroups>
                        <VisualStateGroup x:Name="FocusStates">
                            <VisualState x:Name="Focused">
                                <VisualState.Setters>
                                    <Setter Target="RootBorder.BorderBrush" Value="Red" />
                                    <Setter Target="RootBorder.BorderThickness" Value="2" />
                                </VisualState.Setters>
                            </VisualState>
                        </VisualStateGroup>
                    </VisualStateManager.VisualStateGroups>
                    <ContentPresenter />
                </Border>
            </ControlTemplate>
        </Setter.Value>
    </Setter>
</Style>
```

WinUI 3 (surgical edits — demo intent preserved, base chrome modernized):

```xml
<Style x:Key="DottedRepeatButton" TargetType="RepeatButton"
       BasedOn="{StaticResource DefaultRepeatButtonStyle}">
    <Setter Property="Background" Value="{ThemeResource ControlFillColorDefaultBrush}" />
    <Setter Property="UseSystemFocusVisuals" Value="False" />
    <Setter Property="Template">
        <Setter.Value>
            <ControlTemplate TargetType="RepeatButton">
                <Border x:Name="RootBorder"
                        Background="{TemplateBinding Background}"
                        BorderBrush="{ThemeResource ControlStrokeColorDefaultBrush}"
                        BorderThickness="1"
                        CornerRadius="{ThemeResource ControlCornerRadius}">
                    <VisualStateManager.VisualStateGroups>
                        <VisualStateGroup x:Name="FocusStates">
                            <VisualState x:Name="Focused">
                                <VisualState.Setters>
                                    <Setter Target="RootBorder.BorderBrush" Value="Red" />
                                    <Setter Target="RootBorder.BorderThickness" Value="2" />
                                </VisualState.Setters>
                            </VisualState>
                        </VisualStateGroup>
                    </VisualStateManager.VisualStateGroups>
                    <ContentPresenter />
                </Border>
            </ControlTemplate>
        </Setter.Value>
    </Setter>
</Style>
```

Changed: Setter brush + Border `BorderBrush` switched to WinUI 3 keys, plus
`CornerRadius="{ThemeResource ControlCornerRadius}"` added (modern Fluent
chrome). Preserved: `UseSystemFocusVisuals="False"`, the entire
`FocusStates` VisualStateGroup, and the red focus border — the actual demo.

<a id="visual-deltas"></a>
## Known UWP → WinUI 3 visual deltas (starter list)

This is a **starter list, not exhaustive**. The full UWP → WinUI 3 mapping is
~100+ entries and varies per control (some keys are control-specific, some
are global, some renamed inconsistently). A one-size-fits-all table produces
subtly wrong visuals for a meaningful fraction of controls. **Always verify
the actual key the WinUI 3 default uses for the control you're touching** by
reading `Default<Control>Style` in the SDK's `generic.xaml` (under your NuGet
cache `microsoft.windowsappsdk\<ver>\...\Microsoft.UI.Xaml\Themes\generic.xaml`,
or the [microsoft-ui-xaml](https://github.com/microsoft/microsoft-ui-xaml) source).

### 1. Control-specific resources (preferred — check these first)

Every WinUI 3 control ships its own theme dictionary entries; the default
Template references these directly. Examples taken from `generic.xaml`:

| Control + role | Control-specific WinUI 3 key |
|---|---|
| Button background (rest) | `ButtonBackground` |
| Accent Button background | `AccentButtonBackground` |
| CheckBox background (unchecked) | `CheckBoxBackgroundUnchecked` |
| CheckBox glyph foreground (unchecked) | `CheckBoxForegroundUnchecked` |
| ToggleSwitch knob fill (off) | `ToggleSwitchKnobFillOff` |
| Slider thumb fill | `SliderThumbBackground` |
| ListView item pointer-over | `ListViewItemBackgroundPointerOver` |

How to discover the right key for **your** control: read
`Default<Control>Style` in the SDK's `generic.xaml` and search the
body for the Setter that controls the visual you want to change.

### 2. Global Fluent tokens (fallback only when no control-specific key fits)

| UWP-era key | WinUI 3 Fluent token |
|---|---|
| `SystemControlForegroundBaseHighBrush` | `TextFillColorPrimaryBrush` |
| `SystemControlForegroundBaseMediumBrush` | `TextFillColorSecondaryBrush` |
| `SystemControlForegroundBaseMediumHighBrush` | `TextFillColorPrimaryBrush` |
| `SystemControlBackgroundAccentBrush` | `AccentFillColorDefaultBrush` |
| `SystemControlHighlightAccentBrush` | `AccentFillColorDefaultBrush` |
| `SystemControlBackgroundChromeMediumLowBrush` | `ControlFillColorDefaultBrush` |
| `SystemControlPageBackgroundChromeLowBrush` | `LayerFillColorDefaultBrush` |

These are reasonable defaults, **not** correct for every control. If the
control's default Template uses a control-specific key (Section 1), prefer
that — global tokens skip the per-control disabled / pointer-over / focused
state variations the SDK ships.

### 3. Geometry / corner radius

UWP shipped square corners. WinUI 3 controls round via `ControlCornerRadius`
(default 4) and `OverlayCornerRadius` (default 8 — used by flyouts, dialogs).

- Hard-coded `<Rectangle x:Name="NormalRectangle" />` (UWP CheckBox default
  geometry) → replace with `<Border CornerRadius="{ThemeResource ControlCornerRadius}" />`
  or borrow the corresponding fragment from `DefaultCheckBoxStyle` via the
  helper script.
- `<Setter Property="CornerRadius" Value="0" />` only needs to be there if
  you genuinely want square corners. Most controls inherit
  `ControlCornerRadius` automatically — leaving the setter in produces a
  visible regression vs the surrounding Fluent UI.

### 4. Why "starter list" and not a comprehensive table

If you find yourself reaching for a value not in this list, run the helper
script for the specific control. Skill maintainers will append high-signal
entries to this section as new patterns surface across migration runs —
but the helper script is always the source of truth.

## Test Projects

UWP unit test projects do not load WinUI 3 types. Create new test projects from the WinUI templates:

| UWP | WinUI 3 |
|-----|---------|
| Unit Test App (Universal Windows) | **Unit Test App (WinUI in Desktop)** |
| Class Library (Universal Windows) | **Class Library (WinUI in Desktop)** |
| `[TestMethod]` for everything | `[TestMethod]` for logic, `[UITestMethod]` for XAML |

```csharp
[UITestMethod]
public void Control_DefaultState_IsValid()
{
    var control = new MyUserControl();
    Assert.AreEqual(expected, control.MyProperty);
}
```

<a id="csproj"></a>
## Project File Updates

- Target a current WinAppSDK-supported TFM. The exact TFM is the source of truth in the project's `.csproj`; do not hard-code it across instruction files. Typical values at time of writing:
  - `net8.0-windows10.0.19041.0` (LTS)
  - `net9.0-windows10.0.19041.0`
  - `net10.0-windows10.0.26100.0` (current `dotnet new winui` default in this repo)
- Add `<UseWinUI>true</UseWinUI>`.
- Add `<EnableMsixTooling>true</EnableMsixTooling>` for packaged builds.
- Reference `Microsoft.WindowsAppSDK` and `Microsoft.Windows.SDK.BuildTools`.
- Reference `Microsoft.Windows.SDK.BuildTools.WinApp` to wire `dotnet run` into `winapp run`.
- Keep `Package.appxmanifest` for packaged scenarios; set `<WindowsPackageType>None</WindowsPackageType>` for unpackaged.

### PackageReference reconciliation cheat-sheet

`winapp migrate scaffold --from-uwp` preserves the UWP `.csproj` at `<Target>/.uwp-source/*.csproj.reference` (renamed to prevent MSBuild discovery) and leaves the WinUI 3 scaffold's `.csproj` intact. Open both side-by-side and merge:

- **Drop** (UWP-only — never carry over):
  - `Microsoft.NETCore.UniversalWindowsPlatform`
  - Any `<PackageReference>` whose version string contains `uap` or whose name starts with `Windows.SDK.Contracts`.
- **Keep** (already in the scaffold — do not duplicate or downgrade):
  - `Microsoft.WindowsAppSDK`
  - `Microsoft.Windows.SDK.BuildTools`
- **Add** (project-specific — copy across, then update to a WinAppSDK-compatible version):
  - Third-party libraries the UWP project pulled in (`CommunityToolkit.*`, `Microsoft.Extensions.*`, `Newtonsoft.Json`, etc.). Pick the latest stable release; UWP-pinned versions are usually too old.

Do **not** copy the UWP `.csproj` over the scaffold's. The two formats are incompatible — the UWP csproj carries `<TargetPlatformIdentifier>UAP</TargetPlatformIdentifier>`, `<OutputType>AppContainerExe</OutputType>`, explicit `<Compile Include="...">` items, and `Microsoft.Common.props` imports, none of which build under WinAppSDK.

### Package.appxmanifest — reconcile image references with the assets you actually have

The WinUI 3 scaffold ships with a default `Package.appxmanifest` that references assets the template provides under `Assets/` (`SplashScreen.scale-200.png`, `Square150x150Logo.scale-200.png`, `Square44x44Logo.scale-200.png`, `StoreLogo.png`, `Wide310x150Logo.scale-200.png`, `LockScreenLogo.scale-200.png`). The UWP SDK sample's manifest usually points at sample-branded assets with a `-sdk` suffix (`Splash-sdk.png`, `squareTile-sdk.png`, `SmallTile-sdk.png`, `StoreLogo-sdk.png`).

If you copy the UWP manifest's `Logo` / `Square150x150Logo` / `Square44x44Logo` / `<uap:SplashScreen Image="...">` / `<uap:DefaultTile Wide310x150Logo="...">` references over the scaffold's without also bringing the matching files, **`winapp run` will register the package but the AppX layout will fail to launch** with errors like:

```
AppxManifest.xml(...): error 0x80070002: ... splash screen image [Splash-sdk.png] cannot be located.
```

(Failure code on the AppX side is typically `0x80073CF6` — "package could not be registered".)

You have two options. Pick one **before** the first `winapp run`:

- **Preferred — keep the scaffold's manifest image references** (`Assets\SplashScreen.scale-200.png`, etc.). When you merge any other content from the UWP manifest into the scaffold's (capabilities, file-type associations, `<uap:Extension>`, `<Application Id>`, etc.), do **not** overwrite the `Logo`, `<uap:SplashScreen Image>`, `Square150x150Logo`, `Square44x44Logo`, or `Wide310x150Logo` attribute values. The scaffold's defaults already match the files in its `Assets/` folder.

- **Alternative — keep the UWP sample's branded assets.** Copy every file the UWP manifest references from `.uwp-source/Assets/` (or `.uwp-source/<SampleName>/Assets/`) into the new project's `Assets/` folder, preserving the exact filename (including the `-sdk` suffix and any scale qualifiers). Verify by re-reading each `Image=`/`Logo>` value in the manifest and confirming `Test-Path "Assets\<that filename>"` for every one of them. Don't rename files to look prettier — the manifest reference is the source of truth.

Either way, before the first `winapp run`, sanity-check every asset reference in the manifest resolves:

```powershell
[xml]$m = Get-Content .\Package.appxmanifest
@($m.Package.Properties.Logo,
  $m.Package.Applications.Application.uap_VisualElements.Square150x150Logo,
  $m.Package.Applications.Application.uap_VisualElements.Square44x44Logo,
  $m.Package.Applications.Application.uap_VisualElements.uap_SplashScreen.Image,
  $m.Package.Applications.Application.uap_VisualElements.uap_DefaultTile.Wide310x150Logo
) | Where-Object { $_ } | ForEach-Object {
    if (-not (Test-Path $_)) { Write-Host "[MISSING] $_" -ForegroundColor Red }
}
```

### Manifest migration checklist (Windows.Desktop + runFullTrust)

The default UWP `Package.appxmanifest` declares itself as a Universal app, but a packaged WinUI 3 desktop app is a Win32 process with package identity — it needs a different shape. `winapp run` will register the AppX but **fail to deploy** with `0x80073CF6` or "requires runFullTrust capability" if any of the following are missing.

When merging the UWP manifest into the scaffold's, make sure all of these are true:

1. **TargetDeviceFamily is `Windows.Desktop`** — not `Windows.Universal`:
   ```xml
   <Dependencies>
     <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
   </Dependencies>
   ```
   Windows.Universal is UWP-only and rejected for a Win32 entrypoint.

2. **rescap namespace declared on `<Package>` and added to `IgnorableNamespaces`**:
   ```xml
   <Package
     xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
     xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
     xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
     IgnorableNamespaces="uap rescap">
   ```
   Without the namespace declaration, item 3 below is silently stripped by AppX validation and you get the "requires runFullTrust" error at deploy time.

3. **`runFullTrust` capability declared**:
   ```xml
   <Capabilities>
     <rescap:Capability Name="runFullTrust" />
   </Capabilities>
   ```
   Packaged WinUI 3 desktop apps run outside the UWP AppContainer sandbox and must declare this. Keep any UWP `<Capability>` entries you actually use (e.g. `<DeviceCapability Name="webcam" />`) but add the `runFullTrust` line above no matter what.

4. **`<Application EntryPoint="$targetentrypoint$">`** — the WinUI 3 scaffold uses an MSBuild placeholder that the build resolves to the real entry point. Don't replace it with a literal `<UwpAppName>.App` (that's a UWP entry-point pattern).

<a id="manifest-backgroundtask"></a>

5. **Remove UWP `<Extension Category="windows.backgroundTasks">` declarations** — UWP in-process background tasks (`IBackgroundTask` with an `EntryPoint` attribute in the manifest) do not work in WinUI 3 packaged desktop apps. The AppX deployment will fail with `0x80080204: App manifest validation error` because the entry point requires a matching `windows.activatableClass.inProcessServer` registration that Win32-based WinUI 3 apps cannot provide.

   **Migration approach:**
   - **Remove** the `<Extension Category="windows.backgroundTasks">` block from `Package.appxmanifest`.
   - **Remove** any separate BackgroundTask class library project (e.g. `*Tasks.csproj`) from the solution.
   - **Inline the background logic** into the foreground app. If the task monitored a sensor/event, subscribe to the same API directly in a page or service class. If it performed periodic work, use `DispatcherTimer` or `ThreadPoolTimer` in the foreground process.
   - If the background task wrote to `ApplicationData.LocalSettings` for cross-process state, the migrated app can read/write the same store directly (it's the same process now).

   ```xml
   <!-- REMOVE this entire block from Package.appxmanifest -->
   <Extensions>
     <Extension Category="windows.backgroundTasks" EntryPoint="Tasks.MyBackgroundTask">
       <BackgroundTasks>
         <Task Type="..." />
       </BackgroundTasks>
     </Extension>
   </Extensions>
   ```

<a id="manifest-extensions"></a>

6. **Migrate or remove UWP `<Extension>` declarations** — Several UWP extension categories require adaptation for WinUI 3 desktop apps. Extensions that declare an `EntryPoint` referencing a UWP activation class will fail AppX registration with `0x80080204: extension is missing an EntryPoint or StartPage attribute` because WinUI 3 uses `$targetentrypoint$` as its single entry point.

   **Common extensions and how to handle them:**

   | Extension Category | Action |
   | --- | --- |
   | `windows.appService` | **Remove** the extension entirely. In-process app services don't work the same way in WinUI 3. Implement the service logic directly in the app. |
   | `windows.backgroundTasks` | **Remove** — see section above. |
   | `windows.protocol` | **Keep** but ensure the `<uap:Extension>` uses `EntryPoint="$targetentrypoint$"`. Handle activation in `App.xaml.cs` `OnLaunched` via `AppInstance.GetActivatedEventArgs()`. |
   | `windows.fileTypeAssociation` | **Keep** but ensure `EntryPoint="$targetentrypoint$"`. Handle in `App.xaml.cs` like protocol activation. |
   | `windows.shareTarget` | **Remove** unless critical. Share target activation requires COM server registration in WinUI 3. |
   | `windows.appUriHandler` | **Keep** as-is (no EntryPoint needed). |
   | `windows.dialProtocol` | **Remove** entirely. DIAL protocol (media casting discovery) is a UWP-only extension that has no WinUI 3 desktop equivalent. The casting APIs remain available without the manifest extension. |

   **Rule of thumb:** If an `<Extension>` or `<uap:Extension>` has an `EntryPoint="SomeClass.Name"` attribute that references a UWP activation class, either:
   - Change it to `EntryPoint="$targetentrypoint$"` (for protocol/fileType activations), or
   - Remove it entirely (for backgroundTasks, appService).

   ```xml
   <!-- BAD: UWP-style EntryPoint will fail registration -->
   <uap:Extension Category="windows.appService">
     <uap:AppService Name="com.example.myservice" />
   </uap:Extension>

   <!-- GOOD: Remove appService extension, implement inline -->
   <!-- (no Extension block needed) -->

   <!-- BAD: protocol with UWP EntryPoint -->
   <uap:Extension Category="windows.protocol" EntryPoint="MyApp.App">
     <uap:Protocol Name="myprotocol" />
   </uap:Extension>

   <!-- GOOD: protocol with WinUI 3 EntryPoint -->
   <uap:Extension Category="windows.protocol" EntryPoint="$targetentrypoint$">
     <uap:Protocol Name="myprotocol" />
   </uap:Extension>
   ```

### WUI analyzer warnings (UWP API residue)

The benchmark's build step (the `BuildAndRun.ps1` script from the `winui-dev-workflow` skill) injects the `Microsoft.WindowsAppSDK.Analyzers` package, which flags UWP-only APIs that compile cleanly under WinUI 3 but throw `COMException` at runtime — typically inside `Microsoft.UI.Xaml.Application.Start(...)` before any window can render. The runner sees this as `builds=true, runs=false`. `winui-analyze` surfaces the same APIs pre-build as `severity: startup-crash` findings.

| Rule | Symptom | Fix |
| --- | --- | --- |
| `WUI0002` | `Window.Current does not exist in WinUI 3 desktop apps` | Store the `Window` reference in `App.xaml.cs` (`App.Window`) and pass it where needed; see "Windowing" above. |
| `WUI0003` | `CoreDispatcher is UWP-only` | Use `DispatcherQueue.GetForCurrentThread()` and `TryEnqueue(...)`; see "Threading" above. |
| `WUI0004` | `SystemNavigationManager.GetForCurrentView() is UWP-only` | Drop the system back button hookup, or use HWND-based COM interop; see "GetForCurrentView Replacements" above. |

Treat every `warning WUI000\d` line in the build output as a defect — the analyzer does not produce false positives. Search for the API name in this document for the recommended replacement.

<a id="xaml"></a>
## XAML Migration

XAML migration is mostly **mechanical transformation of existing files**, not re-authoring. Copy each `*.xaml` from the source verbatim, then apply the rewrites below. Do not regenerate a page from scratch — controls, names, and event handlers must be preserved so the code-behind continues to compile.

### xmlns root rewrites

`winapp migrate scaffold --from-uwp` rewrites `using:Windows.UI.Xaml.*` → `using:Microsoft.UI.Xaml.*` in both `.cs` `using` directives and `.xaml` `xmlns:` clauses. If you ever hand-edit a file afterward, `winapp migrate validate`'s residue check will flag any remaining `using:Windows.UI.Xaml` reference.

### Resource references: `DynamicResource` → `ThemeResource`

WinUI 3 ships Fluent theme resources under `ThemeResource`. UWP code that used `{StaticResource}` for theme brushes still works, but most app templates and the system theme dictionary expect `{ThemeResource}`. Migrate references to system brushes / styles to `{ThemeResource}` so they respond to light/dark/high-contrast changes.

`{StaticResource}` will not switch on theme change:

```xml
<Border Background="{StaticResource SystemControlBackgroundChromeMediumLowBrush}" />
```

`{ThemeResource}`:

```xml
<Border Background="{ThemeResource SubtleFillColorSecondaryBrush}" />
```

The system brush names also changed in many cases (Fluent v2 vs UWP v1). Cross-reference with the [Fluent Design colour palette](https://learn.microsoft.com/windows/apps/design/style/xaml-theme-resources).

### Controls that need element-level swaps

| UWP element | WinUI 3 element | Notes |
|---|---|---|
| `<InkCanvas … />` | _(none — defer)_ | Not supported. |
| `<Pivot>` / `<PivotItem>` | `<TabView>` / `<TabViewItem>`, or `<controls:Pivot>` from `CommunityToolkit.WinUI.UI.Controls` | Pick based on the source's intent (top-tab vs swipe pivot). |
| `<Hub>` / `<HubSection>` | Hand-rolled `<NavigationView>` with section grouping, or `<ScrollViewer>` with stacked sections. | No drop-in equivalent. |
| `<AppBarButton Icon="…">` system icons | Most identifiers carry over | A handful of glyphs were renamed; verify visually. |
| `<CommandBar>` `LabelPosition` | unchanged | Behaviour parity. |

> `<MediaElement>` / `<CaptureElement>` element swaps live under [Controls](#controls) and [Camera Preview](#capture-preview) respectively — those anchors have the surrounding code-behind context.

### `x:Bind` and compiled bindings

`x:Bind` is supported in WinUI 3 with the same syntax. Compiled bindings against `Windows.UI.Xaml.*` types resolve to `Microsoft.UI.Xaml.*` automatically once the namespace rewrites land. If the build emits `XLS0414`/`MC3074` "type was not found", look for stale UWP namespace prefixes in the XAML.

### Page root element

WinUI 3 `Page` is still a valid root and is the right target for content navigated to via `Frame`. Keep `Page` as the root for any source `Page`. Only `MainPage` itself is replaced by `MainWindow` (see Shell Conversion in SKILL.md Step 3) — never wholesale convert a content `Page` into a `Window`.
