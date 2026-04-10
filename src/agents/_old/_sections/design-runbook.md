Before writing XAML, plan the UI design by following these steps.

#### Step 1: Identify the App Type

Classify the app and pick a real Windows 11 app as your design anchor:

| App Type | Anchor | Pattern |
|----------|--------|---------|
| Settings/Config tool | Windows Settings | NavigationView + SettingsCards |
| Document/Editor | Windows Terminal / Notepad | TabView + content |
| File browser | File Explorer | TreeView + ListView + BreadcrumbBar |
| Developer tool/dashboard | Dev Home | NavigationView + cards |
| Single-purpose utility | Calculator | Mode switcher + compact grid |

#### Step 2: Map Requirements to Controls

For each user requirement, select the right WinUI control:

**Navigation:** Multiple sections → `NavigationView` + `Frame` · Tabs → `TabView` · Breadcrumbs → `BreadcrumbBar`

**Data display:** List → `ListView` · Grid/tiles → `GridView` or `ItemsRepeater` · Tree → `TreeView` · Table → `DataGrid` · Master-detail → `ListView` + detail `Grid`

**Input:** Text → `TextBox` · Number → `NumberBox` · Search → `AutoSuggestBox` · Boolean → `ToggleSwitch` · Pick 1 of 2-3 → `RadioButtons` · Pick 1 of 4+ → `ComboBox` · File → `Button` + `FileOpenPicker`

**Feedback:** Decision → `ContentDialog` · Quick action → `Flyout` · Status → `InfoBar` · Notification → `AppNotification`

#### Step 3: Plan the Layout

Content MUST fill the window. Use this structure:
- **Shell**: `NavigationView` or `TabView`
- **Main content**: fills remaining space
- **Sidebar**: fixed width 300-360px (if needed)
- **Status bar**: `Grid` row at bottom (if needed)
- **Toolbar**: `CommandBar` or TitleBar buttons (if needed)

Layout rules:
- `Grid` for structure, `StackPanel` only for simple stacking
- Fixed sidebar + flexible main — NOT 50/50 split
- Settings go in a Settings page, not title bar or dialogs

Anti-patterns:
- ❌ Centered floating card on empty background
- ❌ Custom pill/tab switcher (use `NavigationView` or `SelectorBar`)
- ❌ `ScrollViewer` wrapping a `ListView`
- ❌ Hardcoded colors — use `{ThemeResource}` brushes
- ❌ Custom `ControlTemplate` for standard controls

#### Step 4: Apply Fluent Design

**Typography** — use built-in styles, never hardcode:
- Page titles → `TitleTextBlockStyle`
- Section headers → `SubtitleTextBlockStyle`
- Body → `BodyTextBlockStyle`
- Secondary → `CaptionTextBlockStyle`

**Spacing** — 4px grid only: 4, 8, 12, 16, 24, 32, 48

**Colors** — `{ThemeResource}` only. ❌ No `#FF0000` or `Color="Blue"`

**Materials** — `MicaBackdrop` for main window · **Icons** — `SymbolIcon` or `FontIcon` (Segoe Fluent Icons)

#### Step 5: Framework Translations

When converting from another framework, apply these mappings:

| Source Pattern | WinUI 3 Equivalent |
|---------------|-------------------|
| Centered card on gradient | Full-width content, 24-36px padding |
| CSS tab/pill buttons | `NavigationView` Top or `SelectorBar` |
| `<select>` dropdown | `ComboBox` |
| Floating action button | `CommandBar` or `AppBarButton` |
| Toast/snackbar | `InfoBar` (in-app) |
| WPF `DataGrid` | `ListView` with column headers |
| WPF `WrapPanel` | `ItemsRepeater` + `UniformGridLayout` |
| WPF `TabControl` | `TabView` |