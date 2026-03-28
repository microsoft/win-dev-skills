# Windowing Patterns — Detailed Reference

Detailed code patterns for WinUI 3 windowing. See [SKILL.md](../SKILL.md) for rules summary.

---

## Getting AppWindow from a WinUI Window

Use the interop pattern to obtain the `AppWindow` backing a WinUI `Window`:

```csharp
using Microsoft.UI.Windowing;
using WinRT.Interop;

public static AppWindow GetAppWindow(Window window)
{
    var hwnd = WindowNative.GetWindowHandle(window);
    var windowId = Win32Interop.GetWindowIdFromWindow(hwnd);
    return AppWindow.GetFromWindowId(windowId);
}
```

Every `Window` has exactly one backing `AppWindow`. Cache the `AppWindow` reference per window — do not look it up repeatedly in hot paths.

---

## Creating Additional Windows

Create secondary windows by instantiating a new `Window` and activating it. Use `AppWindow.TryCreateAsync` only for headless/owned windows without XAML content:

```csharp
public Window CreateSecondaryWindow()
{
    var newWindow = new Window();
    newWindow.Content = new SecondaryPage();
    newWindow.Title = "Detail View";
    newWindow.Activate();

    TrackWindow(newWindow);
    return newWindow;
}
```

---

## Window Service Pattern for Multi-Window Management

Track all active windows in a centralized service to avoid lost references and enable cross-window communication:

```csharp
public sealed class WindowService
{
    private readonly Dictionary<WindowId, Window> _windows = new();

    public void TrackWindow(Window window)
    {
        var appWindow = GetAppWindow(window);
        _windows[appWindow.Id] = window;

        appWindow.Destroying += (s, _) =>
        {
            _windows.Remove(s.Id);
        };
    }

    public Window? GetWindow(WindowId id) =>
        _windows.TryGetValue(id, out var w) ? w : null;

    public IReadOnlyCollection<Window> ActiveWindows => _windows.Values;
}
```

Register `WindowService` as a singleton in your DI container. Never store `Window` references in static fields without cleanup.

---

## Presenter Types

Switch window chrome and behavior using presenters:

```csharp
var appWindow = GetAppWindow(window);

// Default overlapped (standard chrome with configurable buttons)
var overlapped = OverlappedPresenter.Create();
overlapped.IsResizable = true;
overlapped.IsMinimizable = true;
overlapped.IsMaximizable = false; // disable maximize
appWindow.SetPresenter(overlapped);

// Full screen
appWindow.SetPresenter(AppWindowPresenterKind.FullScreen);

// Compact overlay (picture-in-picture, always on top)
appWindow.SetPresenter(AppWindowPresenterKind.CompactOverlay);

// Restore to default
appWindow.SetPresenter(AppWindowPresenterKind.Default);
```

Always provide a user-accessible way to exit `FullScreen` and `CompactOverlay` presenters.

---

## DPI-Aware Window Sizing

`Resize()` and `Move()` use physical pixels (device units), not effective/logical pixels. Always account for DPI:

```csharp
public static void SetWindowSizeInDips(Window window, int widthDips, int heightDips)
{
    var appWindow = GetAppWindow(window);
    var hwnd = WindowNative.GetWindowHandle(window);
    var dpi = PInvoke.GetDpiForWindow(new HWND(hwnd));
    var scale = dpi / 96.0;

    appWindow.Resize(new SizeInt32(
        (int)(widthDips * scale),
        (int)(heightDips * scale)));
}
```

---

## Window Positioning with DisplayArea

Use `DisplayArea` to get monitor information for safe positioning:

```csharp
public static void CenterOnDisplay(Window window)
{
    var appWindow = GetAppWindow(window);
    var displayArea = DisplayArea.GetFromWindowId(appWindow.Id, DisplayAreaFallback.Primary);
    var workArea = displayArea.WorkArea;

    var x = (workArea.Width - appWindow.Size.Width) / 2 + workArea.X;
    var y = (workArea.Height - appWindow.Size.Height) / 2 + workArea.Y;

    appWindow.Move(new PointInt32(x, y));
}
```

---

## Custom Title Bar with TitleBar Control

Prefer the built-in `TitleBar` control from WinUI (`Microsoft.UI.Xaml.Controls.TitleBar`) over manual `ExtendsContentIntoTitleBar` + `SetTitleBar()`. The `TitleBar` control handles drag regions, caption buttons, theming, and Snap Layouts automatically:

```xml
<Window x:Class="MyApp.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
        </Grid.RowDefinitions>

        <TitleBar x:Name="AppTitleBar"
                  Title="My App"
                  Subtitle="Preview"
                  IsBackButtonVisible="True"
                  BackRequested="AppTitleBar_BackRequested">
            <TitleBar.IconSource>
                <ImageIconSource ImageSource="ms-appx:///Assets/AppIcon.png" />
            </TitleBar.IconSource>
            <TitleBar.Content>
                <AutoSuggestBox PlaceholderText="Search" Width="240" />
            </TitleBar.Content>
            <TitleBar.Footer>
                <PersonPicture Width="28" Height="28" />
            </TitleBar.Footer>
        </TitleBar>

        <Frame Grid.Row="1" x:Name="ContentFrame" />
    </Grid>
</Window>
```

Then set it as the window title bar in code-behind:

```csharp
ExtendsContentIntoTitleBar = true;
SetTitleBar(AppTitleBar);
```

The `TitleBar` control provides `Title`, `Subtitle`, `IconSource`, `Content` (center), `Footer` (right), and built-in back button support — eliminating the need for manual `InputNonClientPointerSource` hit-test overrides.

**Fallback: Manual title bar** — only use if you need full custom layout beyond what the `TitleBar` control offers:

```csharp
ExtendsContentIntoTitleBar = true;
SetTitleBar(CustomDragRegion); // any UIElement as drag region
```

Customize caption button colors via `AppWindowTitleBar`:

```csharp
var titleBar = appWindow.TitleBar;
titleBar.ButtonBackgroundColor = Colors.Transparent;
titleBar.ButtonForegroundColor = Colors.White;
titleBar.ButtonHoverBackgroundColor = Color.FromArgb(30, 255, 255, 255);
titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
```

---

## Window Events

Handle window lifecycle events on `AppWindow`:

```csharp
var appWindow = GetAppWindow(window);

appWindow.Closing += (s, args) =>
{
    if (HasUnsavedChanges)
    {
        args.Cancel = true;
        _ = PromptSaveAsync(); // show save dialog, then close if confirmed
    }
};

appWindow.Changed += (s, args) =>
{
    if (args.DidSizeChange)   { /* handle resize */ }
    if (args.DidPositionChange) { /* handle move */ }
    if (args.DidPresenterChange) { /* presenter switched */ }
};

appWindow.Destroying += (s, _) =>
{
    // Final cleanup — unregister events, release resources
    UnregisterAllHandlers(s);
};
```

---

## Modal Dialogs per Window

Each window has its own XAML tree. A `ContentDialog` must target the correct `XamlRoot`:

```csharp
public static async Task<ContentDialogResult> ShowDialogOnWindow(
    Window targetWindow, string title, string message)
{
    var dialog = new ContentDialog
    {
        Title = title,
        Content = message,
        PrimaryButtonText = "OK",
        CloseButtonText = "Cancel",
        XamlRoot = targetWindow.Content.XamlRoot // critical for multi-window
    };
    return await dialog.ShowAsync();
}
```

Never rely on a global or static `XamlRoot`. Always obtain it from the target window's content tree.

---

## Cross-Window Communication

Use events or a messaging service — never static mutable state:

```csharp
public sealed class WindowMessenger
{
    public event Action<string, object?>? MessageReceived;

    public void Send(string channel, object? payload) =>
        MessageReceived?.Invoke(channel, payload);
}

// Register as singleton; each window subscribes to channels it cares about.
```
