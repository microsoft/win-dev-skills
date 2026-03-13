---
name: notifications
description: 'Rules and patterns for implementing toast notifications, scheduled notifications, push notifications, and notification handling in WinUI 3 / Windows App SDK apps using AppNotificationManager and AppNotificationBuilder.'
---

# WinUI 3 App Notifications (Toast & Push)

These rules apply to all notification implementations in WinUI 3 desktop applications using the Windows App SDK, including toast notifications, scheduled notifications, push notifications, badge updates, and notification action handling.

---

## Rules

### 1. Use `AppNotificationManager` (Windows App SDK)

`AppNotificationManager` replaces the legacy UWP `ToastNotificationManager`. It requires package identity. Register the notification handler early in `App.xaml.cs`:

```csharp
public sealed partial class App : Application
{
    private readonly DispatcherQueue _dispatcherQueue;

    public App()
    {
        this.InitializeComponent();

        // Capture the UI thread dispatcher queue
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

Unregister notifications when the app exits. Handle this in your main window's `Closed` event:

```csharp
// In MainWindow.xaml.cs
private void MainWindow_Closed(object sender, WindowEventArgs args)
{
    AppNotificationManager.Default.Unregister();
}
```

### 2. Build Notifications with `AppNotificationBuilder`

Use the builder API instead of raw XML. It supports text, images, buttons, and input fields:

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

### 3. Handle Notification Actions

Parse activation arguments when users click buttons or submit input:

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
            // Default activation — user clicked the notification body
            NavigateToMainPage();
            break;
    }
}
```

### 4. Schedule Notifications

Use `AppNotificationManager.Schedule()` with a future `DateTimeOffset`:

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

### 5. Badge Updates

Badge notifications update the count or glyph on the app's taskbar icon:

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

> **Note:** Live tiles are not supported in WinUI 3 desktop apps. Badge notifications work on the taskbar icon only.

### 6. Notification Groups and Tags

Use `Tag` and `Group` to organize, replace, or update existing notifications:

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

### 7. Push Notifications (Windows App SDK)

`PushNotificationManager` enables Azure-based push notifications:

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

### 8. Unpackaged App Considerations

Notifications require package identity. For unpackaged apps, use the Windows App SDK bootstrapper with a COM-based activator:

```csharp
// Register a COM activator GUID for notification handling in unpackaged apps
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
// Set <WindowsPackageType>None</WindowsPackageType> with identity settings in .csproj
```

### 9. Check Notification Permissions

Windows allows users to disable notifications per-app. Always handle the disabled case:

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
            // Guide user to Windows notification settings
            ShowNotificationDisabledDialog(setting);
            break;

        case AppNotificationSetting.DisabledForApplication:
            // App-level block — direct to Settings > Notifications
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

---

## Anti-patterns

| ❌ Anti-pattern | ✅ Correct approach |
|---|---|
| Using `Windows.UI.Notifications.ToastNotificationManager` | Use `AppNotificationManager` from Windows App SDK |
| Not registering `NotificationInvoked` before showing notifications | Register handler in `App()` constructor before `Register()` |
| Hardcoding XML: `new XmlDocument()` with raw toast XML | Use `AppNotificationBuilder` for type-safe construction |
| Sending excessive notifications without throttling | Batch updates using `Tag`/`Group` to replace existing ones |
| Ignoring the case where notifications are disabled | Check `AppNotificationManager.Default.Setting` before showing |
| Forgetting to call `Unregister()` on app exit | Call `AppNotificationManager.Default.Unregister()` in app shutdown |
| Assuming notifications work without package identity | Verify identity or configure COM activator for unpackaged apps |

---

## Validation

### Verification Checklist

- [ ] `AppNotificationManager.Default.Register()` is called in `App()` constructor
- [ ] `NotificationInvoked` event handler is registered before `Register()`
- [ ] Notifications display correctly in Windows Action Center
- [ ] Button clicks route to correct action handler with proper arguments
- [ ] Text input from notification is retrieved via `args.UserInput`
- [ ] App launches or activates correctly when user clicks notification body
- [ ] Scheduled notifications fire at the correct `DateTimeOffset`
- [ ] Notification `Tag` and `Group` are set for replaceable notifications
- [ ] `AppNotificationManager.Default.Setting` is checked before showing
- [ ] Notifications work correctly after app restart
- [ ] `Unregister()` is called during app shutdown
- [ ] Push notification channel URI is sent to backend on registration

---

## Must Read & Research

> **Agent rule:** Before generating notification code, look up the latest Windows App SDK notification APIs using the references below. API surface changes between SDK versions — always verify method signatures and enum values.

| Topic | Reference |
|---|---|
| App notifications overview | [App notifications overview (Windows App SDK)](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/app-notifications-overview) |
| AppNotificationBuilder API | [AppNotificationBuilder Class](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.windows.appnotifications.builder.appnotificationbuilder) |
| Send a local app notification | [Send a local app notification](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/notifications/app-notifications/send-local-app-notification) |
| Push notifications overview | [Push notifications (Windows App SDK)](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/notifications/push-notifications/) |
| Notification design guidance | [Toast notification UX guidance](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/toast-ux-guidance) |
