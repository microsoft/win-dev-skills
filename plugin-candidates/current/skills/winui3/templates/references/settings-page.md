# Settings Page Implementation for WinUI 3

Complete XAML + C# implementation for a Settings page with theme switching, toggle preferences, and persistent storage.

---

## Step 1 — Add Required Packages

If using `SettingsExpander` / `SettingsCard` from the Community Toolkit (recommended):

```powershell
dotnet add package CommunityToolkit.Mvvm
dotnet add package CommunityToolkit.WinUI.Controls.SettingsControls
```

If building the settings layout manually, only the MVVM package is needed:

```powershell
dotnet add package CommunityToolkit.Mvvm
```

---

## Step 2 — Create the SettingsPage

### 2.1 XAML — `SettingsPage.xaml`

#### Option A: Using CommunityToolkit SettingsExpander (Recommended)

```xml
<Page
    x:Class="MyApp.Views.SettingsPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:controls="using:CommunityToolkit.WinUI.Controls"
    xmlns:vm="using:MyApp.ViewModels">

    <Page.DataContext>
        <vm:SettingsViewModel />
    </Page.DataContext>

    <ScrollViewer Padding="36,24" VerticalScrollBarVisibility="Auto">
        <StackPanel Spacing="4" MaxWidth="800"
                    HorizontalAlignment="Stretch">

            <!-- Appearance -->
            <TextBlock Text="Appearance" Style="{StaticResource BodyStrongTextBlockStyle}"
                       Margin="0,0,0,4" />

            <controls:SettingsCard Header="App theme"
                                   Description="Select which app theme to display"
                                   HeaderIcon="{ui:FontIcon Glyph=&#xE790;}">
                <ComboBox SelectedIndex="{x:Bind ViewModel.SelectedThemeIndex, Mode=TwoWay}"
                          MinWidth="150">
                    <ComboBoxItem Content="Light" />
                    <ComboBoxItem Content="Dark" />
                    <ComboBoxItem Content="Use system setting" />
                </ComboBox>
            </controls:SettingsCard>

            <!-- General Preferences -->
            <TextBlock Text="General" Style="{StaticResource BodyStrongTextBlockStyle}"
                       Margin="0,24,0,4" />

            <controls:SettingsExpander Header="Startup"
                                       Description="Configure startup behavior"
                                       HeaderIcon="{ui:FontIcon Glyph=&#xE7B5;}">
                <controls:SettingsExpander.Items>
                    <controls:SettingsCard Header="Run at startup">
                        <ToggleSwitch IsOn="{x:Bind ViewModel.RunAtStartup, Mode=TwoWay}" />
                    </controls:SettingsCard>
                    <controls:SettingsCard Header="Open last used file on launch">
                        <ToggleSwitch IsOn="{x:Bind ViewModel.OpenLastFile, Mode=TwoWay}" />
                    </controls:SettingsCard>
                </controls:SettingsExpander.Items>
            </controls:SettingsExpander>

            <controls:SettingsCard Header="Notifications"
                                   Description="Enable or disable app notifications"
                                   HeaderIcon="{ui:FontIcon Glyph=&#xEA8F;}">
                <ToggleSwitch IsOn="{x:Bind ViewModel.NotificationsEnabled, Mode=TwoWay}" />
            </controls:SettingsCard>

            <!-- About -->
            <TextBlock Text="About" Style="{StaticResource BodyStrongTextBlockStyle}"
                       Margin="0,24,0,4" />

            <controls:SettingsExpander Header="MyApp"
                                       Description="{x:Bind ViewModel.VersionDescription}">
                <controls:SettingsExpander.Items>
                    <controls:SettingsCard Header="Source code">
                        <HyperlinkButton Content="GitHub"
                                         NavigateUri="https://github.com/user/repo" />
                    </controls:SettingsCard>
                    <controls:SettingsCard Header="Privacy policy">
                        <HyperlinkButton Content="View"
                                         NavigateUri="https://example.com/privacy" />
                    </controls:SettingsCard>
                </controls:SettingsExpander.Items>
            </controls:SettingsExpander>

        </StackPanel>
    </ScrollViewer>
</Page>
```

#### Option B: Manual Layout (No Toolkit Controls)

```xml
<Page
    x:Class="MyApp.Views.SettingsPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:vm="using:MyApp.ViewModels">

    <Page.DataContext>
        <vm:SettingsViewModel />
    </Page.DataContext>

    <ScrollViewer Padding="36,24" VerticalScrollBarVisibility="Auto">
        <StackPanel Spacing="8" MaxWidth="800" HorizontalAlignment="Stretch">

            <!-- Appearance -->
            <TextBlock Text="Appearance" Style="{StaticResource SubtitleTextBlockStyle}" />
            <StackPanel Orientation="Horizontal" Spacing="12" Margin="0,8,0,0">
                <TextBlock Text="Theme" VerticalAlignment="Center" />
                <RadioButtons SelectedIndex="{x:Bind ViewModel.SelectedThemeIndex, Mode=TwoWay}">
                    <x:String>Light</x:String>
                    <x:String>Dark</x:String>
                    <x:String>System default</x:String>
                </RadioButtons>
            </StackPanel>

            <!-- General -->
            <TextBlock Text="General" Style="{StaticResource SubtitleTextBlockStyle}"
                       Margin="0,24,0,0" />
            <ToggleSwitch Header="Notifications"
                          IsOn="{x:Bind ViewModel.NotificationsEnabled, Mode=TwoWay}"
                          Margin="0,8,0,0" />
            <ToggleSwitch Header="Run at startup"
                          IsOn="{x:Bind ViewModel.RunAtStartup, Mode=TwoWay}" />

            <!-- About -->
            <TextBlock Text="About" Style="{StaticResource SubtitleTextBlockStyle}"
                       Margin="0,24,0,0" />
            <TextBlock Text="{x:Bind ViewModel.VersionDescription}"
                       Style="{StaticResource CaptionTextBlockStyle}"
                       IsTextSelectionEnabled="True" />
        </StackPanel>
    </ScrollViewer>
</Page>
```

### 2.2 Code-Behind — `SettingsPage.xaml.cs`

```csharp
using Microsoft.UI.Xaml.Controls;
using MyApp.ViewModels;

namespace MyApp.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = App.GetService<SettingsViewModel>();
        InitializeComponent();
        DataContext = ViewModel;
    }
}
```

> **Tip:** If the app does not use DI, instantiate the ViewModel directly: `ViewModel = new SettingsViewModel();`

---

## Step 3 — Create the SettingsViewModel

```csharp
using System.Reflection;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.UI.Xaml;
using Windows.Storage;

namespace MyApp.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ApplicationDataContainer _localSettings =
        ApplicationData.Current.LocalSettings;

    // ── Appearance ──────────────────────────────────────────────

    [ObservableProperty]
    private int _selectedThemeIndex;

    partial void OnSelectedThemeIndexChanged(int value)
    {
        SaveSetting(nameof(SelectedThemeIndex), value);
        ApplyTheme(value);
    }

    // ── General ─────────────────────────────────────────────────

    [ObservableProperty]
    private bool _notificationsEnabled;

    partial void OnNotificationsEnabledChanged(bool value)
        => SaveSetting(nameof(NotificationsEnabled), value);

    [ObservableProperty]
    private bool _runAtStartup;

    partial void OnRunAtStartupChanged(bool value)
        => SaveSetting(nameof(RunAtStartup), value);

    [ObservableProperty]
    private bool _openLastFile;

    partial void OnOpenLastFileChanged(bool value)
        => SaveSetting(nameof(OpenLastFile), value);

    // ── About ───────────────────────────────────────────────────

    public string VersionDescription { get; }

    // ── Constructor ─────────────────────────────────────────────

    public SettingsViewModel()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version!;
        VersionDescription = $"MyApp v{version.Major}.{version.Minor}.{version.Build}";

        // Load persisted settings — MUST happen before UI binds
        _selectedThemeIndex = LoadSetting(nameof(SelectedThemeIndex), 2); // default: system
        _notificationsEnabled = LoadSetting(nameof(NotificationsEnabled), true);
        _runAtStartup = LoadSetting(nameof(RunAtStartup), false);
        _openLastFile = LoadSetting(nameof(OpenLastFile), false);
    }

    // ── Persistence helpers ─────────────────────────────────────

    private void SaveSetting<T>(string key, T value)
        => _localSettings.Values[key] = value;

    private T LoadSetting<T>(string key, T fallback)
        => _localSettings.Values.TryGetValue(key, out var obj) && obj is T val
            ? val
            : fallback;

    // ── Theme ───────────────────────────────────────────────────

    private static void ApplyTheme(int index)
    {
        if (App.MainWindow?.Content is not FrameworkElement root) return;

        root.RequestedTheme = index switch
        {
            0 => ElementTheme.Light,
            1 => ElementTheme.Dark,
            _ => ElementTheme.Default,
        };
    }
}
```

### Unpackaged App — JSON Persistence Alternative

For unpackaged apps, `ApplicationData.Current` is not available. Use a JSON file instead:

```csharp
using System.IO;
using System.Text.Json;

namespace MyApp.Services;

public sealed class SettingsService
{
    private readonly string _filePath =
        Path.Combine(AppContext.BaseDirectory, "appsettings.json");

    private Dictionary<string, object?> _cache = new();

    public SettingsService()
    {
        if (File.Exists(_filePath))
        {
            var json = File.ReadAllText(_filePath);
            _cache = JsonSerializer.Deserialize<Dictionary<string, object?>>(json) ?? new();
        }
    }

    public T Get<T>(string key, T fallback)
    {
        if (_cache.TryGetValue(key, out var raw) && raw is JsonElement el)
        {
            try { return JsonSerializer.Deserialize<T>(el.GetRawText())!; }
            catch { return fallback; }
        }
        return fallback;
    }

    public void Set<T>(string key, T value)
    {
        _cache[key] = value;
        File.WriteAllText(_filePath, JsonSerializer.Serialize(_cache,
            new JsonSerializerOptions { WriteIndented = true }));
    }
}
```

---

## Step 4 — Wire Up Navigation

### 4.1 Add the Settings Item to `NavigationView`

`NavigationView` has a built-in settings item. Enable it with `IsSettingsVisible="True"` (this is the default).

### 4.2 Handle Navigation — `ShellPage.xaml.cs`

```csharp
private void NavigationView_SelectionChanged(
    NavigationView sender, NavigationViewSelectionChangedEventArgs args)
{
    if (args.IsSettingsSelected)
    {
        ContentFrame.Navigate(typeof(SettingsPage));
        return;
    }

    // ... handle other navigation items
}
```

### 4.3 Apply Theme on App Startup — `App.xaml.cs`

```csharp
public partial class App : Application
{
    public static Window MainWindow { get; private set; } = null!;

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        MainWindow = new MainWindow();
        MainWindow.Activate();

        // Restore persisted theme
        var settings = ApplicationData.Current.LocalSettings;
        if (settings.Values.TryGetValue("SelectedThemeIndex", out var idx) && idx is int i)
        {
            if (MainWindow.Content is FrameworkElement root)
            {
                root.RequestedTheme = i switch
                {
                    0 => ElementTheme.Light,
                    1 => ElementTheme.Dark,
                    _ => ElementTheme.Default,
                };
            }
        }
    }
}
```

---

## Anti-patterns

❌ **Not persisting on every change** — waiting for a "Save" button click loses settings if the app crashes or the user closes without saving. Persist immediately in every `On<Property>Changed` handler.

❌ **Not loading settings before binding** — if you load settings *after* `InitializeComponent()`, the UI shows default values and then flickers. Assign backing fields (`_field`) in the constructor *before* raising `PropertyChanged`.

❌ **Setting `RequestedTheme` on `Window`** — `Window` does not have a `RequestedTheme` property. Set it on the root `FrameworkElement` (`Content`).

❌ **Using `App.Current.RequestedTheme` at runtime** — `Application.RequestedTheme` can only be set *before* any UI is created. Use `FrameworkElement.RequestedTheme` on the root element for runtime theme changes.

❌ **Storing complex objects in `LocalSettings`** — `ApplicationDataContainer` only supports simple types (`int`, `bool`, `string`, `double`, etc.). Serialize complex data to JSON and store as a `string`.

---

## Verification Checklist

- [ ] Settings page is reachable from `NavigationView` settings gear icon
- [ ] Theme changes apply instantly without app restart
- [ ] All toggle and selection changes persist across app restarts
- [ ] Settings load their saved values when the page is revisited (no flicker to defaults)
- [ ] The About section shows the correct app version
- [ ] Unpackaged apps use JSON file instead of `ApplicationData`

---

## Must Read & Research

| # | Reference | When to consult |
|---|-----------|-----------------|
| 1 | [NavigationView — Settings item](https://learn.microsoft.com/windows/apps/design/controls/navigationview#pane-footer) | Wiring up the settings gear |
| 2 | [SettingsCard / SettingsExpander](https://learn.microsoft.com/dotnet/communitytoolkit/windows/settingscontrols/settingscard) | Using toolkit settings controls |
| 3 | [ApplicationData.LocalSettings](https://learn.microsoft.com/windows/apps/design/app-settings/store-and-retrieve-app-data#local-app-data) | Persisting settings in packaged apps |
| 4 | [CommunityToolkit.Mvvm source generators](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/generators/overview) | `[ObservableProperty]` and `[RelayCommand]` |
| 5 | [Theme switching in WinUI 3](https://learn.microsoft.com/windows/apps/design/style/xaml-theme-resources) | Understanding `ElementTheme` and theme resources |