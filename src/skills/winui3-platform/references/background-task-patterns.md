# Background Task Patterns — Detailed Reference

Registration, triggers, extended execution, timers, startup tasks, and COM-based background tasks for WinUI 3.

---

## App Lifecycle & Activation

Windows App SDK replaces UWP activation with `AppInstance` APIs. Desktop apps use `Main` or `OnLaunched` — not `OnBackgroundActivated`.

```csharp
var appInstance = AppInstance.GetCurrent();
var args = appInstance.GetActivatedEventArgs();

if (args.Kind == ExtendedActivationKind.StartupTask)
{
    // App was launched at login — start minimized or skip UI
}
```

---

## Extended Execution

Use `ExtendedExecutionSession` to request continued execution when the user navigates away. Always handle revocation and dispose:

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

---

## Background Work Patterns

```csharp
// CPU-bound: offload to thread pool
var result = await Task.Run(() => ComputeExpensiveHash(data), cts.Token);

// I/O-bound: use async directly (no Task.Run needed)
var content = await File.ReadAllTextAsync(path, cts.Token);

// Marshal back to UI thread
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

---

## Timer-Based Work

### UI Timer (fires on UI thread)

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

### Background Timer

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

---

## Long-Running Operations with Progress & Cancellation

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

---

## Startup Tasks

Register the app to launch at user login:

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

---

## COM-Based Background Tasks (Packaged Apps)

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

---

## Process Lifecycle

WinUI 3 desktop apps are **not** suspended when minimized — timers and background work **continue**. Use `Windows.System.Power.PowerManager` to check battery state and reduce work on battery.

## Anti-patterns

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
