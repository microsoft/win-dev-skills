# Data Binding Patterns — Detailed Reference

x:Bind examples, converter patterns, DataTemplate examples, collection views, and incremental loading for WinUI 3.

---

## x:Bind vs {Binding} Comparison

| Feature | `x:Bind` | `{Binding}` |
|---|---|---|
| Compile-time check | ✅ Yes | ❌ No |
| Performance | Faster (compiled) | Slower (reflection) |
| Default mode | **OneTime** | OneWay |
| IntelliSense | ✅ Yes | ❌ No |
| Works in Style setters | ❌ No | ✅ Yes |

> **Developer tip:** `x:Bind` currently breaks XAML Hot Reload. Use `{Binding}` temporarily during iterative UI dev, then switch to `x:Bind` for production.

---

## Binding Modes

```xml
<!-- OneTime (default for x:Bind) — value set once, never updated -->
<TextBlock Text="{x:Bind ViewModel.Title}" />

<!-- OneWay — updates UI when source changes -->
<TextBlock Text="{x:Bind ViewModel.Title, Mode=OneWay}" />

<!-- TwoWay — UI and source stay in sync (use for input controls) -->
<TextBox Text="{x:Bind ViewModel.Name, Mode=TwoWay}" />

<!-- OneWayToSource — UI pushes to source, source does not push to UI -->
<Slider Value="{x:Bind ViewModel.Volume, Mode=OneWayToSource}" />
```

---

## ObservableProperty Source Generator

```csharp
using CommunityToolkit.Mvvm.ComponentModel;

public partial class ItemViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private bool _isSelected;

    // Generated: public string Name { get; set; } with PropertyChanged
    // Generated: public bool IsSelected { get; set; } with PropertyChanged
}
```

> **Tip (.NET 10+):** With `LangVersion preview`, prefer partial properties over fields for F12 navigation from XAML:
> ```csharp
> public partial class ItemViewModel : ObservableObject
> {
>     [ObservableProperty]
>     public partial string Name { get; set; }
>
>     [ObservableProperty]
>     public partial bool IsSelected { get; set; }
> }
> ```

Manual fallback when the toolkit cannot be used:
```csharp
public class ItemViewModel : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    private string _name = string.Empty;
    public string Name
    {
        get => _name;
        set { _name = value; PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Name))); }
    }
}
```

---

## ObservableCollection Pattern

```csharp
public partial class MainViewModel : ObservableObject
{
    public ObservableCollection<ItemViewModel> Items { get; } = new();

    [RelayCommand]
    private async Task LoadItemsAsync()
    {
        var data = await _dataService.GetItemsAsync();
        Items.Clear();
        foreach (var item in data)
            Items.Add(new ItemViewModel(item));
    }
}
```

---

## DataTemplate with x:DataType

```xml
<DataTemplate x:DataType="vm:ItemViewModel">
    <StackPanel Orientation="Horizontal" Spacing="8">
        <TextBlock Text="{x:Bind Name, Mode=OneWay}" />
        <CheckBox IsChecked="{x:Bind IsSelected, Mode=TwoWay}" />
    </StackPanel>
</DataTemplate>
```

---

## x:Bind Function Bindings

```xml
<!-- Static method -->
<TextBlock Visibility="{x:Bind local:Converters.BoolToVisibility(ViewModel.IsVisible), Mode=OneWay}" />

<!-- Instance method on code-behind or ViewModel -->
<TextBlock Text="{x:Bind ViewModel.FormatDate(ViewModel.CreatedAt), Mode=OneWay}" />
```

```csharp
public static class Converters
{
    public static Visibility BoolToVisibility(bool value)
        => value ? Visibility.Visible : Visibility.Collapsed;

    public static string FormatCurrency(double amount)
        => amount.ToString("C2");
}
```

### Pathless Casting

Pass the entire data context object to a method by omitting the path:
```xml
<DataTemplate x:DataType="local:ItemModel">
    <TextBlock Text="{x:Bind local:Helpers.FormatItem((local:ItemModel))}" />
</DataTemplate>
```

---

## Auto-Conversion: bool ↔ Visibility

```xml
<!-- No converter needed — x:Bind handles this automatically -->
<ProgressRing Visibility="{x:Bind ViewModel.IsLoading, Mode=OneWay}" />
```

For other common conversions, use `CommunityToolkit.WinUI.Converters` NuGet package (e.g., `StringFormatConverter`, `BoolToObjectConverter`, `EmptyCollectionToObjectConverter`).

---

## List-Detail Pattern

```xml
<Grid>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="300" />
        <ColumnDefinition Width="*" />
    </Grid.ColumnDefinitions>

    <ListView
        ItemsSource="{x:Bind ViewModel.Items}"
        SelectedItem="{x:Bind ViewModel.SelectedItem, Mode=TwoWay}">
        <ListView.ItemTemplate>
            <DataTemplate x:DataType="vm:ItemViewModel">
                <TextBlock Text="{x:Bind Name, Mode=OneWay}" />
            </DataTemplate>
        </ListView.ItemTemplate>
    </ListView>

    <StackPanel Grid.Column="1">
        <TextBlock Text="{x:Bind ViewModel.SelectedItem.Name, Mode=OneWay}" Style="{StaticResource TitleTextBlockStyle}" />
        <TextBlock Text="{x:Bind ViewModel.SelectedItem.Description, Mode=OneWay}" TextWrapping="Wrap" />
    </StackPanel>
</Grid>
```

---

## CollectionViewSource — Grouping

```xml
<Page.Resources>
    <CollectionViewSource
        x:Name="GroupedItems"
        IsSourceGrouped="True"
        Source="{x:Bind ViewModel.GroupedItems, Mode=OneWay}" />
</Page.Resources>

<ListView ItemsSource="{x:Bind GroupedItems.View, Mode=OneWay}">
    <ListView.GroupStyle>
        <GroupStyle>
            <GroupStyle.HeaderTemplate>
                <DataTemplate x:DataType="vm:ItemGroup">
                    <TextBlock Text="{x:Bind Key}" Style="{StaticResource SubtitleTextBlockStyle}" />
                </DataTemplate>
            </GroupStyle.HeaderTemplate>
        </GroupStyle>
    </ListView.GroupStyle>
</ListView>
```

> **Note:** `CollectionViewSource` in WinUI 3 supports grouping but does **not** support built-in sorting/filtering. Sort and filter in your ViewModel before binding.

```csharp
public ObservableCollection<ItemGroup> GroupedItems { get; } = new();

public class ItemGroup : ObservableCollection<ItemViewModel>
{
    public string Key { get; }
    public ItemGroup(string key, IEnumerable<ItemViewModel> items) : base(items) => Key = key;
}
```

---

## Incremental Loading

Implement `ISupportIncrementalLoading` for lazy-loading large datasets:

```csharp
public class IncrementalItemSource : ObservableCollection<ItemViewModel>, ISupportIncrementalLoading
{
    private readonly IDataService _dataService;
    private int _currentPage;

    public bool HasMoreItems { get; private set; } = true;

    public IAsyncOperation<LoadMoreItemsResult> LoadMoreItemsAsync(uint count)
    {
        return AsyncInfo.Run(async token =>
        {
            var items = await _dataService.GetItemsAsync(_currentPage++, (int)count);
            if (items.Count == 0) HasMoreItems = false;
            foreach (var item in items) Add(new ItemViewModel(item));
            return new LoadMoreItemsResult { Count = (uint)items.Count };
        });
    }
}
```
