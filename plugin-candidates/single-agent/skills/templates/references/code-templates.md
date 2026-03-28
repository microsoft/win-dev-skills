# WinUI 3 Code Templates

Copy-paste-ready XAML + C# patterns. Use `{x:Bind}` with explicit `Mode=`, `[ObservableProperty]`/`[RelayCommand]` from CommunityToolkit.Mvvm, and `ThemeResource` for all colors.

---

## Templates

### 1. List-Detail Layout

Two-column layout with a list on the left and a detail pane on the right. Selecting an item updates the detail view.

**XAML — `ListDetailPage.xaml`**

```xml
<Page
    x:Class="MyApp.Views.ListDetailPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:vm="using:MyApp.ViewModels">

    <Page.DataContext>
        <vm:ListDetailViewModel />
    </Page.DataContext>

    <Grid ColumnSpacing="16" Padding="24">
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="320" />
            <ColumnDefinition Width="*" />
        </Grid.ColumnDefinitions>

        <!-- ──── List Pane ──── -->
        <ListView
            Grid.Column="0"
            ItemsSource="{x:Bind ViewModel.Items, Mode=OneWay}"
            SelectedItem="{x:Bind ViewModel.SelectedItem, Mode=TwoWay}">
            <ListView.ItemTemplate>
                <DataTemplate x:DataType="vm:ItemModel">
                    <StackPanel Padding="8,12">
                        <TextBlock Text="{x:Bind Title}" Style="{StaticResource BodyStrongTextBlockStyle}" />
                        <TextBlock Text="{x:Bind Summary}" Style="{StaticResource CaptionTextBlockStyle}"
                                   Foreground="{ThemeResource TextFillColorSecondaryBrush}" />
                    </StackPanel>
                </DataTemplate>
            </ListView.ItemTemplate>
        </ListView>

        <!-- ──── Detail Pane ──── -->
        <ScrollViewer Grid.Column="1">
            <StackPanel Spacing="12" Visibility="{x:Bind ViewModel.HasSelection, Mode=OneWay}">
                <TextBlock Text="{x:Bind ViewModel.SelectedItem.Title, Mode=OneWay}"
                           Style="{StaticResource TitleTextBlockStyle}" />
                <TextBlock Text="{x:Bind ViewModel.SelectedItem.Description, Mode=OneWay}"
                           TextWrapping="WrapWholeWords"
                           Style="{StaticResource BodyTextBlockStyle}" />
            </StackPanel>
        </ScrollViewer>
    </Grid>
</Page>
```

**C# — `ListDetailViewModel.cs`**

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;

namespace MyApp.ViewModels;

public partial class ListDetailViewModel : ObservableObject
{
    public ObservableCollection<ItemModel> Items { get; } = new();

    [ObservableProperty]
    private ItemModel? _selectedItem;

    public bool HasSelection => SelectedItem is not null;

    partial void OnSelectedItemChanged(ItemModel? value)
    {
        OnPropertyChanged(nameof(HasSelection));
    }
}

public partial class ItemModel : ObservableObject
{
    public string Title { get; init; } = string.Empty;
    public string Summary { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}
```

**Code-Behind — `ListDetailPage.xaml.cs`**

```csharp
namespace MyApp.Views;

public sealed partial class ListDetailPage : Page
{
    public ListDetailViewModel ViewModel => (ListDetailViewModel)DataContext;

    public ListDetailPage() => InitializeComponent();
}
```

---

### 2. Data Entry Form

Vertical form layout with validation and Save/Cancel commands. Uses `CommunityToolkit.Mvvm` source generators for validation.

**XAML — `DataEntryPage.xaml`**

```xml
<Page
    x:Class="MyApp.Views.DataEntryPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:vm="using:MyApp.ViewModels">

    <Page.DataContext>
        <vm:DataEntryViewModel />
    </Page.DataContext>

    <ScrollViewer Padding="24">
        <StackPanel MaxWidth="480" Spacing="16" HorizontalAlignment="Left">
            <TextBlock Text="New Entry" Style="{StaticResource TitleTextBlockStyle}" />

            <TextBox Header="Full Name" PlaceholderText="Enter your name"
                     Text="{x:Bind ViewModel.FullName, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />

            <TextBox Header="Email" PlaceholderText="user@example.com"
                     Text="{x:Bind ViewModel.Email, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />

            <ComboBox Header="Category" PlaceholderText="Select a category"
                      ItemsSource="{x:Bind ViewModel.Categories}"
                      SelectedItem="{x:Bind ViewModel.SelectedCategory, Mode=TwoWay}" />

            <DatePicker Header="Date of Birth" />

            <ToggleSwitch Header="Notifications" OnContent="Enabled" OffContent="Disabled"
                          IsOn="{x:Bind ViewModel.NotificationsEnabled, Mode=TwoWay}" />

            <!-- ──── Error display ──── -->
            <InfoBar
                IsOpen="{x:Bind ViewModel.HasErrors, Mode=OneWay}"
                Severity="Error"
                Title="Validation Error"
                Message="{x:Bind ViewModel.ErrorMessage, Mode=OneWay}" />

            <!-- ──── Actions ──── -->
            <StackPanel Orientation="Horizontal" Spacing="8">
                <Button Content="Save" Style="{StaticResource AccentButtonStyle}"
                        Command="{x:Bind ViewModel.SaveCommand}" />
                <Button Content="Cancel"
                        Command="{x:Bind ViewModel.CancelCommand}" />
            </StackPanel>
        </StackPanel>
    </ScrollViewer>
</Page>
```

**C# — `DataEntryViewModel.cs`**

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.ComponentModel.DataAnnotations;

namespace MyApp.ViewModels;

public partial class DataEntryViewModel : ObservableValidator
{
    [ObservableProperty]
    [Required(ErrorMessage = "Name is required.")]
    [MinLength(2, ErrorMessage = "Name must be at least 2 characters.")]
    private string _fullName = string.Empty;

    [ObservableProperty]
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Invalid email format.")]
    private string _email = string.Empty;

    [ObservableProperty]
    private string? _selectedCategory;

    [ObservableProperty]
    private bool _notificationsEnabled = true;

    public ObservableCollection<string> Categories { get; } = new()
    {
        "Personal", "Work", "Education", "Other"
    };

    public bool HasErrors => GetErrors().Any();

    public string ErrorMessage =>
        string.Join("\n", GetErrors().Select(e => e.ErrorMessage));

    [RelayCommand]
    private void Save()
    {
        ValidateAllProperties();
        OnPropertyChanged(nameof(HasErrors));
        OnPropertyChanged(nameof(ErrorMessage));
        if (HasErrors) return;
        // TODO: Persist the entry
    }

    [RelayCommand]
    private void Cancel()
    {
        FullName = string.Empty;
        Email = string.Empty;
        SelectedCategory = null;
        NotificationsEnabled = true;
        ClearErrors();
        OnPropertyChanged(nameof(HasErrors));
    }
}
```

---

### 3. Dashboard with Cards

Responsive grid of statistic cards using `ThemeResource` colors for automatic theme support.

**XAML — `DashboardPage.xaml`**

```xml
<Page
    x:Class="MyApp.Views.DashboardPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <ScrollViewer Padding="24">
        <StackPanel Spacing="24">
            <TextBlock Text="Dashboard" Style="{StaticResource TitleLargeTextBlockStyle}" />

            <GridView SelectionMode="None" IsItemClickEnabled="False"
                      ItemsSource="{x:Bind ViewModel.Stats, Mode=OneWay}">
                <GridView.ItemTemplate>
                    <DataTemplate>
                        <Border Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"
                                BorderBrush="{ThemeResource CardStrokeColorDefaultBrush}"
                                BorderThickness="1" CornerRadius="8"
                                Padding="20" Width="200" Height="120">
                            <StackPanel VerticalAlignment="Center" Spacing="4">
                                <TextBlock Text="{Binding Label}"
                                           Style="{StaticResource CaptionTextBlockStyle}"
                                           Foreground="{ThemeResource TextFillColorSecondaryBrush}" />
                                <TextBlock Text="{Binding Value}"
                                           Style="{StaticResource TitleLargeTextBlockStyle}" />
                                <TextBlock Text="{Binding Trend}"
                                           Style="{StaticResource CaptionTextBlockStyle}"
                                           Foreground="{ThemeResource SystemFillColorSuccessBrush}" />
                            </StackPanel>
                        </Border>
                    </DataTemplate>
                </GridView.ItemTemplate>
            </GridView>

            <!-- ──── Add more dashboard sections below ──── -->
        </StackPanel>
    </ScrollViewer>
</Page>
```

> **Tip:** To create a fixed-column grid instead of the adaptive `GridView`, replace it with a `Grid` that has explicit `ColumnDefinitions` and place each card `Border` in a column.

---

### 4. Login / Authentication Page

Centered card layout with username/password fields and an async login command.

**XAML — `LoginPage.xaml`**

```xml
<Page
    x:Class="MyApp.Views.LoginPage"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    xmlns:vm="using:MyApp.ViewModels">

    <Page.DataContext>
        <vm:LoginViewModel />
    </Page.DataContext>

    <Grid HorizontalAlignment="Center" VerticalAlignment="Center">
        <Border Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"
                BorderBrush="{ThemeResource CardStrokeColorDefaultBrush}"
                BorderThickness="1" CornerRadius="12"
                Padding="40" Width="380">
            <StackPanel Spacing="16">
                <FontIcon Glyph="&#xE77B;" FontSize="48"
                          HorizontalAlignment="Center"
                          Foreground="{ThemeResource AccentTextFillColorPrimaryBrush}" />
                <TextBlock Text="Sign In" HorizontalAlignment="Center"
                           Style="{StaticResource SubtitleTextBlockStyle}" />

                <TextBox Header="Username" PlaceholderText="Enter username"
                         Text="{x:Bind ViewModel.Username, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />

                <PasswordBox Header="Password" PlaceholderText="Enter password"
                             Password="{x:Bind ViewModel.Password, Mode=TwoWay}" />

                <InfoBar IsOpen="{x:Bind ViewModel.HasError, Mode=OneWay}"
                         Severity="Error" Title="Login Failed"
                         Message="{x:Bind ViewModel.ErrorMessage, Mode=OneWay}" />

                <Button Content="Sign In" HorizontalAlignment="Stretch"
                        Style="{StaticResource AccentButtonStyle}"
                        Command="{x:Bind ViewModel.LoginCommand}" />

                <ProgressRing IsActive="{x:Bind ViewModel.IsBusy, Mode=OneWay}"
                              HorizontalAlignment="Center" Width="28" Height="28" />

                <HyperlinkButton Content="Forgot password?"
                                 HorizontalAlignment="Center" />
            </StackPanel>
        </Border>
    </Grid>
</Page>
```

**C# — `LoginViewModel.cs`**

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Threading.Tasks;

namespace MyApp.ViewModels;

public partial class LoginViewModel : ObservableObject
{
    [ObservableProperty]
    private string _username = string.Empty;

    [ObservableProperty]
    private string _password = string.Empty;

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    [ObservableProperty]
    private bool _hasError;

    [ObservableProperty]
    private bool _isBusy;

    [RelayCommand]
    private async Task LoginAsync()
    {
        HasError = false;
        IsBusy = true;
        try
        {
            // TODO: Replace with real authentication call
            await Task.Delay(1000);
            bool success = Username == "admin" && Password == "password";
            if (!success)
            {
                ErrorMessage = "Invalid username or password.";
                HasError = true;
            }
            // Navigate on success
        }
        finally
        {
            IsBusy = false;
        }
    }
}
```

---

### 5. Empty State / No Content

Centered placeholder shown when a collection has no items. Pair with a `ListView` using a visibility toggle.

**XAML — Inline in any page**

```xml
<!-- Place alongside a ListView; toggle visibility based on collection count -->
<StackPanel
    HorizontalAlignment="Center"
    VerticalAlignment="Center"
    Spacing="12"
    Visibility="{x:Bind ViewModel.IsEmpty, Mode=OneWay}">

    <FontIcon Glyph="&#xE7BA;" FontSize="48"
              HorizontalAlignment="Center"
              Foreground="{ThemeResource TextFillColorSecondaryBrush}" />

    <TextBlock Text="No items yet"
               HorizontalAlignment="Center"
               Style="{StaticResource SubtitleTextBlockStyle}" />

    <TextBlock Text="Add your first item to get started."
               HorizontalAlignment="Center"
               Foreground="{ThemeResource TextFillColorSecondaryBrush}"
               Style="{StaticResource BodyTextBlockStyle}" />

    <Button Content="Add Item"
            HorizontalAlignment="Center"
            Style="{StaticResource AccentButtonStyle}"
            Command="{x:Bind ViewModel.AddItemCommand}" />
</StackPanel>
```

> **Tip:** Compute `IsEmpty` in your ViewModel by subscribing to `Items.CollectionChanged`:
> ```csharp
> public bool IsEmpty => Items.Count == 0;
> // In constructor: Items.CollectionChanged += (_, _) => OnPropertyChanged(nameof(IsEmpty));
> ```

---

### 6. Command Bar with Search

Top bar combining an `AutoSuggestBox` for filtering with action buttons. Binds the search query into the ViewModel for live filtering.

**XAML — Inline or in a page header**

```xml
<Grid Padding="24,16" ColumnSpacing="12">
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="*" />
        <ColumnDefinition Width="Auto" />
    </Grid.ColumnDefinitions>

    <AutoSuggestBox Grid.Column="0"
                    QueryIcon="Find"
                    PlaceholderText="Search items..."
                    Text="{x:Bind ViewModel.SearchQuery, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged}" />

    <CommandBar Grid.Column="1" DefaultLabelPosition="Right" IsOpen="False">
        <AppBarButton Icon="Add" Label="New" Command="{x:Bind ViewModel.AddCommand}" />
        <AppBarButton Icon="Refresh" Label="Refresh" Command="{x:Bind ViewModel.RefreshCommand}" />
        <AppBarButton Icon="Filter" Label="Filter" />
        <CommandBar.SecondaryCommands>
            <AppBarButton Icon="Setting" Label="Settings" />
            <AppBarButton Icon="Help" Label="Help" />
        </CommandBar.SecondaryCommands>
    </CommandBar>
</Grid>
```

**C# — Search/filter pattern in ViewModel**

```csharp
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.Linq;

namespace MyApp.ViewModels;

public partial class SearchableViewModel : ObservableObject
{
    private readonly List<ItemModel> _allItems = new();

    public ObservableCollection<ItemModel> FilteredItems { get; } = new();

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    partial void OnSearchQueryChanged(string value)
    {
        FilteredItems.Clear();
        var matches = string.IsNullOrWhiteSpace(value)
            ? _allItems
            : _allItems.Where(i => i.Title.Contains(value, StringComparison.OrdinalIgnoreCase));
        foreach (var item in matches)
            FilteredItems.Add(item);
    }

    [RelayCommand]
    private void Add() { /* TODO: Navigate or show dialog */ }

    [RelayCommand]
    private void Refresh() => OnSearchQueryChanged(SearchQuery);
}
```

---

## Guidelines

### When to Use Each Template

| Scenario | Template | Combine With |
|---|---|---|
| Browse a collection and view details | **List-Detail** | Command Bar, Empty State |
| Collect user input, create/edit records | **Data Entry Form** | — |
| Overview screen with KPIs or metrics | **Dashboard Cards** | Command Bar |
| App entry point requiring credentials | **Login Page** | — |
| Collection is loaded but has zero items | **Empty State** | List-Detail, Dashboard |
| Page needs filtering and actions | **Command Bar with Search** | List-Detail, Dashboard |

### How to Customize

1. **Replace placeholder namespaces** — Change `MyApp` to your actual root namespace.
2. **Swap model properties** — Replace `Title`, `Summary`, `Description` with your domain fields.
3. **Adjust layout constants** — Column widths (`320`), card sizes (`200×120`), and max widths (`480`) are sensible defaults; tune to your content.
4. **Add navigation** — Replace `// TODO` comments with `Frame.Navigate()` or messenger-based navigation.
5. **Wire up real services** — Inject repositories or API clients via constructor parameters instead of inline stubs.

### How Templates Compose

- **Full master-detail screen:** Command Bar (top) + List-Detail (body) + Empty State (when list is empty).
- **Admin dashboard:** Command Bar (top) + Dashboard Cards (body) + Data Entry Form (in a `ContentDialog` for quick-add).
- **Onboarding flow:** Login Page → Dashboard Cards (home screen).

### Anti-Patterns

- ❌ **Hardcoding colors** — Use `ThemeResource` keys, never `#FF0000` or `SolidColorBrush` in XAML.
- ❌ **Using `Binding` instead of `x:Bind`** — `{Binding}` is reflection-based and slower; prefer `{x:Bind}` for compile-time safety.
- ❌ **Putting logic in code-behind** — Keep event handlers thin; delegate to ViewModel commands.
- ❌ **Skipping `UpdateSourceTrigger=PropertyChanged`** on `TextBox`/`AutoSuggestBox` — Without it, binding only updates on focus-lost.
- ❌ **Manual `INotifyPropertyChanged`** — Use `[ObservableProperty]` from CommunityToolkit.Mvvm to eliminate boilerplate.

### Verification Checklist

- [ ] App builds without XAML or C# compiler errors.
- [ ] Dark and light themes render correctly (no invisible text or missing backgrounds).
- [ ] `x:Bind` paths resolve at compile time (no runtime binding failures).
- [ ] Form validation shows errors inline before submission.
- [ ] Empty state appears when collection count is zero and hides when items are added.

## Must Read & Research

| Resource | When to Consult |
|---|---|
| [WinUI 3 Gallery app](https://github.com/microsoft/WinUI-Gallery) | Reference implementations of every control |
| [CommunityToolkit.Mvvm docs](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/) | `ObservableProperty`, `RelayCommand`, `ObservableValidator` usage |
| [WinUI 3 design guidelines](https://learn.microsoft.com/windows/apps/design/) | Layout patterns, spacing, typography |
| [Theme resources reference](https://learn.microsoft.com/windows/apps/design/style/xaml-theme-resources) | Available `ThemeResource` keys for colors and brushes |
| [x:Bind markup extension](https://learn.microsoft.com/windows/uwp/xaml-platform/x-bind-markup-extension) | Compiled binding syntax and modes |