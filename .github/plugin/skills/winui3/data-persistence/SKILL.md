---
name: data-persistence
description: 'Data persistence patterns for WinUI 3 apps — local settings, file storage, SQLite, EF Core, JSON serialization, and app lifecycle state. Use when saving user preferences, app state, or structured data.'
---

# Data Persistence

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

- **Packaged apps** must use `ApplicationData.Current.LocalSettings` for simple key-value preferences. Use **composite values** (`ApplicationDataCompositeValue`) to group related settings atomically.

```csharp
// Packaged app — saving settings
var localSettings = ApplicationData.Current.LocalSettings;
localSettings.Values["theme"] = "Dark";

// Composite value for related settings
var composite = new ApplicationDataCompositeValue();
composite["Width"] = 1024;
composite["Height"] = 768;
localSettings.Values["windowSize"] = composite;
```

- **Individual setting values are limited to 8 KB** — never store serialized objects or large blobs in `LocalSettings`. Use file storage instead.

- **Unpackaged apps** cannot use `ApplicationData` APIs (they throw `COMException`). Use `System.Text.Json` with a file in `LocalApplicationData`:

```csharp
// Unpackaged app — file-based settings
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

- **File storage (packaged)** — use `ApplicationData.Current.LocalFolder` for app-private files. `RoamingFolder` is deprecated — do not use it. Access `KnownFolders` (Documents, Pictures) only with matching capabilities in the manifest.

```csharp
// Packaged app — file storage
var localFolder = ApplicationData.Current.LocalFolder;
var file = await localFolder.CreateFileAsync("data.json",
    CreationCollisionOption.ReplaceExisting);
await FileIO.WriteTextAsync(file, jsonContent);
```

- **File storage (unpackaged)** — use direct file system APIs with `Environment.SpecialFolder.LocalApplicationData` as the base path.

- **Always use `async/await`** for file I/O — never block the UI thread with synchronous reads/writes. See the **file-handling** skill for complete file picker, storage path, drag-drop, and file watcher patterns.

- **Handle file I/O exceptions** — always catch `IOException`, `UnauthorizedAccessException`, and `FileNotFoundException`.

- **SQLite** — use `Microsoft.Data.Sqlite` or `sqlite-net-pcl`. Place the database file in `LocalFolder` (packaged) or `LocalApplicationData` (unpackaged). Use `SemaphoreSlim` for thread safety:

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

- **Entity Framework Core** — use `Microsoft.EntityFrameworkCore.Sqlite`. Register `DbContext` in DI and always dispose after use:

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

- **JSON serialization** — prefer `System.Text.Json` with **source generators** for AOT compatibility and better performance:

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

- **App suspend/resume** — save lightweight state in `LocalSettings` and complex state to files. Subscribe to `EnteredBackground` and `LeavingBackground`:

```csharp
// In App.xaml.cs
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

- **Settings UI pattern** — back settings pages with a `SettingsService` that wraps storage access. Expose settings as observable properties that auto-save:

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

## Anti-patterns

- Using `ApplicationData` APIs in **unpackaged apps** — they throw `COMException` at runtime.
- Storing large objects in `LocalSettings` — the **8 KB limit per setting** causes silent data loss.
- Not handling **file I/O exceptions** (`IOException`, `UnauthorizedAccessException`, disk-full scenarios).
- Performing **synchronous file operations on the UI thread** — causes UI freezing and ANR.
- **Hardcoding file paths** instead of using `ApplicationData` (packaged) or `Environment.SpecialFolder` (unpackaged).
- Using `BinaryFormatter` for serialization — it is a **security risk** and deprecated in .NET.
- **Not disposing `DbContext`** after use — causes connection leaks and database locking.
- Using `RoamingFolder` or `RoamingSettings` — they are **deprecated** in Windows App SDK.

## Validation

- Build & register the MSIX package — see **Build, Run & Deploy** in `Agents.md`.
- Test both packaged and unpackaged code paths for storage access.
- Verify database operations complete without locking errors under concurrent access.

### Verification Checklist

- [ ] Settings persist across app restart
- [ ] All file operations use `async/await`
- [ ] Packaged apps use `ApplicationData`; unpackaged apps use `Environment.SpecialFolder`
- [ ] Database connections are properly disposed (via `using` or `IDisposable`)
- [ ] App state survives suspend/resume cycle
- [ ] File I/O exceptions are caught and handled gracefully
- [ ] JSON serialization uses source generators for AOT compatibility
- [ ] No data stored in `LocalSettings` exceeds 8 KB per value

## Must Read & Research

> **Agent Rule:** Before any data-persistence change (settings, files, database, serialization, app lifecycle), you **must** fetch and review these references using `fetch_webpage`. Apply what you learn.

| # | Reference | When to consult |
|---|---|---|
| 1 | [Save and load settings](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/store-and-retrieve-app-data) | Reading or writing app settings and preferences |
| 2 | [ApplicationData class](https://learn.microsoft.com/en-us/windows/apps/reference/cs-interop-apis/microsoft.windows.storage/applicationdata) | Using LocalSettings, LocalFolder, or any ApplicationData API |
| 3 | [SQLite databases in WinUI](https://learn.microsoft.com/en-us/windows/apps/develop/data-access/sqlite-data-access) | Adding or querying a SQLite database |
| 4 | [Entity Framework Core with WinUI](https://learn.microsoft.com/en-us/ef/core/get-started/overview/first-app) | Setting up EF Core, migrations, or DbContext |
| 5 | [File access permissions](https://learn.microsoft.com/en-us/windows/apps/files-and-folders/file-access-permissions) | Accessing files outside the app's sandboxed storage |
| 6 | [App lifecycle — WinUI 3](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/applifecycle/applifecycle-instancing) | Handling suspend, resume, or background transitions |
