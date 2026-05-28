// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

internal static class Notes
{
    /// <summary>
    /// Cross-control family disambiguation. Single source of truth for "when to pick
    /// X vs Y vs Z" — referenced by every family member so we don't repeat the same
    /// guidance in 3-5 places (and don't drift between control entries).
    /// </summary>
    private static readonly Dictionary<string, string> FamilyGuide = new()
    {
        ["Tabs"] = "TabView=closable doc tabs (browser-style); Pivot=static sections (legacy, prefer SelectorBar for new code); SelectorBar=modern Win11 flat selector; Segmented (Toolkit)=2-5 mutually-exclusive short toggles",
        ["Toolbars"] = "CommandBar=app-wide toolbar (PrimaryCommands always-visible, SecondaryCommands overflow); TabbedCommandBar (Toolkit)=Office ribbon-style with multiple tabs of AppBarButton groups",
        ["Popups"] = "ContentDialog=modal blocking decision; Flyout=inline contextual UI; MenuFlyout=context/dropdown menu; TeachingTip=non-blocking targeted hint; InfoBar=persistent inline status (Severity Info/Success/Warning/Error); AppNotification=system-wide toast",
        ["Collections"] = "ListView=vertical text rows; GridView=image/card grid; ItemsView=modern flexible (LinedFlow/Stack/UniformGrid layouts; replaces ListView/GridView for new code); ItemsRepeater=fully custom layout (no selection, no scroll, wrap in ScrollViewer); TreeView=hierarchy",
        ["TextInput"] = "TextBox=plain; RichEditBox=formatted (bold/italic/lists); AutoSuggestBox=search-as-you-type; ComboBox=closed-list dropdown; TokenizingTextBox (Toolkit)=removable chip/tag pills; RichSuggestBox (Toolkit)=@mention/#hashtag inline tokens",
        ["Numeric"] = "NumberBox=precise typed value with validation; Slider=visual single-value range; RangeSelector (Toolkit)=two-handle min/max range",
        ["Navigation"] = "NavigationView=app sidebar with built-in UX (SelectionChanged + Frame); SplitView=low-level pane primitive (build the list yourself); BreadcrumbBar=path-style trail (ItemsSource only)",
        ["Settings"] = "SettingsCard=single setting row (Win11 standard); SettingsExpander=group of related cards under one collapsible header",
        ["Sizers"] = "GridSplitter (Toolkit)=column/row resize within a Grid; ContentSizer (Toolkit)=single-axis resize of a sibling element outside a Grid",
        ["LayoutPanels"] = "StackPanel=linear; Grid=row/column with sizes; Canvas=absolute positioning; DockPanel (Toolkit)=Dock attached property + LastChildFill; WrapPanel (Toolkit)=row/col then wrap; UniformGrid (Toolkit)=equal cells; StaggeredPanel (Toolkit)=Pinterest masonry; ItemsRepeater Layout=virtualized variants (StackLayout/UniformGridLayout/WrapLayout/StaggeredLayout)",
        ["ColorPickers"] = "Microsoft.UI.Xaml.Controls.ColorPicker=basic, dependency-free; CommunityToolkit.WinUI.Controls.ColorPicker=adds ShowAccentColors + IsColorPaletteVisible swatches + IsColorSpectrumVisible toggle; ColorPickerButton (Toolkit)=compact button+flyout wrapper",
    };

    /// <summary>
    /// Maps each <c>controlId</c> (the lowercase <c>UniqueId</c> from
    /// <c>ControlInfoData.json</c>) to its family key in <see cref="FamilyGuide"/>.
    /// Keying on <c>controlId</c> instead of the (display) <c>ControlName</c> means
    /// upstream <c>Title</c> renames (e.g. <c>AppNotification</c> →
    /// <c>App notifications</c>) don't silently break our cross-control guidance.
    /// </summary>
    private static readonly Dictionary<string, string> ControlToFamily = new()
    {
        ["tabview"] = "Tabs",
        ["pivot"] = "Tabs",
        ["selectorbar"] = "Tabs",
        ["segmented"] = "Tabs",
        ["commandbar"] = "Toolbars",
        ["tabbedcommandbar"] = "Toolbars",
        ["contentdialog"] = "Popups",
        ["flyout"] = "Popups",
        ["menuflyout"] = "Popups",
        ["teachingtip"] = "Popups",
        ["infobar"] = "Popups",
        ["appnotification"] = "Popups",
        ["listview"] = "Collections",
        ["gridview"] = "Collections",
        ["itemsview"] = "Collections",
        ["itemsrepeater"] = "Collections",
        ["treeview"] = "Collections",
        ["textbox"] = "TextInput",
        ["richeditbox"] = "TextInput",
        ["autosuggestbox"] = "TextInput",
        ["combobox"] = "TextInput",
        ["tokenizingtextbox"] = "TextInput",
        ["richsuggestbox"] = "TextInput",
        ["numberbox"] = "Numeric",
        ["slider"] = "Numeric",
        ["rangeselector"] = "Numeric",
        ["navigationview"] = "Navigation",
        ["splitview"] = "Navigation",
        ["breadcrumbbar"] = "Navigation",
        ["settingscard"] = "Settings",
        ["settingsexpander"] = "Settings",
        ["gridsplitter"] = "Sizers",
        ["contentsizer"] = "Sizers",
        ["dockpanel"] = "LayoutPanels",
        ["wrappanel"] = "LayoutPanels",
        ["uniformgrid"] = "LayoutPanels",
        ["staggeredpanel"] = "LayoutPanels",
        ["colorpicker"] = "ColorPickers",
        ["colorpickerbutton"] = "ColorPickers",
    };

    /// <summary>
    /// Per-control pitfalls. ONLY control-specific guidance — cross-control "use X vs Y"
    /// disambiguation lives in <see cref="FamilyGuide"/> above. Keyed by <c>controlId</c>
    /// (lowercase <c>UniqueId</c>), same as <see cref="ControlToFamily"/>.
    /// </summary>
    private static readonly Dictionary<string, string[]> KnownPitfalls = new()
    {
        // ─── Data binding (covers x:Bind / Binding / DataTemplate / x:DataType) ───
        ["binding"] = [
            "x:Bind OneWay/TwoWay needs INotifyPropertyChanged on source. Easiest: inherit ViewModel from ObservableObject (CommunityToolkit.Mvvm), mark fields [ObservableProperty], collections ObservableCollection<T>. Else WMC1506 + UI silently never updates.",
            "x:Bind enforces target type at compile time. UIElement-typed prop bound to FrameworkElement-typed (e.g. TeachingTip.Target) → WMC1121. Bind to x:Name'd element, or expose prop as the more specific type.",
            "WinUI 3 has NO built-in BoolToVisibility / BoolToVisibilityInverter converter. Don't reference `{StaticResource BoolToVisibilityInverter}` — it will crash at startup with `0xC000027B` ResourceNotFound. Either: (a) write a custom IValueConverter and register it in App.xaml / Page.Resources before reference, or (b) use x:Bind with a method binding like `{x:Bind ViewModel.ShowIfDirectory(IsDirectory)}` returning a `Visibility`."
        ],
        ["templates"] = [
            "Every <DataTemplate> with x:Bind MUST set x:DataType — without it x:Bind silently falls back to {Binding} (no IntelliSense, no errors).",
            "x:Bind in a DataTemplate references the x:DataType item, NOT the parent Page's ViewModel. Use ElementName or RelativeSource to escape."
        ],

        // ─── Tabs ───
        ["tabview"] = [
            "TabCloseRequested provides args.Tab — don't construct TabViewTabCloseRequestedEventArgs manually.",
            "IsClosable on individual TabViewItem controls which tabs can be closed.",
            "Set VerticalAlignment=\"Stretch\" on TabView so content fills available space.",
            "TabViewItem.Content can be ANY UIElement (TextBox, Grid, UserControl); use Frame only for page navigation."
        ],

        // ─── Collections ───
        ["treeview"] = [
            "Don't use C# record/class as TreeViewNode.Content with x:Bind — WinRT can't roundtrip custom managed types through IInspectable.",
            "Data-bound trees: ItemsSource → DataTemplate with TreeViewItem.ItemsSource={x:Bind Children}.",
            "TreeViewItemTemplateSelector doesn't exist in WinUI 3 — use one DataTemplate with x:Bind, or ItemContainerStyleSelector + ItemTemplate.",
            "TreeViewItem has no .Icon — put Image/FontIcon/SymbolIcon as first child of horizontal StackPanel inside DataTemplate.",
            "File-explorer sidebar: ObservableCollection<FolderNode> with Children:ObservableCollection<FolderNode>; root DataTemplate binds ItemsSource={x:Bind Children}."
        ],
        ["listview"] = [
            "Don't wrap ListView in ScrollViewer — breaks virtualization.",
            "Prefer x:Bind in DataTemplates over Binding for performance.",
            "WinUI 3 has no DataGrid. For tables: ListView with Grid-based ItemTemplate (columns) + separate header Grid above; CommunityToolkit GridSplitter for resizable cols.",
            "Sortable columns: handle header Click events, re-sort ObservableCollection or use AdvancedCollectionView (Toolkit)."
        ],
        ["gridview"] = [
            "GridView has no built-in column resize — for spreadsheet UI use ListView + Grid ItemTemplate + GridSplitter."
        ],
        ["itemsrepeater"] = [
            "ItemsRepeater is a layout primitive — NO selection, NO scrolling. Wrap in ScrollViewer.",
            "x:Bind OneWay binding needs INPC source — see Binding entry."
        ],
        ["itemsview"] = [
            "x:Bind OneWay binding needs INPC source — see Binding entry."
        ],

        // ─── Popups ───
        ["contentdialog"] = [
            "Set XamlRoot = Content.XamlRoot before ShowAsync() in WinUI 3 desktop apps.",
            "Save/discard/cancel flows: provide all three of PrimaryButtonText, SecondaryButtonText, CloseButtonText."
        ],
        ["flyout"] = [
            "Flyout auto-dismisses on outside click; ShowMode='Standard' for explicit dismiss.",
            "Attach via FlyoutBase.AttachedFlyout or Button.Flyout."
        ],
        ["menuflyout"] = [
            "Items: MenuFlyoutItem / ToggleMenuFlyoutItem / MenuFlyoutSubItem."
        ],
        ["teachingtip"] = [
            "Without a Target, TeachingTip shows as a banner instead of near a control.",
            "TeachingTip.Target is FrameworkElement, NOT UIElement. x:Bind from UIElement-typed prop → WMC1121. Bind to x:Name'd element or expose as FrameworkElement (Image/TextBlock/Button work)."
        ],
        ["infobar"] = [
            "InfoBar auto-closes on user-click — bind IsOpen TwoWay."
        ],

        // ─── Navigation ───
        ["navigationview"] = [
            "MenuItems for static nav; MenuItemsSource for data-bound.",
            "Handle SelectionChanged, NOT ItemInvoked, for reliable navigation."
        ],
        ["splitview"] = [
            "DisplayMode='Inline'=always-visible pane; 'CompactInline'=icon strip; 'Overlay'=hamburger flyout."
        ],
        ["breadcrumbbar"] = [
            "BreadcrumbBar has no Items property — only ItemsSource."
        ],

        // ─── Window / titlebar ───
        // AppWindow / titlebar customization is one of the most-tripped-over areas
        // in WinUI 3 desktop. Agents routinely write WPF-style chrome code, miss
        // the SetTitleBar drag region, or hit InvalidCastException when packaged-app
        // assumptions leak into unpackaged builds. These pitfalls cover the cases
        // observed in benchmark trials that traffic in MainWindow / titlebar code.
        ["appwindow"] = [
            "WinUI 3 Window is NOT WPF Window — no Topmost / WindowState / WindowStyle. Use AppWindow APIs: SetTitleBar (custom titlebar drag region), Presenter (OverlappedPresenter for size/state), AppWindowTitleBar (BackgroundColor/ButtonForegroundColor).",
            "Get AppWindow via `WindowNative.GetWindowHandle(this)` + `Win32Interop.GetWindowIdFromWindow(hwnd)` + `AppWindow.GetFromWindowId(windowId)`. The Window class itself does NOT expose AppWindow directly in WinAppSDK 1.x.",
            "Custom titlebar: set `ExtendsContentIntoTitleBar=true` on the Window AND call `SetTitleBar(yourDragRegionElement)` — without the drag region, the window can't be moved by the user.",
            "Setting AppWindowTitleBar colors requires `AppWindowTitleBar.IsCustomizationSupported()` to be true (Win11 + 22000+ build). On Win10 the call silently no-ops; agents shouldn't fail-hard on color set.",
            "Centering / sizing: prefer `appWindow.Resize(new SizeInt32(w, h))` + `appWindow.Move(new PointInt32(x, y))` over `appWindow.MoveAndResize` for clarity. All values are in PHYSICAL pixels — multiply DIPs by current scale factor.",
            "Don't set `Window.Title` AND custom titlebar TextBlock — pick one. If `ExtendsContentIntoTitleBar=true`, the system titlebar is gone and only the custom XAML shows."
        ],
        ["appwindowtitlebar"] = [
            "Setting colors needs `AppWindowTitleBar.IsCustomizationSupported()` — false on older Win10 builds; the property setters silently no-op rather than throw, so guard or your branded chrome will appear unstyled.",
            "ExtendsContentIntoTitleBar replaces the system titlebar — your XAML must provide its OWN min/max/close buttons (or accept that there are none). Use `appWindow.TitleBar.ButtonBackgroundColor=Transparent` if you want the system buttons to show through over your custom chrome."
        ],

        // ─── Numeric ───
        ["numberbox"] = [
            "NumberBox.Value is double — Math.Round for integer scenarios.",
            "SpinButtonPlacementMode='Inline' shows +/- buttons.",
            "ValidationMode='InvalidInputOverwritten' auto-corrects invalid input."
        ],

        // ─── Text input ───
        ["autosuggestbox"] = [
            "Filter suggestions in TextChanged when reason==UserInput, NOT in SuggestionChosen."
        ],
        ["richeditbox"] = [
            "Content access: Document.GetText/SetText with TextGetOptions/TextSetOptions."
        ],
        ["richsuggestbox"] = [
            "Prefixes property defines trigger chars (e.g. '@#'); inline tokens tracked in Tokens collection."
        ],
        ["combobox"] = [
            "Bind SelectedItem/SelectedIndex, NOT SelectedValue (unless SelectedValuePath is also set)."
        ],

        // ─── Settings ───
        ["settingscard"] = [
            "Don't build settings UI with plain StackPanel+ToggleSwitch — use SettingsCard (Win11 standard).",
            "IsClickEnabled=True turns the card into a button (e.g. for nav to detail page)."
        ],
        ["settingsexpander"] = [
            "Items collection holds child SettingsCards under one collapsible header."
        ],

        // ─── Sizers ───
        ["gridsplitter"] = [
            "Place in an Auto-width column between two content columns.",
            "ResizeBehavior='BasedOnAlignment' for between-columns; ResizeDirection='Auto' infers."
        ],

        // ─── Layout ───
        ["dockpanel"] = [
            "LastChildFill=True makes last child fill remaining space.",
            "Dock attached property on children: Top/Bottom/Left/Right."
        ],
        ["wrappanel"] = [
            "For virtualized wrap: use WrapLayout (Toolkit) inside ItemsRepeater."
        ],
        ["uniformgrid"] = [
            "All cells equal-sized; specify Rows OR Columns, the other auto-calculates."
        ],
        ["staggeredpanel"] = [
            "For virtualized masonry: StaggeredLayout (Toolkit) inside ItemsRepeater."
        ],

        // ─── Toolbars ───
        ["commandbar"] = [
            "PrimaryCommands=always-visible; SecondaryCommands=overflow menu."
        ],

        // ─── Other commonly-confused controls ───
        ["border"] = [
            "Border has no .Cursor in WinUI 3 (WPF holdover). Override ProtectedCursor on a custom UserControl hosting the Border, or set ProtectedCursor on nearest parent FrameworkElement deriving from Control.",
            "Clickable border: wrap with Button Style=\"{StaticResource TransparentButtonStyle}\" — don't catch pointer events on Border directly."
        ],
        ["webview2"] = [
            "Always call EnsureCoreWebView2Async() before using CoreWebView2 properties.",
            "NavigateToString(html) loads inline HTML without a URL."
        ],
        ["expander"] = [
            "Expander.IsExpanded TwoWay binding needs explicit x:Bind Mode=TwoWay (default doesn't work)."
        ],
        ["menubar"] = [
            "Place MenuBar in title bar or at top of window for standard layout."
        ],
        ["advancedcollectionview"] = [
            "Wrap ObservableCollection with AdvancedCollectionView for sorting/filtering/grouping without modifying source.",
            "Call RefreshFilter() after changing the Filter predicate."
        ],
    };

    /// <summary>Result payload combining specific pitfalls with the optional family guide.</summary>
    public readonly record struct NotesPayload(string[] Pitfalls, string? FamilyName, string? FamilyGuide);

    /// <summary>Look up pitfalls + family guidance for a scenario.</summary>
    /// <param name="controlId">The lowercase <c>UniqueId</c> stored on
    /// <see cref="Scenario.ControlId"/> — NOT the display <c>ControlName</c>.
    /// Using <c>controlId</c> as the key means upstream <c>Title</c> renames
    /// (e.g. <c>AppNotification</c> → <c>App notifications</c>) can't silently
    /// stop us from attaching the family guide.</param>
    public static NotesPayload Get(string controlId)
    {
        var pitfalls = KnownPitfalls.TryGetValue(controlId, out var p) ? p : Array.Empty<string>();
        string? famName = null, famGuide = null;
        if (ControlToFamily.TryGetValue(controlId, out var fk) && FamilyGuide.TryGetValue(fk, out var guide))
        {
            famName = fk;
            famGuide = guide;
        }
        return new NotesPayload(pitfalls, famName, famGuide);
    }

    /// <summary>Backward-compat: just the pitfalls (no family).</summary>
    public static string[] GetNotes(string controlId) => Get(controlId).Pitfalls;

    /// <summary>All controlIds referenced anywhere in Notes — used by unit tests
    /// to guard against orphan keys after upstream renames.</summary>
    internal static IEnumerable<string> AllReferencedControlIds()
    {
        foreach (var k in KnownPitfalls.Keys) yield return k;
        foreach (var k in ControlToFamily.Keys) yield return k;
    }
}