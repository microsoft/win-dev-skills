# UWP → WinUI 3 Replacement Patterns

Reference for API replacements and patterns that the `Initialize-UwpMigration.ps1` bootstrap doesn't (and can't) handle automatically — the script only does the bulk `Windows.UI.Xaml → Microsoft.UI.Xaml` namespace rewrite. Everything below requires code-level adaptation: dialog shape changes, threading model, windowing, lifecycle, resources, controls, and storage. Use this file when fixing build errors or runtime issues during Step 4.

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

`<CaptureElement>` is listed under [Unsupported on WinUI 3 Desktop](#unsupported-on-winui-3-desktop-no-migration-path). The file using it should be marked `Triage label = defer` in `MIGRATION-MAPPING.md` and entered in `MIGRATION-DEFERRED.md`. Do **not** try to fake it with a placeholder XAML element — the build will fail and there is no compatible replacement (`MediaPlayerElement` covers playback only, not the live camera preview API surface).

## Unsupported on WinUI 3 Desktop (no migration path)

Code touching these APIs has no WinUI 3 desktop equivalent. The corresponding files in `MIGRATION-MAPPING.md` get `Triage label = defer`; cite the specific API in `MIGRATION-DEFERRED.md`.

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

Validator catches this race with a 10s smoke launch after the build healthcheck passes — see `Validate-UwpMigration.ps1` Section 7.

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

None of the `GetForCurrentView()` patterns work in WinUI 3 desktop — there is no implicit per-view singleton.

| UWP API | WinUI 3 Replacement |
|---------|---------------------|
| `ApplicationView.GetForCurrentView()` | `AppWindow.GetFromWindowId(windowId)` |
| `UIViewSettings.GetForCurrentView()` | `AppWindow` properties (size, presenter) |
| `DisplayInformation.GetForCurrentView()` | `XamlRoot.RasterizationScale` or Win32 `GetDpiForWindow` |
| `CoreApplication.GetCurrentView()` | Track windows manually in `App` |
| `SystemNavigationManager.GetForCurrentView()` | Wire back handling in `NavigationView` / `BackRequested` directly |

<a id="pickers"></a>
## Pickers and Win32 Surfaces

UWP pickers infer the active window. WinUI 3 desktop pickers must be initialized explicitly or `ShowAsync` throws `COMException`.

```csharp
var picker = new FileOpenPicker();
picker.FileTypeFilter.Add(".txt");
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
var file = await picker.PickSingleFileAsync();
```

Apply the same `InitializeWithWindow.Initialize(obj, hwnd)` pattern to `FolderPicker`, `FileSavePicker`, `DataTransferManager` (Share), `PrintManager`, and other UI surfaces that target a window.

<a id="startup-crashes"></a>
## Diagnosing Startup Crashes

A packaged WinUI 3 app can build cleanly and still crash the instant it launches — `winapp run` returns no usable window and the process is gone. The build log and the analyzer cannot see this; only a real launch does. The **wrong** way to chase it is to sprinkle `File.WriteAllText` traces through `Program.cs` / `App.xaml.cs` and re-run repeatedly — that burns time and usually misses the real frame (the crash often happens in native activation, before your managed `Main` even runs).

**Capture the real exception first.** Either run the launch-and-diagnose helper:

```powershell
& "<skill-root>/scripts/Test-AppLaunch.ps1" -Target "<winui3-project-root>"
```

…or read the Windows **Application** event log directly for the two events the crash writes:

```powershell
Get-WinEvent -LogName Application -MaxEvents 40 |
  Where-Object { $_.Id -in 1000,1026 -and $_.TimeCreated -gt (Get-Date).AddMinutes(-3) } |
  ForEach-Object { "`n=== Event $($_.Id) @ $($_.TimeCreated) ==="; $_.Message }
```

- **Event 1000** — faulting module + native **Exception code** (e.g. `0x8001010E`).
- **Event 1026** — *.NET Runtime*: the managed **exception type, message, and stack**. This is the one that names the actual throwing frame. Read it before changing any code.

**Known native codes and what they usually mean** (the code names the error *class*; the real fix is whatever the captured stack points at):

| Exception code | Meaning | Usual migration cause → where to look |
|---|---|---|
| `0x80004003` | `E_POINTER` | Static-window **init-order race** — a `Page` read `App.MainWindow` (or another static window reference) before `OnLaunched` assigned it. Keep `MainWindow`'s constructor inert and navigate after `Activate`. See [Initialization order](#windowing). |
| `0x8001010E` | `RPC_E_WRONG_THREAD` | A **thread/apartment-affined object** was accessed during startup — commonly a view- or `CoreWindow`-affined UWP API touched from a `static` initializer, a type constructor, or off the UI thread. Construct/access it on the UI thread *after* `Activate`. If the API has no WinUI 3 desktop equivalent, defer it. |
| `0xE0434352` | Managed CLR exception | Read the **.NET exception type** in event 1026. `TypeLoadException` / `FileNotFoundException` almost always means a missing or version-incompatible package reference, not your code. |
| `0xC000027B` | Native stowed exception | Often a legacy projection/activation incompatibility for an API used at startup. If the API/contract is unsupported on the current OS, defer it. |

> Do **not** assume the entry point is the problem. A custom `Program.Main` for WinUI 3 **correctly** carries `[STAThread]` + `ComWrappersSupport.InitializeComWrappers()` + the `DispatcherQueueSynchronizationContext` setup — this matches the SDK's auto-generated `Main`. `[STAThread]` is **required**, not a bug. If you have a hand-written entry point and don't need single-instancing/redirection, the simplest path is to delete it and let the SDK generate `Main`.

The Step 4 validator runs this same check (`Validate-UwpMigration.ps1` Section 7) and **fails** when the app registers but dies at startup, surfacing the captured signature in `.validator-diagnostics.txt`.

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

<a id="background-tasks"></a>
## Background Tasks

`IBackgroundTask` / `BackgroundTaskRegistration` are not the recommended model. Use the WinAppSDK [`BackgroundTaskBuilder`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.windows.applicationmodel.background.backgroundtaskbuilder) (introduced in 1.7), or move the work to push-driven activation / Windows Task Scheduler. See the [background task migration strategy](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/background-task-migration-strategy).

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
| `MapControl` (Windows.UI.Xaml.Controls.Maps) | `MapControl` (Microsoft.UI.Xaml.Controls) — WinAppSDK 1.5+ |
| `CameraCaptureUI` (Windows.Media.Capture) | `CameraCaptureUI` (Microsoft.Windows.Media.Capture) — WinAppSDK 1.7+ |
| `WebAuthenticationBroker` | `Microsoft.Security.Authentication.OAuth` — WinAppSDK 1.7+ |
| Background acrylic via `AcrylicBrush` BackgroundSource | `DesktopAcrylicController` (Microsoft.UI.Composition.SystemBackdrops) |
| `InkCanvas` | Not yet supported |

<a id="storage"></a>
## Storage and Settings

| Scenario | Packaged app | Unpackaged app |
|----------|--------------|----------------|
| Simple key/value settings | `ApplicationData.Current.LocalSettings` | JSON in `Environment.SpecialFolder.LocalApplicationData` |
| Local files | `ApplicationData.Current.LocalFolder` | `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` |
| Roaming settings | Deprecated — migrate to your own sync layer | N/A |

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

`Initialize-UwpMigration.ps1` preserves the UWP `.csproj` at `<Target>/.uwp-source/` and leaves the WinUI 3 scaffold's `.csproj` intact. Open both side-by-side and merge:

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

### WUI analyzer warnings (UWP API residue)

The benchmark's `winapp build` injects the `Microsoft.WindowsAppSDK.Analyzers` package, which flags UWP-only APIs that compile cleanly under WinUI 3 but throw `COMException` at runtime — typically inside `Microsoft.UI.Xaml.Application.Start(...)` before any window can render. The runner sees this as `builds=true, runs=false`, and `Validate-UwpMigration.ps1` will FAIL the build healthcheck for each unique warning.

| Rule | Symptom | Fix |
| --- | --- | --- |
| `WUI0002` | `Window.Current does not exist in WinUI 3 desktop apps` | Store the `Window` reference in `App.xaml.cs` (`App.Window`) and pass it where needed; see "Windowing" above. |
| `WUI0003` | `CoreDispatcher is UWP-only` | Use `DispatcherQueue.GetForCurrentThread()` and `TryEnqueue(...)`; see "Threading" above. |
| `WUI0004` | `SystemNavigationManager.GetForCurrentView() is UWP-only` | Drop the system back button hookup, or use HWND-based COM interop; see "GetForCurrentView Replacements" above. |

Treat every `warning WUI000\d` line in the build output as a defect — the analyzer does not produce false positives. Search for the API name in this document for the recommended replacement.

### Bootstrap-neutralized helper classes (filter-prone)

Some SDK Samples ship a shared `Common\NavigationHelper.cs` containing a `RootFrameNavigationHelper` class that wires ALT+Left / BrowserBack (virtual key 166) / mouse XButton1+XButton2 to frame back/forward navigation. Its WinUI 3 equivalent requires `Microsoft.UI.Input.InputKeyboardSource.GetKeyState` or P/Invoke `GetAsyncKeyState` plus virtual-key code constants — exactly the shape the model provider's content-safety filter classifies as "keylogger / surveillance" code. Migrating it routinely produces `CAPIError: 400 Output blocked by content filtering policy`.

`Initialize-UwpMigration.ps1` handles this automatically: before the agent ever sees the file, the bootstrap rewrites just the `RootFrameNavigationHelper` class body to a no-op stub (preserving the public ctor with `params object[] args` so callers compile no matter what signature they invoke). The audit log records `NEUTRALIZED  class RootFrameNavigationHelper`. The mapping row's Notes column is prefixed with `NEUTRALIZED:`.

**You don't need to migrate the neutralized class.** Just leave both it and the call site (typically `new RootFrameNavigationHelper(rootFrame)` in `App.xaml.cs`'s `OnLaunched`) untouched — back-nav is not a demonstrated feature of any UWP SDK sample. The remainder of `NavigationHelper.cs` (the `NavigationHelper` class used for per-page state save/restore, the LoadStateEventArgs / SaveStateEventArgs types) is migrated normally; it does not trigger the filter.

If you really want ALT+Left back-nav, add a single declarative XAML element to the AppBarButton that triggers GoBack:

```xml
<AppBarButton Icon="Back" Click="OnBackClick">
  <AppBarButton.KeyboardAccelerators>
    <KeyboardAccelerator Key="Left" Modifiers="Menu"/>
  </AppBarButton.KeyboardAccelerators>
</AppBarButton>
```

`KeyboardAccelerator` is declarative and does not trip the filter.

<a id="xaml"></a>
## XAML Migration

XAML migration is mostly **mechanical transformation of existing files**, not re-authoring. Copy each `*.xaml` from the source verbatim, then apply the rewrites below. Do not regenerate a page from scratch — controls, names, and event handlers must be preserved so the code-behind continues to compile.

### xmlns root rewrites

UWP `Page`/`UserControl` root elements use these xmlns declarations as-is in WinUI 3 (the schema URL stayed the same), but any `using:Windows.UI.Xaml.*` references must be rewritten:

UWP `Page`:

```xml
<Page xmlns:controls="using:Windows.UI.Xaml.Controls" ...>
```

WinUI 3 `Page`:

```xml
<Page xmlns:controls="using:Microsoft.UI.Xaml.Controls" ...>
```

`Initialize-UwpMigration.ps1` rewrites both the C# `using` directives and the XAML `xmlns:` clauses (it operates on `.cs` and `.xaml` files indiscriminately). If you ever hand-edit or hand-copy a file post-bootstrap, double-check with `grep -nE "using:Windows\.UI\.Xaml" --glob "*.xaml"` — the validator's Section 1 residue grep will catch it but the build will often not.

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
| `<MediaElement … />` | `<MediaPlayerElement … />` | Source and transport-control properties carry over with minor renames. |
| `<InkCanvas … />` | _(none — defer)_ | Not supported. |
| `<Pivot>` / `<PivotItem>` | `<TabView>` / `<TabViewItem>`, or `<controls:Pivot>` from `CommunityToolkit.WinUI.UI.Controls` | Pick based on the source's intent (top-tab vs swipe pivot). |
| `<Hub>` / `<HubSection>` | Hand-rolled `<NavigationView>` with section grouping, or `<ScrollViewer>` with stacked sections. | No drop-in equivalent. |
| `<AppBarButton Icon="…">` system icons | Most identifiers carry over | A handful of glyphs were renamed; verify visually. |
| `<CommandBar>` `LabelPosition` | unchanged | Behaviour parity. |

### `x:Bind` and compiled bindings

`x:Bind` is supported in WinUI 3 with the same syntax. Compiled bindings against `Windows.UI.Xaml.*` types resolve to `Microsoft.UI.Xaml.*` automatically once the namespace rewrites land. If the build emits `XLS0414`/`MC3074` "type was not found", look for stale UWP namespace prefixes in the XAML.

### Page root element

WinUI 3 `Page` is still a valid root and is the right target for content navigated to via `Frame`. Keep `Page` as the root for any source `Page`. Only `MainPage` itself is replaced by `MainWindow` (see Shell Conversion in SKILL.md Step 3) — never wholesale convert a content `Page` into a `Window`.

### XAML namespace mapping (recap)

`Windows.UI.Xaml.*` → `Microsoft.UI.Xaml.*` for every namespace, both in `using:` xmlns clauses in XAML and in `using` directives in `.cs` files. See the [Namespace Mapping](#namespace-mapping) table at the top of this file.
