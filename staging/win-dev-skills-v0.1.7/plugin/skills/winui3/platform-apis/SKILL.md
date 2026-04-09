---
name: platform-apis
description: 'Windows platform API discovery — notifications, background tasks, sensors, geolocation. Use when the user needs a platform capability and you need to find the right API or apply a key pattern. See identity-and-setup for package identity required by notifications and background tasks.'
---

# Platform APIs — Discovery & Key Patterns

## Quick Reference

1. **Search before coding** — find the right API via [learn.microsoft.com/uwp/api/](https://learn.microsoft.com/uwp/api/) before writing platform code.
2. **Two SDK surfaces** — `Windows.*` (Platform SDK) and `Microsoft.*` (Windows App SDK for WinUI/notifications).
3. **Declare capabilities** — hardware/sensor APIs require `<DeviceCapability>` in `Package.appxmanifest`.
4. **Package identity required** — `AppNotificationManager` and `BackgroundTaskBuilder` need identity.
5. **DispatcherQueue for UI** — sensor/hardware callbacks arrive on background threads; marshal with `DispatcherQueue.TryEnqueue()`.

---

## Key Rules

### API Decision Tree
- Notifications → `AppNotificationManager` · Background → `BackgroundTaskBuilder` + `ExtendedExecutionSession`
- Location → `Geolocator` · Bluetooth → `BluetoothLEAdvertisementWatcher` · Sensors → `*.GetDefault()`
- Serial → `SerialDevice` · Camera → `MediaCapture` · Anything else → search `learn.microsoft.com/uwp/api/`

### Notifications
- Use `AppNotificationManager` + `AppNotificationBuilder` (never raw XML); requires package identity
- Register `NotificationInvoked` **before** `Register()` in `App()` constructor
- Check `Setting` before showing; use `Tag`/`Group` to replace; call `Unregister()` on exit

### Background Tasks
- Desktop apps are NOT suspended — timers continue. Use `ExtendedExecutionSession` for critical work
- `Task.Run` for CPU-bound, `async/await` for I/O — never `.Result`/`.Wait()`
- `DispatcherQueue.CreateTimer()` for UI timers; `PeriodicTimer` for background

### Sensors & Hardware
- Null-check `GetDefault()`; set `ReportInterval`; subscribe to `ReadingChanged` (don't poll)
- Dispose devices/stop watchers on page leave; handle permission denial with UI guidance

---

## Reference Docs

| File | Contents |
|------|----------|
| [references/notification-patterns.md](references/notification-patterns.md) | AppNotificationManager setup, AppNotificationBuilder, action handling, scheduling, push, badges |
| [references/background-task-patterns.md](references/background-task-patterns.md) | Registration, triggers, extended execution, timers, startup tasks, COM tasks |
| [references/sensor-patterns.md](references/sensor-patterns.md) | Geolocation, Bluetooth LE, serial, device enumeration |

## Related Skills
- `identity-and-setup` — package identity for notifications/background tasks
- `interop-webview` — HWND, `InitializeWithWindow` · `media-files` — MediaCapture, pickers

## External Resources

- [Platform SDK API](https://learn.microsoft.com/uwp/api/) · [WinAppSDK API](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/)
- [Notifications](https://learn.microsoft.com/windows/apps/design/shell/tiles-and-notifications/app-notifications-overview) · [Background tasks](https://learn.microsoft.com/windows/uwp/launch-resume/support-your-app-with-background-tasks)
- [Geolocation](https://learn.microsoft.com/windows/uwp/maps-and-location/get-location) · [Sensors](https://learn.microsoft.com/windows/uwp/devices-sensors/sensors) · [GATT](https://learn.microsoft.com/windows/uwp/devices-sensors/gatt-client)
