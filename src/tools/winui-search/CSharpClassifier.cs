// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.RegularExpressions;

/// <summary>
/// Classify a C# snippet returned by `winui-search get` so that
/// <see cref="SearchEngine.RenderScenario"/> can pick a label that tells
/// the agent <em>what kind of code this is</em> and <em>where it belongs</em>,
/// rather than emitting a bare <c>**C#:**</c> header.
///
/// Motivation: in benchmark run35 (sonnet-4.5 / file-explorer-shell), the
/// agent treated <c>gallery-tabview-1</c>'s event-handler snippet as a
/// recipe for "construct the whole UI procedurally" and spent 9 extra turns
/// crashing on <c>mainGrid.Children.Add(treeView)</c> before refactoring to
/// a UserControl. A clarifying label like
/// <c>"C# (event handlers — pair with the XAML above)"</c> eliminates that
/// ambiguity at zero token cost.
///
/// The detector is intentionally <em>conservative</em>: it only fires on
/// stable, high-precision markers (well-known WinUI Gallery naming
/// conventions, CommunityToolkit.Mvvm attributes, AppWindow/Window
/// titlebar APIs, <c>IValueConverter</c>). Anything else falls through to
/// <see cref="CSharpKind.Unknown"/> → the renderer emits the original
/// <c>**C#:**</c> label, so a misclassification can only ever go
/// "no extra help", never "wrong help".
/// </summary>
internal static partial class CSharpClassifier
{
    /// <summary>Most stable marker for a Gallery-style event handler:
    /// <c>private void Foo_Bar(... RoutedEventArgs)</c> or any *EventArgs.
    /// WinUI Gallery uses the <c>{Origin}_{Event}</c> naming convention
    /// universally (see <see cref="GalleryFetcher"/>'s
    /// <c>EventHandlerRegex</c> which keys off the same shape).</summary>
    [GeneratedRegex(
        @"\b(?:private|protected|internal|public)\s+(?:async\s+|static\s+|override\s+|virtual\s+|sealed\s+|new\s+)*(?:void|Task)\s+\w+_\w+\s*\([^)]*?(?:RoutedEventArgs|EventArgs|args)\b",
        RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex EventHandlerRegex();

    public enum CSharpKind
    {
        Unknown,
        EventHandler,
        ViewModel,
        WindowInit,
        Converter,
    }

    public static CSharpKind Classify(string? csharp)
    {
        if (string.IsNullOrWhiteSpace(csharp)) return CSharpKind.Unknown;

        // Order matters: event handlers are the most common (167/262 across
        // the embedded catalog) so we check first to short-circuit. Window-init
        // and viewmodel checks are also high-precision keyword matches; they
        // rarely co-exist with event handlers so the order doesn't change the
        // classification of any real sample.
        if (EventHandlerRegex().IsMatch(csharp))
            return CSharpKind.EventHandler;

        // CommunityToolkit.Mvvm or plain INPC ViewModel.
        if (csharp.Contains("[ObservableProperty]")
            || csharp.Contains("[ObservableObject]")
            || csharp.Contains("ObservableObject")
            || csharp.Contains("INotifyPropertyChanged"))
            return CSharpKind.ViewModel;

        // WinAppSDK desktop window / titlebar init. These properties only
        // make sense in a Window subclass constructor or App.OnLaunched.
        if (csharp.Contains("this.SystemBackdrop")
            || csharp.Contains("AppWindow.GetFromWindowId")
            || csharp.Contains("WindowNative.GetWindowHandle")
            || csharp.Contains("ExtendsContentIntoTitleBar")
            || csharp.Contains("Win32Interop.GetWindowIdFromWindow")
            || csharp.Contains("appWindow.TitleBar"))
            return CSharpKind.WindowInit;

        // Custom value converter — needs registration as a resource before
        // it can be referenced from XAML's {StaticResource ...}.
        if (csharp.Contains("IValueConverter")
            || csharp.Contains(": IValueConverter"))
            return CSharpKind.Converter;

        return CSharpKind.Unknown;
    }

    /// <summary>Markdown label for a classified C# block. Returned without
    /// the trailing colon/newline — the caller wraps the code-fence as
    /// usual. <see cref="CSharpKind.Unknown"/> returns the historical
    /// <c>**C#:**</c> bare label so existing output is unchanged when the
    /// detector has no opinion.</summary>
    public static string LabelFor(CSharpKind kind) => kind switch
    {
        CSharpKind.EventHandler =>
            "**C# (event handlers — pair with the XAML above; put in your Page's code-behind):**",
        CSharpKind.ViewModel =>
            "**C# (ViewModel — set as Page DataContext or use as x:Bind target):**",
        CSharpKind.WindowInit =>
            "**C# (Window / titlebar init — call from your MainWindow constructor or App.OnLaunched):**",
        CSharpKind.Converter =>
            "**C# (value converter — register in App.xaml or Page.Resources before referencing from XAML):**",
        _ => "**C#:**",
    };
}
