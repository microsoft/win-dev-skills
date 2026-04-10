# Notification Patterns — Detailed Reference

AppNotificationManager setup, AppNotificationBuilder, action handling, scheduling, push notifications, and badges for WinUI 3.

---

## AppNotificationManager Registration

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
// In MainWindow.xaml.cs
private void MainWindow_Closed(object sender, WindowEventArgs args)
{
    AppNotificationManager.Default.Unregister();
}
```

---

## AppNotificationBuilder Examples

### Simple Toast

```csharp
var simple = new AppNotificationBuilder()
    .AddText("New message received")
    .AddText("Hello from WinUI 3!");
AppNotificationManager.Default.Show(simple.BuildNotification());
```

### Toast with Image, Buttons, and Input

```csharp
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

---

## Notification Action Handling

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

---

## Scheduled Notifications

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

---

## Badge Updates

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

---

## Notification Groups and Tags

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

---

## Push Notifications

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

---

## Unpackaged App COM Activator

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

---

## Permission Checking

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
