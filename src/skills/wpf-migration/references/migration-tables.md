# WPF → WinUI 3 Migration Tables

Quick-reference tables extracted from the migration skill. For detailed guidance, see the reference docs: `namespace-api-mapping.md`, `xaml-migration.md`, `threading-and-windowing.md`.

---

## Namespace Mapping

| WPF | WinUI 3 |
|-----|---------|
| `System.Windows` | `Microsoft.UI.Xaml` |
| `System.Windows.Controls` | `Microsoft.UI.Xaml.Controls` |
| `System.Windows.Media` | `Microsoft.UI.Xaml.Media` |
| `System.Windows.Media.Imaging` | `Microsoft.UI.Xaml.Media.Imaging` |
| `System.Windows.Input` | `Microsoft.UI.Xaml.Input` |
| `System.Windows.Data` | `Microsoft.UI.Xaml.Data` |
| `System.Windows.Threading` | `Microsoft.UI.Dispatching` |
| `System.Windows.Interop` | `WinRT.Interop` |

## Critical API Replacements

| WPF | WinUI 3 | Notes |
|-----|---------|-------|
| `Dispatcher.Invoke()` | `DispatcherQueue.TryEnqueue()` | Returns `bool` |
| `Dispatcher.CheckAccess()` | `DispatcherQueue.HasThreadAccess` | Property vs method |
| `Application.Current.Dispatcher` | Store `DispatcherQueue` in static field | See threading ref |
| `MessageBox.Show()` | `ContentDialog` | Must set `XamlRoot` |
| `DynamicResource` | `ThemeResource` | Theme-reactive only |
| `clr-namespace:` | `using:` | XAML namespace prefix |
| `{x:Static props:Resources.Key}` | `x:Uid` or `ResourceLoader.GetString()` | .resx → .resw |
| `DataType="{x:Type m:Foo}"` | `x:DataType="m:Foo"` | `x:Type` not supported |
| `Properties.Resources.MyString` | `ResourceLoader.GetString("MyString")` | Lazy-init pattern |
| `Application.Current.MainWindow` | Custom `App.Window` static property | Track manually |
| `SizeToContent="Height"` | Manual `AppWindow.Resize()` | DPI-aware |
| `MouseLeftButtonDown` | `PointerPressed` | Mouse → Pointer events |
| `Pack URI (pack://...)` | `ms-appx:///` | Resource URI scheme |
| `Observable` (custom base) | `ObservableObject` + `[ObservableProperty]` | CommunityToolkit.Mvvm |
| `RelayCommand` (custom) | `[RelayCommand]` source generator | CommunityToolkit.Mvvm |

## NuGet Package Migration

| WPF | WinUI 3 |
|-----|---------|
| `Microsoft.Xaml.Behaviors.Wpf` | `Microsoft.Xaml.Behaviors.WinUI.Managed` |
| Third-party WPF control libraries | Remove — use native WinUI 3 controls |
| `Microsoft.Toolkit.Wpf.*` | `CommunityToolkit.WinUI.*` |
| (none) | `Microsoft.WindowsAppSDK` |
| (none) | `Microsoft.Windows.SDK.BuildTools` |

## XAML Syntax Changes

| WPF | WinUI 3 |
|-----|---------|
| `xmlns:local="clr-namespace:MyApp"` | `xmlns:local="using:MyApp"` |
| `{DynamicResource Key}` | `{ThemeResource Key}` |
| `{x:Static Type.Member}` | `{x:Bind}` or code-behind |
| `<Style.Triggers>` / `<DataTrigger>` | `VisualStateManager` |
| `{Binding}` in `Setter.Value` | Not supported — use `StaticResource` |
| `BasedOn="{StaticResource {x:Type Button}}"` | `BasedOn="{StaticResource DefaultButtonStyle}"` |
| `IsDefault="True"` / `IsCancel="True"` | `AccentButtonStyle` / handle via KeyDown |
| `<behaviors:Interaction.Triggers>` | Code-behind or WinUI behaviors |

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `ContentDialog` "does not have a XamlRoot" | Set `dialog.XamlRoot = this.Content.XamlRoot` |
| `FilePicker` throws in desktop | `WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd)` |
| `Window.Dispatcher` returns null | Use `Window.DispatcherQueue` |
| Resources on `Window` not found | Move to root layout container (`Grid.Resources`) |
| `VisualStateManager` on `Window` fails | Use `UserControl`/`Page` inside Window |
| `ResourceLoader` crash at static init | Wrap in `Lazy<T>` |
| `SizeToContent` not available | Manual content measurement + `AppWindow.Resize()` with DPI |
| `x:Bind` default is `OneTime` | Set `Mode=OneWay`/`TwoWay` explicitly |
| `IValueConverter.Convert` signature | Last param: `CultureInfo` → `string` |
| `DataContext` on Window | WinUI 3 `Window` not a `DependencyObject`; use root `Page` |

### DataContext + x:Bind Pitfall

When using `x:Bind` in pages receiving `DataContext` at runtime, bindings won't update (default `OneTime` evaluates before `DataContext` set).

**Fix:** Add `Bindings.Update()` on DataContextChanged:
```csharp
public sealed partial class InputPage : Page
{
    public InputPage()
    {
        this.InitializeComponent();
        this.DataContextChanged += (s, e) => Bindings.Update();
    }
    public InputViewModel ViewModel => DataContext as InputViewModel;
}
```

If command bindings still don't fire through `DataContext`, use Click handlers as fallback:
```csharp
// In XAML: <Button Click="OnResizeClick" ... />
private void OnResizeClick(object sender, RoutedEventArgs e)
    => ViewModel?.ResizeCommand.Execute(null);
```
