# Builder Knowledge Bundle

Reference material for the Builder specialist agent. Contains the operational knowledge needed to create, build, run, and verify WinUI 3 applications.

---

## 1. Prerequisites

Before writing any code, verify the development environment:

```powershell
# Check Developer Mode (required for sideloading MSIX packages)
Get-WindowsDeveloperLicense
# Must return IsValid: True. If not: Settings → System → For developers → Developer Mode → On

# Check .NET SDK (10.0+ required)
dotnet --version

# Check winapp CLI
winapp --version
```

If missing, install:
```powershell
winget install Microsoft.DotNet.SDK.10 --source winget
winget install Microsoft.WinAppCLI --source winget
```

---

## 2. Project Creation

```powershell
# Template name is "winui", NOT "winui3"
dotnet new winui -n <AppName>
```

- The `-n` flag creates the subfolder — do NOT `mkdir` first
- After creation, PRESERVE the template-generated `MainWindow.xaml` structure (TitleBar, SystemBackdrop, layout Grid). Insert your content into the existing structure — do NOT rewrite the file from scratch
- The template also generates `App.xaml`, `App.xaml.cs`, `.csproj`, and `Package.appxmanifest` — preserve these

---

## 3. Build Commands

WinUI 3 does NOT support AnyCPU. Always specify the platform:

```powershell
# Detect platform
$Platform = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'Arm64' } else { 'x64' }

# Build
dotnet build <AppName>.csproj -c Debug -p:Platform=$Platform
```

### Common Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `NETSDK1005` or AnyCPU errors | Missing `-p:Platform=x64` | Always specify platform |
| `CS0246` unknown type | Wrong namespace or missing NuGet | Check imports, verify package is installed |
| `XLS0504` / XAML parse error | Typo in XAML namespace, missing `x:DataType` | Check XAML syntax carefully |
| `NU1101` package not found | NuGet source misconfigured | Check NuGet sources with `dotnet nuget list source` |
| `NETSDK1004` assets file missing | Need to restore | Run `dotnet restore` first |
| `CA2024` EndOfStream in async | Using `EndOfStream` in async method | Don't use `stream.EndOfStream` — use `await stream.ReadLineAsync()` and check for `null` instead |
| `XamlCompiler` internal error / cryptic crash | XAML contains unsupported construct | See XAML Compiler Crash Recovery below |

### XAML Compiler Crash Recovery

When the XAML compiler crashes with a cryptic internal error (no helpful line number), do NOT spend time guessing. Follow this **binary search** approach:

1. **Comment out half the XAML** in the file that was most recently edited
2. **Rebuild** — does it compile?
   - Yes → the problem is in the commented-out half. Uncomment it, comment the other half.
   - No → the problem is in the remaining half (or a different file).
3. **Narrow down** by halving again until you find the exact element
4. **Check against known XAML crash patterns** (see below)

**Known WinUI 3 XAML Compiler Crashes:**

| Pattern | What Happens | Fix |
|---------|-------------|-----|
| `<Window.KeyboardAccelerators>` in XAML | XamlCompiler crashes silently (exit code 1, MSB3073, no line number) — `Window` is NOT a `UIElement` and has no `KeyboardAccelerators` property | Attach accelerators to a UIElement (NavigationView, Page, Grid) instead — NOT to Window. See Window vs UIElement rules below. |
| `<SomeControl.KeyboardAccelerators>` on complex controls | Same crash on some controls | Always verify the control inherits UIElement before using KeyboardAccelerators in XAML |
| Complex nested `DataTemplate` with `x:Bind` function bindings | Can cause internal compiler error | Simplify the binding or move logic to ViewModel property |
| Missing `x:DataType` on `DataTemplate` | May crash instead of giving a helpful error | Always add `x:DataType` on every `DataTemplate` |
| Properties set on `Window` that only exist on `UIElement` | Silent crash — no error message | See Window vs UIElement rules below |

### Window vs UIElement — Critical WinUI 3 Architecture Rule

**Unlike WPF, WinUI 3's `Window` does NOT inherit from `UIElement` or `FrameworkElement`.** It is a completely separate class with a very limited API. Many things that work on `Page`, `Grid`, or any control will **silently crash the XAML compiler** or **throw runtime exceptions** if applied to `Window`.

This is the single most common source of cryptic, hard-to-debug XAML compiler crashes.

#### Window's Actual API Surface (this is ALL it has)

**Properties:**
| Property | Type | Notes |
|----------|------|-------|
| `Content` | `UIElement` | The root visual element (Grid, NavigationView, Frame) |
| `Title` | `string` | Window title text |
| `AppWindow` | `AppWindow` | For sizing, position, presenters, custom title bar |
| `DispatcherQueue` | `DispatcherQueue` | UI thread access |
| `ExtendsContentIntoTitleBar` | `bool` | Custom title bar |
| `SystemBackdrop` | `SystemBackdrop` | Mica, Acrylic |
| `Visible` | `bool` | Read-only visibility state |

**Methods:**
| Method | Notes |
|--------|-------|
| `Activate()` | Show and focus — MUST call after creating |
| `Close()` | Close the window |
| `SetTitleBar(UIElement)` | Set custom title bar element |

**Events:** `Activated`, `Closed`, `SizeChanged`, `VisibilityChanged`

**That's it.** No `Resources`, no `DataContext`, no `KeyboardAccelerators`, no `RequestedTheme`, no routed events, no animations, no `FindName()`, no `XamlRoot`.

#### What Window Does NOT Have (will crash or fail silently)

| ❌ Crashes / Fails on Window | Why | ✅ Do This Instead |
|------------------------------|-----|-------------------|
| `<Window.KeyboardAccelerators>` | Not a UIElement — crashes XAML compiler silently (MSB3073) | Add to NavigationView, Page, or root Grid |
| `<Window.Resources>` with complex resources | Limited resource support | Use `<Page.Resources>` or `App.xaml` |
| `Window.DataContext = viewModel` | No DataContext property | Set on `(FrameworkElement)Content` |
| `Window.RequestedTheme` | No theme property | `((FrameworkElement)Content).RequestedTheme = theme` |
| `Window.XamlRoot` | No XamlRoot property | `Content.XamlRoot` |
| `Window.FindName("element")` | Not in the visual tree | `Content.FindName("element")` or `x:Name` in Page |
| Storyboard animations on Window | Not animatable | Animate elements inside Content |
| Routed events (Tapped, PointerPressed) | Not a UIElement | Handle on root Grid or Page |
| Attached properties on Window | Most won't work | Attach to Content element |
| `Window.Opacity`, `Window.Visibility` | Not FrameworkElement properties | Use `AppWindow.Show()` / `AppWindow.Hide()` |

#### Architecture Pattern: Keep Window Minimal

```xml
<!-- MainWindow.xaml — KEEP THIS MINIMAL -->
<Window x:Class="MyApp.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    
    <!-- Window ONLY sets SystemBackdrop and Content. Nothing else. -->
    <NavigationView x:Name="NavView"
                    PaneDisplayMode="LeftCompact"
                    IsBackButtonVisible="Collapsed"
                    IsSettingsVisible="True">
        
        <!-- KeyboardAccelerators go on NavigationView, NOT Window -->
        <NavigationView.KeyboardAccelerators>
            <KeyboardAccelerator Key="Number1" Modifiers="Control" />
            <KeyboardAccelerator Key="Number2" Modifiers="Control" />
        </NavigationView.KeyboardAccelerators>
        
        <Frame x:Name="ContentFrame" />
    </NavigationView>
</Window>
```

```csharp
// MainWindow.xaml.cs — window setup only
public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        
        // Window-level setup (the ONLY things that belong here):
        Title = "My App";
        ExtendsContentIntoTitleBar = true;
        SystemBackdrop = new MicaBackdrop();
        
        // Theme goes on Content, NOT Window:
        ((FrameworkElement)Content).RequestedTheme = ElementTheme.Default;
        
        // Sizing goes via AppWindow:
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1100, 700));
    }
}
```

#### Where Things Belong

| Concern | Where It Goes | NOT Here |
|---------|-------------|----------|
| Window chrome (title, backdrop, sizing) | `MainWindow.xaml.cs` via `AppWindow` | — |
| Navigation (NavigationView, Frame) | `MainWindow.xaml` Content | — |
| Page content (controls, layout, data) | Individual `Page.xaml` files | `MainWindow.xaml` |
| Resources (styles, brushes, templates) | `App.xaml` (global) or `Page.Resources` (local) | `Window.Resources` |
| DataContext / ViewModel binding | `Page` code-behind or `Page.DataContext` | `Window.DataContext` |
| KeyboardAccelerators | NavigationView, Page, or root Grid | `Window` |
| Theme setting | `((FrameworkElement)Content).RequestedTheme` | `Window.RequestedTheme` |
| Dialog XamlRoot | `Content.XamlRoot` | `Window.XamlRoot` |

**Rule of thumb**: `Window` is just a shell. Put all UI, resources, bindings, and behavior in `Page` classes that the `Frame` navigates to.

---

## 4. Running the App

```powershell
# Find build output path — check .csproj for TFM
# Typical: bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\
$buildOutput = "bin\$Platform\Debug\<TFM>\win-$($Platform.ToLower())\"

# Run with package identity + debug output (always use --debug-output)
winapp run $buildOutput --debug-output
```

- **Always use `--debug-output`** — captures debug messages, exceptions, and first-chance errors in the console. Invaluable for diagnosing runtime issues.
- Note: `--debug-output` prevents other debuggers (like Visual Studio) from attaching.
- If `winapp run` itself fails (before the app launches), add `--verbose` for detailed diagnostic output about the registration/launch process.

### Common Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Wrong path / exe not found | Build output path wrong | List the build output directory to find correct folder |
| `HRESULT 0x80070005` | Access denied | Check permissions, ensure Developer Mode is on |
| `HRESULT 0x80070002` | File not found | Check manifest references match actual files |
| `RPC_E_WRONG_THREAD` | WinRT API called from wrong thread | Marshal to UI thread with `DispatcherQueue.TryEnqueue()` |
| App crashes on launch | Unhandled exception in init | Use `--debug-output` to see the exception |

---

## 5. UI Verification

```powershell
# Take a screenshot to verify layout
winapp ui screenshot -a <appname>

# Inspect interactive elements (buttons, text boxes, etc.)
winapp ui inspect -a <appname> --interactive

# Navigate to a page and screenshot
winapp ui invoke <nav-item-automation-id> -a <appname>
winapp ui screenshot -a <appname>

# Click buttons, fill inputs
winapp ui invoke <button-id> -a <appname>
winapp ui set-text <textbox-id> -a <appname> --value "test input"

# Read element properties
winapp ui get-property <element-id> -a <appname> --property Value
winapp ui get-property <toggle-id> -a <appname> --property ToggleState

# Scroll before invoking off-screen elements
winapp ui scroll <container-id> -a <appname> --direction down --amount 3
```

### Verification Checklist
- [ ] Content fills the window (no centered floating cards)
- [ ] All pages from design spec are present and navigable
- [ ] Controls match specified types
- [ ] No clipped text or overlapping elements
- [ ] Window size fits content — resize with `AppWindow.Resize` if needed

---

## 6. MVVM Rules for ViewModels

### Core Principle: Minimum Viable Complexity
Build only what's needed. No speculative interfaces, no DI wrappers for 3-line operations, no "just in case" abstractions.

### Banned Imports — NEVER use these in ViewModel files:
- ❌ `using Microsoft.UI.Xaml;` / `.Controls;` / `.Media;`
- ❌ `using Microsoft.UI.Dispatching;`
- ❌ `using Windows.ApplicationModel.DataTransfer;`
- ❌ `using Microsoft.UI.Windowing;`

Instead of creating interface+service for trivial UI operations, use:
- **Dialogs**: ViewModel raises an event → code-behind handles ContentDialog
- **Clipboard**: Direct call in code-behind, triggered by ViewModel command
- **Navigation**: MainWindow code-behind handles `Frame.Navigate`
- **Theme**: Static helper or code-behind

### What NOT to Build
- ❌ `IClipboardService` / `ILauncherService` / `IThemeService` / `IDispatcherService` — trivial wrappers add files and complexity for zero benefit
- ❌ `INavigationService` for <5 pages — code-behind is simpler
- ❌ DI container (`ServiceCollection`) unless you have services with real external dependencies (HTTP, serial ports, databases) or are writing unit tests
- ❌ `ViewModelBase` unless 3+ ViewModels share the same methods
- ❌ State enums with only 2 values — use a boolean instead
- ❌ Properties, commands, or converters that aren't bound in XAML

### What TO Build
- ✅ `[ObservableProperty]` with partial property syntax
- ✅ `[RelayCommand]` for button actions (async Task, with try-catch)
- ✅ `{x:Bind}` with correct Mode for all bindings
- ✅ `AutomationProperties.Name` on all interactive controls
- ✅ `{ThemeResource}` brushes — never hardcode colors
- ✅ Services for real complexity (serial port, HTTP client, device discovery)
- ✅ Event-based VM→View communication for dialogs and UI-only concerns

### CommunityToolkit.Mvvm — Partial Properties (NOT Fields)
```csharp
// ✅ CORRECT (Toolkit 8.4+):
[ObservableProperty]
public partial bool IsOnline { get; set; } = true;

// ❌ WRONG (deprecated, generates warnings):
[ObservableProperty] private bool _isOnline = true;
```

### Async Error Handling
```csharp
// ❌ WRONG — fire-and-forget silently swallows exceptions:
_ = ConnectToDeviceAsync(value);

// ✅ CORRECT — wrap in try-catch:
private async void OnSelectedDeviceChanged(DeviceInfo? value)
{
    try { await ConnectToDeviceAsync(value); }
    catch (Exception ex) { AddLogEntry($"Error: {ex.Message}"); }
}
```

---

## 7. Key Rules

1. **Build complete UI before first launch** — write ALL XAML elements first, then launch once. Don't launch with partial UI and iterate. Use `winapp ui inspect` to verify element presence and clipping BEFORE taking screenshots. Reserve screenshots for visual polish, not discovering missing elements.
2. **Scaffold first, features second** — for new apps, get a blank app building and running before adding features. Add features one at a time.
3. **One fix at a time** — when fixing errors, change one thing, rebuild, verify. Don't stack multiple changes.
4. **Preserve template files** — don't rewrite MainWindow.xaml from scratch. Insert content into the existing template structure.
5. **Ensure window size fits content** — verify with screenshots that nothing is cut off. Resize with `AppWindow.Resize` if needed.
6. **Use `scroll-into-view` or `scroll`** before invoking off-screen elements in UI automation.
7. **Screenshot and functional validation after every major change and before completion** — visual and functional verification is the only reliable check.
8. **Token efficiency** — batch related XAML changes (e.g., all controls for one page) and verify once. Use `winapp ui inspect` for structural checks (faster, no image tokens) and reserve screenshots for final confirmation.

---

## 7. Pre-Flight Checklist (MANDATORY before reporting done)

After the app builds and runs, but BEFORE reporting completion, run through this checklist. Fix any failures before declaring done.

```
□ grep for "async void" in all ViewModel files — change ALL to "async Task" 
  (except event handlers which must be async void, but those should have try-catch)
□ grep for "using Microsoft.UI.Xaml" in ViewModel files — must be ZERO matches
□ grep for "using Microsoft.UI.Dispatching" in ViewModel files — must be ZERO
□ Verify every interactive control in XAML has a binding: {x:Bind ViewModel.Property}
  - TwoWay for editable controls (NumberBox, ComboBox, ToggleSwitch, Slider, TextBox)
  - OneWay for display controls (TextBlock, ProgressBar, Image)
  - Command binding on every Button that should do something
□ Verify every [RelayCommand] in ViewModels is referenced from XAML
□ Cross-check EVERY control in the design spec against your XAML — nothing missing?
□ Verify every interactive control in XAML has AutomationProperties.Name
□ Verify all [ObservableProperty] use partial property syntax (not fields)
□ Verify no empty catch blocks — every catch must at minimum: Debug.WriteLine($"Error: {ex.Message}")
□ Verify child processes (Process.Start) have cancellation: ct.Register(() => proc.Kill())
□ Verify no hardcoded colors in XAML (run: Select-String -Path "*.xaml" -Pattern 'Background="#|Foreground="#|Color="#' -Recurse)
  - Only acceptable in App.xaml for SystemAccentColor overrides
□ Switch theme to Light mode and VERIFY the UI visually changes (take screenshot in both themes)
□ If app has a Settings page with theme selector: actually switch the theme and confirm it applies
□ Build with zero warnings: dotnet build -p:Platform=$Platform -warnaserror
□ All pages from design spec are present and navigable (verify with screenshots)
```

---

## 8. Completion Validation

Before reporting completion, you MUST:

1. **Re-read the design spec** — list every page and feature specified
2. **Check each requirement** — navigate to the relevant page, interact with the feature, and screenshot to confirm it works
3. **Test core functionality end-to-end** — if the app processes data, actually trigger the operation and verify the output (click the action button, wait for completion, verify results)
4. **If anything is missing or broken** — fix it before reporting completion
5. **If something couldn't be done** — explain clearly what wasn't possible and why
6. **Never say "done" if you skipped something** — either implement it or explicitly call out that it was not completed

---

## 8. Pre-Code Workflow

Before writing any code for a feature:

1. **Check existing code** — search for related implementations to avoid duplication (DRY)
2. **Find the right API** — if the task involves a platform capability (notifications, windowing, sensors, etc.), look up the correct API in the [WinUI 3 API Reference](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/) before writing code
3. **Plan the approach** — consider SOLID principles and identify which classes/interfaces are involved
4. **Read the relevant skill files** — check the skills directory for guidance based on what you're about to do:

### Skill Routing — Which Skill to Read When

The skills directory is at `{SKILLS_PATH}/` (provided by the orchestrator). Read the relevant skill BEFORE writing code in its area:

| What you're doing | Read this skill |
|-------------------|----------------|
| Creating a new project, building, running | `dev-workflow/SKILL.md` |
| Adding/changing UI controls or XAML | `quality/SKILL.md` (accessibility, performance) + `visual-design/SKILL.md` (typography, spacing, colors) |
| Choosing which control to use | `templates/SKILL.md` (decision trees) + `templates/references/code-templates.md` (patterns) |
| Adding data binding, collections, async I/O | `data-layer/SKILL.md` + `data-layer/references/binding-patterns.md` |
| Working with windows, title bars, multi-window | `windowing/SKILL.md` + `windowing/references/windowing-patterns.md` |
| Adding notifications, background tasks, sensors | `platform-apis/SKILL.md` + relevant `references/` file |
| Using file pickers, media playback | `media-files/SKILL.md` + `media-files/references/file-patterns.md` |
| P/Invoke, HWND interop, WebView2 | `interop-webview/SKILL.md` + relevant reference |
| Custom controls, context menus, drag-and-drop | `ui-controls/SKILL.md` + `ui-controls/references/control-patterns.md` |
| Migrating from WPF | `wpf-migration/SKILL.md` + `wpf-migration/references/` |
| Adding user-facing strings, globalization | `quality/SKILL.md` (globalization section) |
| Handling secrets, user input, permissions | `quality/SKILL.md` (security section) |
| Writing tests | `testing/SKILL.md` |
| AOT, trimming, source generators | `aot-sourcegen/SKILL.md` |
| Looking up APIs, finding samples | Use `microsoft_docs_search` and `microsoft_code_sample_search` MCP tools. Read `microsoft-docs/SKILL.md` for query tips. |

If you're unsure which skill applies, list the skills directory and read the SKILL.md files' frontmatter descriptions.

### API Research — Use MCP Tools First

When you need to look up a WinUI 3 or Windows API, use the Microsoft Learn MCP tools instead of guessing or searching the web:

```
# Verify a class/method exists
microsoft_docs_search(query: "AppNotificationManager RegisterAsync Windows App SDK")

# Find a working code sample
microsoft_code_sample_search(query: "winui3 file picker", language: "csharp")

# Get full API reference page
microsoft_docs_fetch(url: "https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/...")
```

This replaces the old "web search first" approach — MCP tools give you authoritative, up-to-date Microsoft documentation directly.

---

## 9. Error Recovery Workflow

When a build or runtime error occurs:

1. **Read the error message carefully** — identify the exact error code or exception type
2. **Check the common error tables** above first
3. **Common runtime error categories:**
   - `XAML parse error` → Check for typos in XAML namespaces, missing `x:DataType`, or unsupported markup
   - `HRESULT 0x...` → Search the error code online or in the dev-workflow skill
   - `NullReferenceException` → Check that bindings have correct `Mode` and DataContext is set
   - `Build error CS...` → Usually a namespace or type mismatch — check imports
   - `RPC_E_WRONG_THREAD` → Marshal to UI thread with `DispatcherQueue.TryEnqueue()`
4. **Escalation order for unknown types/APIs** (follow in order, don't skip):
   - Step 1: Read the dev-workflow and platform-apis skill files (if provided)
   - Step 2: Web search — translate the unknown type into search keywords, search the [WinAppSDK API Reference](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/) and [Platform SDK Reference](https://learn.microsoft.com/en-us/uwp/api/)
   - Step 3: Check [release notes](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/stable-channel) for SDK version compatibility
   - Step 4: Search sample repos (WindowsAppSDK-Samples, WinUI-Gallery) for working examples
   - Step 5: Inspect `.winmd` metadata files (LAST RESORT only — always try web search first)
5. **After fixing** — rebuild and verify the fix before moving on. Never apply more than one fix at a time.

---

## 10. WPF Migration Notes

When converting a WPF app to WinUI 3, read the `wpf-migration` skill file first. Key rules:

1. **NEVER reference PresentationCore.dll** — it crashes the WinUI XAML compiler. Replace `System.Windows.Media.Imaging` with `Windows.Graphics.Imaging` before porting any XAML.
2. **Migrate file-by-file** — don't try to convert everything at once
3. **Imaging code goes early** — if the app has image processing, migrate it at step 2 (data models), not step 7 (views)
4. **Don't mix WPF and WinUI assemblies** — no `<UseWPF>true</UseWPF>`, no conditional PresentationCore references

---

## 11. Packaging & Distribution

Once the app is built and verified, if packaging is needed:

```powershell
# Generate a dev certificate (one-time)
winapp cert generate --manifest .

# Build for Release
dotnet build <project.csproj> -c Release -p:Platform=$Platform

# Package as MSIX
winapp package bin\Release\<TFM>\win-$($Platform.ToLower())\ --cert devcert.pfx

# Install cert for testing (may require admin)
winapp cert install devcert.pfx
```

For advanced packaging, CI/CD, or Store submission — these are handled by the winapp agent, not the builder.

---

## 12. Icon Generation

If a source logo is available (from the App Inspector or user):

```powershell
# Generate all MSIX icon assets from source logo
winapp manifest update-assets <path-to-logo-file>
```

- Source image should be at least 400x400px
- Accepts SVG, PNG, ICO, JPG, BMP, GIF
- If manifest isn't in current directory: `--manifest <path>`
- For light-theme variant: `--light-image <path>`

---

## 13. Visual Quality Pass

After functionality works, do a visual quality check before reporting completion:

- [ ] Typography: using `TextBlockStyle` resources, not hardcoded `FontSize`?
- [ ] Spacing: margins/padding are multiples of 4px (4, 8, 12, 16, 24)?
- [ ] Colors: all `{ThemeResource}` brushes, no hardcoded hex colors?
- [ ] Icons: `SymbolIcon` or `FontIcon` with proper sizes (16/20/24px)?
- [ ] Corner radius: using `ControlCornerRadius` / `OverlayCornerRadius` tokens?
- [ ] No unnecessary whitespace or extra chrome?
- [ ] Brand identity applied: accent color override in App.xaml, app name, logo?
- [ ] **Light mode test**: Switch theme to Light and verify the app looks correct (no invisible text, no unreadable controls)

---

## 14. Theme-Aware Brushes — ALWAYS Use These

**NEVER hardcode colors** like `Background="#2D2D2D"` or `Foreground="#FFFFFF"`. These look fine in dark mode but break completely in light mode (invisible text, unreadable controls).

| Purpose | ThemeResource Key |
|---------|------------------|
| Card / panel background | `{ThemeResource CardBackgroundFillColorDefaultBrush}` |
| Card border | `{ThemeResource CardStrokeColorDefaultBrush}` |
| Layer / inset background | `{ThemeResource LayerFillColorDefaultBrush}` |
| Subtle fill (hover states) | `{ThemeResource SubtleFillColorSecondaryBrush}` |
| Primary text | `{ThemeResource TextFillColorPrimaryBrush}` |
| Secondary text | `{ThemeResource TextFillColorSecondaryBrush}` |
| Disabled text | `{ThemeResource TextFillColorDisabledBrush}` |
| Divider / separator | `{ThemeResource DividerStrokeColorDefaultBrush}` |
| Accent text | `{ThemeResource AccentTextFillColorPrimaryBrush}` |
| Page background | Mica backdrop handles this — don't set a background |
| Control background | Controls have built-in themed backgrounds — don't override |

**Common mistakes that break light mode:**
```xml
<!-- ❌ WRONG — invisible in light mode -->
<Grid Background="#1E1E1E">
    <TextBlock Foreground="#FFFFFF" Text="Hello" />
</Grid>

<!-- ✅ CORRECT — works in all themes -->
<Grid Background="{ThemeResource LayerFillColorDefaultBrush}">
    <TextBlock Foreground="{ThemeResource TextFillColorPrimaryBrush}" Text="Hello" />
</Grid>
```

**Pre-build color audit:**
```powershell
# Search for hardcoded colors in XAML (should return 0 matches except accent overrides in App.xaml)
Select-String -Path "*.xaml" -Pattern 'Background="#|Foreground="#|Color="#|Fill="#' -Recurse
```
