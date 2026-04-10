# Architect Knowledge Bundle — WinUI 3

Complete technical reference for architecture decisions in WinUI 3 desktop applications. Covers MVVM, async/dispatcher, data binding, API selection, platform APIs, persistence, and common gotchas.

---

## 1. MVVM Architecture Patterns

### CommunityToolkit.Mvvm Source Generators

Combine `[RelayCommand]` with `CanExecute`, `[NotifyCanExecuteChangedFor]`, `[NotifyPropertyChangedFor]`, and partial `OnPropertyChanged` hooks.

```csharp
public partial class OrderViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SubmitCommand))]
    [NotifyPropertyChangedFor(nameof(OrderSummary))]
    private string _customerName = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SubmitCommand))]
    private decimal _totalAmount;

    public string OrderSummary => $"{CustomerName} — {TotalAmount:C}";
    partial void OnCustomerNameChanged(string value) => _logger.LogDebug("Customer: {Name}", value);

    [RelayCommand(CanExecute = nameof(CanSubmit))]
    private async Task SubmitAsync(CancellationToken token) =>
        await _orderService.SubmitAsync(CustomerName, TotalAmount, token);
    private bool CanSubmit() => !string.IsNullOrWhiteSpace(CustomerName) && TotalAmount > 0;
}
```

### Cancellable Async Commands

Use `[RelayCommand(IncludeCancelCommand = true)]` to auto-generate a cancel command:

```csharp
public partial class ImportViewModel : ObservableObject
{
    [ObservableProperty] private double _progress;

    [RelayCommand(IncludeCancelCommand = true)] // Generates ImportCommand + ImportCancelCommand
    private async Task ImportAsync(CancellationToken token)
    {
        var items = await _fileService.ReadItemsAsync();
        for (int i = 0; i < items.Count; i++) {
            token.ThrowIfCancellationRequested();
            await _dataService.SaveAsync(items[i], token);
            Progress = (double)(i + 1) / items.Count * 100;
        }
    }
}
```

### Messenger Pattern

Use `WeakReferenceMessenger` for decoupled ViewModel-to-ViewModel communication. Implement `IRecipient<T>` on `ObservableRecipient` subclasses.

```csharp
// Message definition
public sealed class OrderSubmittedMessage(int orderId) : ValueChangedMessage<int>(orderId);

// Sender — fire from any ViewModel
WeakReferenceMessenger.Default.Send(new OrderSubmittedMessage(orderId));

// Receiver — IRecipient<T> auto-registers on OnActivated()
public partial class DashboardViewModel : ObservableRecipient, IRecipient<OrderSubmittedMessage>
{
    public void Receive(OrderSubmittedMessage message) => RecentOrderId = message.Value;
}

// Request/response: sender awaits a reply
public class ConfirmRequest : AsyncRequestMessage<bool> { }
bool confirmed = await WeakReferenceMessenger.Default.Send<ConfirmRequest>();
```

### XAML Behaviors

Install `Microsoft.Xaml.Behaviors.WinUI.Managed`. Bind UI events to commands without code-behind:

```xml
xmlns:i="using:Microsoft.Xaml.Interactivity"  xmlns:core="using:Microsoft.Xaml.Interactions.Core"

<ListView ItemsSource="{x:Bind ViewModel.Items, Mode=OneWay}">
    <i:Interaction.Behaviors>
        <core:EventTriggerBehavior EventName="DoubleTapped">
            <core:InvokeCommandAction Command="{x:Bind ViewModel.OpenDetailCommand}" />
        </core:EventTriggerBehavior>
    </i:Interaction.Behaviors>
</ListView>
```

### Composite ViewModels

Parent ViewModel owns child ViewModels. Share state through injected services, not direct references. Register children in DI.

```csharp
public partial class ShellViewModel : ObservableObject
{
    [ObservableProperty] private object _currentPage;
    public HeaderViewModel Header { get; }
    public NavigationViewModel Navigation { get; }

    public ShellViewModel(HeaderViewModel header, NavigationViewModel nav, INavigationService navService)
    { Header = header; Navigation = nav; navService.Navigated += page => CurrentPage = page; }
}
```

### State Management

Model explicit states with an enum. Bind `VisualStateManager` to the state property — avoid scattered boolean flags.

```csharp
public enum PageState { Loading, Loaded, Error, Empty }

public partial class ProductListViewModel : ObservableObject
{
    [ObservableProperty] private PageState _state = PageState.Loading;
    [ObservableProperty] private string _errorMessage = string.Empty;

    [RelayCommand]
    private async Task LoadAsync()
    {
        State = PageState.Loading;
        try {
            var items = await _productService.GetAllAsync();
            State = items.Count > 0 ? PageState.Loaded : PageState.Empty;
        } catch (Exception ex) { ErrorMessage = ex.Message; State = PageState.Error; }
    }
}
```

Use `StateTrigger` in XAML to toggle visibility per state:

```xml
<VisualState x:Name="Loading">
    <VisualState.StateTriggers>
        <StateTrigger IsActive="{x:Bind ViewModel.State.Equals(local:PageState.Loading), Mode=OneWay}" />
    </VisualState.StateTriggers>
</VisualState>
```

### Validation with ObservableValidator

Extend `ObservableValidator` with data annotations (`[Required]`, `[Range]`, `[MinLength]`). Call `ValidateAllProperties()` before submission and bind `GetErrors()` to UI.

```csharp
public partial class RegistrationViewModel : ObservableValidator
{
    [ObservableProperty] [Required] [EmailAddress] private string _email = string.Empty;
    [ObservableProperty] [Required] [MinLength(8)] private string _password = string.Empty;

    [RelayCommand]
    private void Register() { ValidateAllProperties(); if (!HasErrors) _authService.Register(Email, Password); }
}
```

### Dialog and Navigation Services

Abstract `ContentDialog` and `Frame.Navigate` behind interfaces for testable ViewModels:

```csharp
public interface IDialogService { Task<bool> ShowConfirmationAsync(string title, string message); }
public interface INavigationService { bool Navigate<TViewModel>(object? parameter = null); void GoBack(); }

// ViewModel never touches UI types directly
public class DialogService(XamlRoot xamlRoot) : IDialogService
{
    public async Task<bool> ShowConfirmationAsync(string title, string message) =>
        await new ContentDialog { Title = title, Content = message,
            PrimaryButtonText = "Yes", CloseButtonText = "No", XamlRoot = xamlRoot
        }.ShowAsync() == ContentDialogResult.Primary;
}
```

### Dependency Injection Setup

Use `Microsoft.Extensions.DependencyInjection` to configure an `IServiceProvider` on the `App` class. Avoid `Ioc.Default`.

```csharp
// App.xaml.cs — register services at startup
public sealed partial class App : Application
{
    public App()
    {
        Services = ConfigureServices();
        this.InitializeComponent();
    }

    public new static App Current => (App)Application.Current;
    public IServiceProvider Services { get; }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();

        services.AddSingleton<IDialogService, DialogService>();
        services.AddSingleton<INavigationService, NavigationService>();
        services.AddTransient<MainViewModel>();

        return services.BuildServiceProvider();
    }
}
```

```csharp
// ViewModel — use constructor injection
public partial class MainViewModel(INavigationService nav) : ObservableObject
{
    private readonly INavigationService _nav = nav;
}
```

```csharp
// View — resolve via App.Current.Services
public sealed partial class MainPage : Page
{
    public MainViewModel ViewModel { get; } = App.Current.Services.GetRequiredService<MainViewModel>();
}
```

### Project Folder Structure

```
MyApp/
├── Models/           # Data models, DTOs
├── ViewModels/       # ObservableObject subclasses
├── Views/            # Pages, Windows, UserControls
├── Services/         # INavigationService, IDialogService, etc.
├── Converters/       # IValueConverter implementations
├── Helpers/          # Static utility methods
├── Controls/         # Custom UserControls, TemplatedControls
├── Assets/           # Images, icons, fonts
└── App.xaml.cs       # DI container, app startup
```

### MVVM Anti-patterns

| Anti-pattern | Problem | Correct approach |
|---|---|---|
| Direct ViewModel-to-ViewModel references | Tight coupling, untestable | Use `WeakReferenceMessenger` or shared services |
| Code-behind event handlers for commands | Bypasses data binding, not testable | Use XAML Behaviors `EventTriggerBehavior` |
| ViewModel referencing View types | Breaks separation of concerns | Use `IDialogService` / `INavigationService` |
| Not unregistering Messenger recipients | Memory leaks | Use `ObservableRecipient` with `OnDeactivated()` |
| Synchronous I/O in commands | Freezes UI thread | Use `async Task` with `[RelayCommand]` |
| Business logic in value converters | Hidden, untestable logic | Move logic to ViewModel computed properties |
| `Ioc.Default` service locator | Older migration helper | `Microsoft.Extensions.DependencyInjection` |
| Scattered `IsLoading`, `HasError` booleans | Hard to manage state | Single `PageState` enum |

---

## 2. Async/Dispatcher Patterns

### DispatcherQueue Replaces WPF Dispatcher

WinUI 3 uses `DispatcherQueue` — there is no `Dispatcher.Invoke` or `Application.Current.Dispatcher`.

```csharp
// Store the UI DispatcherQueue explicitly — no Application.Current.Dispatcher equivalent
private readonly DispatcherQueue _dispatcherQueue = DispatcherQueue.GetForCurrentThread();

// Marshal back to UI thread from background work
_dispatcherQueue.TryEnqueue(() =>
{
    StatusText.Text = "Operation complete";
});

// Only three priorities: High, Normal, Low (not WPF's 10 levels)
_dispatcherQueue.TryEnqueue(DispatcherQueuePriority.High, () =>
{
    CriticalStatusUpdate();
});
```

### Awaitable Dispatch Wrapper

```csharp
public static Task<T> RunOnUIAsync<T>(DispatcherQueue dispatcher, Func<T> func)
{
    var tcs = new TaskCompletionSource<T>();
    if (!dispatcher.TryEnqueue(() =>
    {
        try { tcs.SetResult(func()); }
        catch (Exception ex) { tcs.SetException(ex); }
    }))
    {
        tcs.SetException(new InvalidOperationException("Failed to enqueue to dispatcher"));
    }
    return tcs.Task;
}

// Usage
var result = await RunOnUIAsync(_dispatcherQueue, () => MyTextBox.Text);
```

### Task.Run vs Native Async

```csharp
// CPU-bound: offload to thread pool
var hash = await Task.Run(() => ComputeExpensiveHash(data), cts.Token);

// I/O-bound: use async directly (no Task.Run needed)
var content = await File.ReadAllTextAsync(path, cts.Token);
var response = await httpClient.GetAsync(url, cts.Token);
```

### CancellationToken Patterns

```csharp
public partial class SearchViewModel : ObservableObject
{
    [RelayCommand(IncludeCancelCommand = true)]
    private async Task SearchAsync(CancellationToken token)
    {
        await Task.Delay(300, token); // debounce
        Results = await _searchService.SearchAsync(Query, token);
    }
}
```

XAML binding:
```xml
<Button Command="{x:Bind ViewModel.SearchCommand}" Content="Search" />
<Button Command="{x:Bind ViewModel.SearchCancelCommand}" Content="Cancel" />
```

### IProgress<T> for Progress Reporting

```csharp
[RelayCommand]
private async Task ProcessAsync()
{
    var progressHandler = new Progress<double>(p =>
    {
        // Progress<T> automatically marshals to the capturing SynchronizationContext (UI thread)
        ProgressValue = p;
    });
    await Task.Run(() => DoHeavyWork(progressHandler, _cts.Token));
}

private void DoHeavyWork(IProgress<double> progress, CancellationToken ct)
{
    for (int i = 0; i < total; i++)
    {
        ct.ThrowIfCancellationRequested();
        ProcessItem(i);
        progress.Report((double)(i + 1) / total * 100);
    }
}
```

### Thread Affinity Pitfalls

```csharp
// ❌ WRONG: XAML objects have thread affinity — cannot create on background thread
await Task.Run(() =>
{
    var brush = new SolidColorBrush(Colors.Red); // Throws!
});

// ✅ CORRECT: Create XAML objects on UI thread
var brush = new SolidColorBrush(Colors.Red);
await Task.Run(() => DoWork());
brush.Color = Colors.Green; // OK — back on UI thread

// ❌ WRONG: StorageFile from picker is tied to UI thread
StorageFile file = await picker.PickSingleFileAsync();
await Task.Run(async () =>
{
    await FileIO.ReadTextAsync(file); // May throw — agile boundary
});

// ✅ CORRECT: Read on UI thread, process on background
string content = await FileIO.ReadTextAsync(file);
var result = await Task.Run(() => ParseContent(content));
```

### DispatcherQueueTimer Setup and Cleanup

```csharp
private DispatcherQueueTimer? _timer;

private void StartTimer()
{
    _timer = DispatcherQueue.CreateTimer();
    _timer.Interval = TimeSpan.FromSeconds(1);
    _timer.Tick += OnTimerTick;
    _timer.Start();
}

private void OnTimerTick(DispatcherQueueTimer sender, object args)
{
    ElapsedText.Text = DateTime.Now.ToString("T");
}

// MUST stop and clean up — leaked timers keep firing after page unload
private void OnNavigatedFrom(NavigationEventArgs e)
{
    _timer?.Stop();
    _timer = null;
}
```

### ExtendedExecutionSession Lifecycle

```csharp
private ExtendedExecutionSession? _exSession;

private async Task<bool> RequestExtendedExecutionAsync()
{
    var session = new ExtendedExecutionSession
    {
        Reason = ExtendedExecutionReason.SavingData,
        Description = "Completing file sync"
    };
    session.Revoked += OnSessionRevoked;

    var result = await session.RequestExtensionAsync();
    if (result == ExtendedExecutionResult.Allowed)
    {
        _exSession = session;
        return true;
    }
    session.Dispose();
    return false;
}

private void OnSessionRevoked(object sender, ExtendedExecutionRevokedEventArgs args)
{
    _exSession?.Dispose();
    _exSession = null;
}
```

### Async Anti-patterns

```csharp
// ❌ WRONG: .Result and .Wait() cause deadlocks on UI thread
var data = GetDataAsync().Result;
GetDataAsync().Wait();

// ❌ WRONG: Thread.Sleep blocks the thread
Thread.Sleep(5000);
// ✅ CORRECT:
await Task.Delay(TimeSpan.FromSeconds(5), ct);

// ❌ WRONG: async void (except for event handlers)
async void LoadData() { ... } // unhandled exceptions crash the app
// ✅ CORRECT:
async Task LoadDataAsync() { ... }

// ❌ WRONG: BackgroundWorker is legacy
var worker = new BackgroundWorker();
// ✅ CORRECT: Use Task.Run + IProgress<T>
```

---

## 3. x:Bind Patterns

### x:Bind vs {Binding} Comparison

| Feature | `x:Bind` | `{Binding}` |
|---|---|---|
| Compile-time check | ✅ Yes | ❌ No |
| Performance | Faster (compiled) | Slower (reflection) |
| Default mode | **OneTime** | OneWay |
| IntelliSense | ✅ Yes | ❌ No |
| Works in Style setters | ❌ No | ✅ Yes |

> **Developer tip:** `x:Bind` currently breaks XAML Hot Reload. Use `{Binding}` temporarily during iterative UI dev, then switch to `x:Bind` for production.

### Binding Modes

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

### x:DataType Required on Every DataTemplate

```xml
<DataTemplate x:DataType="vm:ItemViewModel">
    <StackPanel Orientation="Horizontal" Spacing="8">
        <TextBlock Text="{x:Bind Name, Mode=OneWay}" />
        <CheckBox IsChecked="{x:Bind IsSelected, Mode=TwoWay}" />
    </StackPanel>
</DataTemplate>
```

### Function Bindings

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

### Pathless Casting (Pass Whole Object)

```xml
<DataTemplate x:DataType="local:ItemModel">
    <TextBlock Text="{x:Bind local:Helpers.FormatItem((local:ItemModel))}" />
</DataTemplate>
```

### Auto-Conversion: bool ↔ Visibility

```xml
<!-- No converter needed — x:Bind handles this automatically -->
<ProgressRing Visibility="{x:Bind ViewModel.IsLoading, Mode=OneWay}" />
```

### ObservableProperty Source Generator

```csharp
public partial class ItemViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private bool _isSelected;
}
```

> **Tip (.NET 10+):** With `LangVersion preview`, prefer partial properties for F12 navigation from XAML:
> ```csharp
> public partial class ItemViewModel : ObservableObject
> {
>     [ObservableProperty]
>     public partial string Name { get; set; }
> }
> ```

### ObservableCollection Pattern

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

### List-Detail Pattern

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
        <TextBlock Text="{x:Bind ViewModel.SelectedItem.Name, Mode=OneWay}"
                   Style="{StaticResource TitleTextBlockStyle}" />
        <TextBlock Text="{x:Bind ViewModel.SelectedItem.Description, Mode=OneWay}"
                   TextWrapping="Wrap" />
    </StackPanel>
</Grid>
```

### CollectionViewSource — Grouping

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

### Incremental Loading

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

---

## 4. API Selection Guide

### Sample-First Rule

> **MANDATORY:** Before implementing **any** WinAppSDK or Windows Platform SDK API you have not used before, you **must** search the sample repositories for a working example first. **Do not guess API usage patterns from documentation alone** — docs often omit critical details that only sample code reveals.

### How to Apply

1. **Translate** the user's scenario into API/programming keywords
2. **Search** the API references (Part A–B below) to identify which API fits
3. **Search sample repos** for the class name — search **all** of these:

| # | Repository | What it covers |
|---|---|---|
| 1 | [WindowsAppSDK-Samples](https://github.com/microsoft/WindowsAppSDK-Samples) | All WinAppSDK features (AI, windowing, lifecycle, notifications, etc.) |
| 2 | [AI Dev Gallery](https://github.com/microsoft/ai-dev-gallery) | On-device AI/ML patterns, model usage examples |
| 3 | [WinUI-Gallery](https://github.com/microsoft/WinUI-Gallery) | UI control patterns and XAML examples |

4. **Study** the sample's Model/ViewModel/Service layer — understand lifetime, parameters, error handling
5. **Adapt** into MVVM — don't copy the sample structure wholesale, match the call sequence exactly

### Part A — Windows App SDK APIs

**Full API reference:** https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/

Search strategy:
1. Translate the user's request into API terms (e.g., "describe an image" → `ImageDescription`; "add a notification" → `AppNotification`)
2. Search the API reference with those keywords
3. Verify the class/method exists in the project's SDK version (check `.csproj` `<PackageReference>` for `Microsoft.WindowsAppSDK`)

| # | Link | When to consult |
|---|---|---|
| 1 | [WinAppSDK API Reference (full)](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/) | Always — search and look up exact signatures |
| 2 | [Windows App SDK overview](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/) | Feature overview, architecture |
| 3 | [Release notes (stable)](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/stable-channel) | API availability, version support, breaking changes |
| 4 | [Windows AI overview](https://learn.microsoft.com/en-us/windows/ai/) | All AI options: Windows AI APIs, Windows ML, Foundry Local |
| 5 | [Get started with Windows AI APIs](https://learn.microsoft.com/en-us/windows/ai/apis/get-started) | Prerequisites, project setup, first AI call |

### Part B — Windows Platform SDK (UWP / WinRT APIs)

**Full API reference:** https://learn.microsoft.com/en-us/uwp/api/

The Platform SDK (`Windows.*` namespaces) is very large. Search by translating the user's requirement into programming keywords:
- "Send a Bluetooth message" → `Bluetooth`, `RFCOMM`, `BluetoothDevice`
- "Get the user's location" → `geolocation`, `Geolocator`, `position`
- "Copy to clipboard" → `clipboard`, `DataTransfer`, `DataPackage`

When both WinAppSDK and Platform SDK offer a similar API, prefer the WinAppSDK version.

---

## 5. Windows API Patterns

### 5.1 Notifications

#### AppNotificationManager Registration

Register the notification handler early in `App.xaml.cs`. Register `NotificationInvoked` **before** calling `Register()`:

```csharp
public sealed partial class App : Application
{
    private readonly DispatcherQueue _dispatcherQueue;

    public App()
    {
        this.InitializeComponent();

        _dispatcherQueue = DispatcherQueue.GetForCurrentThread();

        var notificationManager = AppNotificationManager.Default;
        notificationManager.NotificationInvoked += OnNotificationInvoked;
        notificationManager.Register();
    }

    private void OnNotificationInvoked(AppNotificationManager sender,
        AppNotificationActivatedEventArgs args)
    {
        _dispatcherQueue.TryEnqueue(() => HandleNotificationAction(args));
    }
}
```

Unregister on app exit:

```csharp
private void MainWindow_Closed(object sender, WindowEventArgs args)
{
    AppNotificationManager.Default.Unregister();
}
```

#### AppNotificationBuilder Patterns

```csharp
// Simple toast
var simple = new AppNotificationBuilder()
    .AddText("New message received")
    .AddText("Hello from WinUI 3!");
AppNotificationManager.Default.Show(simple.BuildNotification());

// Toast with image, buttons, and input
var rich = new AppNotificationBuilder()
    .AddText("Reply to John")
    .AddText("Hey, are you available for a meeting?")
    .SetAppLogoOverride(new Uri("ms-appx:///Assets/avatar.png"), AppNotificationImageCrop.Circle)
    .AddTextBox("replyBox", "Type a reply...")
    .AddButton(new AppNotificationButton("Send")
        .AddArgument("action", "reply")
        .AddArgument("conversationId", "42"))
    .AddButton(new AppNotificationButton("Dismiss")
        .AddArgument("action", "dismiss"));
AppNotificationManager.Default.Show(rich.BuildNotification());
```

#### Action Handling

```csharp
private void HandleNotificationAction(AppNotificationActivatedEventArgs args)
{
    string action = string.Empty;
    if (args.Arguments.TryGetValue("action", out var actionValue))
    {
        action = actionValue;
    }

    switch (action)
    {
        case "reply":
            string replyText = args.UserInput["replyBox"];
            string conversationId = args.Arguments["conversationId"];
            SendReply(conversationId, replyText);
            break;

        case "dismiss":
            break;

        default:
            NavigateToMainPage();
            break;
    }
}
```

#### Scheduled Notifications

```csharp
public void ScheduleReminder(string title, string message, DateTimeOffset scheduledTime)
{
    var builder = new AppNotificationBuilder()
        .AddText(title)
        .AddText(message)
        .AddButton(new AppNotificationButton("Snooze").AddArgument("action", "snooze"))
        .AddButton(new AppNotificationButton("Dismiss").AddArgument("action", "dismiss"));

    var notification = builder.BuildNotification();
    notification.Tag = $"reminder-{Guid.NewGuid():N}";
    notification.Group = "reminders";
    AppNotificationManager.Default.Schedule(notification, scheduledTime);
}

public void CancelScheduledNotification(string tag)
{
    AppNotificationManager.Default.RemoveScheduledNotificationByTag(tag);
}
```

#### Badge Updates

```csharp
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

public void UpdateBadgeCount(int count)
{
    var badgeXml = BadgeUpdateManager.GetTemplateContent(BadgeTemplateType.BadgeNumber);
    var badgeElement = badgeXml.SelectSingleNode("/badge") as XmlElement;
    badgeElement.SetAttribute("value", count.ToString());

    var badge = new BadgeNotification(badgeXml);
    BadgeUpdateManager.CreateBadgeUpdaterForApplication().Update(badge);
}

public void ClearBadge()
{
    BadgeUpdateManager.CreateBadgeUpdaterForApplication().Clear();
}
```

> Live tiles are not supported in WinUI 3 desktop apps. Badge notifications work on the taskbar icon only.

#### Notification Groups and Tags

```csharp
public void ShowOrUpdateChatNotification(string chatId, string sender, string message)
{
    var builder = new AppNotificationBuilder()
        .AddText(sender)
        .AddText(message)
        .AddButton(new AppNotificationButton("Open Chat")
            .AddArgument("action", "openChat")
            .AddArgument("chatId", chatId));

    var notification = builder.BuildNotification();
    notification.Tag = chatId;           // Same tag replaces existing
    notification.Group = "chat-messages";
    AppNotificationManager.Default.Show(notification);
}
```

#### Push Notification Channel Creation

```csharp
public async Task RegisterForPushAsync()
{
    var result = await PushNotificationManager.Default.CreateChannelAsync(
        new Guid("YOUR-AZURE-APP-ID-GUID"));

    if (result.Status == PushNotificationChannelStatus.CompletedSuccess)
    {
        await SendChannelToBackendAsync(result.Channel.Uri.ToString());
    }
}
```

#### Unpackaged App COM Activator

```csharp
[ComVisible(true)]
[ClassInterface(ClassInterfaceType.None)]
[Guid("YOUR-COM-ACTIVATOR-GUID")]
public class NotificationActivator : NotificationActivationCallback
{
    public void Activate(string appUserModelId, string invokedArgs,
        byte[] data, uint dataCount)
    {
        // Handle activation in unpackaged context
    }
}
```

#### Permission Checking and UI Flow

```csharp
public bool AreNotificationsEnabled()
{
    var setting = AppNotificationManager.Default.Setting;
    return setting == AppNotificationSetting.Enabled;
}

public void ShowNotificationOrGuide(AppNotificationBuilder builder)
{
    var setting = AppNotificationManager.Default.Setting;

    switch (setting)
    {
        case AppNotificationSetting.Enabled:
            AppNotificationManager.Default.Show(builder.BuildNotification());
            break;

        case AppNotificationSetting.DisabledByUser:
        case AppNotificationSetting.DisabledByGroupPolicy:
            ShowNotificationDisabledDialog(setting);
            break;

        case AppNotificationSetting.DisabledForApplication:
            ShowNotificationDisabledDialog(setting);
            break;
    }
}

private async void ShowNotificationDisabledDialog(AppNotificationSetting setting)
{
    var dialog = new ContentDialog
    {
        Title = "Notifications Disabled",
        Content = "Please enable notifications in Windows Settings to receive alerts.",
        PrimaryButtonText = "Open Settings",
        CloseButtonText = "Cancel",
        XamlRoot = MainWindow.Content.XamlRoot
    };

    if (await dialog.ShowAsync() == ContentDialogResult.Primary)
    {
        await Launcher.LaunchUriAsync(new Uri("ms-settings:notifications"));
    }
}
```

#### Notification Anti-patterns

| ❌ Anti-pattern | ✅ Correct approach |
|---|---|
| Using `Windows.UI.Notifications.ToastNotificationManager` | Use `AppNotificationManager` from Windows App SDK |
| Not registering `NotificationInvoked` before `Register()` | Register handler in `App()` constructor before `Register()` |
| Hardcoding XML: `new XmlDocument()` with raw toast XML | Use `AppNotificationBuilder` for type-safe construction |
| Sending excessive notifications without throttling | Batch updates using `Tag`/`Group` to replace existing ones |
| Ignoring the case where notifications are disabled | Check `AppNotificationManager.Default.Setting` before showing |
| Forgetting `Unregister()` on app exit | Call `AppNotificationManager.Default.Unregister()` in app shutdown |
| Assuming notifications work without package identity | Verify identity or configure COM activator for unpackaged apps |

#### Notification Verification Checklist

- [ ] `AppNotificationManager.Default.Register()` called in `App()` constructor
- [ ] `NotificationInvoked` event handler registered before `Register()`
- [ ] Notifications display correctly in Windows Action Center
- [ ] Button clicks route to correct action handler with proper arguments
- [ ] Text input from notification retrieved via `args.UserInput`
- [ ] App launches/activates when user clicks notification body
- [ ] Scheduled notifications fire at the correct `DateTimeOffset`
- [ ] `Tag` and `Group` set for replaceable notifications
- [ ] `AppNotificationManager.Default.Setting` checked before showing
- [ ] `Unregister()` called during app shutdown
- [ ] Push notification channel URI sent to backend on registration

### 5.2 Background Tasks

#### AppInstance Activation Handling

```csharp
var appInstance = AppInstance.GetCurrent();
var args = appInstance.GetActivatedEventArgs();

if (args.Kind == ExtendedActivationKind.StartupTask)
{
    // App was launched at login — start minimized or skip UI
}
```

#### Channel<T> Producer-Consumer Pattern

```csharp
var channel = Channel.CreateBounded<WorkItem>(100);
_ = Task.Run(async () => {
    await foreach (var item in GetWorkItemsAsync())
        await channel.Writer.WriteAsync(item);
    channel.Writer.Complete();
});
await foreach (var item in channel.Reader.ReadAllAsync())
    await ProcessItemAsync(item);
```

#### Progress + Cancellation ViewModel

```csharp
public partial class ImportViewModel : ObservableObject
{
    private CancellationTokenSource? _cts;

    [ObservableProperty] private double _progress;
    [ObservableProperty] private bool _isRunning;

    [RelayCommand]
    private async Task StartImportAsync()
    {
        _cts = new CancellationTokenSource();
        IsRunning = true;
        var progressHandler = new Progress<double>(p => Progress = p);
        try
        {
            await ImportDataAsync(progressHandler, _cts.Token);
        }
        catch (OperationCanceledException) { /* user cancelled */ }
        finally { IsRunning = false; }
    }

    [RelayCommand]
    private void CancelImport() => _cts?.Cancel();

    private async Task ImportDataAsync(IProgress<double> progress, CancellationToken ct)
    {
        for (int i = 0; i < totalItems; i++)
        {
            ct.ThrowIfCancellationRequested();
            await ProcessItemAsync(items[i], ct);
            progress.Report((double)(i + 1) / totalItems * 100);
        }
    }
}
```

#### StartupTask Registration

```csharp
private async Task ConfigureStartupAsync()
{
    var task = await StartupTask.GetAsync("MyAppStartupId"); // matches Package.appxmanifest

    switch (task.State)
    {
        case StartupTaskState.Disabled:
            var result = await task.RequestEnableAsync();
            break;
        case StartupTaskState.DisabledByUser:
            // Cannot enable programmatically — direct user to Settings
            break;
        case StartupTaskState.Enabled:
            break;
    }
}
```

#### COM-Based Background Task Registration

```csharp
var builder = new BackgroundTaskBuilder
{
    Name = "SyncTask",
    TaskEntryPoint = "MyApp.Background.SyncBackgroundTask"
};
builder.SetTrigger(new TimeTrigger(freshnessTime: 15, oneShot: false));
builder.AddCondition(new SystemCondition(SystemConditionType.InternetAvailable));
builder.Register();
```

#### DispatcherQueueTimer Patterns

```csharp
private DispatcherQueueTimer? _uiTimer;

private void StartUiTimer()
{
    _uiTimer = DispatcherQueue.CreateTimer();
    _uiTimer.Interval = TimeSpan.FromSeconds(1);
    _uiTimer.Tick += (s, e) => StatusText.Text = DateTime.Now.ToString("T");
    _uiTimer.Start();
}

private void StopUiTimer()
{
    _uiTimer?.Stop();
    _uiTimer = null;
}
```

#### PeriodicTimer (Background-Only)

```csharp
private async Task RunBackgroundTimerAsync(CancellationToken ct)
{
    using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
    while (await timer.WaitForNextTickAsync(ct))
    {
        await PollForUpdatesAsync(ct);
    }
}
```

#### Async Loading on Page Construction

```csharp
public partial class MyViewModel : ObservableObject
{
    [ObservableProperty] private bool _isLoading;
    public IAsyncRelayCommand LoadCommand { get; }

    public MyViewModel()
    {
        LoadCommand = new AsyncRelayCommand(LoadAsync);
        LoadCommand.Execute(null); // fire on construction
    }

    private async Task LoadAsync()
    {
        IsLoading = true;
        Items = await _dataService.GetItemsAsync();
        IsLoading = false;
    }
}
```

#### Process Lifecycle

WinUI 3 desktop apps are **not** suspended when minimized — timers and background work **continue**. Use `Windows.System.Power.PowerManager` to check battery state and reduce work on battery.

#### Background Task Anti-patterns

```csharp
// ❌ WRONG: Using UWP IBackgroundTask interface directly
public class MyTask : IBackgroundTask { ... }

// ❌ WRONG: Blocking UI thread with .Result or .Wait()
var data = GetDataAsync().Result;

// ❌ WRONG: Thread.Sleep blocks the thread
Thread.Sleep(5000);
// ✅ CORRECT: async delay
await Task.Delay(TimeSpan.FromSeconds(5), ct);

// ❌ WRONG: BackgroundWorker is legacy
var worker = new BackgroundWorker();

// ❌ WRONG: DispatcherQueue timer without cleanup — leaks
_timer = DispatcherQueue.CreateTimer();
_timer.Start();

// ❌ WRONG: Not disposing ExtendedExecutionSession — resource leak
var session = new ExtendedExecutionSession();
await session.RequestExtensionAsync();
```

### 5.3 Sensors & Hardware

#### Geolocation

Declare `<DeviceCapability Name="location" />` in `Package.appxmanifest`.

```csharp
var accessStatus = await Geolocator.RequestAccessAsync();
if (accessStatus == GeolocationAccessStatus.Allowed)
{
    var geolocator = new Geolocator { DesiredAccuracyInMeters = 50 };
    Geoposition position = await geolocator.GetGeopositionAsync();
    double lat = position.Coordinate.Point.Position.Latitude;
    double lon = position.Coordinate.Point.Position.Longitude;

    // Continuous tracking
    geolocator.PositionChanged += (s, e) =>
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            UpdateMapPosition(e.Position.Coordinate.Point);
        });
    };
}
```

Set `DesiredAccuracy` and `MovementThreshold` to control battery impact.

#### Bluetooth LE

Declare `<DeviceCapability Name="bluetooth" />` in `Package.appxmanifest`.

```csharp
var watcher = new BluetoothLEAdvertisementWatcher();
watcher.Received += (s, e) =>
{
    DispatcherQueue.TryEnqueue(async () =>
    {
        var device = await BluetoothLEDevice.FromBluetoothAddressAsync(e.BluetoothAddress);
        if (device != null)
        {
            var services = await device.GetGattServicesAsync();
            // Enumerate GATT services and characteristics
        }
    });
};
watcher.Start();
```

#### Serial Communication

Declare `<DeviceCapability Name="serialcommunication" />`.

```csharp
string selector = SerialDevice.GetDeviceSelector();
var devices = await DeviceInformation.FindAllAsync(selector);
if (devices.Count > 0)
{
    var serialDevice = await SerialDevice.FromIdAsync(devices[0].Id);
    serialDevice.BaudRate = 9600;
    serialDevice.DataBits = 8;

    using var writer = new DataWriter(serialDevice.OutputStream);
    writer.WriteString("PING");
    await writer.StoreAsync();
}
```

#### DeviceWatcher / AQS Enumeration

```csharp
var watcher = DeviceInformation.CreateWatcher(
    DeviceClass.VideoCapture);
watcher.Added += (s, info) =>
    DispatcherQueue.TryEnqueue(() => Devices.Add(info));
watcher.Removed += (s, update) =>
    DispatcherQueue.TryEnqueue(() => RemoveDevice(update.Id));
watcher.Start();
```

#### Sensors (Accelerometer, Gyroscope, Compass, etc.)

```csharp
var accelerometer = Accelerometer.GetDefault();
if (accelerometer != null)
{
    accelerometer.ReportInterval = Math.Max(100,
        accelerometer.MinimumReportInterval);
    accelerometer.ReadingChanged += (s, e) =>
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            XValue.Text = $"X: {e.Reading.AccelerationX:F3}";
        });
    };
}
```

#### Capability Declarations per Hardware Type

| Hardware | Capability | Manifest Element |
|---|---|---|
| GPS/Location | `location` | `<DeviceCapability Name="location" />` |
| Bluetooth | `bluetooth` | `<DeviceCapability Name="bluetooth" />` |
| Serial ports | `serialcommunication` | `<DeviceCapability Name="serialcommunication" />` |
| USB/HID | vendor/product specific | `<DeviceCapability>` with VID/PID |
| Camera | `webcam` | `<DeviceCapability Name="webcam" />` |
| Microphone | `microphone` | `<DeviceCapability Name="microphone" />` |

#### Permission Model

```csharp
// Check permission before accessing hardware
var accessInfo = DeviceAccessInformation.CreateFromDeviceClassId(deviceClassGuid);
if (accessInfo.CurrentStatus == DeviceAccessStatus.Allowed)
{
    // Safe to access
}
```

#### Sensor Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| Not declaring capabilities in manifest | API calls fail silently or throw at runtime | Add required capabilities in `Package.appxmanifest` |
| Assuming hardware is always present | `NullReferenceException` on devices without the sensor | Check `GetDefault() != null` or enumerate first |
| Polling sensor values in a loop | Drains battery, wastes CPU, misses readings | Subscribe to `ReadingChanged` or `PositionChanged` events |
| Not handling permission denial | App crashes or hangs when user denies access | Check access status and show explanatory UI |
| Keeping connections open when not needed | Locks the device, drains battery | Dispose devices and stop watchers when leaving the page |
| Updating UI directly from sensor callbacks | Thread access violation — callbacks arrive on background threads | Marshal to `DispatcherQueue.TryEnqueue()` |

### 5.4 File Handling

#### File Pickers with InitializeWithWindow/HWND

```csharp
var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindow);

// FileOpenPicker
var openPicker = new FileOpenPicker();
WinRT.Interop.InitializeWithWindow.Initialize(openPicker, hwnd);
openPicker.FileTypeFilter.Add(".txt");
openPicker.FileTypeFilter.Add(".md");
StorageFile file = await openPicker.PickSingleFileAsync();
if (file != null) { string content = await FileIO.ReadTextAsync(file); }

// FileSavePicker
var savePicker = new FileSavePicker();
WinRT.Interop.InitializeWithWindow.Initialize(savePicker, hwnd);
savePicker.SuggestedFileName = "NewDocument";
savePicker.FileTypeChoices.Add("Plain Text", new List<string> { ".txt" });
StorageFile saveFile = await savePicker.PickSaveFileAsync();

// FolderPicker
var folderPicker = new FolderPicker();
WinRT.Interop.InitializeWithWindow.Initialize(folderPicker, hwnd);
folderPicker.FileTypeFilter.Add("*");
StorageFolder folder = await folderPicker.PickSingleFolderAsync();
```

#### System.IO vs StorageFile Guidance

- Prefer `System.IO` with async overloads for direct file operations (better performance)
- Use `StorageFile`/`StorageFolder` for broker-mediated access (pickers, future-access lists, MRU)

```csharp
// System.IO — preferred for direct access
string content = await File.ReadAllTextAsync(filePath);
await File.WriteAllTextAsync(filePath, content);

// Streaming large files
await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read,
    FileShare.Read, bufferSize: 4096, useAsync: true);
using var reader = new StreamReader(stream);
while (await reader.ReadLineAsync() is { } line) { /* process line */ }
```

#### Storage Locations

```csharp
// Packaged: Private app data
StorageFolder localFolder = ApplicationData.Current.LocalFolder;

// Packaged: Read-only bundled assets
StorageFolder installFolder = Package.Current.InstalledLocation;

// Unpackaged: App-specific directory
string appDataPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "MyWinUIApp");
Directory.CreateDirectory(appDataPath);
```

#### Drag and Drop Files

```xml
<Grid AllowDrop="True" DragOver="Grid_DragOver" Drop="Grid_Drop" Background="Transparent">
    <TextBlock Text="Drop files here" HorizontalAlignment="Center" VerticalAlignment="Center" />
</Grid>
```

```csharp
private void Grid_DragOver(object sender, DragEventArgs e)
{
    e.AcceptedOperation = DataPackageOperation.Copy;
    e.DragUIOverride.Caption = "Drop to open";
}

private async void Grid_Drop(object sender, DragEventArgs e)
{
    if (e.DataView.Contains(StandardDataFormats.StorageItems))
    {
        var items = await e.DataView.GetStorageItemsAsync();
        foreach (var item in items)
        {
            if (item is StorageFile file)
            {
                string content = await FileIO.ReadTextAsync(file);
            }
        }
    }
}
```

#### File Type Associations

```xml
<Extensions>
  <uap:Extension Category="windows.fileTypeAssociation">
    <uap:FileTypeAssociation Name="myapp-docs">
      <uap:SupportedFileTypes>
        <uap:FileType>.myext</uap:FileType>
      </uap:SupportedFileTypes>
    </uap:FileTypeAssociation>
  </uap:Extension>
</Extensions>
```

```csharp
// Handle file activation in App.xaml.cs
var activatedArgs = AppInstance.GetCurrent().GetActivatedEventArgs();
if (activatedArgs.Kind == ExtendedActivationKind.File)
{
    var fileArgs = activatedArgs.Data as IFileActivatedEventArgs;
    foreach (var item in fileArgs.Files)
    {
        if (item is StorageFile file) { /* open the file */ }
    }
}
```

#### File Watchers with UI Dispatch

```csharp
private FileSystemWatcher _watcher;

public void StartWatching(string directoryPath)
{
    _watcher = new FileSystemWatcher(directoryPath)
    {
        NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
        Filter = "*.*",
        IncludeSubdirectories = true,
        EnableRaisingEvents = true
    };
    _watcher.Created += OnFileChanged;
    _watcher.Changed += OnFileChanged;
    _watcher.Deleted += OnFileChanged;
}

private void OnFileChanged(object sender, FileSystemEventArgs e)
{
    DispatcherQueue.TryEnqueue(() =>
    {
        StatusText.Text = $"{e.ChangeType}: {e.Name}";
    });
}

public void StopWatching() { _watcher?.Dispose(); _watcher = null; }
```

### 5.5 Windowing

#### Getting AppWindow via HWND → WindowId → AppWindow

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

#### Presenter Types

```csharp
var appWindow = GetAppWindow(window);

// Default overlapped
var overlapped = OverlappedPresenter.Create();
overlapped.IsResizable = true;
overlapped.IsMinimizable = true;
overlapped.IsMaximizable = false;
appWindow.SetPresenter(overlapped);

// Full screen
appWindow.SetPresenter(AppWindowPresenterKind.FullScreen);

// Compact overlay (picture-in-picture, always on top)
appWindow.SetPresenter(AppWindowPresenterKind.CompactOverlay);

// Restore to default
appWindow.SetPresenter(AppWindowPresenterKind.Default);
```

#### DPI-Aware Sizing

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

#### Center on Display

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

#### Custom TitleBar

Prefer the built-in `TitleBar` control:

```xml
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
```

```csharp
ExtendsContentIntoTitleBar = true;
SetTitleBar(AppTitleBar);
```

Customize caption button colors:

```csharp
var titleBar = appWindow.TitleBar;
titleBar.ButtonBackgroundColor = Colors.Transparent;
titleBar.ButtonForegroundColor = Colors.White;
titleBar.ButtonHoverBackgroundColor = Color.FromArgb(30, 255, 255, 255);
titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
```

#### Multi-Window Management

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

#### Modal Dialogs per Window

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

#### Cross-Window Communication

```csharp
public sealed class WindowMessenger
{
    public event Action<string, object?>? MessageReceived;
    public void Send(string channel, object? payload) =>
        MessageReceived?.Invoke(channel, payload);
}
// Register as singleton; each window subscribes to channels it cares about.
```

#### Window Events

```csharp
appWindow.Closing += (s, args) =>
{
    if (HasUnsavedChanges)
    {
        args.Cancel = true;
        _ = PromptSaveAsync();
    }
};

appWindow.Changed += (s, args) =>
{
    if (args.DidSizeChange)   { /* handle resize */ }
    if (args.DidPositionChange) { /* handle move */ }
};

appWindow.Destroying += (s, _) =>
{
    UnregisterAllHandlers(s);
};
```

---

## 6. Data Persistence Patterns

### ApplicationData Settings (Packaged Apps)

```csharp
var localSettings = ApplicationData.Current.LocalSettings;
localSettings.Values["theme"] = "Dark";

// Composite value for related settings
var composite = new ApplicationDataCompositeValue();
composite["Width"] = 1024;
composite["Height"] = 768;
localSettings.Values["windowSize"] = composite;
```

Individual values limited to **8 KB**. `RoamingFolder`/`RoamingSettings` are **deprecated**.

### File-Based Settings (Unpackaged Apps)

`ApplicationData` throws `COMException` in unpackaged apps. Use JSON file storage:

```csharp
public class SettingsService
{
    private readonly string _settingsPath;

    public SettingsService()
    {
        var appData = Environment.GetFolderPath(
            Environment.SpecialFolder.LocalApplicationData);
        var appFolder = Path.Combine(appData, "MyApp");
        Directory.CreateDirectory(appFolder);
        _settingsPath = Path.Combine(appFolder, "settings.json");
    }

    public async Task<AppSettings> LoadAsync()
    {
        if (!File.Exists(_settingsPath))
            return new AppSettings();

        await using var stream = File.OpenRead(_settingsPath);
        return await JsonSerializer.DeserializeAsync<AppSettings>(stream)
            ?? new AppSettings();
    }

    public async Task SaveAsync(AppSettings settings)
    {
        await using var stream = File.Create(_settingsPath);
        await JsonSerializer.SerializeAsync(stream, settings,
            AppJsonContext.Default.AppSettings);
    }
}
```

### JSON Serialization with Source Generators

Prefer `System.Text.Json` with source generators for AOT compatibility:

```csharp
[JsonSerializable(typeof(AppSettings))]
[JsonSerializable(typeof(List<UserProfile>))]
public partial class AppJsonContext : JsonSerializerContext { }

// Usage
var json = JsonSerializer.Serialize(settings,
    AppJsonContext.Default.AppSettings);
var result = JsonSerializer.Deserialize(json,
    AppJsonContext.Default.AppSettings);
```

### SQLite Setup

```csharp
public class DatabaseService : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly SemaphoreSlim _semaphore = new(1, 1);

    public DatabaseService(string dbPath)
    {
        _connection = new SqliteConnection($"Data Source={dbPath}");
        _connection.Open();
        InitializeDatabase();
    }

    private void InitializeDatabase()
    {
        using var cmd = _connection.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS Items (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """;
        cmd.ExecuteNonQuery();
    }

    public async Task<List<Item>> GetAllAsync()
    {
        await _semaphore.WaitAsync();
        try
        {
            var items = new List<Item>();
            using var cmd = _connection.CreateCommand();
            cmd.CommandText = "SELECT Id, Name, CreatedAt FROM Items";
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                items.Add(new Item
                {
                    Id = reader.GetInt32(0),
                    Name = reader.GetString(1),
                    CreatedAt = reader.GetString(2)
                });
            }
            return items;
        }
        finally { _semaphore.Release(); }
    }

    public void Dispose() => _connection.Dispose();
}
```

### Entity Framework Core Setup

```csharp
public class AppDbContext : DbContext
{
    public DbSet<Note> Notes => Set<Note>();

    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }
}

// In App.xaml.cs — register with DI
var dbPath = Path.Combine(
    ApplicationData.Current.LocalFolder.Path, "app.db");
services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// In a ViewModel — use scoped DbContext
public async Task LoadNotesAsync()
{
    await using var db = _dbContextFactory.CreateDbContext();
    Notes = new ObservableCollection<Note>(
        await db.Notes.OrderByDescending(n => n.UpdatedAt).ToListAsync());
}
```

### App Suspend/Resume State

```csharp
public App()
{
    this.InitializeComponent();
    this.EnteredBackground += OnEnteredBackground;
    this.LeavingBackground += OnLeavingBackground;
}

private async void OnEnteredBackground(object sender,
    EnteredBackgroundEventArgs e)
{
    var deferral = e.GetDeferral();
    try
    {
        var settings = ApplicationData.Current.LocalSettings;
        settings.Values["lastPage"] = _navigationService.CurrentPage;
        await _stateService.SaveStateAsync();
    }
    finally { deferral.Complete(); }
}
```

### Settings UI Pattern

```csharp
public class SettingsViewModel : ObservableObject
{
    private readonly ISettingsService _settings;

    private string _theme;
    public string Theme
    {
        get => _theme;
        set
        {
            if (SetProperty(ref _theme, value))
                _settings.Set("theme", value);
        }
    }

    public SettingsViewModel(ISettingsService settings)
    {
        _settings = settings;
        _theme = _settings.Get<string>("theme") ?? "Default";
    }
}
```

---

## 7. NuGet Package Catalog

| Package | Purpose | When to Use |
|---------|---------|-------------|
| CommunityToolkit.Mvvm | MVVM source generators | Always — core MVVM infrastructure |
| CommunityToolkit.WinUI.Controls.SettingsControls | SettingsCard, SettingsExpander | When app has a settings page |
| CommunityToolkit.WinUI.UI.Controls.DataGrid | DataGrid | When displaying tabular data |
| CommunityToolkit.WinUI.Converters | Common converters | When needing value converters |
| CommunityToolkit.WinUI.Animations | Animation helpers | When adding motion/transitions |
| Microsoft.Xaml.Behaviors.WinUI.Managed | Event triggers, InvokeCommandAction | When binding events to commands in XAML |
| WinUIEx | Window helpers, tray icon, etc. | When needing extended window features |
| Microsoft.Web.WebView2 | Embedded web content | When embedding HTML/web content |
| H.NotifyIcon.WinUI | System tray icon | When app needs tray presence |
| Microsoft.Extensions.DependencyInjection | DI container | Always — for service registration |
| System.Text.Json | JSON serialization | For data persistence |
| Microsoft.EntityFrameworkCore.Sqlite | SQLite database | When app needs structured data storage |
| Microsoft.Data.Sqlite | Lightweight SQLite | When EF Core is overkill but need SQLite |

---

## 8. Common Gotchas

1. **ContentDialog.XamlRoot must be set** — crashes without it. Always assign `dialog.XamlRoot = element.XamlRoot` before calling `ShowAsync()`.

2. **File pickers need HWND initialization** — calling `PickSingleFileAsync()` without `InitializeWithWindow` causes a crash or silent failure.

3. **AnyCPU doesn't work** — must specify `x64` or `Arm64` as the platform target. WinUI 3 requires a specific architecture.

4. **x:Bind defaults to OneTime** — dynamic data needs explicit `Mode=OneWay` or `Mode=TwoWay`. This is different from WPF's `{Binding}` which defaults to OneWay.

5. **NavigationView's SelectedItem must be set correctly** — auto-selection requires setting `SelectedItem` after items are loaded, not in the constructor.

6. **Async void should only be used for event handlers** — `async void` methods swallow exceptions and crash the app. Use `async Task` for commands.

7. **XAML objects have thread affinity** — cannot create `SolidColorBrush`, `BitmapImage`, or any UI element on a background thread. Create on UI thread only.

8. **StorageFile created via picker is tied to the UI thread** — read content on UI thread first, then process on background.

9. **WinUI 3 has no Dispatcher** — use `DispatcherQueue`. There is no `Application.Current.Dispatcher`. Capture `DispatcherQueue.GetForCurrentThread()` explicitly during initialization.

10. **Template-generated MainWindow.xaml should be modified, not replaced** — replacing the file can break the build system's code generation. Edit the existing file instead.

11. **`Window.Current` does not exist in WinUI 3** — it is a UWP-only API. Pass explicit `Window` references or use a `WindowService`.

12. **`Resize()` and `Move()` use physical pixels** — must scale by DPI (`GetDpiForWindow / 96.0`) for correct sizing on high-DPI displays.

13. **`CollectionViewSource` does not support sorting/filtering** — sort and filter in your ViewModel before binding, unlike WPF which supports it natively.

14. **`RoamingSettings` and `RoamingFolder` are deprecated** — do not use them for new apps. Use `LocalSettings` or cloud sync via your own backend.

15. **One `ContentDialog` per XamlRoot at a time** — showing a second dialog while one is active throws. Queue or dismiss existing dialogs first.

16. **Window is NOT a UIElement** — WinUI 3's `Window` class does NOT inherit from `UIElement` or `FrameworkElement`. This is fundamentally different from WPF. Consequences for architecture:
    - **No `Window.DataContext`** — set DataContext on `(FrameworkElement)window.Content` instead
    - **No `Window.Resources`** — put resources in `App.xaml` or `Page.Resources`
    - **No `Window.KeyboardAccelerators`** — will silently crash the XAML compiler. Attach to NavigationView or Page instead
    - **No `Window.RequestedTheme`** — set on `((FrameworkElement)Content).RequestedTheme`
    - **No `Window.XamlRoot`** — get from `Content.XamlRoot`
    - **No routed events on Window** (Tapped, PointerPressed, etc.)
    - **IThemeService implementation** must cast `Window.Content` to `FrameworkElement` to set theme — NOT the Window itself
    - **IDialogService implementation** must get `XamlRoot` from a UIElement (via Content), not from Window
    - **MainWindow.xaml should be minimal** — just NavigationView/Frame as content. All UI goes in Page files.

17. **Transient disposable services need factory injection** — If a service is both `Transient` and `IDisposable` (e.g., a per-recording capture service), do NOT inject the service directly. The DI container creates one instance, the ViewModel disposes it after use, then can't create a new one.
    - **Register** as Transient: `services.AddTransient<IScreenCaptureService, ScreenCaptureService>();`
    - **Inject a factory**, not the instance: `Func<IScreenCaptureService>` in the ViewModel constructor
    - **Create fresh** per operation: `var capture = _captureFactory();`
    - **Dispose** after the operation completes
    - If the blueprint specifies a service as Transient, ALWAYS include the factory pattern in the DI registration section and the ViewModel constructor signature.

18. **Template name is `winui`, NOT `winui3`** — use `dotnet new winui -n AppName`. The `winui3` template does not exist.
