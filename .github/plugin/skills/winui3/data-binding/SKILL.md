---
name: data-binding
description: 'WinUI 3 data binding patterns — x:Bind, ObservableCollection, INotifyPropertyChanged, converters, templates, and collection views. Use when implementing or modifying data binding in XAML or ViewModels.'
---

# Data Binding

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

- **Always use `x:Bind`** over `{Binding}`. `x:Bind` is compiled, type-safe, and faster. Reserve `{Binding}` only where `x:Bind` cannot be used (e.g., `Style` setters, `DataGridColumn` bindings).

  | Feature | `x:Bind` | `{Binding}` |
  |---|---|---|
  | Compile-time check | ✅ Yes | ❌ No |
  | Performance | Faster (compiled) | Slower (reflection) |
  | Default mode | **OneTime** | OneWay |
  | IntelliSense | ✅ Yes | ❌ No |
  | Works in Style setters | ❌ No | ✅ Yes |

  > **Developer tip:** `x:Bind` is compile-time and currently breaks XAML Hot Reload. During iterative UI development, you may temporarily use `{Binding}` for hot-reload support, then switch to `x:Bind` for production.

- **Set binding Mode explicitly.** `x:Bind` defaults to `OneTime` — if you need live updates, specify `Mode=OneWay` or `Mode=TwoWay`:
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

- **Use `[ObservableProperty]` from CommunityToolkit.Mvvm** as the preferred way to implement `INotifyPropertyChanged`. This generates the boilerplate automatically:
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

  > **Tip (.NET 10+):** With `LangVersion preview`, prefer partial properties over fields. This enables F12 (Go to Definition) navigation from XAML directly to the property:
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

- **Use `ObservableCollection<T>`** for any list bound to a UI control. It raises `CollectionChanged` events so the UI updates automatically when items are added or removed:
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

- **Specify `x:DataType` on every `DataTemplate`** for type-safe, compiled bindings inside templates:
  ```xml
  <DataTemplate x:DataType="vm:ItemViewModel">
      <StackPanel Orientation="Horizontal" Spacing="8">
          <TextBlock Text="{x:Bind Name, Mode=OneWay}" />
          <CheckBox IsChecked="{x:Bind IsSelected, Mode=TwoWay}" />
      </StackPanel>
  </DataTemplate>
  ```

- **Use `x:Bind` with functions** for simple conversions instead of creating `IValueConverter` classes:
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

- **Pathless casting** — pass the entire data context object to a method or converter by omitting the path. Most useful inside a `DataTemplate` where the cast type matches `x:DataType`:
  ```xml
  <DataTemplate x:DataType="local:ItemModel">
      <TextBlock Text="{x:Bind local:Helpers.FormatItem((local:ItemModel))}" />
  </DataTemplate>
  ```
  See [pathless casting documentation](https://learn.microsoft.com/en-us/windows/apps/develop/platform/xaml/x-bind-markup-extension#pathless-casting) for details.

- **`x:Bind` auto-converts `bool` ↔ `Visibility`** — no `BoolToVisibilityConverter` needed:
  ```xml
  <ProgressRing Visibility="{x:Bind ViewModel.IsLoading, Mode=OneWay}" />
  ```
  For other common conversions, use the `CommunityToolkit.WinUI.Converters` NuGet package (e.g., `StringFormatConverter`, `BoolToObjectConverter`, `EmptyCollectionToObjectConverter`).

- **Create custom `IValueConverter` implementations** only when conversions are reused across views and no Toolkit converter covers the scenario.

- **Implement List-Detail patterns** (formerly master-detail) by binding `ListView.SelectedItem` to a ViewModel property:
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

- **Use `CollectionViewSource`** for grouping, sorting, or filtering collections:
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
  > **Note:** `CollectionViewSource` in WinUI 3 supports grouping but does **not** support the full WPF feature set (e.g., built-in sorting and filtering are not available). For advanced collection manipulation, filter and sort in your ViewModel before binding. See [microsoft-ui-xaml#4307](https://github.com/microsoft/microsoft-ui-xaml/issues/4307) for details.

  ```csharp
  // ViewModel — expose grouped data as ObservableGroupedCollection or List<IGrouping>
  public ObservableCollection<ItemGroup> GroupedItems { get; } = new();

  public class ItemGroup : ObservableCollection<ItemViewModel>
  {
      public string Key { get; }
      public ItemGroup(string key, IEnumerable<ItemViewModel> items) : base(items) => Key = key;
  }
  ```

- **Implement `ISupportIncrementalLoading`** for lazy-loading large datasets in `ListView` or `GridView`:
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

- **Debug binding failures** using the Output window — search for `Error` or `BindingExpression`. Prefer `x:Bind` to catch binding errors at compile time rather than silently failing at runtime.

---

## Anti-patterns

- ❌ **Using `{Binding}` when `x:Bind` is available** — `{Binding}` is slower, not type-safe, and fails silently at runtime.
- ❌ **Forgetting `Mode=OneWay`** — `x:Bind` defaults to `OneTime`. If the UI does not update, this is almost always the cause.
- ❌ **Replacing `ObservableCollection` with a new instance** — The UI loses its binding reference. Instead, call `.Clear()` and re-add items:
  ```csharp
  // BAD — UI stops updating
  Items = new ObservableCollection<ItemViewModel>(newItems);

  // GOOD — UI stays in sync
  Items.Clear();
  foreach (var item in newItems) Items.Add(item);
  ```
- ❌ **Not implementing `INotifyPropertyChanged` on ViewModel properties** — The UI will never update after initial load. Use `[ObservableProperty]` or raise `PropertyChanged` manually.
- ❌ **Using `IValueConverter` for simple null/bool checks** — Use `x:Bind` functions instead; they are simpler, compiled, and type-safe.
- ❌ **Binding directly to Model objects** — Always bind to ViewModel properties that wrap Models. This keeps the View decoupled from data layer changes.
- ❌ **`DataTemplate` without `x:DataType`** — You lose compile-time binding checks and must fall back to `{Binding}`.
- ❌ **Raising `PropertyChanged` on the UI thread without marshalling** — If updating from a background thread, use `DispatcherQueue.TryEnqueue()`.

---

## Validation

- Build the project — `x:Bind` errors surface as **compile-time errors**, not silent runtime failures.
- Run the app and interact with all bound UI elements — verify live updates, two-way sync, and list operations.
- Check the **Output window** for `BindingExpression` errors — there should be zero.
- Verify that adding/removing items from `ObservableCollection` updates the `ListView`/`GridView` immediately.
- Test List-Detail selection — selecting a list item must update the detail panel.

### Verification Checklist

- [ ] All data bindings use `x:Bind` with correct `Mode` (OneWay/TwoWay as needed)
- [ ] ViewModels implement `INotifyPropertyChanged` (via `[ObservableProperty]` or manual)
- [ ] Collections use `ObservableCollection<T>` — never replaced, only cleared and re-populated
- [ ] All `DataTemplate` elements specify `x:DataType`
- [ ] No binding errors in the Output window at runtime
- [ ] `IValueConverter` classes are registered in Page or App resources
- [ ] `x:Bind` functions are used for simple conversions (bool→Visibility, formatting)
- [ ] Incremental loading triggers correctly when scrolling to the bottom of a list

---

## Must Read & Research

> **Agent Rule:** Before any data-binding-related change, you **must** fetch and review the relevant references below using `fetch_webpage`. Apply what you learn — do not skip this step.

| # | Reference | When to consult |
|---|---|---|
| 1 | [Data binding overview](https://learn.microsoft.com/en-us/windows/uwp/data-binding/data-binding-quickstart) | Any new data binding implementation — understand core concepts |
| 2 | [x:Bind markup extension](https://learn.microsoft.com/en-us/windows/uwp/xaml-platform/x-bind-markup-extension) | Writing or reviewing any `x:Bind` expression, function bindings |
| 3 | [ObservableCollection&lt;T&gt;](https://learn.microsoft.com/en-us/dotnet/api/system.collections.objectmodel.observablecollection-1) | Binding lists to ListView/GridView, dynamic collection updates |
| 4 | [CommunityToolkit.Mvvm — ObservableProperty](https://learn.microsoft.com/en-us/dotnet/communitytoolkit/mvvm/generators/observableproperty) | Implementing ViewModels with auto-generated property change notification |
| 5 | [ListView and GridView data binding](https://learn.microsoft.com/en-us/windows/apps/design/controls/listview-and-gridview) | Binding collections, item templates, selection, grouping |
| 6 | [CollectionViewSource](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.data.collectionviewsource) | Grouping, sorting, and filtering bound collections in XAML |
