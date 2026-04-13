---
name: wpf-migration
description: 'Guide for migrating .NET WPF applications to WinUI 3 (Windows App SDK). Use when asked to migrate WPF code, convert WPF XAML to WinUI 3, replace System.Windows namespaces with Microsoft.UI.Xaml, update Dispatcher to DispatcherQueue, replace DynamicResource with ThemeResource, or migrate custom MVVM to CommunityToolkit.Mvvm.'
---

## Quick Reference

- **NEVER reference PresentationCore.dll or System.Windows.Media.Imaging** — WPF imaging assemblies crash the WinUI XAML compiler. Use `Windows.Graphics.Imaging` from the start. This is an architectural incompatibility, not a build config problem.
- **Break migration into focused tasks** — Don't send one massive "rewrite everything" prompt. Work file-by-file or module-by-module (e.g., "migrate ResizeOperation.cs", "update Settings.cs enums").
- **Set `<RootNamespace>` immediately** after `dotnet new winui` — match your WPF namespace BEFORE porting code.
- **Use `winapp run <build-output>`** — Packaged apps can't launch via exe directly. Never switch to unpackaged.
- **`x:Bind` defaults to `OneTime`** — Unlike WPF's `{Binding}`. Always set `Mode=OneWay`/`TwoWay`. Add `Bindings.Update()` in `DataContextChanged`.
- **Replace custom MVVM with CommunityToolkit.Mvvm** — Delete custom `Observable`/`RelayCommand`. Use `[ObservableProperty]` and `[RelayCommand]`.
- **Convert page switching to Frame navigation** — WPF's implicit DataTemplate switching → `Frame.Navigate(typeof(PageType), param)`.
- **Scan for `System.Windows` after porting** — `Select-String -Pattern 'System.Windows' -Recurse -Include '*.cs'`

---

## Critical Migration Rules

### Rule 1: WPF Imaging is Incompatible with WinUI (Do NOT Mix)
`PresentationCore.dll` and `System.Windows.Media.Imaging` **crash the WinUI XAML compiler** (`XamlCompiler.exe`). This is an architectural incompatibility — no MSBuild hack or reference configuration will fix it. 

**What to do:**
- Remove ALL `System.Windows.Media.Imaging` references at the start of migration
- Replace with `Windows.Graphics.Imaging` (WinRT) — see [references/imaging-migration.md](./references/imaging-migration.md)
- Do NOT add `<UseWPF>true</UseWPF>` or reference PresentationCore "temporarily" — it will silently corrupt the build
- If your app has heavy imaging code (encoders, decoders, metadata), migrate it early (step 2, not step 7)

### Rule 2: Break Work into Focused Tasks
Do NOT attempt to rewrite the entire app in one pass. Break migration into file-level or module-level tasks:
1. "Migrate the project file and NuGet references"
2. "Migrate Models/ResizeOperation.cs — replace WPF imaging with Windows.Graphics.Imaging"  
3. "Migrate ViewModels — update Dispatcher to DispatcherQueue"
4. "Migrate InputPage.xaml — convert XAML syntax"

This reduces token waste and makes errors traceable to specific changes.

### Rule 3: Avoid Concurrent File Conflicts
Do NOT have two agents modifying the same project files simultaneously. If the builder agent is handling this migration, it should read this skill directly — no need for a separate sub-agent. The conflict occurs when a parent agent spawns a child agent and both edit the same files.

### Rule 4: Namespace Alignment (Do FIRST)
After `dotnet new winui -n <Name>`:
1. Set `<RootNamespace>YourExistingNamespace</RootNamespace>` in csproj
2. Update `x:Class` in App.xaml, MainWindow.xaml
3. Update `namespace` in App.xaml.cs, MainWindow.xaml.cs
4. Build to verify before porting any code

### Rule 5: Always Use `winapp run`
```bash
dotnet build <project.csproj> -c Debug -p:Platform=x64
winapp run bin\x64\Debug\<tfm>\win-x64\
```
**Never** add `<WindowsPackageType>None</WindowsPackageType>` — removes package identity.
Use `winapp run --debug-output` to capture first-chance exceptions and `RPC_E_WRONG_THREAD` errors.

### Rule 5b: Threading — NEVER Use .GetAwaiter().GetResult() on WinRT APIs
WinRT APIs (including `Windows.Graphics.Imaging`) are apartment-threaded. Calling `.GetAwaiter().GetResult()` or `.Result` on them deadlocks or throws `RPC_E_WRONG_THREAD`.

**Anti-patterns that WILL crash:**
```csharp
// ❌ DEADLOCK: sync-over-async on WinRT API
var bitmap = decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult();
// ❌ DEADLOCK: inside Parallel.ForEach or Task.Run  
Parallel.ForEach(files, file => {
    var decoder = BitmapDecoder.CreateAsync(stream).GetAwaiter().GetResult(); // CRASH
});
```

**Correct pattern for batch image processing:**
```csharp
// ✅ Process sequentially with proper async
foreach (var file in files)
{
    await Task.Run(async () =>
    {
        using var stream = File.OpenRead(file);
        var winrtStream = stream.AsRandomAccessStream();
        var decoder = await BitmapDecoder.CreateAsync(winrtStream);
        var bitmap = await decoder.GetSoftwareBitmapAsync();
        // ... resize with BitmapEncoder ...
    });
    // Report progress on UI thread
    dispatcherQueue.TryEnqueue(() => reportProgress(++completed, total));
}
```

### Rule 6: Source Analysis Strategy
Read efficiently to minimize token waste:
1. csproj → dependencies, TFM
2. App.xaml/cs → startup, DI, global resources
3. Models/services (batch-read)
4. ViewModels → data flow, commands
5. Views last (XAML is verbose)
6. Helpers/converters → only when build errors reference them

---

## Migration Strategy (Recommended Order)

> **⚠️ Before each step, read the linked reference doc(s).**

1. **Project file** — Update TFM, NuGet packages, `<UseWinUI>true</UseWinUI>`. See [references/namespace-api-mapping.md](./references/namespace-api-mapping.md)
2. **Data models / business logic** — No UI deps, migrate first
3. **MVVM framework** — Delete custom Observable/RelayCommand → `dotnet add package CommunityToolkit.Mvvm` → `[ObservableProperty]` + `[RelayCommand]`
4. **Resource strings** — `.resx` → `.resw` (copy+rename to `Strings\en-us\`), `{x:Static}` → `x:Uid`, `Properties.Resources.Key` → `ResourceLoader.GetString("Key")`
5. **Services/utilities** — Replace `System.Windows` types. See [references/namespace-api-mapping.md](./references/namespace-api-mapping.md)
6. **ViewModels** — Update Dispatcher → DispatcherQueue. See [references/threading-and-windowing.md](./references/threading-and-windowing.md)
7. **Views/Pages** — Leaf pages first. See [references/xaml-migration.md](./references/xaml-migration.md)
8. **Main page / shell** — Last (depends on everything)
9. **App.xaml** — MERGE into WinUI 3 boilerplate, do NOT overwrite
10. **Tests** — Adapt for WinUI 3 runtime

### Key Principles
- Do NOT overwrite `App.xaml`/`App.xaml.cs` — merge your code into WinUI 3's generated App class
- Use `Lazy<T>` for resource-dependent statics
- WinUI 3's `ContentControl` + `DataTemplate` doesn't support implicit DataType — use `Frame.Navigate()`

### Layout Matching (for conversions)
When converting an existing app, the converted version must **visually match** the original:
- **Same window dimensions** — use `AppWindow.Resize()` to match. Verify with `winapp ui inspect` on both apps
- **Same visual density** — don't add UI elements that the original didn't have. Keep it compact
- **Faithful control reproduction** — if the original has rich item templates (showing preview data in dropdowns), replicate them
- **Match the button/control arrangement** — same relative positions, same grouping
- **Read the `visual-design` skill** for typography, spacing, colors, and iconography guidance

**For mapping tables, common pitfalls, and XAML syntax changes → See [references/migration-tables.md](./references/migration-tables.md)**

---

## Post-Migration Validation

```powershell
# 1. Check for remaining WPF references (should return 0)
Select-String -Path (Get-ChildItem -Recurse -Filter "*.cs" | Where-Object { $_.FullName -notlike "*\obj\*" }) -Pattern "System\.Windows\."

# 2. Verify packaging preserved
Select-String -Path "*.csproj" -Pattern "WindowsPackageType.*None"  # should find nothing
Test-Path "Package.appxmanifest"  # should be True

# 3. Build and run
dotnet build <project.csproj> -c Debug -p:Platform=x64
winapp run bin\x64\Debug\<tfm>\win-x64\

# 4. Check for custom MVVM remnants (should find nothing)
Get-ChildItem -Recurse -Filter "*.cs" | Select-String -Pattern "class (Observable|RelayCommand|DelegateCommand)\b"
```

After launching, verify: all pages render content, navigation works, bindings show data.

---

## Detailed Reference Docs

| Document | Contents |
|----------|----------|
| [namespace-api-mapping.md](./references/namespace-api-mapping.md) | Full type mapping, NuGet changes, project file, CsWinRT interop |
| [xaml-migration.md](./references/xaml-migration.md) | XAML syntax, markup extensions, styles, resources, data binding |
| [threading-and-windowing.md](./references/threading-and-windowing.md) | Dispatcher→DispatcherQueue, SizeToContent, AppWindow, HWND interop |
| [imaging-migration.md](./references/imaging-migration.md) | System.Windows.Media.Imaging → Windows.Graphics.Imaging API mapping |
| [migration-tables.md](./references/migration-tables.md) | Namespace mapping, API replacements, XAML syntax, common pitfalls |

## External Resources

- [Migrate from WPF to WinUI 3](https://learn.microsoft.com/windows/apps/winui/winui3/migrate-from-wpf)
- [CommunityToolkit.Mvvm](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/)
- [WinUI 3 Controls Gallery](https://learn.microsoft.com/windows/apps/design/controls/)
- [Windows App SDK API](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/)
