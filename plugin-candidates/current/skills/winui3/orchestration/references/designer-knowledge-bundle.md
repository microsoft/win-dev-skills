# Designer Knowledge Bundle — WinUI 3 Design Specialist

> **Purpose**: Complete design reference for a WinUI 3 designer agent. Contains the full WinUI 3 controls catalog, layout patterns, decision trees, anti-patterns, and Fluent Design guidelines needed to produce correct, native-looking Windows 11 app designs.

---

## 1. WinUI 3 Controls Catalog (Categorized)

Every available WinUI 3 control organized by category. For each control: a one-line description of when to use it.

### Navigation Controls

| Control | When to Use |
|---------|-------------|
| **NavigationView** | Primary app navigation for 3+ sections. Supports Left, LeftCompact, LeftMinimal, Top, and Auto pane display modes. |
| **TabView** | Peer documents or sessions (like browser tabs). Each tab is independent and user-closable. |
| **BreadcrumbBar** | Hierarchical/path navigation showing the user's current location in a content tree. |
| **SelectorBar** | Compact inline peer switching within a page (lightweight alternative to full TabView or NavigationView Top). |
| **Frame** | Page stack for back/forward navigation within a NavigationView; hosts Page instances. |
| **Pivot** | (Legacy — prefer NavigationView Top or SelectorBar for new apps.) |

### Input Controls

| Control | When to Use |
|---------|-------------|
| **Button** | Primary action trigger. Use `Style="{StaticResource AccentButtonStyle}"` for the page's main action. |
| **RepeatButton** | Action that fires repeatedly while pressed (increment/decrement, scroll). |
| **HyperlinkButton** | Inline navigational link styled as text. |
| **ToggleButton** | Binary on/off action that stays pressed (toolbar bold/italic). |
| **CheckBox** | Multi-select boolean option. Use for lists where multiple items can be selected. |
| **RadioButton** | Single-select from a mutually exclusive group. Group with `GroupName`. |
| **ToggleSwitch** | Immediate on/off toggle with instant effect (like a light switch). Prefer over CheckBox for settings. |
| **TextBox** | Single-line or multi-line plain text input. |
| **PasswordBox** | Masked password entry with optional reveal button. |
| **RichEditBox** | Rich-text editing with formatting (bold, italic, lists). |
| **AutoSuggestBox** | Text input with dropdown suggestions that filter as the user types. Use for search bars. |
| **NumberBox** | Numeric input with validation, formatting, and optional spin buttons (`SpinButtonPlacementMode="Inline"`). |
| **ComboBox** | Single-select dropdown from a predefined list. Use when options are 4+ and space is limited. |
| **CalendarDatePicker** | Date selection with an inline calendar popup. |
| **DatePicker** | Date selection with spinning day/month/year columns. |
| **TimePicker** | Time selection with spinning hour/minute columns. |
| **Slider** | Continuous value selection within a range. |
| **RatingControl** | Star-based rating input. |
| **ColorPicker** | Color selection with spectrum, sliders, and hex input. |
| **PersonPicture** | Displays a person's avatar/initials in a circle. Use in contact lists, chat UIs. |

### Layout Controls

| Control | When to Use |
|---------|-------------|
| **Grid** | Rows and columns with proportional (`*`), fixed (`px`), and auto sizing. The workhorse layout panel. |
| **StackPanel** | Vertical or horizontal stacking with `Spacing` property. Use for simple linear layouts. |
| **RelativePanel** | Position elements relative to each other or the panel edges. Good for adaptive layouts. |
| **Canvas** | Absolute positioning with `Canvas.Left`/`Canvas.Top`. Use for drawing surfaces, custom positioning. |
| **Border** | Visual container with background, border brush, corner radius, and padding. |
| **ScrollViewer** | Scrollable content wrapper. Never wrap a ListView/GridView in one (they virtualize internally). |
| **Viewbox** | Scales a single child element to fit available space. |
| **Expander** | Collapsible content section with a header. Use for progressive disclosure. |
| **SplitView** | Side pane + main content. Lower-level than NavigationView; use when you need custom pane behavior. |
| **ItemsRepeater** | Flexible data-driven repeating layout. Pair with `StackLayout` or `UniformGridLayout` for custom arrangements. |

### Collection Controls

| Control | When to Use |
|---------|-------------|
| **ListView** | Virtualized vertical list. Auto-virtualizes — **never** wrap in ScrollViewer. Use `ItemTemplate` for custom rows. |
| **GridView** | Virtualized grid/tile layout. Auto-virtualizes — **never** wrap in ScrollViewer. |
| **TreeView** | Hierarchical data display with expand/collapse nodes. |
| **FlipView** | Full-page item swiping (image galleries, onboarding carousels). |
| **SemanticZoom** | Zoomed-in/zoomed-out views of the same grouped data (e.g., contacts A-Z). |
| **ItemsRepeater + UniformGridLayout** | Custom wrapping/grid layouts when GridView's built-in layout isn't flexible enough. |

### Dialog & Overlay Controls

| Control | When to Use |
|---------|-------------|
| **ContentDialog** | Modal dialog for confirmations, forms, critical actions. **MUST** set `XamlRoot` before showing. |
| **Flyout** | Lightweight popup attached to a control. Dismisses on outside click. |
| **MenuFlyout** | Context menu with menu items. Attach to right-click or button. |
| **CommandBarFlyout** | Rich context menu combining primary commands (icons) + secondary commands (text). |
| **TeachingTip** | Onboarding/tutorial tips anchored to a control. Use for first-run guidance. |
| **InfoBar** | Non-blocking in-app status messages (success, warning, error, informational). Dismissible. |
| **ToolTip** | Hover information on any control. Keep text short. |

### Command Surface Controls

| Control | When to Use |
|---------|-------------|
| **CommandBar** | App-level command surface with primary (icon) and secondary (overflow) commands. |
| **AppBarButton** | Icon button for use inside CommandBar. Has `Icon` + `Label`. |
| **AppBarToggleButton** | Toggle button for use inside CommandBar (bold, italic, view mode). |
| **AppBarSeparator** | Visual separator between groups of commands in a CommandBar. |
| **SplitButton** | Primary action (left click) + dropdown for alternatives (chevron). Example: font color button. |
| **DropDownButton** | Button that always opens a dropdown flyout. No separate primary action. |
| **ToggleSplitButton** | Toggle state (left click) + dropdown for options (chevron). Example: bullet list type. |

### Status & Progress Controls

| Control | When to Use |
|---------|-------------|
| **ProgressBar** | Determinate (known %) or indeterminate (unknown duration) horizontal progress. |
| **ProgressRing** | Circular progress indicator. Use for inline loading states. |
| **InfoBar** | Status messages — success, warning, error, informational. Inline, non-blocking. |
| **InfoBadge** | Small notification badge on NavigationViewItems or other controls to indicate new content. |

### Media Controls

| Control | When to Use |
|---------|-------------|
| **MediaPlayerElement** | Video and audio playback surface. |
| **MediaTransportControls** | Play/pause/seek/volume controls. Auto-included with MediaPlayerElement. |

### Icon Controls

| Control | When to Use |
|---------|-------------|
| **SymbolIcon** | Built-in symbol set (`Symbol="Play"`, `Symbol="Save"`). Easiest icon approach. |
| **FontIcon** | Specific Segoe Fluent Icons font glyphs by Unicode code point. Use `FontFamily="{StaticResource SymbolThemeFontFamily}"`. |
| **ImageIcon** | Icon from an image file (SVG or PNG). |
| **PathIcon** | Icon from a vector path geometry string. |
| **BitmapIcon** | Icon from a bitmap URI. |

### CommunityToolkit Controls

| Control | Package | When to Use |
|---------|---------|-------------|
| **SettingsCard** | `CommunityToolkit.WinUI.Controls.SettingsControls` | Standard settings row: icon + title + description + action control on the right. |
| **SettingsExpander** | `CommunityToolkit.WinUI.Controls.SettingsControls` | Expandable settings group containing child SettingsCards. |
| **DataGrid** | `CommunityToolkit.WinUI.Controls.DataGrid` | Tabular data with columns, sorting, editing. Not built into WinUI 3. |
| **TokenizingTextBox** | `CommunityToolkit.WinUI.Controls.TokenizingTextBox` | Tag/token input (email recipients, labels). |
| **Segmented** | `CommunityToolkit.WinUI.Controls.Segmented` | Segmented control for switching between 2-5 options inline. |
| **DockPanel** | `CommunityToolkit.WinUI.Controls.Primitives` | Dock layout (Top/Bottom/Left/Right/Fill) similar to WPF DockPanel. |
| **SwitchPresenter** | `CommunityToolkit.WinUI.Controls.Primitives` | Switch between content views based on a bound value. |

---

## 2. NavigationView Decision Tree

Use this decision tree to determine the correct navigation pattern for any app.

```
How many top-level sections does the app have?
│
├─ 1 section
│  └─ No NavigationView needed. Use a single page.
│
├─ 2 sections
│  └─ NavigationView Top or SelectorBar
│
├─ 3–7 sections
│  ├─ Sections are equal peers (no hierarchy) → NavigationView Top
│  ├─ Sections have hierarchy or sub-items → NavigationView Left
│  └─ App needs a Settings page → NavigationView Left (Settings icon in footer)
│
├─ 8+ sections
│  └─ NavigationView Left with grouping (NavigationViewItem.MenuItems for sub-items)
│
└─ Document/session-based (like browser tabs, multiple files open)
   └─ TabView
```

### NavigationView PaneDisplayMode Selection

```
Which PaneDisplayMode to use?
│
├─ Left
│  Best for 5–7+ items. Full sidebar always visible.
│  Sidebar shows icons + labels. Most discoverable.
│
├─ LeftCompact
│  Icons-only sidebar, expands on hover/click.
│  Good for space efficiency when icons are recognizable.
│
├─ LeftMinimal
│  Hamburger button only, pane overlays content when opened.
│  Maximum content space. Good for small windows.
│
├─ Top
│  Horizontal items across the top of the page.
│  Best for 3–5 items with flat hierarchy. No sub-items.
│
└─ Auto
   Adapts between Left, LeftCompact, and LeftMinimal based on window width.
   Good default for responsive apps. Breakpoints:
     ≥1008px → Left
     ≥641px  → LeftCompact
     <641px  → LeftMinimal
```

### Combined Pattern Examples

```
NavigationView Left + Settings page in footer
├─ Most common pattern for utility/tool apps
├─ NavigationView.IsSettingsVisible="True" adds a gear icon
└─ Handle Settings via NavigationView.SelectionChanged

TabView + NavigationView Left (nested)
├─ Use when each tab has its own navigation structure
├─ Rare — usually overkill
└─ Example: VS Code (tabs for files + sidebar for explorer)

NavigationView Left + CommandBar on content page
├─ Navigation in sidebar, page-level actions in CommandBar
├─ Example: File Explorer, Mail apps
└─ CommandBar at top of page content, not in NavigationView header
```

---

## 3. Windows 11 App Reference Catalog

Real Windows 11 apps and their layout patterns. The designer agent can say "layout inspired by [App]" to communicate intent clearly.

| App | Navigation | Layout Pattern | When to Reference |
|-----|-----------|----------------|-------------------|
| **Windows Settings** | NavigationView Left | Sectioned pages with SettingsCards, toggles, ComboBoxes, grouped by category. Scrollable pages. | Settings-heavy apps, system utilities, preference panels, configuration tools |
| **Windows Terminal** | TabView | Full-width terminal rendering surface per tab, compact chrome, settings in separate page | Document/session apps, editors, multi-instance terminal-like tools |
| **Dev Home** | NavigationView Left | Full-width content pages, card-based dashboards with mixed content, widget-style sections | Developer tools, admin dashboards, multi-tool aggregator apps |
| **File Explorer** | BreadcrumbBar + CommandBar | TreeView nav (left pane) + file ListView (main) + preview pane (right), CommandBar at top | File managers, browsers, hierarchical content exploration |
| **Notepad** | TabView | Minimal chrome, full-width text editor per tab, simple menu bar | Simple editors, single-purpose text tools, minimal-UI apps |
| **Calculator** | Mode switcher (NavigationView) + button grid | Compact single-purpose display area + grid of buttons, mode switching via hamburger menu | Single-purpose computational tools, converters, compact utilities |
| **Photos** | NavigationView Left | Gallery grid view (GridView) + detail viewer overlay, timeline grouping | Media browsers, image galleries, portfolio apps |
| **Microsoft Store** | NavigationView Left | Card grids for discovery + detail pages with hero images, ratings, reviews | Catalog/discovery apps, marketplaces, content browsing |
| **Microsoft To Do** | List + Detail side-by-side | List sidebar (ListView) + task detail panel on right, inline editing | Task/list management, note-taking, checklist apps |
| **Clock** | NavigationView Left | Sectioned content pages (Timer, Alarm, Stopwatch, World Clock), each page is a distinct tool | Multi-mode utility apps, apps with independent functional areas |
| **Paint** | Toolbar/ribbon + canvas | Tool palette (vertical toolbar or ribbon) + central editing canvas surface | Creative/editing tools, drawing apps, diagram editors |
| **Media Player** | NavigationView Left | Library grid (music/video) + now-playing bar at bottom, detail pages | Media library apps, music players, podcast apps |
| **Phone Link** | NavigationView Left rail (icons only) | List-detail messaging, device status cards, notification mirroring | Communication apps, device management, messaging |
| **WinUI 3 Gallery** | NavigationView Left | Control demo pages + inline code samples, search via AutoSuggestBox in header | Reference/documentation apps, sample galleries, API explorers |
| **Outlook (new)** | NavigationView Left rail + list-detail | Mail list (center) + reading pane (right), folder tree (left), ribbon-style CommandBar | Email clients, communication apps, multi-pane productivity tools |
| **Teams** | NavigationView Left rail | Activity feed, chat list-detail, channel views, meeting surfaces | Chat/collaboration apps, real-time communication |

---

## 4. Page Layout Pattern Library

### Pattern: Sidebar + Main Content (Most Common)

```
┌───────────────────────────────────────────────────┐
│ NavigationView                                    │
│ ┌──────────────┬──────────────────────────────────┤
│ │  Sidebar     │  Main Content                    │
│ │  (300-360px) │  (Width="*", fills remaining)    │
│ │  fixed width │                                  │
│ │              │  Padding: 24px                   │
│ │  Controls:   │                                  │
│ │  - Buttons   │  Output area:                    │
│ │  - ComboBox  │  - ListView / log                │
│ │  - TextBox   │  - Editor surface                │
│ │  - Settings  │  - Data display                  │
│ │              │                                  │
│ └──────────────┴──────────────────────────────────┤
└───────────────────────────────────────────────────┘
```

**Use when**: App has controls/input on one side and output/display on the other.
**Examples**: Serial monitor + log, form builder + preview, settings + content.
**Implementation**:
```xml
<Grid>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="320"/>   <!-- Fixed sidebar -->
        <ColumnDefinition Width="*"/>      <!-- Flexible main -->
    </Grid.ColumnDefinitions>
    <!-- Sidebar content in Grid.Column="0" -->
    <!-- Main content in Grid.Column="1" -->
</Grid>
```

### Pattern: Full-Width Content

```
┌───────────────────────────────────────────────────┐
│ NavigationView                                    │
│ ┌─────────────────────────────────────────────────┤
│ │                                                 │
│ │  Content fills entire width                     │
│ │  Padding: 24–36px on sides                      │
│ │                                                 │
│ │  Sections separated by 24–48px vertical spacing │
│ │                                                 │
│ └─────────────────────────────────────────────────┤
└───────────────────────────────────────────────────┘
```

**Use when**: Content is the primary focus — editors, lists, dashboards, settings pages.
**Examples**: Text editor, settings page with SettingsCards, dashboard.
**Implementation**:
```xml
<ScrollViewer>
    <StackPanel Padding="36,24" Spacing="24">
        <!-- Sections of content -->
    </StackPanel>
</ScrollViewer>
```

### Pattern: List-Detail (Master-Detail)

```
┌───────────────────────────────────────────────────┐
│ NavigationView                                    │
│ ┌────────────────┬────────────────────────────────┤
│ │  List          │  Detail                        │
│ │  (300-400px)   │  (fills remaining)             │
│ │                │                                │
│ │  ListView of   │  Selected item's full details  │
│ │  items with    │  - Title, description          │
│ │  summary info  │  - Actions, metadata           │
│ │                │  - Sub-items, attachments       │
│ │                │                                │
│ │  [+ Add]       │                                │
│ └────────────────┴────────────────────────────────┤
└───────────────────────────────────────────────────┘
```

**Use when**: Browsing a collection with a detail view for the selected item.
**Examples**: Email (Outlook), tasks (To Do), contacts, file browser.
**Implementation**:
```xml
<Grid>
    <Grid.ColumnDefinitions>
        <ColumnDefinition Width="360"/>
        <ColumnDefinition Width="*"/>
    </Grid.ColumnDefinitions>
    <ListView Grid.Column="0" ... />
    <Frame Grid.Column="1" ... />  <!-- or direct detail content -->
</Grid>
```

### Pattern: Dashboard Cards

```
┌───────────────────────────────────────────────────┐
│ NavigationView                                    │
│ ┌─────────────────────────────────────────────────┤
│ │  Page Title                                     │
│ │                                                 │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│ │  │  Card 1  │  │  Card 2  │  │  Card 3  │      │
│ │  │  Status  │  │  Chart   │  │  Summary │      │
│ │  └──────────┘  └──────────┘  └──────────┘      │
│ │                                                 │
│ │  ┌──────────┐  ┌─────────────────────────┐      │
│ │  │  Card 4  │  │  Card 5 (wide)          │      │
│ │  │  Quick   │  │  Recent Activity List   │      │
│ │  │  Actions │  │                         │      │
│ │  └──────────┘  └─────────────────────────┘      │
│ └─────────────────────────────────────────────────┤
└───────────────────────────────────────────────────┘
```

**Use when**: Overview/summary pages, home screens, status dashboards.
**Examples**: Dev Home dashboard, app home page, monitoring overview.
**Implementation**:
```xml
<ScrollViewer>
    <ItemsRepeater ItemsSource="{x:Bind Cards}">
        <ItemsRepeater.Layout>
            <UniformGridLayout MinItemWidth="300"
                               MinItemHeight="200"
                               MinColumnSpacing="12"
                               MinRowSpacing="12"/>
        </ItemsRepeater.Layout>
    </ItemsRepeater>
</ScrollViewer>
```

### Pattern: Settings Page

```
┌───────────────────────────────────────────────────┐
│ NavigationView (settings via footer gear icon)    │
│ ┌─────────────────────────────────────────────────┤
│ │  Settings                                       │
│ │                                                 │
│ │  Appearance                                     │
│ │  ┌───────────────────────────────────────────┐  │
│ │  │ 🎨 Theme                        [▼ Dark] │  │
│ │  └───────────────────────────────────────────┘  │
│ │  ┌───────────────────────────────────────────┐  │
│ │  │ 📐 Compact mode                 [═══ On] │  │
│ │  └───────────────────────────────────────────┘  │
│ │                                                 │
│ │  Advanced                                       │
│ │  ┌───────────────────────────────────────────┐  │
│ │  │ 🔧 Advanced Settings              [ ﹀ ] │  │
│ │  │   ┌─────────────────────────────────────┐ │  │
│ │  │   │ Enable logging             [☐]     │ │  │
│ │  │   ├─────────────────────────────────────┤ │  │
│ │  │   │ Log level                   [▼]    │ │  │
│ │  │   └─────────────────────────────────────┘ │  │
│ │  └───────────────────────────────────────────┘  │
│ │                                                 │
│ │  About                                          │
│ │  ┌───────────────────────────────────────────┐  │
│ │  │ App Name v1.0.0                           │  │
│ │  │ © 2024 Company                            │  │
│ │  └───────────────────────────────────────────┘  │
│ └─────────────────────────────────────────────────┤
└───────────────────────────────────────────────────┘
```

**Use when**: App settings, preferences, configuration pages.
**Required NuGet**: `CommunityToolkit.WinUI.Controls.SettingsControls`
**Implementation**:
```xml
<ScrollViewer>
    <StackPanel Padding="36,24" Spacing="4" MaxWidth="1000">
        <TextBlock Text="Appearance" Style="{StaticResource BodyStrongTextBlockStyle}"/>
        <labs:SettingsCard Header="Theme" HeaderIcon="{ui:FontIcon Glyph=&#xE790;}">
            <ComboBox SelectedIndex="0">
                <x:String>Light</x:String>
                <x:String>Dark</x:String>
                <x:String>Use system setting</x:String>
            </ComboBox>
        </labs:SettingsCard>
        <labs:SettingsExpander Header="Advanced Settings"
                              HeaderIcon="{ui:FontIcon Glyph=&#xE713;}">
            <labs:SettingsExpander.Items>
                <labs:SettingsCard Header="Enable logging">
                    <ToggleSwitch/>
                </labs:SettingsCard>
            </labs:SettingsExpander.Items>
        </labs:SettingsExpander>
    </StackPanel>
</ScrollViewer>
```

### Pattern: Toolbar + Canvas (Editor)

```
┌───────────────────────────────────────────────────┐
│ CommandBar / Toolbar                              │
│ ┌─────────────────────────────────────────────────┤
│ │                                                 │
│ │              Editing Surface                    │
│ │           (Canvas, RichEditBox,                 │
│ │            WebView2, custom)                    │
│ │                                                 │
│ │                                                 │
│ └─────────────────────────────────────────────────┤
│ Status Bar (optional)                             │
└───────────────────────────────────────────────────┘
```

**Use when**: Creative/editing tools, drawing apps, code editors.
**Examples**: Paint, Notepad, diagram editors.

---

## 5. Design Anti-Patterns

These are patterns that **MUST** be avoided. They come from real failures building WinUI 3 apps.

### ❌ Anti-Pattern: Centered Floating Card

```
BAD LAYOUT:
┌───────────────────────────────────────────────────┐
│                                                   │
│            ┌─────────────────────┐                │
│            │                     │                │
│            │   Card content      │                │
│            │   MaxWidth="600"    │                │
│            │   HAlign="Center"   │                │
│            │                     │                │
│            └─────────────────────┘                │
│                   (Mica background)               │
└───────────────────────────────────────────────────┘
```

**Why it's wrong**: This is a web pattern (centered max-width container on a gradient background). Native Windows apps fill the window with content. No Windows 11 inbox app uses this layout.

**Fix**: Remove `MaxWidth` and `HorizontalAlignment="Center"` from the main content container. Content fills the window with appropriate padding (24–36px). If the page content is truly narrow, let it be left-aligned within the NavigationView content area — do not center a card.

---

### ❌ Anti-Pattern: Custom Pill/Segment Tab Switcher

```
BAD LAYOUT:
┌───────────────────────────────────────────────────┐
│                                                   │
│        ┌────────────┬────────────┐                │
│        │  Monitor   │   Flash    │  ← custom      │
│        └────────────┴────────────┘    RadioButtons │
│                                       with 70-line │
│                                       template     │
└───────────────────────────────────────────────────┘
```

**Why it's wrong**: Building a custom `ControlTemplate` (pill-shaped RadioButtons acting as tabs) requires 70+ lines of XAML with `VisualStateManager` and pointer states. The result is fragile, doesn't follow system theme changes properly, and duplicates what `NavigationView` does natively.

**Fix**: Use `NavigationView` with `PaneDisplayMode="Top"` for section switching, or `SelectorBar` for compact inline switching. These are 5–10 lines of XAML and handle theming, accessibility, keyboard navigation, and visual states automatically.

---

### ❌ Anti-Pattern: Theme Toggle in Title Bar

**Why it's wrong**: No Windows 11 inbox app puts a theme toggle in the title bar or as a prominent UI element. Windows apps place theme selection in a **Settings** page, consistent with the OS pattern (Settings → Personalization → Colors).

**Fix**: Add a Settings page accessible from the NavigationView footer icon (`IsSettingsVisible="True"`). On the Settings page, use `RadioButtons` or a `ComboBox` with Light / Dark / Use system setting options. This is the expected Windows pattern.

---

### ❌ Anti-Pattern: Equal-Width Column Split (50/50)

```
BAD LAYOUT:
┌───────────────────────────────────────────────────┐
│                                                   │
│  ┌──────────────────┬──────────────────┐          │
│  │   Controls       │   Content        │          │
│  │   Width="*"      │   Width="*"      │          │
│  │   (50%)          │   (50%)          │          │
│  └──────────────────┴──────────────────┘          │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Why it's wrong**: Control panels (buttons, dropdowns, configuration) rarely need 50% of the window. The content area (logs, editors, data displays) needs more space. A 50/50 split wastes space on the controls side and starves the content side.

**Fix**: Use a fixed-width sidebar (`Width="300"` or `Width="360"`) for controls and a flexible main content area (`Width="*"`) that takes remaining space.

---

### ❌ Anti-Pattern: Custom ControlTemplate When Native Control Exists

**Why it's wrong**: Writing 70+ lines of `VisualStateManager` XAML for a control that already exists as a native WinUI 3 control. The custom version will miss accessibility features, keyboard navigation, high contrast support, and theme transitions.

**Fix**: Before creating any custom `ControlTemplate`, search the WinUI 3 Controls Catalog (Section 1 above) and the CommunityToolkit. If a native control exists, use it. Only create custom templates for genuinely novel UI elements.

---

### ❌ Anti-Pattern: Wrapping ListView/GridView in ScrollViewer

```xml
<!-- BAD: Double scroll, breaks virtualization -->
<ScrollViewer>
    <ListView ItemsSource="{x:Bind Items}" />
</ScrollViewer>
```

**Why it's wrong**: `ListView` and `GridView` have built-in virtualization and scrolling. Wrapping them in `ScrollViewer` breaks virtualization (all items render at once → memory/performance issues) and creates confusing double-scroll behavior.

**Fix**: Never wrap `ListView` or `GridView` in `ScrollViewer`. They handle scrolling internally. If you need other content above/below the list that also scrolls, put the list inside the page layout and set its `Height` or use `Grid` row sizing.

---

### ❌ Anti-Pattern: Hardcoded Colors

```xml
<!-- BAD -->
<TextBlock Foreground="#333333" />
<Border Background="#F0F0F0" />
```

**Why it's wrong**: Hardcoded colors break Dark theme, High Contrast mode, and accent color customization.

**Fix**: Always use `{ThemeResource}` brushes:
```xml
<TextBlock Foreground="{ThemeResource TextFillColorPrimaryBrush}" />
<Border Background="{ThemeResource CardBackgroundFillColorDefaultBrush}" />
```

---

## 6. Web → Windows Translation Table

When converting web/Electron designs to native WinUI 3, use this translation table.

| Web / Electron Pattern | WinUI 3 Native Equivalent | Notes |
|------------------------|--------------------------|-------|
| Centered card on gradient/background | Full-width content with 24–36px padding | Windows apps fill the window |
| CSS tab/pill buttons | `NavigationView` (Top) or `SelectorBar` | Built-in theming, accessibility, keyboard nav |
| Hamburger menu (custom JS/CSS) | `NavigationView` with `PaneDisplayMode` | Handles responsive breakpoints automatically |
| Theme toggle in header/nav bar | Settings page with `RadioButtons` | Light / Dark / System, accessed via gear icon |
| Modal overlay as main content area | `ContentDialog` or separate `Page` navigation | ContentDialog for confirmations; Page for full views |
| Equal-width flexbox panels | Fixed sidebar (300–360px) + flexible main (`Width="*"`) | Controls panel is narrow, content gets the space |
| CSS `<select>` dropdown | `ComboBox` | Native dropdown with search in large lists |
| CSS number input with +/- | `NumberBox` with `SpinButtonPlacementMode="Inline"` | Built-in validation, formatting, min/max |
| Floating action button (FAB) | `CommandBar` or `AppBarButton` | Windows doesn't use FABs; use command surfaces |
| Toast / snackbar notification | `InfoBar` (in-app) or `AppNotification` (system tray) | InfoBar for persistent in-app; AppNotification for OS-level |
| CSS loading spinner | `ProgressRing` | Circular indeterminate progress |
| CSS progress bar | `ProgressBar` | Determinate or indeterminate |
| Accordion / collapsible section | `Expander` | Built-in expand/collapse with animation |
| Badge / chip / tag | `InfoBadge` (on nav items) or custom styled `Border` | InfoBadge for notification counts |
| Breadcrumb links | `BreadcrumbBar` | Hierarchical path navigation |
| Search bar (custom) | `AutoSuggestBox` | Type-ahead suggestions, search icon built in |
| HTML data table | `ListView` with `Grid` in `ItemTemplate` or `DataGrid` (CommunityToolkit) | ListView for simple lists; DataGrid for sortable/editable tables |
| CSS card grid (flexbox/grid) | `ItemsRepeater` + `UniformGridLayout` | Virtualizes automatically, responsive column count |
| Tabs (HTML/CSS/JS) | `TabView` (document tabs) or `NavigationView` Top (section tabs) | TabView for closable peer documents; NavigationView for app sections |
| Sidebar navigation (custom) | `NavigationView` Left | Full sidebar with icons, labels, footers, settings |
| CSS tooltip | `ToolTip` | Attach to any control |
| Inline editable text | `TextBox` with styling to look inline | Toggle between `TextBlock` and `TextBox` |
| Image carousel | `FlipView` | Full-page swiping between items |
| Star rating (custom) | `RatingControl` | Built-in star rating with half-star support |
| Color picker (custom JS) | `ColorPicker` | Full color picker with spectrum, hex, RGB |
| Date picker (custom JS) | `CalendarDatePicker` or `DatePicker` | Calendar popup or spinning columns |
| Toggle / switch (custom CSS) | `ToggleSwitch` | Native on/off with animation |
| Context menu (right-click) | `MenuFlyout` or `CommandBarFlyout` | MenuFlyout for simple; CommandBarFlyout for rich |

---

## 7. Fluent Design Quick Reference

### Spacing System (4px Base Grid)

All spacing values are multiples of 4px:

| Value | Usage |
|-------|-------|
| **4px** | Tight spacing between closely related controls (icon + label inside a button) |
| **8px** | Between controls within a group (two buttons side by side, `StackPanel Spacing="8"`) |
| **12px** | Between related groups or between label and its control |
| **16px** | Card internal padding, section spacing within a group |
| **24px** | Between major sections on a page, standard page padding |
| **36px** | Page side margins, large page padding |
| **48px** | Large section spacing, page top margin for hero content |

**Key property**: Use `Spacing` on `StackPanel` for consistent gap between children (avoids individual margins).

### Materials (Window Backgrounds)

| Material | Class | Usage | Fallback |
|----------|-------|-------|----------|
| **Mica** | `MicaBackdrop` | Main window background. Subtly shows desktop wallpaper color. | Solid `ApplicationPageBackgroundThemeBrush` |
| **Mica Alt** | `MicaBackdrop` (Kind=MicaAlt) | Alternate Mica with slightly different tinting. Used in TabView title bars. | Solid color |
| **Desktop Acrylic** | `DesktopAcrylicBackdrop` | Transient surfaces: flyouts, sidebars, overlays. Semi-transparent blur. | Solid color |

**Implementation** (in `App.xaml.cs` or `MainWindow.xaml.cs`):
```csharp
// In MainWindow constructor
this.SystemBackdrop = new MicaBackdrop();
// Fallback handled automatically by WinUI
```

### Corner Radius

| Token | Value | Usage |
|-------|-------|-------|
| **ControlCornerRadius** | 4px | In-page controls: Button, TextBox, ComboBox, CheckBox, etc. |
| **OverlayCornerRadius** | 8px | Top-level containers: ContentDialog, Flyout, cards, window frame |

**Usage in XAML**:
```xml
<Border CornerRadius="{StaticResource ControlCornerRadius}" />
<Border CornerRadius="{StaticResource OverlayCornerRadius}" />
```

### Color System

**Rule**: NEVER hardcode colors. Always use `{ThemeResource}` brushes for automatic Light/Dark/High Contrast support.

#### Text Colors
| Brush | Usage |
|-------|-------|
| `TextFillColorPrimaryBrush` | Primary text (headings, body text) |
| `TextFillColorSecondaryBrush` | Secondary/subtitle text |
| `TextFillColorTertiaryBrush` | Placeholder, disabled text |
| `TextFillColorDisabledBrush` | Disabled text |
| `AccentTextFillColorPrimaryBrush` | Accent-colored text (links, emphasis) |

#### Background Colors
| Brush | Usage |
|-------|-------|
| `ApplicationPageBackgroundThemeBrush` | Page background (behind Mica) |
| `CardBackgroundFillColorDefaultBrush` | Card/container surfaces |
| `CardBackgroundFillColorSecondaryBrush` | Nested card surfaces |
| `LayerFillColorDefaultBrush` | Layered surfaces (sidebar backgrounds) |
| `SolidBackgroundFillColorBaseBrush` | Opaque base layer |
| `ControlFillColorDefaultBrush` | Control backgrounds (buttons, text boxes) |
| `SubtleFillColorTransparentBrush` | Subtle hover/press states |

#### Border & Divider Colors
| Brush | Usage |
|-------|-------|
| `CardStrokeColorDefaultBrush` | Card borders |
| `ControlStrokeColorDefaultBrush` | Control borders |
| `DividerStrokeColorDefaultBrush` | Separator lines |
| `SurfaceStrokeColorDefaultBrush` | Surface borders |

#### Accent Color
| Brush | Usage |
|-------|-------|
| `SystemAccentColor` | System accent color (user-chosen in Windows Settings) |
| `SystemAccentColorLight1` through `Light3` | Lighter variants |
| `SystemAccentColorDark1` through `Dark3` | Darker variants |

**Overriding accent color** (in `App.xaml`):
```xml
<Application.Resources>
    <Color x:Key="SystemAccentColor">#0078D4</Color>
</Application.Resources>
```

### Typography

Use built-in text styles — never set `FontSize`/`FontWeight` manually.

| Style Resource | Size | Weight | Usage |
|---------------|------|--------|-------|
| `TitleLargeTextBlockStyle` | 40px | SemiBold | Hero headers, splash screens |
| `TitleTextBlockStyle` | 28px | SemiBold | Page titles |
| `SubtitleTextBlockStyle` | 20px | SemiBold | Section headers, dialog titles |
| `BodyStrongTextBlockStyle` | 14px | SemiBold | Emphasized body text, group headers |
| `BodyTextBlockStyle` | 14px | Normal | Standard body text (default) |
| `CaptionTextBlockStyle` | 12px | Normal | Captions, timestamps, secondary info |

**Usage**:
```xml
<TextBlock Text="Page Title" Style="{StaticResource TitleTextBlockStyle}"/>
<TextBlock Text="Section" Style="{StaticResource SubtitleTextBlockStyle}"/>
<TextBlock Text="Body text" Style="{StaticResource BodyTextBlockStyle}"/>
<TextBlock Text="Caption" Style="{StaticResource CaptionTextBlockStyle}"/>
```

**Font**: Segoe UI Variable is used automatically by WinUI 3. Do not specify a font family unless you need a custom font.

**Minimum readable size**: 12px (`CaptionTextBlockStyle`). Never go below this.

### Icons

| Approach | When to Use | Example |
|----------|-------------|---------|
| `SymbolIcon` | Quick access to common symbols | `<SymbolIcon Symbol="Save"/>` |
| `FontIcon` | Specific Segoe Fluent Icons glyph by Unicode point | `<FontIcon FontFamily="{StaticResource SymbolThemeFontFamily}" Glyph="&#xE710;"/>` |
| `ImageIcon` | Custom SVG or PNG icon | `<ImageIcon Source="ms-appx:///Assets/icon.svg"/>` |
| `PathIcon` | Vector path geometry | `<PathIcon Data="M10,0 L20,20 L0,20 Z"/>` |
| `BitmapIcon` | Bitmap icon from URI | `<BitmapIcon UriSource="ms-appx:///Assets/icon.png"/>` |

**Standard icon sizes**:
| Size | Usage |
|------|-------|
| 16px | Compact/dense UI, inline with text |
| 20px | Default size for most controls (buttons, nav items) |
| 24px | Emphasis, toolbar icons |
| 32px | Large display, empty states |
| 48px | Hero icons, onboarding illustrations |

**Common SymbolIcon values**: Play, Pause, Stop, Save, Delete, Add, Edit, Setting, Search, Filter, Refresh, Share, Download, Upload, Copy, Paste, Undo, Redo, Back, Forward, Home, Mail, People, Calendar, Clock, Pin, UnPin, Favorite, Important, Flag, Accept, Cancel, More, Sort, List, Grid.

### Elevation & Shadows

WinUI 3 handles elevation through layered backgrounds, not explicit shadows:
- **Layer 0**: Page background (Mica)
- **Layer 1**: Cards, containers (`CardBackgroundFillColorDefaultBrush`)
- **Layer 2**: Flyouts, dialogs (system handles shadow automatically)

ContentDialog, Flyout, MenuFlyout, and CommandBarFlyout automatically get appropriate shadows. Do not add manual shadows to controls.

### Responsive Design

WinUI 3 uses `VisualStateManager` with `AdaptiveTrigger` for responsive layouts:

```xml
<VisualStateManager.VisualStateGroups>
    <VisualStateGroup>
        <VisualState x:Name="Wide">
            <VisualState.StateTriggers>
                <AdaptiveTrigger MinWindowWidth="1008"/>
            </VisualState.StateTriggers>
            <!-- Wide layout setters -->
        </VisualState>
        <VisualState x:Name="Medium">
            <VisualState.StateTriggers>
                <AdaptiveTrigger MinWindowWidth="641"/>
            </VisualState.StateTriggers>
            <!-- Medium layout setters -->
        </VisualState>
        <VisualState x:Name="Narrow">
            <!-- Default narrow layout -->
        </VisualState>
    </VisualStateGroup>
</VisualStateManager.VisualStateGroups>
```

**Standard breakpoints** (matching NavigationView Auto mode):
| Breakpoint | NavigationView Mode | Layout Guidance |
|-----------|-------------------|-----------------|
| ≥1008px | Left (full sidebar) | Multi-column layouts, full sidebar visible |
| ≥641px | LeftCompact (icons only) | Reduced columns, compact sidebar |
| <641px | LeftMinimal (hamburger) | Single-column, stacked layout |

---

## 8. Common XAML Patterns Quick Reference

### ContentDialog (MUST set XamlRoot)

```xml
<!-- In code-behind or ViewModel -->
var dialog = new ContentDialog
{
    Title = "Confirm Action",
    Content = "Are you sure you want to proceed?",
    PrimaryButtonText = "Yes",
    CloseButtonText = "Cancel",
    DefaultButton = ContentDialogButton.Primary,
    XamlRoot = this.XamlRoot  // REQUIRED — will crash without this
};
var result = await dialog.ShowAsync();
```

### NavigationView with Pages

```xml
<NavigationView x:Name="NavView"
                IsSettingsVisible="True"
                SelectionChanged="NavView_SelectionChanged">
    <NavigationView.MenuItems>
        <NavigationViewItem Content="Home" Icon="{ui:SymbolIcon Symbol=Home}" Tag="HomePage"/>
        <NavigationViewItem Content="Settings" Icon="{ui:SymbolIcon Symbol=Setting}" Tag="SettingsPage"/>
    </NavigationView.MenuItems>
    <Frame x:Name="ContentFrame"/>
</NavigationView>
```

### InfoBar Placement

```xml
<!-- Place InfoBar at the TOP of the page content, outside ScrollViewer -->
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
    </Grid.RowDefinitions>
    <InfoBar x:Name="StatusInfoBar"
             IsOpen="False"
             Severity="Success"
             Title="Saved"
             Message="Your changes have been saved."/>
    <ScrollViewer Grid.Row="1">
        <!-- Page content -->
    </ScrollViewer>
</Grid>
```

### Keyboard Accelerators

```xml
<Button Content="Save" Click="Save_Click">
    <Button.KeyboardAccelerators>
        <KeyboardAccelerator Modifiers="Control" Key="S"/>
    </Button.KeyboardAccelerators>
</Button>
```

---

## 9. Known WinUI 3 / CommunityToolkit Limitations

### SettingsCard inside SettingsExpander.Items
- `SettingsCard` with `IsClickEnabled="True"` placed inside `SettingsExpander.Items` may not render correctly — the card can be invisible or missing its click target.
- Known accessibility issue: SettingsCard automation peer may not implement the expected invoke pattern ([GitHub #391](https://github.com/CommunityToolkit/Windows/issues/391)).
- **Workaround**: Place clickable `SettingsCard` elements as standalone cards outside the `SettingsExpander`, directly in the parent `StackPanel`. Use `SettingsExpander.Items` only for non-clickable display items.
- Example:
  ```xml
  <!-- ✅ CORRECT: Clickable cards outside the expander -->
  <controls:SettingsExpander Header="About" Description="App info">
      <controls:SettingsExpander.Items>
          <controls:SettingsCard Header="Version" Description="1.0.0" />  <!-- display only -->
      </controls:SettingsExpander.Items>
  </controls:SettingsExpander>
  <controls:SettingsCard Header="Check for updates" IsClickEnabled="True" Command="{x:Bind ...}" />
  <controls:SettingsCard Header="What's New" IsClickEnabled="True" Command="{x:Bind ...}" />
  
  <!-- ❌ WRONG: Clickable cards inside expander items — may not render -->
  <controls:SettingsExpander Header="About">
      <controls:SettingsExpander.Items>
          <controls:SettingsCard Header="Check for updates" IsClickEnabled="True" />  <!-- may be invisible -->
      </controls:SettingsExpander.Items>
  </controls:SettingsExpander>
  ```

### ContentDialog requires XamlRoot
- `ContentDialog.XamlRoot` MUST be set before calling `ShowAsync()` — omitting it causes a crash, not a warning.
- The `XamlRoot` must come from the View layer (code-behind or service), never from a ViewModel.

### x:Bind does not work in Style Setters
- Use `{Binding}` (reflection-based) inside `Style.Setters` — `x:Bind` is not supported there.

### Window Is NOT a UIElement
WinUI 3's `Window` does not inherit from `UIElement` or `FrameworkElement` (unlike WPF). When designing, **never specify features on the Window itself** — they will crash the XAML compiler silently.

| ❌ Don't Specify This | ✅ Specify This Instead |
|----------------------|------------------------|
| "Add keyboard shortcuts to the Window" | "Add keyboard shortcuts to the NavigationView" |
| "Set theme on the Window" | "Set theme on the root FrameworkElement (Content)" |
| "Put resources in Window.Resources" | "Put resources in App.xaml or Page.Resources" |
| "Handle keyboard events on the Window" | "Handle on NavigationView, Page, or root Grid" |

**Design rule**: In your design spec, always assign keyboard shortcuts, theme controls, and interactive behavior to the NavigationView or Page level — never to the Window. The Window is just a shell for title bar, backdrop, and sizing.

## 10. Design Spec Size Guideline

Keep the design spec to **~10-15KB**. Focus on:
- Pages, controls, and layout (what the app looks like)
- Navigation pattern and page list
- Brand identity and visual style
- Wireframes (ASCII art)

Do NOT include:
- `x:Bind` binding expressions (that's the Builder's job)
- NuGet package suggestions (that's the Architect's job)
- Implementation details like `DispatcherQueueTimer` or threading concerns
- API usage patterns

The design spec describes **WHAT** the app looks like. The blueprint describes **HOW** to build it.

---

*End of Designer Knowledge Bundle*
