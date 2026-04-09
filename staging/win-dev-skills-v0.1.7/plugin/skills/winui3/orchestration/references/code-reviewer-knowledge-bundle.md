# Code Reviewer Knowledge Bundle

Reference material for the Code Reviewer agent. Used to validate Builder output for quality, patterns, security, accessibility, and performance.

---

## 1. MVVM Compliance

### Rules
- ViewModels MUST NOT reference UI types (`Page`, `ContentDialog`, `Frame`, `Window`, etc.)
- Abstract UI interactions behind `INavigationService` / `IDialogService`
- Use `[ObservableProperty]` and `[RelayCommand]` source generators — no manual INPC boilerplate
- Use `Microsoft.Extensions.DependencyInjection` — not `Ioc.Default`
- One ViewModel per page/dialog
- No direct ViewModel-to-ViewModel references — use `WeakReferenceMessenger` or shared services
- Model page states with enums (`PageState { Loading, Loaded, Error, Empty }`) — not scattered booleans
- Async commands should use `[RelayCommand]` with `async Task` — not `async void`

### Check
```
❌ BAD: ViewModel references ContentDialog
public async Task ShowError(string msg) {
    var dialog = new ContentDialog { ... };
    await dialog.ShowAsync();
}

✅ GOOD: ViewModel uses IDialogService
public async Task ShowError(string msg) {
    await _dialogService.ShowErrorAsync(msg);
}
```

---

## 2. x:Bind Usage

### Rules
- Default mode is `OneTime` — explicitly set `Mode=OneWay` or `Mode=TwoWay` for dynamic data
- Every `DataTemplate` MUST have `x:DataType` specified
- `x:Bind` does NOT work in Style setters — use `{Binding}` there
- Prefer function bindings over IValueConverter for simple conversions
- `bool` ↔ `Visibility` auto-converts in x:Bind (no converter needed)

### Check
```xml
❌ BAD: Missing Mode — defaults to OneTime, won't update
<TextBlock Text="{x:Bind ViewModel.StatusText}" />

✅ GOOD: Explicit OneWay for dynamic data  
<TextBlock Text="{x:Bind ViewModel.StatusText, Mode=OneWay}" />

❌ BAD: Missing x:DataType on DataTemplate
<DataTemplate>
    <TextBlock Text="{x:Bind Name}" />
</DataTemplate>

✅ GOOD: x:DataType specified
<DataTemplate x:DataType="models:Item">
    <TextBlock Text="{x:Bind Name}" />
</DataTemplate>
```

---

## 3. Accessibility

### Rules
- `AutomationProperties.Name` on EVERY interactive control (buttons, text boxes, toggles, sliders)
- Focusable controls must be keyboard-navigable (Tab order)
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text
- Text must scale to 200% without clipping (use `TextBlockStyle` resources, not hardcoded FontSize)
- Never convey information by color alone — use icons or text as well
- `AutomationProperties.LabeledBy` to associate labels with controls
- Keyboard accelerators for common actions (`KeyboardAccelerator`)

### Check
```xml
❌ BAD: Button without AutomationProperties
<Button Content="⟳" Click="Refresh_Click" />

✅ GOOD: Button with AutomationProperties.Name
<Button Content="⟳" Click="Refresh_Click" 
        AutomationProperties.Name="Refresh device list" />
```

---

## 4. Security

### Rules
- No hardcoded secrets (API keys, passwords, connection strings) in source code
- Use `PasswordBox` for password input — never regular `TextBox`
- Validate all user input before processing
- Use `System.Security.Cryptography` for any crypto — never custom implementations
- File paths from user input must be validated/sanitized
- Use least-privilege capabilities in appxmanifest
- HTTPS for all network requests
- No logging of sensitive data (passwords, tokens, PII)

---

## 5. Performance

### Rules
- No `.Result`, `.Wait()`, or `Thread.Sleep()` on the UI thread — these cause hangs
- Use `x:Load` for deferred loading of UI that's not immediately visible
- Use `x:Bind` (compiled binding) instead of `{Binding}` (reflection-based)
- `ListView` / `GridView` auto-virtualize — NEVER wrap in `ScrollViewer`
- Use `x:Phase` for incremental rendering in templates
- Use `async/await` for all I/O operations
- Dispose `IDisposable` objects (streams, timers, sessions)
- Use `CancellationToken` for cancellable operations
- Avoid creating XAML objects on background threads (thread affinity)

### Check
```csharp
❌ BAD: Blocking UI thread
var result = httpClient.GetStringAsync(url).Result;

✅ GOOD: Async
var result = await httpClient.GetStringAsync(url);

❌ BAD: ListView in ScrollViewer (breaks virtualization)
<ScrollViewer>
    <ListView ItemsSource="{x:Bind Items}" />
</ScrollViewer>

✅ GOOD: ListView alone (it has built-in ScrollViewer)
<ListView ItemsSource="{x:Bind Items}" />
```

---

## 6. Visual/Style Quality

### Rules
- NEVER hardcode colors — always use `{ThemeResource}` brushes
- NEVER hardcode FontSize or FontWeight — use `TextBlockStyle` resources
- All spacing must be multiples of 4px (4, 8, 12, 16, 24, 36, 48)
- Use `ControlCornerRadius` (4px) for controls, `OverlayCornerRadius` (8px) for containers
- Never hardcode `CornerRadius` values — use theme resources
- Use `Mica` for main window, `DesktopAcrylic` for transient surfaces only

### Check
```xml
❌ BAD: Hardcoded color
<TextBlock Foreground="#333333" Text="Hello" />

✅ GOOD: ThemeResource
<TextBlock Foreground="{ThemeResource TextFillColorPrimaryBrush}" Text="Hello" />

❌ BAD: Hardcoded font size
<TextBlock FontSize="24" FontWeight="SemiBold" Text="Title" />

✅ GOOD: TextBlockStyle
<TextBlock Style="{StaticResource TitleTextBlockStyle}" Text="Title" />
```

---

## 7. Code Quality

### Rules
- Remove all unused `using` statements
- Remove dead code and commented-out blocks
- No duplicated code blocks (DRY) — extract into shared methods/services
- Clean build — zero warnings
- Consistent naming: PascalCase for public members, _camelCase for private fields
- Error handling on all async operations (try/catch or appropriate error propagation)
- No empty catch blocks
- Resource cleanup in `Dispose` or `OnNavigatedFrom`

---

## 8. Review Verdict Criteria

### APPROVED — all of these are true:
- Clean build (zero warnings/errors)
- No critical or warning issues
- MVVM compliance verified
- Accessibility basics covered (AutomationProperties on interactive controls)
- No security issues
- No performance anti-patterns

### NEEDS FIXES — any of these are true:
- Build warnings or errors
- Critical issues found (blocking bugs, security vulnerabilities)
- Missing AutomationProperties on interactive controls
- UI thread blocking (.Result, .Wait)
- Hardcoded secrets
- ViewModel references UI types directly
