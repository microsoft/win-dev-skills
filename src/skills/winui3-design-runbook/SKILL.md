---
name: winui3-design-runbook
description: 'EXECUTE this skill when designing WinUI 3 UI. Step-by-step runbook for selecting controls, planning layout, and applying Fluent Design. Do NOT skip steps.'
---


When you need to design a UI, you MUST execute these steps IN ORDER. Do NOT skip ahead to writing XAML.

#### STOP — Execute Step 1: Identify the App Type

Read the user's requirements and classify the app:
- **Settings/Config tool** → Anchor: Windows Settings (NavigationView + SettingsCards)
- **Document/Editor app** → Anchor: Windows Terminal or Notepad (TabView + content)
- **File browser/manager** → Anchor: File Explorer (TreeView + ListView + BreadcrumbBar)
- **Developer tool/dashboard** → Anchor: Dev Home (NavigationView + cards)
- **Single-purpose utility** → Anchor: Calculator (mode switcher + compact)

Write down which anchor app you're using. You MUST reference one.

#### STOP — Execute Step 2: Map Every Requirement to a Control

For EACH user requirement, select a WinUI control. Use this decision tree:

**Navigation needs:**
- Multiple sections → `NavigationView` + `Frame`
- Multiple documents/tabs → `TabView`
- Breadcrumb path → `BreadcrumbBar`

**Data display needs:**
- Vertical list → `ListView` (NEVER StackPanel for dynamic items)
- Grid/tiles → `GridView` or `ItemsRepeater` + `UniformGridLayout`
- Tree/hierarchy → `TreeView`
- Table → CommunityToolkit `DataGrid`
- Master-detail → `ListView` (left) + detail `Grid` (right)

**Input needs:**
- Text → `TextBox` / `RichEditBox`
- Number → `NumberBox` (NOT TextBox with validation)
- Search → `AutoSuggestBox`
- Boolean → `ToggleSwitch` (NOT CheckBox for settings)
- Pick 1 of 2-3 → `RadioButtons`
- Pick 1 of 4+ → `ComboBox`
- File selection → `Button` + `FileOpenPicker`

**Feedback needs:**
- Blocking decision → `ContentDialog`
- Quick action → `Flyout` / `MenuFlyout`
- Status message → `InfoBar`
- System notification → `AppNotification`
- Tooltip → `ToolTip`

**Output a mapping table:** Each requirement → the specific control you chose.

#### STOP — Execute Step 3: Plan the Layout

Draw the layout structure using this format:
```
Shell: [NavigationView/TabView/none]
Main content: [what fills the window]
Sidebar: [fixed width 300-360px if needed]
Status bar: [Grid row at bottom if needed]
Toolbar: [CommandBar or TitleBar buttons if needed]
```

**RULES you MUST follow:**
- Content MUST fill the window — NO centered floating cards, NO empty backgrounds
- Fixed sidebar (300-360px) + flexible main content — NOT 50/50 split
- `Grid` for structure, `StackPanel` ONLY for simple stacking of few items
- Settings go in a Settings PAGE, NOT in title bar or dialogs

**ANTI-PATTERNS — if you catch yourself doing any of these, STOP and redesign:**
- ❌ Centered card on a background
- ❌ Custom pill/tab switcher (use NavigationView or SelectorBar)
- ❌ Theme toggle in title bar
- ❌ ScrollViewer wrapping a ListView
- ❌ Hardcoded colors (#FF0000)
- ❌ Custom ControlTemplate for standard controls

#### STOP — Execute Step 4: Apply Fluent Design Tokens

Before writing ANY XAML, confirm you will use:

**Typography** (NEVER hardcode font sizes):
- Page titles → `Style="{StaticResource TitleTextBlockStyle}"`
- Section headers → `Style="{StaticResource SubtitleTextBlockStyle}"`
- Body text → `Style="{StaticResource BodyTextBlockStyle}"`
- Secondary info → `Style="{StaticResource CaptionTextBlockStyle}"`

**Spacing** (4px grid ONLY — values: 4, 8, 12, 16, 24, 32, 48):
- ❌ `Margin="7"` or `Padding="15"` — NOT on the 4px grid

**Colors** (ThemeResource ONLY):
- `{ThemeResource CardBackgroundFillColorDefaultBrush}` for card backgrounds
- `{ThemeResource TextFillColorPrimaryBrush}` for text
- ❌ `Background="#FF0000"` or `Color="Blue"`

**Corner Radius**: `ControlCornerRadius` for controls, `OverlayCornerRadius` for overlays
**Materials**: `MicaBackdrop` for main window, `DesktopAcrylicBackdrop` for transient surfaces
**Icons**: `SymbolIcon` for standard, `FontIcon` (Segoe Fluent Icons) for extended

#### Execute Step 5: Write the Design Output

Output a structured design specification containing:
1. The anchor app you selected
2. The requirement → control mapping table
3. The layout structure
4. Any conversion notes (if migrating from another framework)

**Web/Framework → WinUI translations you MUST apply:**
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

Only AFTER completing all 5 steps should you proceed to writing XAML code.
