---
name: background-tasks
description: 'WinUI 3 background tasks, extended execution, timers, startup tasks, and long-running operation patterns for Windows App SDK desktop apps'
---

# Background Tasks & Services in WinUI 3

These rules apply to all background work, extended execution, timer-based operations, startup tasks, and long-running service patterns in WinUI 3 desktop applications using the Windows App SDK.

---

## Rules

### App Lifecycle & Activation

Windows App SDK replaces UWP activation with `AppInstance` APIs. Desktop apps use `Main` or `OnLaunched` — not `OnBackgroundActivated`.

```csharp
// App activation handling in Program.cs or App.xaml.cs
var appInstance = AppInstance.GetCurrent();
var args = appInstance.GetActivatedEventArgs();

if (args.Kind == ExtendedActivationKind.StartupTask)
{
    // App was launched at login — start minimized or skip UI
}
```

### Extended Execution

Use `ExtendedExecutionSession` to request continued execution when the user navigates away. Always handle revocation and dispose the session.

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
    // Save state immediately — execution is ending
    _exSession?.Dispose();
    _exSession = null;
}
```

### Background Work Patterns

Use `Task.Run` to offload long-running CPU-bound computations to the thread pool, keeping the UI responsive. For I/O-bound work, use `async/await` directly (no `Task.Run` needed). Use `Channel<T>` for producer-consumer queues.

> **Important:** Any UI property updates from a background thread must be dispatched back to the UI thread. Use `DispatcherQueue.TryEnqueue()` in views, or inject `TaskScheduler.FromCurrentSynchronizationContext()` in ViewModels (see the [advanced-mvvm](../advanced-mvvm/SKILL.md) DI section for the pattern).

```csharp
// CPU-bound: offload to thread pool
var result = await Task.Run(() => ComputeExpensiveHash(data), cts.Token);

// I/O-bound: use async directly (no Task.Run needed)
var content = await File.ReadAllTextAsync(path, cts.Token);

// Marshal back to UI thread when updating UI from background work
DispatcherQueue.TryEnqueue(() => StatusText.Text = result);

// Producer-consumer with Channel<T>
var channel = Channel.CreateBounded<WorkItem>(100);
_ = Task.Run(async () => {
    await foreach (var item in GetWorkItemsAsync())
        await channel.Writer.WriteAsync(item);
    channel.Writer.Complete();
});
await foreach (var item in channel.Reader.ReadAllAsync())
    await ProcessItemAsync(item);
```

### Timer-Based Work

Use `DispatcherQueue.CreateTimer()` for timers that need to update UI — callbacks fire on the UI thread automatically (no manual dispatch needed). Use `PeriodicTimer` for background-only timers where no UI updates occur.

```csharp
// UI timer — fires on the UI thread
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

// Background timer — does not block UI thread
private async Task RunBackgroundTimerAsync(CancellationToken ct)
{
    using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
    while (await timer.WaitForNextTickAsync(ct))
    {
        await PollForUpdatesAsync(ct);
    }
}
```

### Long-Running Operations with Progress & Cancellation

Report progress via `IProgress<T>` and support cancellation with `CancellationToken`.

```csharp
// ViewModel pattern with cancel support
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

### Startup Tasks

Register the app to launch at user login using the `StartupTask` API. Handle user denial gracefully.

```csharp
private async Task ConfigureStartupAsync()
{
    var task = await StartupTask.GetAsync("MyAppStartupId"); // matches Package.appxmanifest

    switch (task.State)
    {
        case StartupTaskState.Disabled:
            var result = await task.RequestEnableAsync();
            // result may be EnabledByPolicy, DisabledByUser, etc.
            break;
        case StartupTaskState.DisabledByUser:
            // Cannot enable programmatically — direct user to Settings
            break;
        case StartupTaskState.Enabled:
            break;
    }
}
```

> **Tip:** When a page needs to run async work on load (e.g., fetching data), use an `AsyncRelayCommand` triggered from the page's `Loaded` event or the ViewModel constructor — don't use `async void` event handlers. See [CommunityToolkit MVVM-Samples#25](https://github.com/CommunityToolkit/MVVM-Samples/issues/25) for the pattern:
> ```csharp
> public partial class MyViewModel : ObservableObject
> {
>     [ObservableProperty]
>     private bool _isLoading;
>
>     public IAsyncRelayCommand LoadCommand { get; }
>
>     public MyViewModel()
>     {
>         LoadCommand = new AsyncRelayCommand(LoadAsync);
>         LoadCommand.Execute(null); // fire on construction
>     }
>
>     private async Task LoadAsync()
>     {
>         IsLoading = true;
>         Items = await _dataService.GetItemsAsync();
>         IsLoading = false;
>     }
> }
> ```

### COM-Based Background Tasks (Packaged Apps)

For packaged WinUI 3 apps needing system-triggered background work, register COM-based tasks.

```csharp
var builder = new BackgroundTaskBuilder { Name = "SyncTask", TaskEntryPoint = "MyApp.Background.SyncBackgroundTask" };
builder.SetTrigger(new TimeTrigger(freshnessTime: 15, oneShot: false));
builder.AddCondition(new SystemCondition(SystemConditionType.InternetAvailable));
builder.Register();
```

### Process Lifecycle — Desktop Apps Are Not Suspended

WinUI 3 desktop apps are **not** suspended when minimized — they keep running like classic Win32 apps. No automatic suspend/resume cycle — your timers and background work **continue**.
- Use `Windows.System.Power.PowerManager` to check battery state and reduce work on battery.
- Stop non-essential background work when the app is minimized if appropriate.

## Anti-patterns

```csharp
// ❌ WRONG: Using UWP IBackgroundTask interface directly — desktop apps don't use this model
public class MyTask : IBackgroundTask { ... }

// ❌ WRONG: Blocking UI thread with .Result or .Wait()
var data = GetDataAsync().Result;              // deadlock risk
await Task.Run(() => service.FetchAsync().Wait()); // also wrong

// ❌ WRONG: Thread.Sleep blocks the thread
Thread.Sleep(5000);
// ✅ CORRECT: async delay
await Task.Delay(TimeSpan.FromSeconds(5), ct);

// ❌ WRONG: BackgroundWorker is legacy
var worker = new BackgroundWorker();

// ❌ WRONG: Creating DispatcherQueue timer without cleanup
_timer = DispatcherQueue.CreateTimer();
_timer.Start();
// Never stopped — leaks and keeps firing after page is unloaded

// ❌ WRONG: Not disposing ExtendedExecutionSession
var session = new ExtendedExecutionSession();
await session.RequestExtensionAsync();
// session never disposed — resource leak
```

## Validation

### Verification Checklist

- [ ] Long-running operations report progress via `IProgress<T>` and accept `CancellationToken`
- [ ] All `DispatcherQueueTimer` instances are stopped and nulled on page `Unloaded` or `NavigatedFrom`
- [ ] `ExtendedExecutionSession` handles `Revoked` event and is disposed in all code paths
- [ ] Background work uses `Task.Run` or `async/await` — never blocks the UI thread with `.Result` or `.Wait()`
- [ ] `StartupTask.RequestEnableAsync()` handles `DisabledByUser` state (cannot re-enable programmatically)
- [ ] `PeriodicTimer` and `CancellationTokenSource` are disposed when no longer needed
- [ ] Power state is checked before starting intensive background work on battery

## Must Read & Research

> **Agent rule:** Before generating background task, timer, or extended execution code, look up the latest API surface and patterns from the references below using your research tools.

| Topic | Reference |
|---|---|
| App lifecycle (Windows App SDK) | [App lifecycle and activation](https://learn.microsoft.com/windows/apps/windows-app-sdk/applifecycle/applifecycle-rich-activation) |
| Extended execution | [Extended execution](https://learn.microsoft.com/windows/uwp/launch-resume/run-minimized-with-extended-execution) |
| Background tasks overview | [Background tasks overview](https://learn.microsoft.com/windows/uwp/launch-resume/support-your-app-with-background-tasks) |
| Threading and async | [Threading and async programming](https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/) |
| StartupTask class | [StartupTask API](https://learn.microsoft.com/uwp/api/windows.applicationmodel.startuptask) |
| COM background tasks | [Create and register a COM background task](https://learn.microsoft.com/windows/uwp/launch-resume/create-and-register-a-winmain-background-task) |
| Power management | [PowerManager class](https://learn.microsoft.com/uwp/api/windows.system.power.powermanager) |

---

## Related Skills

- **data-persistence** — saving state during suspension or extended execution
