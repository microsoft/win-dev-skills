---
name: winui-wpf-migration
description: "Migrate WPF applications to WinUI 3 — namespace replacement (System.Windows → Microsoft.UI.Xaml), control mapping (DataGrid→ListView, WrapPanel→ItemsRepeater, TabControl→TabView), threading (Dispatcher→DispatcherQueue), imaging (System.Drawing→BitmapImage), MVVM conversion to CommunityToolkit.Mvvm ([ObservableProperty] on partial properties, not fields — MVVMTK0045), DataTemplate/TreeView x:Bind pitfalls, build-warning triage, and DynamicResource→ThemeResource. Use when converting WPF code, replacing WPF namespaces, or fixing migration build/runtime errors."
---

### Migration Process

#### Step 1: Audit the WPF Source
Before writing code, inventory WPF-specific APIs:
```powershell
# Find all WPF namespace usage
Select-String -Path (Get-ChildItem -Recurse -Filter "*.cs" | Where-Object { $_.FullName -notlike "*\obj\*" }) -Pattern "System\.Windows\." | Select-Object -Property Filename, LineNumber, Line
```
List: WPF controls used, custom MVVM framework, imaging APIs, threading patterns, Win32 interop.

#### Step 2: Create WinUI 3 Project and Align Namespaces
```powershell
dotnet new winui-mvvm -n <AppName>
```
Immediately set `<RootNamespace>` in `.csproj` to match the WPF namespace. Update `x:Class` in `App.xaml`, `MainWindow.xaml` and their code-behind files. Build to verify before porting any code.

#### Step 3: Replace Namespaces

| WPF | WinUI 3 |
|-----|---------|
| `System.Windows` | `Microsoft.UI.Xaml` |
| `System.Windows.Controls` | `Microsoft.UI.Xaml.Controls` |
| `System.Windows.Media` | `Microsoft.UI.Xaml.Media` |
| `System.Windows.Input` | `Microsoft.UI.Xaml.Input` |
| `System.Windows.Data` | `Microsoft.UI.Xaml.Data` |
| `System.Windows.Threading.Dispatcher` | `Microsoft.UI.Dispatching.DispatcherQueue` |
| `PresentationCore` / `PresentationFramework` | Remove entirely |

#### Step 4: Replace Controls

| WPF Control | WinUI 3 Equivalent |
|------------|-------------------|
| `DataGrid` | `ListView` with Grid column headers |
| `WrapPanel` | `ItemsRepeater` + `UniformGridLayout` |
| `TabControl` | `TabView` |
| `StatusBar` | `Grid` row at bottom with `TextBlock` elements |
| `Menu` / `MenuItem` | `MenuBar` / `MenuBarItem` / `MenuFlyoutItem` |
| `ToolBar` | `CommandBar` |
| `TreeView` | `TreeView` — but mind node vs bound mode (see Binding Pitfalls) |
| `Expander` (custom) | `Expander` (built-in) |

#### Step 5: Replace Threading
```csharp
// WPF
Application.Current.Dispatcher.Invoke(() => { /* UI work */ });

// WinUI 3
dispatcherQueue.TryEnqueue(() => { /* UI work */ });
```
Get via `DispatcherQueue.GetForCurrentThread()`. No `Application.Current.Dispatcher` in WinUI 3.

#### Step 6: Replace Imaging
**Critical:** `PresentationCore.dll` and `System.Windows.Media.Imaging` crash the WinUI XAML compiler. This is an architectural incompatibility — no workaround exists.
- Remove ALL `System.Windows.Media.Imaging` references at migration start
- Replace with `Windows.Graphics.Imaging` (WinRT) or `Microsoft.UI.Xaml.Media.Imaging.BitmapImage`
- Do NOT add `<UseWPF>true</UseWPF>` — it silently corrupts the build
- If heavy imaging code exists, migrate it early (step 2, not step 7)

#### Step 7: Replace MVVM Framework
Delete custom `ObservableObject`/`RelayCommand`/`DelegateCommand`. Use CommunityToolkit.Mvvm:
- `INotifyPropertyChanged` base → `ObservableObject`
- Observable members → `[ObservableProperty]` on **partial properties, NOT fields**. In WinUI 3 the field form emits warning **MVVMTK0045** and generates WinRT-incompatible code that can fail at runtime. Always use the partial-property form:
  ```csharp
  // ✅ WinUI 3 — partial property (requires the class to be `partial`)
  [ObservableProperty] public partial string Title { get; set; }

  // ❌ field form — triggers MVVMTK0045, not AOT/WinRT-safe
  [ObservableProperty] private string _title = string.Empty;
  ```
  Partial properties **cannot have inline initializers** — move any default values into the constructor.
- Custom `RelayCommand` → `[RelayCommand]` attribute
- `DynamicResource` → `{ThemeResource}`
- Prefer `{x:Bind Mode=OneWay}` over `{Binding}` — but see **Binding Pitfalls** for `DataTemplate`/`TreeView`.

### Binding Pitfalls

`x:Bind` inside a `DataTemplate` generates compiled code that casts each item to the template's `x:DataType`. This throws `InvalidCastException` (`IInspectable`→your type) **at runtime on first layout** — a clean build hides it.

- **`TreeView` in node mode** (populated via `RootNodes` / `TreeViewNode` in code-behind): the template item is the **`TreeViewNode`**, not your model. `x:Bind`/`x:DataType="<Model>"` will crash. Bind through the node instead:
  ```xml
  <!-- ✅ node mode: reach the model via the node's Content -->
  <DataTemplate>
      <TextBlock Text="{Binding Content.Name}" />
  </DataTemplate>
  ```
  Alternatively use **bound mode** (`TreeView.ItemsSource` + `TreeViewItemTemplateSettings`) so items are your model type.
- For `ListView`/`GridView` in **bound mode** (`ItemsSource` = collection of your model), `x:Bind` with `x:DataType="<Model>"` is correct and safe.

#### Step 8: Replace Resources
- `.resx` → `.resw` (copy + rename to `Strings\en-us\`)
- `{x:Static}` → `x:Uid` for localized strings
- `Properties.Resources.Key` → `ResourceLoader.GetString("Key")`

### Critical Rules

- ❌ NEVER reference `PresentationCore`, `PresentationFramework`, or `System.Windows.Controls` assemblies
- ❌ NEVER add `<UseWPF>true</UseWPF>` or `<WindowsPackageType>None</WindowsPackageType>`
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER overwrite `App.xaml` / `App.xaml.cs` — merge WPF code into the WinUI 3 boilerplate
- ✅ Always use `winapp run` to launch — never run the .exe directly
- ✅ Break migration into file-level tasks — not one massive rewrite
- ✅ Acknowledge build warnings — do not ignore them. In WinUI 3 several warnings (e.g. MVVMTK0045) compile fine but fail at runtime. After each build, review every warning; fix the ones you introduced and any known runtime hazards; explicitly note any you deliberately leave.
- ✅ A clean build is NOT done. You MUST launch the migrated app and confirm it renders without crashing — WinUI 3 binding errors surface only at runtime. Use `winapp run --debug-output` to capture first-chance exceptions and crash dumps, and verify the window renders and survives basic interaction before declaring the migration complete.

### Post-Migration Validation

```powershell
# Check for remaining WPF references (should return nothing)
Select-String -Path (Get-ChildItem -Recurse -Filter "*.cs" | Where-Object { $_.FullName -notlike "*\obj\*" }) -Pattern "System\.Windows\."

# Verify packaging preserved
Test-Path "Package.appxmanifest"  # should be True

# Build — review ALL warnings, not just errors. MVVMTK0045 must be fixed (Step 7).
.\BuildAndRun.ps1

# Launch and confirm it actually runs (build success is not enough).
# --debug-output surfaces first-chance exceptions + writes a crash dump on failure.
winapp run <output-folder> --debug-output
```

A migration is only complete when the app **builds with warnings triaged, launches, renders, and survives basic interaction** without a runtime crash.
