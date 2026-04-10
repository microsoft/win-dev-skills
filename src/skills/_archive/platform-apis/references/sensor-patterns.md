# Sensor & Hardware Patterns — Detailed Reference

Geolocation, Bluetooth LE, serial communication, device enumeration, and sensor access for WinUI 3.

---

## Geolocation

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

---

## Bluetooth LE

Declare `<DeviceCapability Name="bluetooth" />` in `Package.appxmanifest`.

Discover BLE devices with `BluetoothLEAdvertisementWatcher`. Connect via GATT client for reading characteristics:

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

---

## Serial Communication

Declare `<DeviceCapability Name="serialcommunication" />`. Enumerate ports with `DeviceInformation.FindAllAsync`:

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

---

## Device Enumeration

Use `DeviceInformation.FindAllAsync()` with AQS filters. Use `DeviceWatcher` for real-time plug-and-play:

```csharp
var watcher = DeviceInformation.CreateWatcher(
    DeviceClass.VideoCapture);
watcher.Added += (s, info) =>
    DispatcherQueue.TryEnqueue(() => Devices.Add(info));
watcher.Removed += (s, update) =>
    DispatcherQueue.TryEnqueue(() => RemoveDevice(update.Id));
watcher.Start();
```

---

## Sensors (Accelerometer, Gyroscope, Compass, etc.)

Access via static `GetDefault()` methods. Always null-check — sensor may not exist:

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

---

## USB/HID Devices

Use `Windows.Devices.HumanInterfaceDevice` for HID devices and `Windows.Devices.Usb` for raw USB. Both require capability declarations specifying vendor/product IDs.

---

## Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| Not declaring capabilities in manifest | API calls fail silently or throw at runtime | Add required capabilities in `Package.appxmanifest` |
| Assuming hardware is always present | `NullReferenceException` on devices without the sensor | Check `GetDefault() != null` or enumerate first |
| Polling sensor values in a loop | Drains battery, wastes CPU, misses readings | Subscribe to `ReadingChanged` or `PositionChanged` events |
| Not handling permission denial | App crashes or hangs when user denies access | Check access status and show explanatory UI |
| Keeping connections open when not needed | Locks the device, drains battery | Dispose devices and stop watchers when leaving the page |
| Updating UI directly from sensor callbacks | Thread access violation — callbacks arrive on background threads | Marshal to `DispatcherQueue.TryEnqueue()` |
