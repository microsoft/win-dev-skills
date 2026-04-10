---
name: winui3-template-summary
description: 'Complete source listing of the WinUI 3 MVVM project template files. Read this INSTEAD of reading individual project files — it contains all template content in one place.'
---

# Project Template Reference

This skill contains the complete source of every file in the `dotnet new winui-mvvm` template. **Read this skill INSTEAD of opening individual project files** — everything is here.

After reading this, you know the full project structure. Go straight to creating your new files and editing MainPage.xaml / MainPage.xaml.cs. Do NOT re-read files you've already seen here.

---

### PROJECT FILE (.csproj)
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows10.0.26100.0</TargetFramework>
    <TargetPlatformMinVersion>10.0.17763.0</TargetPlatformMinVersion>
    <RootNamespace>PROJECT_NAMESPACE</RootNamespace>
    <ApplicationManifest>app.manifest</ApplicationManifest>
    <Platforms>x86;x64;ARM64</Platforms>
    <RuntimeIdentifiers>win-x86;win-x64;win-arm64</RuntimeIdentifiers>
    <PublishProfile>win-$(Platform).pubxml</PublishProfile>
    <UseWinUI>true</UseWinUI>
    <WinUISDKReferences>false</WinUISDKReferences>
    <EnableMsixTooling>true</EnableMsixTooling>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Windows.SDK.BuildTools" Version="10.0.28000.1721" />
    <PackageReference Include="Microsoft.WindowsAppSDK" Version="1.8.260317003" />
    <PackageReference Include="CommunityToolkit.Mvvm" Version="8.4.2" />
  </ItemGroup>
</Project>
```

### App.xaml
```xml
<?xml version="1.0" encoding="utf-8" ?>
<Application
    x:Class="PROJECT_NAMESPACE.App"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:local="using:PROJECT_NAMESPACE">
    <Application.Resources>
        <ResourceDictionary>
            <ResourceDictionary.MergedDictionaries>
                <XamlControlsResources xmlns="using:Microsoft.UI.Xaml.Controls" />
            </ResourceDictionary.MergedDictionaries>
        </ResourceDictionary>
    </Application.Resources>
</Application>
```

### App.xaml.cs
```csharp
using Microsoft.UI.Xaml;

namespace PROJECT_NAMESPACE;

public partial class App : Application
{
    /// <summary>Static window reference. Use App.Window from anywhere.</summary>
    public static Window Window { get; private set; } = null!;

    /// <summary>UI thread dispatcher. Fully qualified to avoid CS0104.</summary>
    public static Microsoft.UI.Dispatching.DispatcherQueue DispatcherQueue { get; private set; } = null!;

    /// <summary>Native HWND for file pickers and interop.</summary>
    public static nint WindowHandle =>
        WinRT.Interop.WindowNative.GetWindowHandle(Window);

    public App() { InitializeComponent(); }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        Window = new MainWindow();
        DispatcherQueue = Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
        Window.Activate();
    }
}
```

### MainWindow.xaml
```xml
<?xml version="1.0" encoding="utf-8" ?>
<Window
    x:Class="PROJECT_NAMESPACE.MainWindow"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:local="using:PROJECT_NAMESPACE"
    Title="APP_TITLE">
    <Window.SystemBackdrop>
        <MicaBackdrop />
    </Window.SystemBackdrop>

    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
        </Grid.RowDefinitions>

        <TitleBar x:Name="AppTitleBar" Title="APP_TITLE">
            <TitleBar.IconSource>
                <ImageIconSource ImageSource="Assets/AppIcon.ico" />
            </TitleBar.IconSource>
        </TitleBar>

        <!-- Frame hosts pages. Add UI to MainPage.xaml, not here. -->
        <Frame x:Name="RootFrame" Grid.Row="1" />
    </Grid>
</Window>
```

### MainWindow.xaml.cs
```csharp
using Microsoft.UI.Xaml;

namespace PROJECT_NAMESPACE;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);
        AppWindow.SetIcon("Assets/AppIcon.ico");
        RootFrame.Navigate(typeof(MainPage));
    }
}
```

### MainPage.xaml
```xml
<?xml version="1.0" encoding="utf-8" ?>
<Page
    x:Class="PROJECT_NAMESPACE.MainPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:local="using:PROJECT_NAMESPACE">

    <!-- REPLACE this content with your app UI -->
    <StackPanel HorizontalAlignment="Center" VerticalAlignment="Center" Spacing="16">
        <TextBlock Text="{x:Bind ViewModel.Greeting, Mode=OneWay}"
                   Style="{StaticResource TitleTextBlockStyle}" />
    </StackPanel>
</Page>
```

### MainPage.xaml.cs
```csharp
using Microsoft.UI.Xaml.Controls;
using PROJECT_NAMESPACE.ViewModels;

namespace PROJECT_NAMESPACE;

public sealed partial class MainPage : Page
{
    public MainPageViewModel ViewModel { get; } = new();

    public MainPage() { InitializeComponent(); }
}
```

### ViewModels/MainPageViewModel.cs
```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace PROJECT_NAMESPACE.ViewModels;

public partial class MainPageViewModel : ObservableObject
{
    [ObservableProperty]
    public partial string Greeting { get; set; } = "Hello, WinUI!";

    [ObservableProperty]
    public partial int Counter { get; set; }

    [RelayCommand]
    private void Increment() { Counter++; }

    [RelayCommand]
    private void Decrement() { Counter--; }
}
```

---

## Key things already set up

- **CommunityToolkit.Mvvm** in .csproj — do NOT install it again
- **App.Window / App.DispatcherQueue / App.WindowHandle** — static helpers, use from anywhere
- **MicaBackdrop** + **TitleBar** — already wired in MainWindow
- **Frame navigation** — RootFrame navigates to MainPage on startup
- **MVVM pattern** — MainPage has ViewModel property, MainPageViewModel uses source generators

## What you need to do

1. Replace MainPage.xaml content with your app UI
2. Rewrite MainPageViewModel.cs for your app's logic
3. Create additional models, services, pages as needed
4. Update window Title in MainWindow.xaml
