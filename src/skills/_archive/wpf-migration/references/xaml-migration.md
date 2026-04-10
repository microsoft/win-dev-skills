# XAML Migration Guide

Detailed reference for migrating XAML from WPF to WinUI 3 in .NET applications.

## XML Namespace Declaration Changes

### Before (WPF)

```xml
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:local="clr-namespace:MyApp"
        xmlns:m="clr-namespace:MyApp.Models"
        xmlns:p="clr-namespace:MyApp.Properties"
        xmlns:sys="clr-namespace:System;assembly=mscorlib"
        x:Class="MyApp.MainWindow">
```

### After (WinUI 3)

```xml
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:local="using:MyApp"
        xmlns:m="using:MyApp.Models"
        xmlns:converters="using:MyApp.Converters"
        xmlns:d="http://schemas.microsoft.com/expression/blend/2008"
        xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
        x:Class="MyApp.MainWindow">
```

### Key Changes

| WPF Syntax | WinUI 3 Syntax | Notes |
|------------|---------------|-------|
| `clr-namespace:Foo` | `using:Foo` | CLR namespace mapping |
| `clr-namespace:Foo;assembly=Bar` | `using:Foo` | Assembly qualification not needed |
| `xmlns:p="clr-namespace:...Properties"` | **Remove** | No more `.resx` string bindings |
| `sys:String` (from mscorlib) | `x:String` | XAML intrinsic types |
| `sys:Int32` | `x:Int32` | XAML intrinsic types |
| `sys:Boolean` | `x:Boolean` | XAML intrinsic types |
| `sys:Double` | `x:Double` | XAML intrinsic types |

## Unsupported Markup Extensions

| WPF Markup Extension | WinUI 3 Alternative |
|----------------------|---------------------|
| `{DynamicResource Key}` | `{ThemeResource Key}` (theme-reactive) or `{StaticResource Key}` |
| `{x:Static Type.Member}` | `{x:Bind}` to a static property, or code-behind |
| `{x:Type local:MyType}` | Not supported; use code-behind |
| `{x:Array}` | Not supported; create collections in code-behind |
| `{x:Code}` | Not supported |

### DynamicResource → ThemeResource

```xml
<!-- WPF -->
<TextBlock Foreground="{DynamicResource MyBrush}" />

<!-- WinUI 3 -->
<TextBlock Foreground="{ThemeResource MyBrush}" />
```

`ThemeResource` automatically updates when the app theme changes (Light/Dark/HighContrast). For truly dynamic non-theme resources, set values in code-behind or use data binding.

### x:Static Resource Strings → x:Uid

This is the most pervasive XAML change. WPF used `{x:Static}` to bind to strongly-typed `.resx` resource strings. WinUI 3 uses `x:Uid` with `.resw` files.

**WPF:**
```xml
<Button Content="{x:Static p:Resources.Cancel}" />
<TextBlock Text="{x:Static p:Resources.Input_Header}" />
```

**WinUI 3:**
```xml
<Button x:Uid="Cancel" />
<TextBlock x:Uid="Input_Header" />
```

In `Strings/en-us/Resources.resw`:
```xml
<data name="Cancel.Content" xml:space="preserve">
    <value>Cancel</value>
</data>
<data name="Input_Header.Text" xml:space="preserve">
    <value>Select a size</value>
</data>
```

The `x:Uid` suffix (`.Content`, `.Text`, `.Header`, `.PlaceholderText`, etc.) matches the target property name.

### DataType with x:Type → x:DataType

**WPF:**
```xml
<DataTemplate DataType="{x:Type m:MyModel}">
```

**WinUI 3:**
```xml
<DataTemplate x:DataType="m:MyModel">
```

## Control Replacements

### Third-Party WPF Control Libraries → Native WinUI 3

If your application uses third-party WPF Fluent control libraries (e.g., WPF-UI / Lepo, MaterialDesignXaml, MahApps.Metro), replace them with native WinUI 3 controls:

| Third-party WPF control | WinUI 3 Native | Notes |
|--------------------------|---------------|-------|
| Custom Fluent `Window` | `<Window>` | Native window + `ExtendsContentIntoTitleBar` |
| Custom `NumberBox` | `<NumberBox>` | Built into WinUI 3 |
| Custom `ProgressRing` | `<ProgressRing>` | Built into WinUI 3 |
| Custom `InfoBar` | `<InfoBar>` | Built into WinUI 3 |
| Custom `SymbolIcon` | `<SymbolIcon>` or `<FontIcon>` | Built into WinUI 3 |
| Custom TitleBar | Custom title bar via `SetTitleBar()` | Use `ExtendsContentIntoTitleBar` |
| Custom ThemesDictionary | `<XamlControlsResources>` | In merged dictionaries |
| `BasedOn="{StaticResource {x:Type Button}}"` | `BasedOn="{StaticResource DefaultButtonStyle}"` | Named style keys |

### DataGrid

WinUI 3 does not include a built-in `DataGrid`. Use the CommunityToolkit version:

```xml
<!-- Add NuGet: CommunityToolkit.WinUI.UI.Controls.DataGrid -->
<xmlns:controls="using:CommunityToolkit.WinUI.UI.Controls">
<controls:DataGrid ItemsSource="{x:Bind ViewModel.Items}" AutoGenerateColumns="False">
    <controls:DataGrid.Columns>
        <controls:DataGridTextColumn Header="Name" Binding="{Binding Name}" />
    </controls:DataGrid.Columns>
</controls:DataGrid>
```

## App.xaml Resources

```xml
<!-- WPF -->
<Application.Resources>
    <ResourceDictionary>
        <ResourceDictionary.MergedDictionaries>
            <!-- Third-party theme dictionaries -->
        </ResourceDictionary.MergedDictionaries>
    </ResourceDictionary>
</Application.Resources>

<!-- WinUI 3 -->
<Application.Resources>
    <ResourceDictionary>
        <ResourceDictionary.MergedDictionaries>
            <XamlControlsResources xmlns="using:Microsoft.UI.Xaml.Controls" />
        </ResourceDictionary.MergedDictionaries>
    </ResourceDictionary>
</Application.Resources>
```

## Style and Template Changes

### Triggers → VisualStateManager

WPF `Triggers`, `DataTriggers`, and `EventTriggers` are not supported in WinUI 3.

**WPF:**
```xml
<Style TargetType="Button">
    <Style.Triggers>
        <Trigger Property="IsMouseOver" Value="True">
            <Setter Property="Background" Value="LightBlue"/>
        </Trigger>
        <DataTrigger Binding="{Binding IsEnabled}" Value="False">
            <Setter Property="Opacity" Value="0.5"/>
        </DataTrigger>
    </Style.Triggers>
</Style>
```

**WinUI 3:**
```xml
<Style TargetType="Button">
    <Setter Property="Template">
        <Setter.Value>
            <ControlTemplate TargetType="Button">
                <Grid x:Name="RootGrid" Background="{TemplateBinding Background}">
                    <VisualStateManager.VisualStateGroups>
                        <VisualStateGroup x:Name="CommonStates">
                            <VisualState x:Name="PointerOver">
                                <VisualState.Setters>
                                    <Setter Target="RootGrid.Background" Value="LightBlue"/>
                                </VisualState.Setters>
                            </VisualState>
                        </VisualStateGroup>
                    </VisualStateManager.VisualStateGroups>
                    <ContentPresenter />
                </Grid>
            </ControlTemplate>
        </Setter.Value>
    </Setter>
</Style>
```

### No Binding in Setter.Value

```xml
<!-- WPF (works) -->
<Setter Property="Foreground" Value="{Binding TextColor}"/>

<!-- WinUI 3 (does NOT work — use StaticResource or ThemeResource) -->
<Setter Property="Foreground" Value="{StaticResource TextColorBrush}"/>
```

### Visual State Name Changes

| WPF | WinUI 3 |
|-----|---------|
| `MouseOver` | `PointerOver` |
| `Disabled` | `Disabled` |
| `Pressed` | `Pressed` |

### Button Patterns

```xml
<!-- WPF -->
<Button IsDefault="True" Content="OK" />
<Button IsCancel="True" Content="Cancel" />

<!-- WinUI 3 (no IsDefault/IsCancel) -->
<Button Style="{StaticResource AccentButtonStyle}" Content="OK" />
<Button Content="Cancel" />
<!-- Handle Enter/Escape keys in code-behind if needed -->
```

## Resource Dictionary Changes

### Window.Resources → Grid.Resources

WinUI 3 `Window` is NOT a `DependencyObject` — it does not support `Window.Resources`, `DataContext`, or `VisualStateManager`.

```xml
<!-- WPF -->
<Window>
    <Window.Resources>
        <SolidColorBrush x:Key="MyBrush" Color="Red"/>
    </Window.Resources>
    <Grid>...</Grid>
</Window>

<!-- WinUI 3 -->
<Window>
    <Grid>
        <Grid.Resources>
            <SolidColorBrush x:Key="MyBrush" Color="Red"/>
        </Grid.Resources>
        ...
    </Grid>
</Window>
```

### Theme Dictionaries

```xml
<ResourceDictionary>
    <ResourceDictionary.ThemeDictionaries>
        <ResourceDictionary x:Key="Light">
            <SolidColorBrush x:Key="MyBrush" Color="#FF000000"/>
        </ResourceDictionary>
        <ResourceDictionary x:Key="Dark">
            <SolidColorBrush x:Key="MyBrush" Color="#FFFFFFFF"/>
        </ResourceDictionary>
        <ResourceDictionary x:Key="HighContrast">
            <SolidColorBrush x:Key="MyBrush"
                Color="{ThemeResource SystemColorWindowTextColor}"/>
        </ResourceDictionary>
    </ResourceDictionary.ThemeDictionaries>
</ResourceDictionary>
```

## URI Scheme Changes

| WPF | WinUI 3 |
|-----|---------|
| `pack://application:,,,/MyAssembly;component/image.png` | `ms-appx:///Assets/image.png` |
| `pack://application:,,,/image.png` | `ms-appx:///image.png` |
| Relative path `../image.png` | `ms-appx:///image.png` |

Convention: move resources from `Resources/` to `Assets/`.

## Data Binding Changes

### {Binding} vs {x:Bind}

Both are available in WinUI 3. Prefer `{x:Bind}` for compile-time safety and performance.

| Feature | `{Binding}` | `{x:Bind}` |
|---------|------------|------------|
| Default mode | `OneWay` | **`OneTime`** — explicit `Mode=OneWay` required! |
| Context | `DataContext` | Code-behind class |
| Resolution | Runtime | Compile-time |
| Performance | Reflection-based | Compiled |
| Function binding | No | Yes |

### Common Binding Migration Patterns

```xml
<!-- WPF: UpdateSourceTrigger=PropertyChanged -->
<TextBox Text="{Binding Value, UpdateSourceTrigger=PropertyChanged}" />
<!-- WinUI 3: Not needed; TextBox uses PropertyChanged by default -->
<TextBox Text="{x:Bind ViewModel.Value, Mode=TwoWay}" />

<!-- WPF: RelativeSource Self -->
{Binding RelativeSource={RelativeSource Self}, ...}
<!-- WinUI 3: x:Bind binds to the page itself, or use ElementName -->

<!-- WPF: Empty binding path (binds to DataContext itself) -->
<ItemsControl ItemsSource="{Binding}" />
<!-- WinUI 3: Must specify explicit path -->
<ItemsControl ItemsSource="{x:Bind ViewModel.Items}" />
```

## WPF-Only Window Properties to Remove

These properties exist on WPF `Window` but not WinUI 3:

```xml
<!-- Remove from XAML — handle in code-behind via AppWindow API -->
SizeToContent="Height"
WindowStartupLocation="CenterScreen"
ResizeMode="NoResize"
ExtendsContentIntoTitleBar="True"  <!-- Set in code-behind -->
```

## XAML Control Property Changes

| WPF Property | WinUI 3 Property | Notes |
|-------------|-----------------|-------|
| `Focusable` | `IsTabStop` | Different name |
| `SnapsToDevicePixels` | Not available | WinUI handles pixel snapping internally |
| `UseLayoutRounding` | `UseLayoutRounding` | Same |
| `IsHitTestVisible` | `IsHitTestVisible` | Same |
| `TextBox.VerticalScrollBarVisibility` | `ScrollViewer.VerticalScrollBarVisibility` (attached) | Attached property |

## MVVM Migration: CommunityToolkit.Mvvm

Replace custom `Observable` base classes and `RelayCommand` implementations with CommunityToolkit.Mvvm source generators:

### ObservableProperty

```csharp
// WPF (custom Observable base)
public class MyViewModel : Observable
{
    private string _name;
    public string Name
    {
        get => _name;
        set => Set(ref _name, value);
    }
}

// WinUI 3 (CommunityToolkit.Mvvm)
public partial class MyViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name;
}
```

### RelayCommand

```csharp
// WPF (custom RelayCommand)
public ICommand SaveCommand => new RelayCommand(Save, CanSave);

// WinUI 3 (CommunityToolkit.Mvvm source generator)
[RelayCommand(CanExecute = nameof(CanSave))]
private void Save() { /* ... */ }
private bool CanSave() => true;
```

### ResourceLoader Pattern

Replace `.resx` strongly-typed resources with `ResourceLoader`:

```csharp
// WPF
string text = Properties.Resources.MyString;

// WinUI 3
private static readonly Lazy<ResourceLoader> _resourceLoader =
    new(() => ResourceLoader.GetForViewIndependentUse());

public static string GetString(string key) => _resourceLoader.Value.GetString(key);
```

Use `Lazy<T>` because `ResourceLoader` is not available at class-load time in all contexts.
