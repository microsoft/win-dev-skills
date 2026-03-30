---
name: winui3
description: "WinUI 3 desktop app builder."
---

# WinUI 3 Desktop App Builder

You build **WinUI 3** desktop applications on the **Windows App SDK**.

## Workflow

Every time you work on this codebase, follow this checklist:

### Understand the Request
- Re-read the user's request and identify every requirement
- Think through the requirements and constraints and consider the scope of the request. 
- Define the scope clearly and completly
- Define the requrements based on the request, even if they are not explicitly inlcuded in the request. Use those requirements for the rest of the workflow as if they are part of the original request.
- If something is not clear, ask the user to clarify
- Search for related implementations to avoid duplication (DRY).
- Read the `.csproj` (if existing app) to determine `TargetFramework`, `RuntimeIdentifiers`, `Platforms`, and package versions

{{metadata}}

{{research}}

{{design}}

{{architecture}}

### Scaffold & Code
- Scaffold if you need to create a new app: `dotnet new winui -n <AppName>`
- Install packages with `dotnet add package <Name>` — **never specify `--version`** unless you need a prerelease. Omitting the version gets the latest stable, which avoids outdated API mismatches.
- Write all XAML and C# — use `x:Bind` with `Mode=OneWay`, `{ThemeResource}` brushes, `AutomationProperties.AutomationId` on interactive controls

### Build
```powershell
.\.github\skills\winui3-dev-workflow\build.ps1 <csproj> /p:Platform=<Arch> /p:Configuration=Debug /restore
```
- For Arch, use the current machine arch. Always use `x64` or `Arm64` platform (never AnyCPU)
- Never delete `Package.appxmanifest`
- Read ALL errors, batch-fix, rebuild

### Run
```powershell
winapp run bin\x64\Debug\<tfm>\win-x64\ --debug-output
```
NEVER run the exe directly.

{{verify}}

{{checklist}}

## WinUI 3 Essentials

### Namespace & Framework
- UI namespace: `Microsoft.UI.Xaml` (NOT `Windows.UI.Xaml`)
- Dispatcher: `DispatcherQueue` (NOT `CoreDispatcher`)
- Window: pass reference explicitly (NOT `Window.Current`)

### MVVM with CommunityToolkit.Mvvm
```csharp
// 8.x+ — use partial properties, NOT field-backed
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] public partial string Title { get; set; }
    [ObservableProperty] public partial bool IsLoading { get; set; }
    [RelayCommand] private async Task DoWorkAsync() { }
}
// ❌ OLD syntax: [ObservableProperty] private string _title = "";
```

**Any model bound to the UI that updates after initial binding must extend `ObservableObject`** — not just ViewModels. Data models like chat messages or list items need `[ObservableProperty]` too, or the UI won't refresh.

**Never replace an `ObservableCollection<T>` instance** — use `.Clear()` + re-add items. Replacing the instance breaks bindings silently.

If you stream/update a property on a bound object and the UI doesn't refresh, the object is missing `INotifyPropertyChanged`.
```csharp
// ✅ CORRECT — UI updates when Content is appended during streaming
public partial class ChatMessage : ObservableObject
{
    [ObservableProperty] public partial string Role { get; set; }
    [ObservableProperty] public partial string Content { get; set; }
}

### ⚠️ x:Bind Null Safety
Never use nested `x:Bind` paths to properties that could be null at startup — the app will crash with `NullReferenceException`:
```xml
❌ CRASHES: {x:Bind ViewModel.SelectedTab.CanGoBack, Mode=OneWay}
   — SelectedTab is null before any tab is created

✅ SAFE — flat ViewModel property (preferred):
   {x:Bind ViewModel.CanGoBack, Mode=OneWay}
```
```csharp
// In ViewModel — handle null safely:
public bool CanGoBack => SelectedTab?.CanGoBack ?? false;
partial void OnSelectedTabChanged(TabViewModel? value) => OnPropertyChanged(nameof(CanGoBack));
```
```xml
✅ SAFE — FallbackValue (alternative):
   {x:Bind ViewModel.SelectedTab.CanGoBack, Mode=OneWay, FallbackValue=False}
```
If `--debug-output` shows `NullReferenceException` at startup, check XAML for nested `x:Bind` paths.

### Title Bar & Backdrop
```csharp
ExtendsContentIntoTitleBar = true;
SetTitleBar(AppTitleBar);
```
```xml
<Window.SystemBackdrop><MicaBackdrop /></Window.SystemBackdrop>
```

## Anti-Patterns
- ❌ Guessing API names — look them up first
- ❌ Running `.exe` directly — always use `winapp run`
- ❌ Using `AnyCPU` platform
- ❌ Using UWP namespaces (`Windows.UI.Xaml`)
- ❌ Hardcoding colors — use `{ThemeResource}`
- ❌ Using `{Binding}` instead of `x:Bind`
- ❌ Old MVVM syntax (`[ObservableProperty] private string _field`)
