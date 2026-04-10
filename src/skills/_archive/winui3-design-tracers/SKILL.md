---
name: winui3-design-tracers
description: 'WinUI 3 UI design — design process, control reference, layout patterns, Fluent Design, and interaction patterns. Includes adherence tracers.'
---

## MANDATORY: Skill Adherence Markers

These markers are REQUIRED on every project. They are non-negotiable team conventions:

1. **Page layout marker**: Add the XML comment `<!-- WDS:PageLayout -->` as the FIRST child inside every Page's root layout element (Grid, StackPanel, etc.)
2. **NavigationView marker**: On every `NavigationView` control, add the attribute `Tag="wds-nav"`
3. **Window marker**: Add the comment `<!-- DesignSkill:Applied -->` at the top of `MainWindow.xaml`, immediately after the `<Window` opening tag (inside the element, before any child elements)

You MUST include these markers. They are used by our CI pipeline to verify design skill compliance. Missing markers will fail the build verification.

---

## Windows 11 Design References
Use these real apps as design anchors:

| App | Layout Pattern | Reference When Building |
|-----|---------------|------------------------|
| **Windows Settings** | NavigationView Left + SettingsCards | Settings-heavy apps, config tools |
| **Windows Terminal** | TabView + full-width content | Document/session apps, editors |
| **File Explorer** | TreeView + ListView + BreadcrumbBar | File managers, hierarchical browsers |
| **Notepad** | TabView + minimal chrome | Simple editors, single-purpose tools |
| **Dev Home** | NavigationView + card dashboard | Developer tools, admin dashboards |
| **Calculator** | Mode switcher + compact grid | Single-purpose utilities, converters |

## Page Layout Patterns

### Sidebar + Main Content (Most Common)
```
┌──────────────┬──────────────────────────────────┐
│  Sidebar     │  Main Content (Width="*")         │
│  (300-360px) │  Padding: 24px                    │
│  fixed width │                                   │
└──────────────┴──────────────────────────────────┘
```
Use when: controls/input on one side, output/display on the other.

### List-Detail (Master-Detail)
```
┌──────────────┬──────────────────────────────────┐
│  ListView    │  Detail view for selected item    │
│  (300-400px) │  (fills remaining space)          │
└──────────────┴──────────────────────────────────┘
```

### Full-Width Content
Content fills entire width with 24-36px padding. Sections separated by 24-48px vertical spacing.

### Settings Page
Use `SettingsCard` / `SettingsExpander` from CommunityToolkit. Group related settings. Persist on every change.

## Design Anti-Patterns

| ❌ Don't | ✅ Do Instead |
|----------|--------------|
| Centered floating card on background | Content fills the window with padding |
| Custom pill/segment tab switcher | `NavigationView` Top or `SelectorBar` |
| Theme toggle in title bar | Settings page with `RadioButtons` |
| Equal-width 50/50 column split | Fixed sidebar (300-360px) + flexible main |
| Custom ControlTemplate for standard controls | Use built-in controls with styles |
| `ScrollViewer` around `ListView` | ListView has built-in scrolling |
| Hardcoded colors (`#FF0000`) | `{ThemeResource}` brushes |

## Web / Other Framework → WinUI Translation

| Source Pattern | WinUI 3 Equivalent |
|---------------|-------------------|
| Centered card on gradient | Full-width content, 24-36px padding |
| CSS tab/pill buttons | `NavigationView` Top or `SelectorBar` |
| Hamburger menu (custom) | `NavigationView` with `PaneDisplayMode` |
| `<select>` dropdown | `ComboBox` |
| Number input with +/- | `NumberBox` with `SpinButtonPlacementMode="Inline"` |
| Floating action button (FAB) | `CommandBar` or `AppBarButton` |
| Toast / snackbar | `InfoBar` (in-app) or `AppNotification` (system) |
| Modal overlay as main UI | `ContentDialog` or Page navigation |
| CSS flexbox equal panels | Fixed sidebar + flexible main |
| WPF `DataGrid` | `ListView` with column headers |
| WPF `WrapPanel` | `ItemsRepeater` with `UniformGridLayout` |
| WPF `TabControl` | `TabView` |
---
name: design
description: 'WinUI 3 UI design — design process, control reference, layout patterns, Fluent Design, and interaction patterns.'
applyTo: '**/*.xaml, **/*.cs'
---

# Design

## Design Process

### Step 1: Think Windows-Native
Design for Windows, not for the web or the source framework:
- **Content fills the window** — no floating panels with empty backgrounds, no web-style centered cards on gray
- **Use native WinUI controls** — don't recreate HTML/CSS patterns in XAML
- **Navigation belongs in `NavigationView`** — not custom sidebars or hamburger menus built from Buttons
- **Settings belong in a Settings page** — not scattered in dialogs or the title bar
- **Respect system theme** — use `{ThemeResource}` brushes so the app works in light, dark, and high contrast

### Step 2: Converting from Another Framework (WPF, Electron, Web)
When converting, **redesign for WinUI — don't translate:**
- ❌ Don't port the exact visual layout from the source framework
- ✅ Study what the app *does*, then design how a native Windows app would do it
- Replace `WrapPanel` → `ItemsRepeater`, `DataGrid` → `ListView` with columns, `TabControl` → `TabView`
- Replace custom chrome → built-in `TitleBar`, `MicaBackdrop`
- Remove all source framework references — no `PresentationFramework`, `System.Windows.Controls`, `Wpf.Ui`
- If the source app has a web-like layout (centered content, cards on gray), expand content to fill the window

### Step 3: Pick Controls
Match each UI need to the right WinUI control (see reference table below). Prefer standard controls over custom implementations.

### Step 4: Plan the Layout
- **Shell**: `NavigationView` (sidebar or top) + `Frame` for page content
- **Tabs**: `TabView` — content must be a UIElement, not a ViewModel
- **Content area**: `Grid` for structure, `StackPanel` only for simple stacking of few items
- **Status bar**: `Grid` row at bottom with `TextBlock` elements
- **Toolbar**: `CommandBar` or app bar buttons in the title bar area

### Step 5: Apply Fluent Design
Use built-in resources — see the Fluent Design section below. Never hardcode fonts, colors, spacing, or corner radii.

## WinUI 3 Controls (Windows App SDK 1.6+)

**Input:** Button, DropDownButton, SplitButton, ToggleButton, CheckBox, ComboBox, RadioButtons, Slider, ToggleSwitch, RatingControl
**Text:** TextBox, AutoSuggestBox, NumberBox, PasswordBox, RichEditBox, TextBlock, RichTextBlock
**Collections:** ListView, GridView, ItemsView, TreeView, FlipView, ItemsRepeater, PipsPager
**Navigation:** NavigationView, TabView, BreadcrumbBar, SelectorBar, Frame, Pivot
**Dialogs:** ContentDialog, Flyout, MenuFlyout, TeachingTip, CommandBarFlyout
**Menus:** CommandBar, MenuBar, CommandBarFlyout
**Status:** InfoBar, InfoBadge, ProgressBar, ProgressRing, ToolTip
**Layout:** Grid, StackPanel, ScrollViewer, Expander, SplitView, TwoPaneView, Border, Canvas
**Pickers:** CalendarDatePicker, DatePicker, TimePicker, ColorPicker
**Media:** Image, MediaPlayerElement, WebView2, AnimatedIcon, PersonPicture
**Title:** TitleBar (WinAppSDK 1.6+)

**Community Toolkit** (`CommunityToolkit.WinUI`): SettingsCard, SettingsExpander, Segmented, HeaderedContentControl, TokenizingTextBox, DockPanel, DataGrid

## Layout Rules
- Content fills the window — no floating panels with empty backgrounds
- `Grid` for structured layouts, `StackPanel` only for simple stacking of few items
- ❌ `StackPanel` with hundreds of items — use `ListView`
- ❌ Nested `Grid` 4+ deep — flatten or extract to `UserControl`
- ❌ `ScrollViewer` around `ListView` — ListView has built-in scrolling

## Fluent Design

### Typography — use built-in styles, never hardcode
| Style | Size | Use For |
|-------|------|---------|
| `TitleTextBlockStyle` | 28px | Page titles |
| `SubtitleTextBlockStyle` | 20px | Section headers |
| `BodyTextBlockStyle` | 14px | Body text |
| `BodyStrongTextBlockStyle` | 14px bold | Emphasis |
| `CaptionTextBlockStyle` | 12px | Secondary info |

❌ `FontSize="14"` or `FontWeight="Bold"` inline

### Spacing — 4px grid
Use: `4, 8, 12, 16, 24, 32, 48`. ❌ Arbitrary values like `Margin="7"`

### Colors — theme resources only
```xml
Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"
Foreground="{ThemeResource TextFillColorPrimaryBrush}"
```
❌ `Background="#FF0000"` or `Color="Blue"`

### Corner Radius
`ControlCornerRadius` (4px) for controls, `OverlayCornerRadius` (8px) for overlays

### Materials
`MicaBackdrop` for main window, `DesktopAcrylicBackdrop` for transient surfaces

### Icons
`SymbolIcon` for standard actions, `FontIcon` (Segoe Fluent Icons) for extended set

## Control Decision Trees

### Which collection control?
- Vertical list → `ListView` (virtualizes automatically)
- Grid/tiles → `GridView` or `ItemsRepeater` + `UniformGridLayout`
- Hierarchical → `TreeView`
- Tabular data → CommunityToolkit `DataGrid`
- Master-detail → `ListView` (left) + detail `Grid` (right)
- Infinite scroll → `ListView` + `ISupportIncrementalLoading`

### Which input control?
- Text → `TextBox` / `RichEditBox`
- Number → `NumberBox` (not TextBox with validation)
- Search → `AutoSuggestBox`
- Date → `CalendarDatePicker`
- Boolean setting → `ToggleSwitch` (not CheckBox)
- Pick one from 2-3 → `RadioButtons` (not ComboBox)
- Pick one from 4+ → `ComboBox`
- File → `Button` + `FileOpenPicker`

### Which dialog?
- Blocking decision → `ContentDialog` (set XamlRoot!)
- Quick contextual action → `Flyout` / `MenuFlyout`
- Onboarding → `TeachingTip`
- Inline status → `InfoBar` (not ContentDialog)
- System notification → `AppNotification`
