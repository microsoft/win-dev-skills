# Threading and Window Management Migration

Reference for migrating WPF Dispatcher and Window APIs to WinUI 3 equivalents.

## Dispatcher → DispatcherQueue

### API Mapping

| WPF | WinUI 3 |
|-----|---------|
| `Dispatcher.Invoke(Action)` | `DispatcherQueue.TryEnqueue(Action)` |
| `Dispatcher.BeginInvoke(Action)` | `DispatcherQueue.TryEnqueue(Action)` |
| `Dispatcher.Invoke(DispatcherPriority, Action)` | `DispatcherQueue.TryEnqueue(DispatcherQueuePriority, Action)` |
| `Dispatcher.CheckAccess()` | `DispatcherQueue.HasThreadAccess` |
| `Dispatcher.VerifyAccess()` | Check `DispatcherQueue.HasThreadAccess` (no exception-throwing method) |

### Priority Mapping

WinUI 3 has only 3 levels: `High`, `Normal`, `Low`.

| WPF `DispatcherPriority` | WinUI 3 `DispatcherQueuePriority` |
|-------------------------|----------------------------------|
| `Send` | `High` |
| `Normal` / `Input` / `Loaded` / `Render` / `DataBind` | `Normal` |
| `Background` / `ContextIdle` / `ApplicationIdle` / `SystemIdle` | `Low` |

### Pattern: Global DispatcherQueue Access

WPF provided `Application.Current.Dispatcher` globally. WinUI 3 requires explicit storage:

```csharp
public partial class App : Application
{
    private static DispatcherQueue _uiDispatcherQueue;

    public static DispatcherQueue UIDispatcherQueue => _uiDispatcherQueue;

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _uiDispatcherQueue = DispatcherQueue.GetForCurrentThread();
        // ...
    }
}
```

Usage with thread-check pattern:

```csharp
public void UpdateOnUIThread(Action action)
{
    var currentDispatcher = DispatcherQueue.GetForCurrentThread();
    if (currentDispatcher != null)
    {
        // Already on UI thread
        action();
    }
    else if (App.UIDispatcherQueue != null)
    {
        // Dispatch to UI thread
        App.UIDispatcherQueue.TryEnqueue(() => action());
    }
    else
    {
        // Fallback (e.g., no UI context available)
        action();
    }
}
```

### Pattern: DispatcherQueue in ViewModels

```csharp
public class MyViewModel
{
    private readonly DispatcherQueue _dispatcherQueue;

    public MyViewModel()
    {
        _dispatcherQueue = DispatcherQueue.GetForCurrentThread();
    }

    private void OnBackgroundWorkCompleted(string result)
    {
        _dispatcherQueue.TryEnqueue(() =>
        {
            StatusText = result;
            // other UI-bound property updates...
        });
    }
}
```

### Pattern: Async Dispatch (await)

```csharp
// WPF
await this.Dispatcher.InvokeAsync(() => { /* UI work */ });

// WinUI 3 (using TaskCompletionSource)
var tcs = new TaskCompletionSource();
this.DispatcherQueue.TryEnqueue(() =>
{
    try
    {
        /* UI work */
        tcs.SetResult();
    }
    catch (Exception ex)
    {
        tcs.SetException(ex);
    }
});
await tcs.Task;
```

---

## Window Management

### WPF Window vs WinUI 3 Window

| Feature | WPF `Window` | WinUI 3 `Window` |
|---------|-------------|------------------|
| Base class | `ContentControl` → `DependencyObject` | **NOT** a control, NOT a `DependencyObject` |
| `Resources` property | Yes | No — use root container's `Resources` |
| `DataContext` property | Yes | No — use root `Page`/`UserControl` |
| `VisualStateManager` | Yes | No — use inside child controls |
| `Loaded`/`Unloaded` events | Yes | No |
| `SizeToContent` | Yes (`Height`/`Width`/`WidthAndHeight`) | No — must implement manually |
| `WindowState` (min/max) | Yes | No — use `AppWindow.Presenter` |
| `WindowStyle` | Yes | No — use `AppWindow` title bar APIs |
| `ResizeMode` | Yes | No — use `AppWindow.Presenter` |
| `WindowStartupLocation` | Yes | No — calculate manually |
| `Icon` | `Window.Icon` | `AppWindow.SetIcon()` |
| `Title` | `Window.Title` | `AppWindow.Title` (or `Window.Title`) |
| Size (Width/Height) | Yes | No — use `AppWindow.Resize()` |
| Position (Left/Top) | Yes | No — use `AppWindow.Move()` |
| `IsDefault`/`IsCancel` buttons | Yes | No — handle Enter/Escape in code-behind |

### Getting AppWindow from Window

```csharp
using Microsoft.UI;
using Microsoft.UI.Windowing;
using WinRT.Interop;

IntPtr hwnd = WindowNative.GetWindowHandle(window);
WindowId windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
AppWindow appWindow = AppWindow.GetFromWindowId(windowId);
```

### Pattern: SizeToContent Replacement

WinUI 3 has no `SizeToContent`. Implement a manual equivalent:

```csharp
private void SizeToContent()
{
    if (Content is not FrameworkElement content)
        return;

    // Measure desired content size
    content.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
    var desiredHeight = content.DesiredSize.Height + WindowChromeHeight + Padding;

    // Account for DPI scaling
    var scaleFactor = Content.XamlRoot.RasterizationScale;
    var pixelHeight = (int)(desiredHeight * scaleFactor);
    var pixelWidth = (int)(DesiredWindowWidth * scaleFactor);

    // Resize via AppWindow
    var hwnd = WindowNative.GetWindowHandle(this);
    var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
    var appWindow = AppWindow.GetFromWindowId(windowId);
    appWindow.Resize(new Windows.Graphics.SizeInt32(pixelWidth, pixelHeight));
}
```

**Key details:**
- `WindowChromeHeight` ≈ 32px for the standard title bar
- Must multiply by `RasterizationScale` for DPI-aware sizing
- Call `SizeToContent()` after page navigation or content changes
- Unsubscribe previous event handlers before subscribing new ones to avoid memory leaks

### Window Positioning (Center Screen)

```csharp
var hwnd = WindowNative.GetWindowHandle(this);
var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
var appWindow = AppWindow.GetFromWindowId(windowId);

var displayArea = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Nearest);
var centerX = (displayArea.WorkArea.Width - appWindow.Size.Width) / 2;
var centerY = (displayArea.WorkArea.Height - appWindow.Size.Height) / 2;
appWindow.Move(new Windows.Graphics.PointInt32(centerX, centerY));
```

### Window State (Minimize/Maximize/Restore)

```csharp
var appWindow = AppWindow.GetFromWindowId(windowId);
(appWindow.Presenter as OverlappedPresenter)?.Maximize();
(appWindow.Presenter as OverlappedPresenter)?.Minimize();
(appWindow.Presenter as OverlappedPresenter)?.Restore();
```

### Disable Resizing

```csharp
var presenter = appWindow.Presenter as OverlappedPresenter;
if (presenter != null)
{
    presenter.IsResizable = false;
    presenter.IsMaximizable = false;
}
```

### Title Bar Customization

```csharp
// Extend content into title bar
this.ExtendsContentIntoTitleBar = true;
this.SetTitleBar(AppTitleBar); // AppTitleBar is a XAML element

// Or via AppWindow API
if (AppWindowTitleBar.IsCustomizationSupported())
{
    var titleBar = appWindow.TitleBar;
    titleBar.ExtendsContentIntoTitleBar = true;
    titleBar.ButtonBackgroundColor = Colors.Transparent;
    titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
}
```

### Tracking the Main Window

WinUI 3 has no `Application.Current.MainWindow`. Track it manually:

```csharp
public partial class App : Application
{
    public static Window MainWindow { get; private set; }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        MainWindow = new MainWindow();
        MainWindow.Activate();
    }
}
```

---

## HWND Interop

### ContentDialog Requires XamlRoot

```csharp
var dialog = new ContentDialog
{
    Title = "Confirm",
    Content = "Are you sure?",
    PrimaryButtonText = "Yes",
    CloseButtonText = "No",
    XamlRoot = this.Content.XamlRoot  // REQUIRED in WinUI 3
};
var result = await dialog.ShowAsync();
```

### File Pickers Require HWND Initialization

```csharp
var picker = new FileOpenPicker();
picker.FileTypeFilter.Add(".jpg");
picker.FileTypeFilter.Add(".png");

// REQUIRED for unpackaged desktop apps
var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

var file = await picker.PickSingleFileAsync();
```

This also applies to `FileSavePicker`, `FolderPicker`, and any other picker dialog.

### Window Close Handling

```csharp
// WPF
protected override void OnClosing(CancelEventArgs e)
{
    e.Cancel = true;
    this.Hide();
}

// WinUI 3
this.AppWindow.Closing += (sender, args) =>
{
    args.Cancel = true;
    this.AppWindow.Hide();
};
```

---

## Custom Entry Point (DISABLE_XAML_GENERATED_MAIN)

Use a custom `Program.cs` entry point when you need:
- CLI mode (process without showing UI)
- Custom initialization before the WinUI 3 App starts
- Single-instance enforcement

### Setup

In `.csproj`:
```xml
<DefineConstants>DISABLE_XAML_GENERATED_MAIN,TRACE</DefineConstants>
```

Create `Program.cs`:
```csharp
public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length > 0)
        {
            // CLI mode — no UI
            return RunCommandLine(args);
        }

        // GUI mode
        WinRT.ComWrappersSupport.InitializeComWrappers();
        Application.Start((p) =>
        {
            var context = new DispatcherQueueSynchronizationContext(
                DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            _ = new App();
        });
        return 0;
    }
}
```

### WPF App Constructor Removal

WPF apps often created `new App()` to initialize the WPF `Application` and access `Application.Current.Dispatcher`. This pattern is no longer needed — WinUI 3's `Application.Start()` handles initialization. Store `DispatcherQueue` explicitly instead (see Global DispatcherQueue Access above).
