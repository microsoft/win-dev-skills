---
name: winui-wpf-migration
description: "Migrate WPF applications to WinUI 3 — namespace replacement (System.Windows → Microsoft.UI.Xaml), control mapping (DataGrid→ListView, WrapPanel→ItemsRepeater, TabControl→TabView), threading (Dispatcher→DispatcherQueue), imaging (System.Drawing→BitmapImage), MVVM conversion to CommunityToolkit.Mvvm ([ObservableProperty] on partial properties, not fields — MVVMTK0045), DataTemplate/TreeView x:Bind pitfalls, nested x:Bind null crashes (WUI2010), x:Bind Mode defaults (WUI2011), ItemsWrapGrid ItemWidth/ItemHeight crashes, build-warning triage, project/packaging setup (no output redirection, host-arch Platforms), and DynamicResource→ThemeResource. Use when converting WPF code, replacing WPF namespaces, or fixing migration build/runtime errors."
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
| `WrapPanel` | `ItemsRepeater` + `UniformGridLayout` (NOT `ItemsWrapGrid` in a plain `ItemsControl` — see Layout Pitfalls) |
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
- Observable members → `[ObservableProperty]` on **partial properties, NOT fields**. This is mandatory in WinUI 3: the field form emits warning **MVVMTK0045** and generates WinRT-incompatible code that fails at runtime. Apply this to **every** `[ObservableProperty]` — do not leave any in field form, even if the build succeeds. Always use the partial-property form:
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
- **Nested `x:Bind` paths crash on null segments (WUI2010).** A path like `{x:Bind ViewModel.SelectedItem.Name}` throws at startup if `SelectedItem` is `null` (common before the user selects anything). Fixes:
  - Add a `FallbackValue`: `{x:Bind ViewModel.SelectedItem.Name, Mode=OneWay, FallbackValue=''}`, or
  - Expose a **flat view-model property** (e.g. `SelectedItemName`) that the VM updates, and bind to that. Flat properties are safer and update reliably.
  This is the most common cause of a detail/master pane crashing when nothing is selected yet.
- **`x:Bind` defaults to `OneTime` (WUI2011).** Unlike WPF `{Binding}` (which is `OneWay` by default), a bare `{x:Bind Path}` binds **once** and never updates. For any value that changes after load, you MUST add `Mode=OneWay` (or `Mode=TwoWay` for editable inputs). Forgetting this produces a UI that silently never refreshes.

### Layout Pitfalls

- **`ItemWidth`/`ItemHeight="Auto"` on `ItemsWrapGrid` crashes at runtime.** These are `double` properties — a non-numeric value like `"Auto"` builds cleanly but throws a `COMException` the instant the panel is measured (the page crashes on open / navigation). This is a common `WrapPanel` → `ItemsWrapGrid` mistake, because `WrapPanel` has no fixed item size. Either omit `ItemWidth`/`ItemHeight` entirely (the items size to content) or give a number.
  ```xml
  <!-- ❌ crashes on load: ItemWidth is a double, "Auto" is invalid -->
  <ItemsWrapGrid Orientation="Horizontal" ItemWidth="Auto"/>

  <!-- ✅ omit it (items size to content) -->
  <ItemsWrapGrid Orientation="Horizontal"/>
  ```
- **Prefer `ItemsRepeater` + `UniformGridLayout` for `WrapPanel`.** It works in any container and handles variable/auto item sizes cleanly:
  ```xml
  <ItemsRepeater ItemsSource="{x:Bind Items, Mode=OneWay}">
      <ItemsRepeater.Layout>
          <UniformGridLayout MinItemWidth="120" MinColumnSpacing="8" MinRowSpacing="8"/>
      </ItemsRepeater.Layout>
  </ItemsRepeater>
  ```
  > Note: `ItemsWrapGrid` is *documented* as the `ItemsPanel` of a `ListViewBase` (`ListView`/`GridView`), but it does also render inside a plain `ItemsControl` — using it there is not itself a crash. The crash above is specifically the invalid `ItemWidth`/`ItemHeight` value.

#### Step 8: Replace Resources
- `.resx` → `.resw` (copy + rename to `Strings\en-us\`)
- `{x:Static}` → `x:Uid` for localized strings
- `Properties.Resources.Key` → `ResourceLoader.GetString("Key")`

### Critical Rules

- ❌ NEVER reference `PresentationCore`, `PresentationFramework`, or `System.Windows.Controls` assemblies
- ❌ NEVER add `<UseWPF>true</UseWPF>` or `<WindowsPackageType>None</WindowsPackageType>`
- ❌ NEVER delete `Package.appxmanifest`
- ❌ NEVER overwrite `App.xaml` / `App.xaml.cs` — merge WPF code into the WinUI 3 boilerplate
- ❌ NEVER redirect build output (`OutDir`, `OutputPath`, `BaseOutputPath`, or a `Directory.Build.props` that moves `bin`). MSIX packaging and `winapp run` locate `AppxManifest.xml` relative to the **default** `bin\<Platform>\<Config>` path — a custom output path makes launch fail with "Manifest file not found." Leave the output path at its default.
- ❌ NEVER restrict `<Platforms>` so it omits the host architecture. Building `-p:Platform=ARM64` against a project declaring only `x86;x64` fails with `NETSDK1032`. Include `ARM64` (and `x64`) in `<Platforms>`, e.g. `<Platforms>x86;x64;ARM64</Platforms>`.
- ❌ NEVER use `[ObservableProperty]` on a **field** — it must annotate a **partial property** (`public partial T Prop { get; set; }`). The field form builds but emits MVVMTK0045 and is WinRT-unsafe. After building, verify **zero MVVMTK0045 warnings** before moving on.
- ❌ NEVER set `ItemWidth`/`ItemHeight="Auto"` on `ItemsWrapGrid` — they are `double` properties; a non-numeric value builds clean but crashes (COMException) when the panel is measured. Omit them or use a number (see Layout Pitfalls).
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
