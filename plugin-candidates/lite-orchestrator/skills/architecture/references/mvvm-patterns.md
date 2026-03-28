# MVVM Patterns — Detailed Reference

Code patterns and examples for CommunityToolkit.Mvvm, Messenger, behaviors, composite ViewModels, state management, validation, and DI in WinUI 3.

---

## CommunityToolkit.Mvvm Source Generators

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

---

## Messenger Pattern

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

---

## XAML Behaviors

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

---

## Composite ViewModels

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

---

## State Management

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

---

## Validation with ObservableValidator

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

---

## Dialog and Navigation Services

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

---

## Dependency Injection Setup

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

---

## Anti-patterns Table

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
