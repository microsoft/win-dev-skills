---
name: winui-uwp-migration
description: "Migrate UWP applications to WinUI 3 / Windows App SDK — namespace replacement (Windows.UI.Xaml → Microsoft.UI.Xaml), threading (CoreDispatcher → DispatcherQueue), windowing (Window.Current/ApplicationView/CoreWindow → AppWindow), dialogs (MessageDialog → ContentDialog with XamlRoot), pickers (InitializeWithWindow), GetForCurrentView replacements, resources (MRT → MRT Core), DirectWrite → DWriteCore, background tasks (BackgroundTaskBuilder), notifications, MediaElement → MediaPlayerElement, and test project migration. Use when converting UWP code, replacing legacy WinRT XAML APIs, or fixing build errors from UWP-to-WinUI 3 ports."
---

## Before You Start

1. **Check what's supported.** Some UWP features are not yet in WinUI 3 — confirm your app doesn't depend on any of them before committing to migration:
   - ❌ `CoreWindow` and related APIs (use `AppWindow` + HWND-based APIs instead)
   - ❌ `InkCanvas`
   - ❌ Virtual key support for gamepad input
   - ❌ Single-app kiosk
   - ❌ Xbox / HoloLens
   - ⚠️ `PrintManager` — Windows 11 only
   - ⚠️ Visual Studio XAML Designer — no design surface for WinUI projects
   See the official [What's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported) page before starting.

2. **Try the .NET Upgrade Assistant first (C# only).** Microsoft's [.NET Upgrade Assistant](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/upgrade-assistant) automates a large portion of UWP → WinAppSDK migration (namespace rewrites, project file conversion, manifest updates). Run it first, then use the steps below to fix what it doesn't handle.

3. **Plan for containerization loss.** UWP apps run in an AppContainer sandbox by default. WinAppSDK apps don't. If sandboxing matters, plan to adopt [Win32 App Isolation](https://learn.microsoft.com/windows/win32/secauthz/app-isolation-overview) after migrating.

## Migration Process

### Step 1: Audit the UWP Source

Inventory UWP-specific APIs that don't exist (or moved) in WinUI 3:

```powershell
Select-String -Path (Get-ChildItem -Recurse -Include *.cs,*.xaml | Where-Object { $_.FullName -notlike "*\obj\*" -and $_.FullName -notlike "*\bin\*" }) -Pattern "Windows\.UI\.Xaml|Windows\.UI\.Core|Windows\.UI\.Popups|Window\.Current|GetForCurrentView|CoreDispatcher|MessageDialog|IBackgroundTask|MediaElement|InkCanvas|WebAuthenticationBroker" | Select-Object Filename, LineNumber, Line
```

List: pickers, dialogs, windowing APIs, dispatcher usage, background tasks, `GetForCurrentView` callers, media controls, resources (`.resw` + MRT), test projects.

Also inspect the current UI shell and application architecture. Read `App.xaml`, the root page or window, navigation hosts, and view-model structure. Record whether the app uses `NavigationView`, `TabView`, `Frame` navigation, MVVM, or a custom shell; use that to select the closest WinUI template in Step 2.

### Step 2: Create a Fresh WinUI 3 Project and Align Namespaces

Prefer a fresh WinUI 3 project as the migration target instead of hand-converting the UWP `.csproj` and packaging files. Start from the template that best matches the UI and architecture found in Step 1:

| Existing UWP app | Command |
|------------------|---------|
| `NavigationView` shell | `dotnet new winui-navview -n <AppName>` |
| `TabView` shell | `dotnet new winui-tabview -n <AppName>` |
| Established MVVM structure | `dotnet new winui-mvvm -n <AppName>` |
| Other, custom, or simple shell | `dotnet new winui -n <AppName>` |

If these templates are unavailable, install or update them first:

```powershell
dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates
```

The templates create the supported single-project MSIX baseline, including the WinUI `.csproj`, Windows App SDK package references, package and app manifests, assets, publish profiles, and packaged `dotnet run` support. Keep that generated project and packaging configuration, then port code, XAML, and resources into it incrementally instead of copying the UWP project or manifest files over.

Set `<RootNamespace>` in `.csproj` to match the UWP namespace. Update `x:Class` in `App.xaml`, `MainWindow.xaml` and code-behind. Build before porting any code.

### Step 3: Replace Namespaces

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

### Step 4: Fix the Top 3 Copilot Mistakes

These dominate UWP-trained suggestions and break at runtime, not compile time.

**1. `ContentDialog` without `XamlRoot`**

```csharp
// ❌ Throws InvalidOperationException in WinUI 3
var dialog = new ContentDialog { Title = "Error", CloseButtonText = "OK" };
await dialog.ShowAsync();

// ✅ XamlRoot is required
var dialog = new ContentDialog
{
    Title = "Error",
    CloseButtonText = "OK",
    XamlRoot = this.Content.XamlRoot
};
await dialog.ShowAsync();
```

**2. `MessageDialog` does not exist in WinUI 3 desktop**

```csharp
// ❌ Windows.UI.Popups.MessageDialog — UWP only
var dlg = new MessageDialog("Are you sure?", "Confirm");
await dlg.ShowAsync();

// ✅ Use ContentDialog
var dlg = new ContentDialog
{
    Title = "Confirm",
    Content = "Are you sure?",
    PrimaryButtonText = "Yes",
    CloseButtonText = "No",
    XamlRoot = this.Content.XamlRoot
};
var result = await dlg.ShowAsync();
```

**3. `CoreDispatcher` does not exist — use `DispatcherQueue`**

```csharp
// ❌ UWP
await Dispatcher.RunAsync(CoreDispatcherPriority.Normal, () => StatusText.Text = "Done");

// ✅ WinUI 3
DispatcherQueue.TryEnqueue(() => StatusText.Text = "Done");
DispatcherQueue.TryEnqueue(DispatcherQueuePriority.High, () => ProgressBar.Value = 100);
```

Cache the queue off the UI thread via `DispatcherQueue.GetForCurrentThread()`. UWP's ASTA reentrancy protection is gone — watch for reentrancy in async code that pumps messages. See the official [threading guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/threading).

### Step 5: Replace Windowing

`Window.Current`, `ApplicationView`, and `CoreWindow` are gone. Track the main window yourself and use `Microsoft.UI.Windowing.AppWindow` for window operations. See the official [windowing guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/windowing).

```csharp
// ❌ UWP
var win = Window.Current;
ApplicationView.GetForCurrentView().TryResizeView(new Size(800, 600));

// ✅ WinUI 3 — expose MainWindow from App
public partial class App : Application
{
    public static Window MainWindow { get; private set; }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        MainWindow = new MainWindow();
        MainWindow.Activate();
    }
}

// Resize via AppWindow
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
var appWindow = AppWindow.GetFromWindowId(windowId);
appWindow.Resize(new SizeInt32(800, 600));
```

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

### Step 6: Replace `GetForCurrentView()`

None of the `GetForCurrentView()` patterns work in WinUI 3 desktop — there is no implicit per-view singleton.

| UWP API | WinUI 3 Replacement |
|---------|---------------------|
| `ApplicationView.GetForCurrentView()` | `AppWindow.GetFromWindowId(windowId)` |
| `UIViewSettings.GetForCurrentView()` | `AppWindow` properties (size, presenter) |
| `DisplayInformation.GetForCurrentView()` | `XamlRoot.RasterizationScale` or Win32 `GetDpiForWindow` |
| `CoreApplication.GetCurrentView()` | Track windows manually in `App` |
| `SystemNavigationManager.GetForCurrentView()` | Wire back handling in `NavigationView` / `BackRequested` directly |

### Step 7: Initialize Pickers and Win32 Surfaces With a Window Handle

UWP pickers infer the active window. WinUI 3 desktop pickers must be initialized explicitly or `ShowAsync` throws `COMException`.

```csharp
var picker = new FileOpenPicker();
picker.FileTypeFilter.Add(".txt");
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);
WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
var file = await picker.PickSingleFileAsync();
```

Apply the same `InitializeWithWindow.Initialize(obj, hwnd)` pattern to `FolderPicker`, `FileSavePicker`, `DataTransferManager` (Share), `PrintManager`, and other UI surfaces that target a window.

### Step 8: Replace Application Lifecycle and Activation

`OnLaunched`, `OnActivated`, `OnFileActivated`, etc. on `Application` are replaced by the unified `AppInstance` / `AppLifecycle` activation model. See the [app lifecycle guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/applifecycle).

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

Single-instancing is also handled here — call `AppInstance.FindOrRegisterForKey` + `Redirect` in `Program.Main`.

### Step 9: Replace Background Tasks

`IBackgroundTask` / `BackgroundTaskRegistration` are not the recommended model. Use the WinAppSDK [`BackgroundTaskBuilder`](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.windows.applicationmodel.background.backgroundtaskbuilder) (introduced in 1.7), or move the work to push-driven activation / Windows Task Scheduler. See the [background task migration strategy](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/background-task-migration-strategy).

### Step 10: Migrate Notifications

| UWP | WinUI 3 / WinAppSDK |
|-----|---------------------|
| `ToastNotificationManager` (Windows.UI.Notifications) | `AppNotificationManager` (Microsoft.Windows.AppNotifications) |
| WNS push via `PushNotificationChannelManager` | `PushNotificationManager` (Microsoft.Windows.PushNotifications) |

See the [toast notifications guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/toast-notifications) and [push notifications guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/notifications).

### Step 11: Migrate Resources (MRT → MRT Core)

UWP's full Resource Management System is replaced by the lighter **MRT Core**. `.resw` files and XAML localization with `x:Uid` are still supported. Preserve existing `x:Uid` values and their property-qualified `.resw` keys (for example, `SaveButton.Content`) whenever possible; `x:Uid` is preferred when XAML properties can be localized declaratively. Use `ResourceLoader` only when a resource must be retrieved in code. See the [MRT Core migration guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/mrtcore).

```csharp
// ❌ UWP
var loader = ResourceLoader.GetForCurrentView();
var s = loader.GetString("Greeting");

// ✅ WinAppSDK
var loader = new Microsoft.Windows.ApplicationModel.Resources.ResourceLoader();
var s = loader.GetString("Greeting");
```

### Step 12: Migrate Text Rendering (DirectWrite → DWriteCore)

If you do custom text rendering with DirectWrite, switch to **DWriteCore** — the WinAppSDK implementation. APIs are largely parallel; see the [DWriteCore migration guide](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/dwritecore).

### Step 13: Swap Replaced Controls and Features

| UWP | WinUI 3 / WinAppSDK |
|-----|---------------------|
| `MediaElement` | `MediaPlayerElement` (Microsoft.UI.Xaml.Controls) |
| `MediaPlayerElement` (Windows.UI.Xaml) | `MediaPlayerElement` (Microsoft.UI.Xaml.Controls) — namespace change only |
| `MapControl` (Windows.UI.Xaml.Controls.Maps) | `MapControl` (Microsoft.UI.Xaml.Controls) — WinAppSDK 1.5+ |
| `CameraCaptureUI` (Windows.Media.Capture) | `CameraCaptureUI` (Microsoft.Windows.Media.Capture) — WinAppSDK 1.7+ |
| `WebAuthenticationBroker` | `Microsoft.Security.Authentication.OAuth` — WinAppSDK 1.7+ |
| Background acrylic via `AcrylicBrush` BackgroundSource | `DesktopAcrylicController` (Microsoft.UI.Composition.SystemBackdrops) |
| `InkCanvas` | ❌ Not yet supported |

### Step 14: Storage and Settings

| Scenario | Packaged app | Unpackaged app |
|----------|--------------|----------------|
| Simple key/value settings | `ApplicationData.Current.LocalSettings` | JSON in `Environment.SpecialFolder.LocalApplicationData` |
| Local files | `ApplicationData.Current.LocalFolder` | `Environment.GetFolderPath(SpecialFolder.LocalApplicationData)` |
| Roaming settings | Deprecated — migrate to your own sync layer | N/A |

### Step 15: Migrate Test Projects

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

### Step 16: Project File Updates

- Target `net10.0-windows10.0.22621.0` (or current WinAppSDK-supported TFM).
- Add `<UseWinUI>true</UseWinUI>`.
- Add `<EnableMsixTooling>true</EnableMsixTooling>` for packaged builds.
- Reference `Microsoft.WindowsAppSDK` and `Microsoft.Windows.SDK.BuildTools`.
- Keep `Package.appxmanifest` for packaged scenarios; set `<WindowsPackageType>None</WindowsPackageType>` for unpackaged.

## Critical Rules

- ❌ NEVER call `Window.Current` — it returns `null` in WinUI 3 desktop and crashes.
- ❌ NEVER `await dialog.ShowAsync()` without setting `XamlRoot` first.
- ❌ NEVER use `Windows.UI.Popups.MessageDialog` — replace with `ContentDialog`.
- ❌ NEVER use `CoreDispatcher` / `Dispatcher.RunAsync` — use `DispatcherQueue.TryEnqueue`.
- ❌ NEVER call pickers, Share, or Print without `InitializeWithWindow.Initialize(obj, hwnd)`.
- ❌ NEVER rely on `GetForCurrentView()` — every replacement is window-scoped, not view-scoped.
- ❌ NEVER use `MediaElement` — use `MediaPlayerElement`.
- ❌ NEVER assume `InkCanvas`, gamepad VKs, or `CoreWindow` will compile — they're not supported.
- ✅ Always cache one `DispatcherQueue` per window; watch for reentrancy in async code that pumps messages.
- ✅ Always use `winapp run` to launch — never run the `.exe` directly.
- ✅ Break migration into file-level tasks — not one massive rewrite.
- ✅ Run the .NET Upgrade Assistant first on C# projects to skip the mechanical changes.

## Migration Checklist

1. [ ] Confirm no dependency on unsupported features (`InkCanvas`, `CoreWindow`, gamepad VKs, single-app kiosk, Xbox/HoloLens)
2. [ ] Run the .NET Upgrade Assistant (C# only)
3. [ ] Replace all `Windows.UI.Xaml.*` using directives with `Microsoft.UI.Xaml.*`
4. [ ] Replace `Windows.UI.Colors` / `Windows.UI.Text` / `Windows.UI.Composition` with `Microsoft.UI.*`
5. [ ] Replace `CoreDispatcher.RunAsync` with `DispatcherQueue.TryEnqueue`
6. [ ] Replace `Window.Current` with `App.MainWindow` static property
7. [ ] Add `XamlRoot` to every `ContentDialog` instance
8. [ ] Replace `MessageDialog` with `ContentDialog`
9. [ ] Initialize all pickers/Share/Print with `InitializeWithWindow.Initialize(obj, hwnd)`
10. [ ] Replace `ApplicationView` / `CoreWindow` usage with `AppWindow`
11. [ ] Replace `CoreApplicationViewTitleBar` with `AppWindowTitleBar`
12. [ ] Replace every `GetForCurrentView()` call with its `AppWindow` equivalent
13. [ ] Move activation handling to `AppInstance.GetActivatedEventArgs` (AppLifecycle)
14. [ ] Migrate background tasks to `BackgroundTaskBuilder` or push-driven activation
15. [ ] Migrate notifications to `AppNotificationManager` and `PushNotificationManager`
16. [ ] Migrate resources to MRT Core `ResourceLoader`
17. [ ] Migrate DirectWrite usage to DWriteCore
18. [ ] Swap `MediaElement` → `MediaPlayerElement`, update `MapControl` / `CameraCaptureUI` / OAuth references
19. [ ] Drop roaming settings; pick local or cloud storage
20. [ ] Update `.csproj` TFM and add `<UseWinUI>true</UseWinUI>`
21. [ ] Migrate unit tests to **Unit Test App (WinUI in Desktop)**; use `[UITestMethod]` for XAML tests
22. [ ] Test both packaged and unpackaged configurations
23. [ ] Consider [Win32 App Isolation](https://learn.microsoft.com/windows/win32/secauthz/app-isolation-overview) to restore sandboxing parity

## Post-Migration Validation

```powershell
# No legacy WinRT XAML / UWP-only APIs should remain
Select-String -Path (Get-ChildItem -Recurse -Include *.cs,*.xaml | Where-Object { $_.FullName -notlike "*\obj\*" -and $_.FullName -notlike "*\bin\*" }) -Pattern "Windows\.UI\.Xaml|Windows\.UI\.Popups\.MessageDialog|Window\.Current|CoreDispatcher|GetForCurrentView|IBackgroundTask|\bMediaElement\b"

# Verify packaging preserved for packaged builds
Test-Path "Package.appxmanifest"

# Build and run
.\BuildAndRun.ps1
```

## References

- [Migrate from UWP to the Windows App SDK — overview](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/migrate-to-windows-app-sdk-ovw)
- [What's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported)
- [Mapping UWP APIs and libraries to Windows App SDK](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table)
- [Feature area guides](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/feature-area-guides-ovw) — UI, windowing, app lifecycle, threading, notifications, MRT Core, DWriteCore, background tasks
- [.NET Upgrade Assistant for UWP](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/upgrade-assistant)
- Case studies: [PhotoLab (C#)](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/case-study-1), [Photo Editor (C++/WinRT)](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/case-study-2)
