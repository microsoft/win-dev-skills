---
name: winui3-platform
description: "Windows platform APIs for WinUI 3 — notifications (AppNotificationManager), background tasks (ExtendedExecutionSession), file handling (pickers, StorageFile, MRU), sensors (Geolocation, Bluetooth GATT, serial), media (MediaPlayerElement, MediaCapture), and native interop (HWND, CsWin32, P/Invoke, COM). Use when adding platform capabilities, calling Win32 APIs, or working with hardware."
---

### API Discovery

Before writing platform code, search [learn.microsoft.com/uwp/api/](https://learn.microsoft.com/uwp/api/) to find the right API. Two SDK surfaces exist:
- **`Windows.*`** — Platform SDK (sensors, Bluetooth, notifications basics)
- **`Microsoft.*`** — Windows App SDK (WinUI, AppNotification, AppLifecycle)

### Notifications

```csharp
// Build and show — no Register() needed for basic notifications
var builder = new AppNotificationBuilder()
    .AddText("Download Complete")
    .AddText("File saved to Downloads folder")
    .AddButton(new AppNotificationButton("Open")
        .AddArgument("action", "open"));
AppNotificationManager.Default.Show(builder.BuildNotification());
```

**To handle notification actions** (when the user clicks a button), call `Register()` in the App constructor. This requires COM server entries in `Package.appxmanifest`:

1. Add namespaces to the `<Package>` element:
```xml
xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
```

2. Add extensions inside `<Application>` (after `</uap:VisualElements>`):
```xml
<Extensions>
    <desktop:Extension Category="windows.toastNotificationActivation">
        <desktop:ToastNotificationActivation
            ToastActivatorCLSID="YOUR-GUID-HERE" />
    </desktop:Extension>
    <com:Extension Category="windows.comServer">
        <com:ComServer>
            <com:ExeServer Executable="YourApp.exe" DisplayName="YourApp"
                           Arguments="----AppNotificationActivated:">
                <com:Class Id="YOUR-GUID-HERE" />
            </com:ExeServer>
        </com:ComServer>
    </com:Extension>
</Extensions>
```

3. Register in App constructor:
```csharp
AppNotificationManager.Default.NotificationInvoked += OnNotificationInvoked;
AppNotificationManager.Default.Register();
```

Without the manifest entries, `Register()` crashes with `COMException: No COM servers are registered`.
- Requires package identity
- Check `AppNotificationManager.Default.Setting` before showing
- Use `Tag`/`Group` to replace existing notifications
- Call `Unregister()` on app exit
- Handle actions in `NotificationInvoked` — parse `Arguments`

### Background Tasks

Desktop apps are NOT suspended — timers continue running. Use the right tool:
- **Critical foreground work:** `ExtendedExecutionSession` with `Reason = Unspecified`
- **UI timers:** `DispatcherQueue.CreateTimer()` — fires on UI thread
- **Background timers:** `PeriodicTimer` — fires on thread pool
- **CPU-bound work:** `Task.Run(() => { /* heavy work */ })`
- **Startup task:** Register via `StartupTask.GetAsync("MyTaskId")`

❌ Never use `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` — deadlocks UI thread.

### File Handling

#### File Pickers (require HWND)
```csharp
var picker = new FileOpenPicker();
var hwnd = WindowNative.GetWindowHandle(window);
InitializeWithWindow.Initialize(picker, hwnd);
picker.FileTypeFilter.Add(".txt");
picker.FileTypeFilter.Add(".md");
var file = await picker.PickSingleFileAsync();
```
Always call `InitializeWithWindow` before any picker method — crashes without it.

#### File Access
- **Packaged apps:** Use `ApplicationData.Current.LocalFolder` for app data, `KnownFolders` for user directories (requires capabilities)
- **Unpackaged apps:** Use `System.IO` directly — `Environment.GetFolderPath()` for known paths
- **MRU:** `StorageApplicationPermissions.MostRecentlyUsedList` — add after successful file operations

### Sensors and Hardware

#### Geolocation
```csharp
var geolocator = new Geolocator { DesiredAccuracyInMeters = 10 };
var position = await geolocator.GetGeopositionAsync();
// position.Coordinate.Point.Position.Latitude / .Longitude
```
Requires `<DeviceCapability Name="location" />` in `Package.appxmanifest`.

#### Bluetooth LE / GATT
Use `BluetoothLEAdvertisementWatcher` to discover devices, `BluetoothLEDevice.FromBluetoothAddressAsync()` to connect, `GattDeviceService` / `GattCharacteristic` for GATT operations.

#### Serial (COM Ports)
Use `SerialDevice.GetDeviceSelector()` + `DeviceInformation.FindAllAsync()` to enumerate, `SerialDevice.FromIdAsync()` to open.

#### All Sensor Patterns
- Null-check `Sensor.GetDefault()` — not all devices have all sensors
- Set `ReportInterval` to control update frequency
- Subscribe to `ReadingChanged` (don't poll)
- Dispose devices / stop watchers on page leave
- Marshal UI updates via `DispatcherQueue.TryEnqueue()`

### Media

- **Video/audio playback:** `MediaPlayerElement` + `MediaPlayer`, built-in transport controls
- **Camera capture:** `MediaCapture` — requires `<DeviceCapability Name="webcam" />`
- **Audio recording:** `MediaCapture` with `AudioOnly` profile

### Native Interop

#### Get HWND
```csharp
var hwnd = WindowNative.GetWindowHandle(window);
```
Cache per window lifetime. Required for pickers, dialogs, and Win32 API calls.

#### CsWin32 (preferred over manual P/Invoke)
1. `dotnet add package Microsoft.Windows.CsWin32` (add `<PrivateAssets>all</PrivateAssets>`)
2. Create `NativeMethods.txt` listing function names
3. Call via `PInvoke.FunctionName()`

#### COM Interop
- Pickers: `IInitializeWithWindow`
- Share: `IDataTransferManagerInterop`
- Release COM refs with `Marshal.ReleaseComObject`
- Bridge HWND↔WinRT: `Win32Interop.GetWindowIdFromWindow()` → `AppWindow.GetFromWindowId()`

### References

| File | Read when... |
|------|-------------|
| `references/notification-patterns.md` | Implementing toast notifications, scheduled notifications, push, badges, action handling |
| `references/background-task-patterns.md` | Adding ExtendedExecution, timers, startup tasks, channels, progress reporting |
| `references/sensor-patterns.md` | Accessing geolocation, Bluetooth/GATT, serial ports, DeviceWatcher |
| `references/file-patterns.md` | Using file pickers, drag-drop, file watchers, MRU, packaged/unpackaged storage |
| `references/media-patterns.md` | Playing audio/video, playlists, MediaCapture, transport controls |
| `references/interop-patterns.md` | HWND retrieval, CsWin32, P/Invoke, COM interop, AppWindow bridging |