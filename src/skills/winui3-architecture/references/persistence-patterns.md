# Persistence Patterns — Detailed Reference

ApplicationData settings, JSON with source generators, SQLite, EF Core setup, and suspend/resume state for WinUI 3.

---

## ApplicationData Settings (Packaged Apps)

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

Individual values limited to **8 KB**. `RoamingFolder`/`RoamingSettings` are **deprecated**.

---

## File-Based Settings (Unpackaged Apps)

`ApplicationData` throws `COMException` in unpackaged apps. Use JSON file storage:

```csharp
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

---

## File Storage (Packaged)

```csharp
var localFolder = ApplicationData.Current.LocalFolder;
var file = await localFolder.CreateFileAsync("data.json",
    CreationCollisionOption.ReplaceExisting);
await FileIO.WriteTextAsync(file, jsonContent);
```

---

## JSON Serialization with Source Generators

Prefer `System.Text.Json` with source generators for AOT compatibility:

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

---

## SQLite Setup

Use `Microsoft.Data.Sqlite` or `sqlite-net-pcl`. Place DB in `LocalFolder` (packaged) or `LocalApplicationData` (unpackaged). Use `SemaphoreSlim` for thread safety:

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

---

## Entity Framework Core Setup

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

---

## App Suspend/Resume State

Subscribe to `EnteredBackground`/`LeavingBackground`. Use `e.GetDeferral()` to save state asynchronously:

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

---

## Settings UI Pattern

Back settings pages with a `SettingsService` that wraps storage access:

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
