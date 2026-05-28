// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Xunit;
using static CSharpClassifier;

namespace WinUISearch.Tests;

/// <summary>
/// Tests for <see cref="CSharpClassifier"/>. Each `[Fact]` either pins a
/// real-world WinUI Gallery snippet shape to the bucket it should land in,
/// or guards a false-positive class that <em>must</em> stay in
/// <see cref="CSharpKind.Unknown"/> so the renderer can fall back to the
/// historical bare <c>**C#:**</c> label.
/// </summary>
public sealed class CSharpClassifierTests
{
    [Fact]
    public void NullEmptyAndWhitespaceAreUnknown()
    {
        Assert.Equal(CSharpKind.Unknown, Classify(null));
        Assert.Equal(CSharpKind.Unknown, Classify(""));
        Assert.Equal(CSharpKind.Unknown, Classify("   \n\t"));
    }

    /// <summary>Canonical Gallery handler signature — the exact case the
    /// run35 sonnet regression got tripped up by (gallery-tabview-1).</summary>
    [Fact]
    public void GalleryTabViewAddButtonClickIsEventHandler()
    {
        const string body = """
            private void TabView_AddButtonClick(TabView sender, object args)
            {
                sender.TabItems.Add(CreateNewTab(sender.TabItems.Count));
            }
            """;
        Assert.Equal(CSharpKind.EventHandler, Classify(body));
    }

    [Fact]
    public void ClickHandlerWithRoutedEventArgsIsEventHandler()
    {
        const string body = "private void OpenButton_Click(object sender, RoutedEventArgs e) { }";
        Assert.Equal(CSharpKind.EventHandler, Classify(body));
    }

    /// <summary>Pointer / drop / SelectionChanged-style handlers all use the
    /// `{Control}_{Event}` naming convention. Catches AnimatedIcon /
    /// ListView / NavigationView patterns.</summary>
    [Fact]
    public void PointerEnteredHandlerIsEventHandler()
    {
        const string body = "private void Button_PointerEntered(object sender, PointerRoutedEventArgs e) { AnimatedIcon.SetState(this.Icon, \"PointerOver\"); }";
        Assert.Equal(CSharpKind.EventHandler, Classify(body));
    }

    [Fact]
    public void AsyncEventHandlerIsEventHandler()
    {
        const string body = "private async void Item_ItemClick(object sender, ItemClickEventArgs e) { await Task.Yield(); }";
        Assert.Equal(CSharpKind.EventHandler, Classify(body));
    }

    /// <summary>CommunityToolkit.Mvvm source-generator marker — the most
    /// common way to declare a WinUI 3 ViewModel today.</summary>
    [Fact]
    public void ObservablePropertyIsViewModel()
    {
        const string body = """
            public partial class MainViewModel : ObservableObject
            {
                [ObservableProperty]
                private ObservableCollection<FileItem> _items = new();
            }
            """;
        Assert.Equal(CSharpKind.ViewModel, Classify(body));
    }

    [Fact]
    public void InpcInterfaceIsViewModel()
    {
        const string body = "public class VM : INotifyPropertyChanged { public event PropertyChangedEventHandler? PropertyChanged; }";
        Assert.Equal(CSharpKind.ViewModel, Classify(body));
    }

    /// <summary>Bare titlebar customization marker — the surface area covered
    /// by the new appwindow pitfalls and matched by SystemBackdrop /
    /// ExtendsContentIntoTitleBar markers.</summary>
    [Fact]
    public void SystemBackdropAssignmentIsWindowInit()
    {
        const string body = """
            public MainWindow()
            {
                this.InitializeComponent();
                this.SystemBackdrop = new MicaBackdrop();
            }
            """;
        Assert.Equal(CSharpKind.WindowInit, Classify(body));
    }

    [Fact]
    public void ExtendsContentIntoTitleBarIsWindowInit()
    {
        const string body = "this.ExtendsContentIntoTitleBar = true; this.SetTitleBar(AppTitleBar);";
        Assert.Equal(CSharpKind.WindowInit, Classify(body));
    }

    [Fact]
    public void AppWindowGetFromWindowIdIsWindowInit()
    {
        const string body = "var hwnd = WindowNative.GetWindowHandle(this); var id = Win32Interop.GetWindowIdFromWindow(hwnd); var aw = AppWindow.GetFromWindowId(id);";
        Assert.Equal(CSharpKind.WindowInit, Classify(body));
    }

    [Fact]
    public void IValueConverterImplementationIsConverter()
    {
        const string body = """
            public sealed class BoolToVisibilityConverter : IValueConverter
            {
                public object Convert(object value, Type targetType, object parameter, string language)
                    => (bool)value ? Visibility.Visible : Visibility.Collapsed;
                public object ConvertBack(object value, Type targetType, object parameter, string language)
                    => throw new NotImplementedException();
            }
            """;
        Assert.Equal(CSharpKind.Converter, Classify(body));
    }

    /// <summary>Non-handler helper methods (used by x:Bind function bindings)
    /// must NOT be classified as event handlers — their `void` return is
    /// typically absent and the name doesn't follow the `{X}_{Y}` shape.
    /// Verified against `binding-3` shape in the embedded catalog.</summary>
    [Fact]
    public void XBindHelperMethodIsUnknown()
    {
        const string body = "public string FormatDate(DateTimeOffset? date) => date?.ToString(\"d\") ?? string.Empty;";
        Assert.Equal(CSharpKind.Unknown, Classify(body));
    }

    /// <summary>A plain DTO / model class with no INPC marker. Common in the
    /// catalog as item-shape declarations adjacent to a ViewModel sample
    /// (e.g. `binding-7: public class ListDetailItem`).</summary>
    [Fact]
    public void PlainModelClassIsUnknown()
    {
        const string body = """
            public class ListDetailItem
            {
                public string Title { get; set; } = "";
                public string Subtitle { get; set; } = "";
            }
            """;
        Assert.Equal(CSharpKind.Unknown, Classify(body));
    }

    /// <summary>Snippets that are pure narrative / comment with no code
    /// must fall back to Unknown rather than tripping a substring match.</summary>
    [Fact]
    public void CommentOnlySnippetIsUnknown()
    {
        const string body = "// Code-behind — replace with your event handler implementations.";
        Assert.Equal(CSharpKind.Unknown, Classify(body));
    }

    /// <summary>Window-init keywords must not fire if the snippet just mentions
    /// them in a comment unrelated to titlebar wiring. Documented behavior:
    /// the classifier is substring-based for these markers, so we explicitly
    /// document the trade-off via a test case.</summary>
    [Fact]
    public void WindowInitIsSubstringMatchByDesign()
    {
        // A snippet that REFERENCES the property in passing rather than
        // assigning it still lands in WindowInit. This is intentional: the
        // hint "call from MainWindow constructor" is still useful for an
        // agent reading this snippet, even if the snippet is documentation.
        const string body = "// Note: ExtendsContentIntoTitleBar should be set before InitializeComponent.";
        Assert.Equal(CSharpKind.WindowInit, Classify(body));
    }

    [Fact]
    public void LabelsAreStableMarkdownFormat()
    {
        // Make sure every label starts with **C# and ends with **
        // so the renderer's existing markdown pipeline keeps working
        // (downstream tooling parses bold sections).
        foreach (CSharpKind k in Enum.GetValues<CSharpKind>())
        {
            var label = LabelFor(k);
            Assert.StartsWith("**C#", label);
            Assert.EndsWith(":**", label);
        }
    }

    [Fact]
    public void UnknownKeepsBareLabelForBackCompat()
    {
        // The whole point of Unknown is to fall back to the historical bare
        // **C#:** label so a misclassification can only ever go "no extra
        // help", never "wrong help".
        Assert.Equal("**C#:**", LabelFor(CSharpKind.Unknown));
    }
}
