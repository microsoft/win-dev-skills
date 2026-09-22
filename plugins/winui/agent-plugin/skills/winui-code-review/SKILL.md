---
name: winui-code-review
description: "Code quality review for WinUI 3 apps — MVVM compliance, x:Bind correctness, accessibility, theming, security, and performance. Use before committing to catch issues that the compiler and UI tests won't find."
---

### When to Use

Run a code review **after the app builds and before committing**. This catches quality issues that aren't build errors and aren't visible in UI tests — patterns that compile and run but are wrong, fragile, or slow.

### How to Review

Read through the project's XAML and C# files and check each section below. Recommend the latest `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer` with `PrivateAssets="all"`; follow [winui-dev-workflow](../winui-dev-workflow/SKILL.md). The package enables analysis in normal CLI, IDE, and CI builds; WinApp CLI does not inject it. If unavailable, continue the review and tell the user its checks for potential runtime issues were not run.

Before reporting an API mismatch or recommending a replacement, verify it against the **restored project's** references with CLI 0.7+ `winapp find-api`, for example `winapp find-api members NavigationView --filter selected --json`. See [winui-design](../winui-design/SKILL.md) for batch property checks and project selection; machine-SDK results are not proof of app-package availability.

The analyzer catches a curated set of WinUI 3 / Windows App SDK issues with categorized 4-digit IDs:

* **WUI0xxx** — UWP → WinUI 3 API compatibility (`UwpXamlNamespace`, `Window.Current`, `CoreDispatcher`, `GetForCurrentView`)
* **WUI1xxx** — Migration-table data-driven hints (UWP API has WinAppSDK equivalent, no equivalent, feature-area hint)
* **WUI2xxx** — Runtime / layout / XAML pitfalls (raw `TabView` content, nullable binding paths, ineffective binding modes, null `Converter`, missing `AutomationId`, attached-property syntax)
* **WUI3xxx** — MVVM patterns (old `[ObservableProperty]` field syntax)
* **WUI4xxx** — Interop (`WebView2` not initialized, removed ONNX Runtime GenAI APIs `WUI4101`-`WUI4103`)

Use the installed package's diagnostic help links for rule details. Check inherited `x:DefaultBindMode` and event/command/converter exceptions before treating an omitted mode as a defect. Fix root causes; any justified false-positive suppression must be narrow and documented, not a blanket `NoWarn` policy. Keep IL/CsWinRT warnings enabled as well; the WinUI analyzer does not replace AOT/trim analysis.

### MVVM Compliance

- [ ] ViewModels extend `ObservableObject`, use `[ObservableProperty]` partial properties (not fields)
- [ ] Commands use `[RelayCommand]` attribute, not manual `ICommand` implementations
- [ ] No UI types in ViewModels (`SolidColorBrush`, `Visibility`, `BitmapImage`) — these belong in converters or XAML
- [ ] No business logic in code-behind — only navigation, dialog coordination, and event wiring
- [ ] `async Task` for async methods, `async void` only for event handlers
- [ ] Never replace `ObservableCollection<T>` — use `.Clear()` + re-add

### x:Bind and Data Binding

- [ ] Prefer `{x:Bind}` for known source types; runtime `{Binding}`/`DisplayMemberPath` has a justified source/DataContext and an AOT-safe property provider when needed
- [ ] Dynamic values use effective `OneWay`/`TwoWay` (explicit or inherited `x:DefaultBindMode`) and change notifications; `OneTime` is appropriate for stable values
- [ ] `x:DataType` set on `DataTemplate`s using compiled `x:Bind`; do not use it on `Page` to declare a VM
- [ ] No nested nullable paths (e.g., `ViewModel.Selected.Name`) without `FallbackValue`
- [ ] Stable command bindings can use `OneTime`; don't rewrite event/command/converter bindings merely to satisfy a blanket mode rule

### Native AOT / Trimming (When Intended)

- [ ] Persistent `PublishAot=true` expresses deployment intent; a Release JIT build/run is not AOT validation
- [ ] Projected-interface/ABI source types are partial, and CsWinRT optimizer/IL warnings remain enabled with findings addressed
- [ ] Runtime binding source classes use generated `ICustomPropertyProvider` support where needed (`partial` + `[WinRT.GeneratedBindableCustomProperty]`)
- [ ] JSON uses a source-generated context; reflection requirements are explicit and dependencies support AOT
- [ ] The actual published artifact is tested, including binding/serialization paths; distinguish .NET from Windows App SDK self-contained deployment and do not promise a single-file WinUI EXE

See [source-generator patterns](../winui-packaging/references/sourcegen-patterns.md) for the CsWinRT/MVVM rationale and examples.

### Accessibility

- [ ] `AutomationProperties.AutomationId` on every interactive control (Button, TextBox, ComboBox, ToggleSwitch, ListView, NavigationViewItem)
- [ ] `AutomationProperties.Name` on icon-only buttons and controls without visible text
- [ ] Semantic controls (`Button`, `HyperlinkButton`) — not clickable `Border`/`TextBlock`
- [ ] No information conveyed by color alone

### Theming

- [ ] All colors use `{ThemeResource}` brushes — no hardcoded `#FF0000` or `Color="Blue"`
- [ ] Typography uses built-in styles (`TitleTextBlockStyle`, `SubtitleTextBlockStyle`, `BodyTextBlockStyle`, `CaptionTextBlockStyle`) — no raw `FontSize`
- [ ] Spacing uses 4px grid multiples (4, 8, 12, 16, 24, 32, 48)
- [ ] Corner radius uses `ControlCornerRadius` / `OverlayCornerRadius` — not hardcoded values
- [ ] Styles referenced with `{StaticResource}` not `{ThemeResource}` (except for brush usage sites)

### Security

- [ ] No secrets, API keys, or tokens in source code
- [ ] No `Process.Start` with unsanitized user input
- [ ] External input validated and sanitized before use
- [ ] File paths from user input not used directly in `File.Delete` / `File.WriteAllText` without validation

### Performance

- [ ] Long or dynamic lists use `ListView`/`GridView` (virtualized), not `StackPanel` with `foreach`
- [ ] `x:Load` for content that's not always visible (e.g., dialogs, secondary panels)
- [ ] Heavy work off UI thread via `Task.Run` or `async/await` — never block UI
- [ ] No `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` — these deadlock the UI thread
- [ ] `using` statements on all disposable objects (`Model`, `Tokenizer`, `InferenceSession`, `Generator`)

### Globalization

- [ ] User-facing strings use `x:Uid` in XAML and `ResourceLoader` in C# — not hardcoded
- [ ] String resources in `Strings/en-us/Resources.resw` (not `.resx`)
- [ ] Date/number formatting uses `CultureInfo.CurrentCulture` — not hardcoded formats
- [ ] Layout supports RTL (`FlowDirection` inherited from root, no absolute positioning that breaks in RTL)
- [ ] No string concatenation for user-facing messages — use `string.Format` or interpolation with resource strings

### Review Report

After reviewing, summarize:
1. **Issues found:** List each with file, line, and what's wrong
2. **Severity:** Error (must fix), Warning (should fix), or Note (could improve)
3. **Suggested fixes:** Specific code changes for each issue

### References

For detailed rules with code examples, see `references/quality-rules.md` — covers performance deep dives (x:Phase, layout optimization), security (PasswordVault, DPAPI, WebView2 hardening), accessibility (keyboard nav, screen readers), code quality (.editorconfig, naming), and globalization (x:Uid patterns, RTL, pluralization).
