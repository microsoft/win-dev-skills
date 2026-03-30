---
name: templates
description: 'Control selection decision trees, CommunityToolkit packages, settings page pattern, and code template index for WinUI 3 apps. Use when choosing controls, adding toolkit packages, or scaffolding UI patterns.'
---

## Quick Reference

- **Layout:** `StackPanel` for stacking, `Grid` for rows/cols, `ItemsRepeater` for wrapping.
- **Lists:** `ListView` virtualizes automatically. Never wrap in `ScrollViewer`.
- **Input:** Match control to data type — `NumberBox`, `AutoSuggestBox`, `CalendarDatePicker`.
- **Navigation:** `NavigationView` for 3+ sections, `TabView` for peers, `Frame` for page stack.
- **Dialogs:** `ContentDialog` (set `XamlRoot`!), `InfoBar` for status, `TeachingTip` for onboarding.
- **Full templates:** `references/code-templates.md` • **Settings:** `references/settings-page.md`

---

## Decision Trees

### Layout
```
├─ Row/column → StackPanel (Spacing="8")
├─ Fixed rows/cols → Grid (Auto for content, * for proportional)
├─ Wrapping items → ItemsRepeater + UniformGridLayout
├─ Centered single item → Grid + Center alignment
├─ Responsive → VisualStateManager + AdaptiveTriggers
├─ Overlapping → Canvas
└─ Sidebar + content → Grid: Width="300" + Width="*"
```

### Collections
```
├─ Vertical list → ListView (virtualizes)
│  └─ Grouped → + CollectionViewSource (IsSourceGrouped)
├─ Grid/tiles → GridView or ItemsRepeater + UniformGridLayout
├─ Infinite scroll → ListView + ISupportIncrementalLoading
├─ Tabular → CommunityToolkit DataGrid
├─ Custom layout → ItemsRepeater + custom Layout
└─ Master-detail → ListView (left) + Grid (right)
```

### Input
```
├─ Text → TextBox / RichEditBox
├─ Number → NumberBox (min/max)
├─ Search → AutoSuggestBox
├─ Date/Time → CalendarDatePicker / TimePicker
├─ Boolean → ToggleSwitch (settings) / CheckBox (forms)
├─ Choose one → RadioButtons (2-5) / ComboBox (5+)
├─ Choose many → ListView SelectionMode="Multiple"
├─ File → Button + FileOpenPicker
└─ Password → PasswordBox
```

### Navigation
```
├─ 3+ sections → NavigationView + Frame
├─ 2-3 peers → TabView
├─ Wizard → Frame + step indicator
├─ Single page → Page + ScrollViewer
└─ Modal task → ContentDialog
```

### Dialogs
```
├─ Blocking decision → ContentDialog (XamlRoot required!)
├─ Quick action → Flyout / MenuFlyout
├─ Onboarding tip → TeachingTip
├─ Inline status → InfoBar (Severity, IsOpen)
├─ Toast → AppNotification
├─ Progress known → ProgressBar
└─ Progress unknown → ProgressRing
```

---

## CommunityToolkit Packages

| Package | Provides |
|---------|----------|
| `CommunityToolkit.Mvvm` | `ObservableObject`, `[ObservableProperty]`, `[RelayCommand]` |
| `.Controls.SettingsControls` | `SettingsCard`, `SettingsExpander` |
| `.Controls.Primitives` | `SwitchPresenter`, `DockPanel` |
| `.Controls.Collections` | `DataGrid`, `TokenizingTextBox` |
| `.Controls.Layout` | `HeaderedContentControl`, `Segmented` |
| `.Converters` | `BoolToVisibilityConverter`, `StringFormatConverter` |
| `.Animations` | Implicit animations, `AnimationSet` |

**Rules:** Install only needed sub-packages (never the umbrella). Always `partial` on ViewModel classes. Rebuild after adding packages. Use `{x:Bind}` over `{Binding}` (except `DataGrid` columns). Never mix 7.x (UWP) with 8.x (WinUI 3).

---

## Settings Page Pattern

`NavigationView` settings gear → `SettingsPage` → persist to `LocalSettings` on every change → load in constructor before binds.

1. Use `SettingsExpander`/`SettingsCard` (recommended) or manual `StackPanel` groups
2. Persist immediately in `On<Property>Changed` — no "Save" button
3. Load settings before `InitializeComponent()` to prevent flicker
4. Theme: set on root `FrameworkElement`, not on `Window` or `Application`
5. Unpackaged apps: use JSON file, not `ApplicationData`

**Full implementation → `references/settings-page.md`**

---

## Code Template Index

| Template | Use Case |
|----------|----------|
| List-Detail | Collection browsing + detail pane |
| Data Entry Form | Input with validation + Save/Cancel |
| Dashboard Cards | KPI/metric overview grid |
| Login Page | Auth with async command |
| Empty State | Zero-item placeholder |
| Command Bar + Search | Filtering + action buttons |

Compose: Command Bar + List-Detail + Empty State = full master-detail screen.

**Full XAML+C# → `references/code-templates.md`**

---

## Anti-Patterns

| Wrong | Problem | Use |
|-------|---------|-----|
| `ScrollViewer` around `ListView` | Breaks virtualization | Let `ListView` scroll |
| `StackPanel` for 100+ items | No virtualization | `ListView` |
| `TextBox` for numbers | No validation | `NumberBox` |
| `ComboBox` for 2-3 options | Hidden choices | `RadioButtons` |
| `ContentDialog` for status | Blocks interaction | `InfoBar` |
| Nested `Grid` 4+ deep | O(n²) layout | Flatten layout |

---

## Related Skills

`dev-workflow` · `windowing` · `aot-sourcegen`

## External Resources

- [Controls Gallery](https://learn.microsoft.com/windows/apps/design/controls/)
- [CommunityToolkit.Mvvm](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/)
- [SettingsCard docs](https://learn.microsoft.com/dotnet/communitytoolkit/windows/settingscontrols/settingscard)
