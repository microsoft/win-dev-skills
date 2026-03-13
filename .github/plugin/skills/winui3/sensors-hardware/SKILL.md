---
name: sensors-hardware
description: 'Sensor and hardware integration for WinUI 3 apps — geolocation, Bluetooth, serial ports, and device enumeration. Use when accessing hardware sensors or peripherals.'
---

# Sensors & Hardware Integration for WinUI 3

These rules apply when your app **integrates with device sensors or hardware peripherals**.

---

## Rules

1. **Geolocation** — Use `Windows.Devices.Geolocation.Geolocator` to obtain device position. Always call `Geolocator.RequestAccessAsync()` before reading location. For continuous tracking, subscribe to `PositionChanged`. Set `DesiredAccuracy` and `MovementThreshold` to control battery impact. Declare the `location` capability in `Package.appxmanifest`.

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

2. **Bluetooth** — Use `Windows.Devices.Bluetooth` for classic Bluetooth and BLE. Discover BLE devices with `BluetoothLEAdvertisementWatcher`. Connect via GATT client for reading characteristics. Declare the `bluetooth` capability.

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

3. **Serial ports** — Use `Windows.Devices.SerialCommunication.SerialDevice`. Enumerate available ports with `DeviceInformation.FindAllAsync` using `SerialDevice.GetDeviceSelector()`. Read/write with `DataReader` and `DataWriter`. Declare the `serialcommunication` capability.

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

4. **Device enumeration** — Use `DeviceInformation.FindAllAsync()` with AQS (Advanced Query Syntax) filter strings to find specific device classes. Use `DeviceWatcher` for real-time plug-and-play monitoring of device arrival and removal.

```csharp
var watcher = DeviceInformation.CreateWatcher(
    DeviceClass.VideoCapture);
watcher.Added += (s, info) =>
    DispatcherQueue.TryEnqueue(() => Devices.Add(info));
watcher.Removed += (s, update) =>
    DispatcherQueue.TryEnqueue(() => RemoveDevice(update.Id));
watcher.Start();
```

5. **Sensors** — Access `Accelerometer`, `Gyroscope`, `Compass`, `LightSensor`, and `Barometer` via their static `GetDefault()` methods. Always check for `null` (sensor may not exist). Set `ReportInterval` to control frequency and subscribe to `ReadingChanged`.

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

6. **USB/HID** — Use `Windows.Devices.HumanInterfaceDevice` for HID devices and `Windows.Devices.Usb` for raw USB access. Both require capability declarations in the manifest specifying vendor/product IDs.

7. **Permission model** — Declare all required capabilities in `Package.appxmanifest`. The system prompts for user consent on first use. Check permission status before accessing hardware. Handle denial gracefully with informative UI rather than silent failure.

8. **Hardware availability** — Never assume a sensor or device exists. Always null-check `GetDefault()` results. Use `Geolocator.RequestAccessAsync()` for location. Use `DeviceAccessInformation.CreateFromDeviceClassId()` to query access status for device classes.

## Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| Not declaring capabilities in manifest | API calls fail silently or throw at runtime | Add required capabilities in `Package.appxmanifest` before coding |
| Assuming hardware is always present | `NullReferenceException` on devices without the sensor | Check `GetDefault() != null` or enumerate devices first |
| Polling sensor values in a loop | Drains battery, wastes CPU, misses readings | Subscribe to `ReadingChanged` or `PositionChanged` events |
| Not handling permission denial | App crashes or hangs when user denies access | Check access status and show explanatory UI on denial |
| Keeping connections open when not needed | Locks the device, drains battery, blocks other apps | Dispose devices and stop watchers when leaving the page |
| Updating UI directly from sensor callbacks | Thread access violation — callbacks arrive on background threads | Marshal to `DispatcherQueue.TryEnqueue()` for all UI updates |

## Validation

### Verification Checklist

- [ ] All required device capabilities are declared in `Package.appxmanifest`
- [ ] Hardware availability is checked before use (`GetDefault() != null`, `RequestAccessAsync`)
- [ ] Permission denial is handled with user-facing feedback
- [ ] Sensor/device event handlers marshal UI updates via `DispatcherQueue.TryEnqueue()`
- [ ] Watchers and device connections are stopped/disposed when no longer needed
- [ ] App behaves gracefully on machines without the target hardware

## Must Read & Research

> **Agent rule:** Before generating sensor or hardware code, look up the specific API on Microsoft Learn using the `microsoft-docs` or `microsoft-code-reference` skill to verify current signatures and capability requirements.

| Topic | Reference |
|---|---|
| Geolocation overview | [Get the user's location](https://learn.microsoft.com/en-us/windows/uwp/maps-and-location/get-location) |
| Bluetooth LE & GATT | [Bluetooth GATT Client](https://learn.microsoft.com/en-us/windows/uwp/devices-sensors/gatt-client) |
| Serial communication | [SerialDevice Class](https://learn.microsoft.com/en-us/uwp/api/windows.devices.serialcommunication.serialdevice) |
| Device enumeration | [Enumerate devices](https://learn.microsoft.com/en-us/windows/uwp/devices-sensors/enumerate-devices) |
| Sensors overview | [Sensors](https://learn.microsoft.com/en-us/windows/uwp/devices-sensors/sensors) |
