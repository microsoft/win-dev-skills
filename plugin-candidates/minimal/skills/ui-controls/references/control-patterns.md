# UI Control Patterns — Detailed Reference

Code patterns for custom controls, context menus, drag-and-drop, and clipboard operations in WinUI 3.

---

## DependencyProperty Registration

Every public property participating in binding/styling must be a `DependencyProperty`:

```csharp
public sealed partial class StatusCard : UserControl
{
    public static readonly DependencyProperty TitleProperty =
        DependencyProperty.Register(
            nameof(Title),                          // property name
            typeof(string),                         // property type
            typeof(StatusCard),                     // owner type — must match the control class
            new PropertyMetadata(string.Empty, OnTitleChanged));

    public string Title
    {
        get => (string)GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    private static void OnTitleChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is StatusCard control)
        {
            // React to property change
        }
    }
}
```

### Attached Properties

Use `RegisterAttached` for cross-control behavior properties:

```csharp
public static class ToolTipExtensions
{
    public static readonly DependencyProperty ShowDelayProperty =
        DependencyProperty.RegisterAttached(
            "ShowDelay",
            typeof(int),
            typeof(ToolTipExtensions),
            new PropertyMetadata(0));

    public static void SetShowDelay(DependencyObject obj, int value)
        => obj.SetValue(ShowDelayProperty, value);

    public static int GetShowDelay(DependencyObject obj)
        => (int)obj.GetValue(ShowDelayProperty);
}
```

---

## UserControl Creation

Define XAML layout and code-behind together. Use `x:Bind` internally:

```xml
<!-- StatusCard.xaml -->
<UserControl
    x:Class="MyApp.Controls.StatusCard"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <Grid Padding="12" Background="{ThemeResource CardBackgroundFillColorDefaultBrush}">
        <TextBlock Text="{x:Bind Title, Mode=OneWay}"
                   Style="{StaticResource SubtitleTextBlockStyle}" />
    </Grid>
</UserControl>
```

---

## TemplatedControl Setup

Derive from `Control`, set `DefaultStyleKey`, provide a default `ControlTemplate` in `Themes/Generic.xaml`:

```csharp
public class RatingControl : Control
{
    public RatingControl()
    {
        DefaultStyleKey = typeof(RatingControl);
    }

    protected override void OnApplyTemplate()
    {
        base.OnApplyTemplate();

        if (GetTemplateChild("PART_StarPanel") is StackPanel starPanel)
        {
            // Wire up events
        }
    }
}
```

```xml
<!-- Themes/Generic.xaml -->
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
                    xmlns:local="using:MyApp.Controls">

    <Style TargetType="local:RatingControl">
        <Setter Property="Template">
            <Setter.Value>
                <ControlTemplate TargetType="local:RatingControl">
                    <Grid Background="{TemplateBinding Background}">
                        <VisualStateManager.VisualStateGroups>
                            <VisualStateGroup x:Name="CommonStates">
                                <VisualState x:Name="Normal" />
                                <VisualState x:Name="PointerOver">
                                    <VisualState.Setters>
                                        <Setter Target="PART_StarPanel.Opacity" Value="0.8" />
                                    </VisualState.Setters>
                                </VisualState>
                                <VisualState x:Name="Disabled">
                                    <VisualState.Setters>
                                        <Setter Target="PART_StarPanel.Opacity" Value="0.4" />
                                    </VisualState.Setters>
                                </VisualState>
                            </VisualStateGroup>
                        </VisualStateManager.VisualStateGroups>

                        <StackPanel x:Name="PART_StarPanel" Orientation="Horizontal" />
                    </Grid>
                </ControlTemplate>
            </Setter.Value>
        </Setter>
    </Style>
</ResourceDictionary>
```

### Template Parts

Document using `[TemplatePart]` attribute. Null-check and unsubscribe from previous parts:

```csharp
[TemplatePart(Name = "ActionButton", Type = typeof(Button))]
public partial class MyControl : Control

protected override void OnApplyTemplate()
{
    base.OnApplyTemplate();

    _button?.Click -= OnButtonClick;
    _button = GetTemplateChild("ActionButton") as Button;
    _button?.Click += OnButtonClick;
}
```

### ContentControl Wrapper

```xml
<ControlTemplate TargetType="local:CardContainer">
    <Border Background="{TemplateBinding Background}"
            CornerRadius="8" Padding="16">
        <ContentPresenter Content="{TemplateBinding Content}"
                          ContentTemplate="{TemplateBinding ContentTemplate}" />
    </Border>
</ControlTemplate>
```

### Events and Commands on Controls

```csharp
// CLR event
public event EventHandler<RatingChangedEventArgs>? RatingChanged;

// ICommand DependencyProperty
public static readonly DependencyProperty RatingChangedCommandProperty =
    DependencyProperty.Register(
        nameof(RatingChangedCommand), typeof(ICommand), typeof(RatingControl),
        new PropertyMetadata(null));

public ICommand? RatingChangedCommand
{
    get => (ICommand?)GetValue(RatingChangedCommandProperty);
    set => SetValue(RatingChangedCommandProperty, value);
}

private void OnRatingUpdated(int newRating)
{
    RatingChanged?.Invoke(this, new RatingChangedEventArgs(newRating));
    if (RatingChangedCommand?.CanExecute(newRating) == true)
        RatingChangedCommand.Execute(newRating);
}
```

---

## MenuFlyout — Basic Context Menus

```xml
<Button Content="Options">
    <Button.ContextFlyout>
        <MenuFlyout>
            <MenuFlyoutItem Text="Cut" Icon="Cut">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="X" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutItem Text="Copy" Icon="Copy">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="C" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutItem Text="Paste" Icon="Paste">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="V" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutSeparator />
            <MenuFlyoutSubItem Text="Share">
                <MenuFlyoutItem Text="Email" />
                <MenuFlyoutItem Text="Link" />
            </MenuFlyoutSubItem>
            <ToggleMenuFlyoutItem Text="Read Only" />
            <RadioMenuFlyoutItem Text="Small" GroupName="Size" />
            <RadioMenuFlyoutItem Text="Large" GroupName="Size" />
        </MenuFlyout>
    </Button.ContextFlyout>
</Button>
```

## CommandBarFlyout — Rich Context Menus

```xml
<TextBox x:Name="EditBox">
    <TextBox.ContextFlyout>
        <CommandBarFlyout>
            <AppBarButton Icon="Cut" Label="Cut" />
            <AppBarButton Icon="Copy" Label="Copy" />
            <AppBarButton Icon="Paste" Label="Paste" />
            <CommandBarFlyout.SecondaryCommands>
                <AppBarButton Icon="SelectAll" Label="Select All" />
                <AppBarButton Icon="Find" Label="Find and Replace" />
            </CommandBarFlyout.SecondaryCommands>
        </CommandBarFlyout>
    </TextBox.ContextFlyout>
</TextBox>
```

## Programmatic Context Menus

```csharp
private void OnElementRightTapped(object sender, RightTappedRoutedEventArgs e)
{
    var flyout = new MenuFlyout();
    flyout.Items.Add(new MenuFlyoutItem { Text = "Rename", Icon = new SymbolIcon(Symbol.Rename) });
    flyout.Items.Add(new MenuFlyoutItem { Text = "Delete", Icon = new SymbolIcon(Symbol.Delete) });
    flyout.ShowAt(sender as UIElement, e.GetPosition(sender as UIElement));
}
```

## KeyboardAccelerator

```xml
<MenuFlyoutItem Text="Save" Click="OnSave">
    <MenuFlyoutItem.KeyboardAccelerators>
        <KeyboardAccelerator Key="S" Modifiers="Control" />
    </MenuFlyoutItem.KeyboardAccelerators>
</MenuFlyoutItem>

<!-- Accelerator on a standalone button (no menu required) -->
<Button Content="Undo" Click="OnUndo">
    <Button.KeyboardAccelerators>
        <KeyboardAccelerator Key="Z" Modifiers="Control" />
    </Button.KeyboardAccelerators>
</Button>
```

Standard Windows shortcuts: `Ctrl+C` (Copy), `Ctrl+X` (Cut), `Ctrl+V` (Paste), `Ctrl+Z` (Undo), `Ctrl+Y` (Redo), `Ctrl+S` (Save), `Ctrl+A` (Select All), `Ctrl+N` (New), `Ctrl+O` (Open), `Delete`.

## AccessKey — Alt+Key Navigation

```xml
<MenuBar>
    <MenuBarItem Title="File" AccessKey="F">
        <MenuFlyoutItem Text="New" AccessKey="N" Click="OnNew" />
        <MenuFlyoutItem Text="Open" AccessKey="O" Click="OnOpen" />
        <MenuFlyoutItem Text="Save" AccessKey="S" Click="OnSave" />
    </MenuBarItem>
    <MenuBarItem Title="Edit" AccessKey="E">
        <MenuFlyoutItem Text="Undo" AccessKey="U" Click="OnUndo" />
        <MenuFlyoutItem Text="Redo" AccessKey="R" Click="OnRedo" />
    </MenuBarItem>
</MenuBar>
```

## Dynamic Menu Items with MVVM

```csharp
private void OnListViewRightTapped(object sender, RightTappedRoutedEventArgs e)
{
    var listView = sender as ListView;
    var item = (e.OriginalSource as FrameworkElement)?.DataContext as MyItem;
    if (item == null) return;

    var flyout = new MenuFlyout();
    flyout.Items.Add(new MenuFlyoutItem
    {
        Text = "Edit",
        Icon = new SymbolIcon(Symbol.Edit),
        Command = ViewModel.EditCommand,
        CommandParameter = item
    });

    if (item.CanDelete)
    {
        flyout.Items.Add(new MenuFlyoutItem
        {
            Text = "Delete",
            Icon = new SymbolIcon(Symbol.Delete),
            Command = ViewModel.DeleteCommand,
            CommandParameter = item
        });
    }

    flyout.ShowAt(listView, e.GetPosition(listView));
}
```

```xml
<MenuFlyoutItem Text="Rename" Command="{x:Bind ViewModel.RenameCommand}"
                CommandParameter="{x:Bind SelectedItem, Mode=OneWay}" />
```

---

## Drag and Drop — Drop Targets

Three requirements: `AllowDrop="True"`, `DragOver` handler setting `AcceptedOperation`, `Drop` handler:

```xml
<Border AllowDrop="True"
        DragOver="Target_DragOver"
        Drop="Target_Drop"
        Width="300" Height="200">
    <TextBlock x:Name="DropStatus" Text="Drop files here" HorizontalAlignment="Center" VerticalAlignment="Center"/>
</Border>
```

```csharp
private void Target_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Copy;
    e.DragUIOverride.Caption = "Drop to add";
    e.DragUIOverride.IsCaptionVisible = true;
    e.DragUIOverride.IsGlyphVisible = true;
}

private async void Target_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.Text))
    {
        string text = await e.DataView.GetTextAsync();
        DropStatus.Text = text;
    }
}
```

## Drag Sources

```xml
<TextBlock Text="Drag me" CanDrag="True" DragStarting="Source_DragStarting"/>
```

```csharp
private void Source_DragStarting(UIElement sender, DragStartingEventArgs args)
{
    args.Data.SetText("Hello from drag source");
    args.Data.RequestedOperation = DataPackageOperation.Copy;
}
```

## File Drag-Drop

```csharp
private void FileDrop_DragOver(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
        e.DragUIOverride.Caption = "Drop files";
    }
    else
    {
        e.AcceptedOperation = DataPackageOperation.None;
    }
}

private async void FileDrop_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is StorageFile file)
            {
                var contents = await FileIO.ReadTextAsync(file);
                ProcessFileContents(file.Name, contents);
            }
        }
    }
}
```

## ListView Reordering

```xml
<ListView ItemsSource="{x:Bind Items}"
          CanReorderItems="True"
          CanDragItems="True"
          AllowDrop="True"
          DragItemsStarting="ListView_DragItemsStarting"
          DragItemsCompleted="ListView_DragItemsCompleted"/>
```

```csharp
private void ListView_DragItemsStarting(object sender, DragItemsStartingEventArgs e)
{
    if (e.Items.FirstOrDefault() is MyItem item && !item.IsDraggable)
        e.Cancel = true;
}

private void ListView_DragItemsCompleted(ListViewBase sender, DragItemsCompletedEventArgs args)
{
    SaveItemOrder(Items.ToList());
}
```

## Visual Feedback

```csharp
private void Target_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Move;
    e.DragUIOverride.Caption = "Move here";
    e.DragUIOverride.IsContentVisible = true;
    e.DragUIOverride.SetContentFromBitmapImage(new BitmapImage(new Uri("ms-appx:///Assets/drop-icon.png")));
}
```

## Cross-App Drag-Drop

```csharp
private void CrossApp_DragStarting(UIElement sender, DragStartingEventArgs args)
{
    args.Data.SetText("Plain text fallback");
    args.Data.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat("<b>Rich content</b>"));
    args.Data.SetUri(new Uri("https://example.com/item/42"));
    args.Data.RequestedOperation = DataPackageOperation.Copy;
}
```

---

## Clipboard — Copy Operations

```csharp
using Windows.ApplicationModel.DataTransfer;

// Text
var package = new DataPackage();
package.SetText("Hello, clipboard!");
Clipboard.SetContent(package);

// HTML (always include plain text fallback)
var htmlPkg = new DataPackage();
htmlPkg.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat("<b>Bold</b>"));
htmlPkg.SetText("Bold");
Clipboard.SetContent(htmlPkg);

// Bitmap
var bmpPkg = new DataPackage();
bmpPkg.SetBitmap(RandomAccessStreamReference.CreateFromUri(new Uri("ms-appx:///Assets/img.png")));
Clipboard.SetContent(bmpPkg);

// Files
var filePkg = new DataPackage();
var file = await StorageFile.GetFileFromPathAsync(@"C:\Users\Public\example.txt");
filePkg.SetStorageItems(new[] { file });
Clipboard.SetContent(filePkg);
```

## Clipboard — Paste Operations

```csharp
var view = Clipboard.GetContent();

if (view.Contains(StandardDataFormats.Text))
{
    string text = await view.GetTextAsync();
    MyTextBox.Text = text;
}
if (view.Contains(StandardDataFormats.Bitmap))
{
    var bitmapRef = await view.GetBitmapAsync();
    using var stream = await bitmapRef.OpenReadAsync();
    var bitmap = new BitmapImage();
    await bitmap.SetSourceAsync(stream);
    MyImage.Source = bitmap;
}
if (view.Contains(StandardDataFormats.StorageItems))
{
    var items = await view.GetStorageItemsAsync();
    foreach (var item in items) { /* process file */ }
}
```

## Custom Clipboard Formats

```csharp
// Copy with custom format
var package = new DataPackage();
package.SetData("MyApp.CustomFormat", mySerializedObject);
Clipboard.SetContent(package);

// Paste custom format
var view = Clipboard.GetContent();
if (view.Contains("MyApp.CustomFormat"))
    var data = await view.GetDataAsync("MyApp.CustomFormat");
```

Standard format constants: `StandardDataFormats.Text`, `.Html`, `.Rtf`, `.Bitmap`, `.StorageItems`, `.Uri`.

## Rich Content with Multiple Formats

```csharp
var package = new DataPackage();
package.SetText("Summary: Q3 revenue grew 12%");
package.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat(
    "<table><tr><td>Q3 Revenue</td><td>+12%</td></tr></table>"));
package.SetRtf(@"{\rtf1 Summary: Q3 revenue grew 12%}");
Clipboard.SetContent(package);
```

## Clipboard Monitoring

```csharp
Clipboard.ContentChanged += async (s, e) =>
{
    var view = Clipboard.GetContent();
    if (view.Contains(StandardDataFormats.Text))
    {
        string text = await view.GetTextAsync();
        DispatcherQueue.TryEnqueue(() =>
        {
            ClipboardPreviewText.Text = text;
        });
    }
};
```

## Clipboard History

```csharp
var result = await Clipboard.GetHistoryItemsAsync();
if (result.Status == ClipboardHistoryItemsResultStatus.Success)
{
    foreach (var item in result.Items)
    {
        if (item.Content.Contains(StandardDataFormats.Text))
        {
            string text = await item.Content.GetTextAsync();
        }
    }
}
```

## Clipboard Error Handling

```csharp
public static async Task<bool> TrySetClipboardContentAsync(DataPackage package, int maxRetries = 3)
{
    for (int i = 0; i < maxRetries; i++)
    {
        try
        {
            Clipboard.SetContent(package);
            Clipboard.Flush();
            return true;
        }
        catch (Exception ex) when (ex.HResult == unchecked((int)0x800401D0))
        {
            if (i < maxRetries - 1) await Task.Delay(100 * (i + 1));
        }
    }
    return false;
}
```
