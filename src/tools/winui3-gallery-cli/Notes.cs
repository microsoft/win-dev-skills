internal static class Notes
{
    private static readonly Dictionary<string, string[]> KnownPitfalls = new()
    {
        ["TreeView"] = [
            "NEVER use custom .NET record/class types as TreeViewNode.Content with x:Bind DataTemplate — WinRT cannot roundtrip custom managed types through IInspectable.",
            "For data-bound trees, use ItemsSource with TreeViewItem in DataTemplate that binds its own ItemsSource to Children."
        ],
        ["TabView"] = [
            "TabCloseRequested provides the Tab via args.Tab — do NOT construct TabViewTabCloseRequestedEventArgs manually.",
            "Use IsClosable on individual TabViewItem to control which tabs can be closed.",
            "Always set VerticalAlignment=\"Stretch\" on TabView so its content fills the available space.",
            "TabViewItem.Content can be ANY UIElement (TextBox, Grid, UserControl) — do NOT use Frame unless you need page navigation."
        ],
        ["ContentDialog"] = [
            "Always set XamlRoot = Content.XamlRoot before ShowAsync() in WinUI 3 desktop apps.",
            "For save/discard/cancel flows, always provide PrimaryButtonText, SecondaryButtonText AND CloseButtonText."
        ],
        ["BreadcrumbBar"] = ["BreadcrumbBar has no Items property — only ItemsSource."],
        ["WebView2"] = [
            "Always call EnsureCoreWebView2Async() before using CoreWebView2 properties.",
            "NavigateToString(html) loads inline HTML content without needing a URL."
        ],
        ["NavigationView"] = [
            "Use NavigationView.MenuItems for static nav, or MenuItemsSource for data-bound.",
            "Handle SelectionChanged, not ItemInvoked, for reliable navigation."
        ],
        ["ListView"] = [
            "Avoid wrapping ListView in ScrollViewer — it breaks virtualization.",
            "Use x:Bind in DataTemplates for better performance vs Binding.",
            "WinUI 3 has no built-in DataGrid. For table/spreadsheet UIs, use ListView with a Grid-based ItemTemplate to create columns. Add column headers with a separate Grid above the ListView. Use GridSplitter from CommunityToolkit for resizable columns.",
            "For sortable columns, handle column header Click events and re-sort the ObservableCollection or use CollectionViewSource."
        ],
        ["ComboBox"] = ["Bind SelectedItem or SelectedIndex, not SelectedValue, unless you also set SelectedValuePath."],
        ["InfoBar"] = ["InfoBar auto-closes if IsOpen is bound and the user clicks the close button. Ensure two-way binding on IsOpen."],
        ["NumberBox"] = ["NumberBox.Value is double — use Math.Round for integer-only scenarios.", "Set SpinButtonPlacementMode='Inline' to show +/- buttons."],
        ["AutoSuggestBox"] = ["Handle TextChanged with reason == UserInput to filter suggestions. Don't filter on SuggestionChosen."],
        ["RichEditBox"] = ["Use Document.GetText/SetText with TextGetOptions/TextSetOptions for content access."],
        ["Expander"] = ["Expander does not support IsExpanded two-way binding by default — use x:Bind Mode=TwoWay."],
        ["MenuBar"] = ["MenuBar must be in the title bar area or at the top of the window for standard layout."],
        ["CommandBar"] = ["Use PrimaryCommands for always-visible actions, SecondaryCommands for overflow."],
        ["Flyout"] = ["Flyout auto-dismisses on outside click. Use ShowMode='Standard' for explicit dismiss."],
        ["TeachingTip"] = ["TeachingTip must have a Target set to appear near a control, or it shows as a banner."],
        // CommunityToolkit controls
        ["SettingsCard"] = [
            "Install CommunityToolkit.WinUI.Controls.SettingsControls via NuGet.",
            "Use SettingsCard for individual settings, SettingsExpander for grouped settings with sub-items.",
            "This is the standard Windows 11 Settings page pattern — do not build settings UI with plain StackPanel + ToggleSwitch."
        ],
        ["AdvancedCollectionView"] = [
            "Install CommunityToolkit.WinUI.Collections via NuGet.",
            "Wrap your ObservableCollection with AdvancedCollectionView for sorting, filtering and grouping without modifying the source.",
            "Call RefreshFilter() after changing the Filter predicate."
        ],
        ["GridSplitter"] = [
            "Install CommunityToolkit.WinUI.Controls.Sizers via NuGet.",
            "Place GridSplitter in an Auto-width column between two content columns."
        ],
        ["Segmented"] = ["Install CommunityToolkit.WinUI.Controls.Segmented via NuGet."],
        ["DockPanel"] = [
            "Install CommunityToolkit.WinUI.Controls.Primitives via NuGet.",
            "Set LastChildFill=True to make the last child fill remaining space."
        ],
    };

    public static string[] GetNotes(string controlName)
    {
        return KnownPitfalls.TryGetValue(controlName, out var notes) ? notes : [];
    }
}
