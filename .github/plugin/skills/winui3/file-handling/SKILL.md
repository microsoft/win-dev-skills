---
name: file-handling
description: 'WinUI 3 file handling patterns: file pickers, System.IO, packaged/unpackaged storage, drag-and-drop, file watchers, and file type associations for Windows App SDK desktop apps.'
---

# File Handling & Storage in WinUI 3

These rules apply to all file access operations in WinUI 3 / Windows App SDK desktop applications, including file pickers, reading and writing files, managing application storage locations, drag-and-drop, file watching, and file type activation.

---

## Rules

### 1. File Pickers Require Window Handle Initialization

In WinUI 3, file pickers are not tied to a `CoreWindow`. You must initialize them with the current window's HWND via `WinRT.Interop.InitializeWithWindow`.

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

### 2. Prefer System.IO for Direct File Operations

Use `System.IO` with async overloads for performance. Reserve `StorageFile`/`StorageFolder` for broker-mediated access (pickers, future-access lists).

```csharp
string content = await File.ReadAllTextAsync(filePath);
await File.WriteAllTextAsync(filePath, content);

// Streaming large files
await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read,
    FileShare.Read, bufferSize: 4096, useAsync: true);
using var reader = new StreamReader(stream);
while (await reader.ReadLineAsync() is { } line) { /* process line */ }
```

### 3. Packaged App File Access

```csharp
// Private app data — persists across sessions
StorageFolder localFolder = ApplicationData.Current.LocalFolder;
StorageFile settingsFile = await localFolder.CreateFileAsync("settings.json",
    CreationCollisionOption.OpenIfExists);

// Read-only bundled assets shipped with the package
StorageFolder installFolder = Package.Current.InstalledLocation;
StorageFile asset = await installFolder.GetFileAsync("Assets\\defaults.json");

// Temporary files — system may clean up
StorageFolder tempFolder = ApplicationData.Current.TemporaryFolder;
StorageFile tempFile = await tempFolder.CreateFileAsync("export.tmp",
    CreationCollisionOption.ReplaceExisting);
```

### 4. Unpackaged App File Access

```csharp
// Create an app-specific directory under LocalApplicationData
string appDataPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "MyWinUIApp");

Directory.CreateDirectory(appDataPath); // Safe to call if already exists

string settingsPath = Path.Combine(appDataPath, "settings.json");
await File.WriteAllTextAsync(settingsPath, jsonContent);
```

### 5. Broad File System Access (Packaged Apps)

Declare in `Package.appxmanifest`:

```xml
<Package xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Capabilities>
    <rescap:Capability Name="broadFileSystemAccess" />
  </Capabilities>
</Package>
```

Users must grant permission in **Settings > Privacy > File system**. Always handle denial:

```csharp
try
{
    StorageFolder folder = await StorageFolder.GetFolderFromPathAsync(@"C:\Users\Public\Documents");
    var files = await folder.GetFilesAsync();
}
catch (UnauthorizedAccessException)
{
    // Permission not granted — prompt user to enable in Settings
    await Launcher.LaunchUriAsync(new Uri("ms-settings:privacy-broadfilesystemaccess"));
}
catch (FileNotFoundException)
{
    // Path does not exist
}
```

### 6. Recent Files / MRU (Most Recently Used)

```csharp
// Packaged apps — StorageApplicationPermissions MRU list
var mru = StorageApplicationPermissions.MostRecentlyUsedList;

// Add a file after user picks it
string token = mru.Add(pickedFile, "user-document.txt");

// Retrieve later by token
try
{
    StorageFile file = await mru.GetFileAsync(token);
}
catch (FileNotFoundException)
{
    mru.Remove(token); // File no longer exists
}
```

For unpackaged apps, maintain your own MRU list serialized to JSON or a local database.

### 7. File Type Associations

Declare supported types in `Package.appxmanifest`:

```xml
<Extensions>
  <uap:Extension Category="windows.fileTypeAssociation">
    <uap:FileTypeAssociation Name="myapp-docs">
      <uap:SupportedFileTypes>
        <uap:FileType>.myext</uap:FileType>
        <uap:FileType>.txt</uap:FileType>
      </uap:SupportedFileTypes>
    </uap:FileTypeAssociation>
  </uap:Extension>
</Extensions>
```

Handle file activation in `App.xaml.cs` using the Windows App SDK `AppInstance` API (this replaces the UWP `OnFileActivated` override):

```csharp
protected override void OnLaunched(LaunchActivatedEventArgs args)
{
    var activatedArgs = AppInstance.GetCurrent().GetActivatedEventArgs();
    if (activatedArgs.Kind == ExtendedActivationKind.File)
    {
        var fileArgs = activatedArgs.Data as IFileActivatedEventArgs;
        foreach (var item in fileArgs.Files)
        {
            if (item is StorageFile file)
            {
                // Open the file in your app
            }
        }
    }
}
```

### 8. Drag and Drop Files

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
    e.DragUIOverride.IsCaptionVisible = true;
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
                // Process file content
            }
            else if (item is StorageFolder folder)
            {
                // Process folder
            }
        }
    }
}
```

### 9. File Watchers with UI Dispatch

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
    _watcher.Renamed += OnFileRenamed;
}

private void OnFileChanged(object sender, FileSystemEventArgs e)
{
    DispatcherQueue.TryEnqueue(() =>
    {
        // Update UI — e.g., refresh file list
        StatusText.Text = $"{e.ChangeType}: {e.Name}";
    });
}

private void OnFileRenamed(object sender, RenamedEventArgs e)
{
    DispatcherQueue.TryEnqueue(() =>
    {
        StatusText.Text = $"Renamed: {e.OldName} → {e.Name}";
    });
}

// Dispose watcher when done
public void StopWatching()
{
    _watcher?.Dispose();
    _watcher = null;
}
```

---

## Anti-patterns

- ❌ **Not initializing file pickers with window handle** — calling `PickSingleFileAsync()` without `InitializeWithWindow` causes a crash or silent failure in WinUI 3.
- ❌ **Synchronous file I/O on the UI thread** — use `File.ReadAllTextAsync` / `WriteAllTextAsync`, never `File.ReadAllText` on the UI thread.
- ❌ **Using `StorageFile`/`StorageFolder` when `System.IO` suffices** — the WinRT storage APIs add overhead; use them only when you need broker-mediated access (pickers, MRU, broad access).
- ❌ **Hardcoding paths with backslashes** — use `Path.Combine("folder", "subfolder", "file.txt")` instead of `"folder\\subfolder\\file.txt"`.
- ❌ **Not handling `UnauthorizedAccessException`** — restricted locations and `broadFileSystemAccess` denial will throw; always wrap in try/catch.
- ❌ **Assuming `broadFileSystemAccess` is always granted** — users must explicitly enable it in Settings; check and handle denial gracefully.
- ❌ **Not disposing file streams** — always use `await using` or `using` statements for `FileStream`, `StreamReader`, and `StreamWriter`.

---

## Validation

### Verification Checklist

- [ ] File pickers open correctly and return selected files/folders without crashes.
- [ ] `InitializeWithWindow` is called on every picker before `Pick*Async`.
- [ ] Files read and write correctly in both packaged and unpackaged deployment modes.
- [ ] `ApplicationData.Current.LocalFolder` resolves correctly in packaged builds.
- [ ] Unpackaged apps create and use `LocalApplicationData` subfolder properly.
- [ ] Drag-and-drop files are received and processed without errors.
- [ ] File type activation launches the app and passes the file to `OnLaunched`.
- [ ] `FileSystemWatcher` events dispatch UI updates via `DispatcherQueue`.
- [ ] All file operations handle errors gracefully: locked files, missing files, permission denied.
- [ ] File streams are disposed properly — no resource leaks.
- [ ] `broadFileSystemAccess` denial is detected and the user is guided to Settings.
- [ ] MRU tokens work for re-accessing previously picked files.

---

## Must Read & Research

> **Agent rule:** Before generating file-handling code, look up the latest Windows App SDK file access documentation using the references below. Verify picker initialization patterns and storage API availability for the target SDK version.

| Topic | Reference |
|---|---|
| File access permissions | [learn.microsoft.com/windows/apps/develop/files/file-access-permissions](https://learn.microsoft.com/windows/apps/develop/files/file-access-permissions) |
| StorageFile class | [learn.microsoft.com/uwp/api/windows.storage.storagefile](https://learn.microsoft.com/uwp/api/windows.storage.storagefile) |
| StorageFolder class | [learn.microsoft.com/uwp/api/windows.storage.storagefolder](https://learn.microsoft.com/uwp/api/windows.storage.storagefolder) |
| File pickers in WinUI 3 | [learn.microsoft.com/windows/apps/develop/files/pickers](https://learn.microsoft.com/windows/apps/develop/files/pickers) |
| ApplicationData class | [learn.microsoft.com/uwp/api/windows.storage.applicationdata](https://learn.microsoft.com/uwp/api/windows.storage.applicationdata) |
| FileSystemWatcher | [learn.microsoft.com/dotnet/api/system.io.filesystemwatcher](https://learn.microsoft.com/dotnet/api/system.io.filesystemwatcher) |
