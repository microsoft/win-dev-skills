// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Xunit;

namespace WinUISearch.Tests;

/// <summary>
/// Tests for <see cref="GalleryFetcher.ParseSampleSidecar(string)"/> — the small
/// line-oriented parser that consumes WinUI-Gallery PR 2175 sample sidecars
/// (Samples/&lt;Control&gt;/&lt;Sample&gt;.txt). The parser is a pure function and
/// every failure mode that's been observed in the wild (or that the regex
/// pipeline used to mis-handle) gets a dedicated test case here.
/// </summary>
public sealed class ParseSampleSidecarTests
{
    [Fact]
    public void EmptyInputReturnsAllNulls()
    {
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar("");
        Assert.Null(h);
        Assert.Null(x);
        Assert.Null(c);
    }

    [Fact]
    public void NullishWhitespaceOnlyReturnsAllNulls()
    {
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar("\n   \r\n\t\n");
        Assert.Null(h);
        Assert.Null(x);
        Assert.Null(c);
    }

    [Fact]
    public void HeaderXamlAndCsharpAllParsed()
    {
        const string body = """
            --- header
            An AppBarButton with a bitmap icon.
            --- xaml
            <AppBarButton Label="Save"/>
            --- c#
            void OnClick() { }
            """;
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("An AppBarButton with a bitmap icon.", h);
        Assert.Equal("<AppBarButton Label=\"Save\"/>", x);
        Assert.Equal("void OnClick() { }", c);
    }

    /// <summary>The upstream marker is `--- c#` with a hash; an earlier draft of the
    /// parser only recognised `csharp` and the C# body bled into the preceding XAML
    /// buffer. Regression-guard that exact bug.</summary>
    [Fact]
    public void CSharpHashVariantIsRecognisedAndDoesNotBleedIntoXaml()
    {
        const string body = """
            --- xaml
            <Button Content="Hi"/>
            --- c#
            private void OnClick(object sender, RoutedEventArgs e) { }
            """;
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Null(h);
        Assert.Equal("<Button Content=\"Hi\"/>", x);
        Assert.Equal("private void OnClick(object sender, RoutedEventArgs e) { }", c);
        // Hard-assert no contamination — the literal `--- c#` line must NOT be in xaml.
        Assert.DoesNotContain("--- c#", x);
        Assert.DoesNotContain("private void", x);
    }

    /// <summary>`csharp` (no hash) is accepted as a synonym so embedded fallback
    /// JSON written by an earlier draft can still round-trip through the parser.</summary>
    [Fact]
    public void CSharpLongVariantIsAlsoRecognised()
    {
        const string body = """
            --- xaml
            <Button/>
            --- csharp
            void M() { }
            """;
        var (_, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("<Button/>", x);
        Assert.Equal("void M() { }", c);
    }

    [Fact]
    public void SectionsAreParsedRegardlessOfOrder()
    {
        const string body = """
            --- c#
            void M() { }
            --- header
            Hello
            --- xaml
            <Tag/>
            """;
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("Hello", h);
        Assert.Equal("<Tag/>", x);
        Assert.Equal("void M() { }", c);
    }

    [Fact]
    public void MissingSectionsReturnNullForJustThatSection()
    {
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar("--- header\nOnly a header");
        Assert.Equal("Only a header", h);
        Assert.Null(x);
        Assert.Null(c);
    }

    /// <summary>HTTP responses use \n, but Windows-authored sidecars may bring \r\n.
    /// The trailing \r must not leak into the section name (else `header\r` is
    /// unrecognised and the title goes missing).</summary>
    [Fact]
    public void WindowsLineEndingsAreHandled()
    {
        const string body = "--- header\r\nWith CRLF\r\n--- xaml\r\n<X/>\r\n";
        var (h, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("With CRLF", h);
        Assert.Equal("<X/>", x);
    }

    /// <summary>A line that starts with `---` but names an unknown section must NOT
    /// be appended to the previous section's buffer (the original `--- c#` bug
    /// trigger). It also must not start a new bucket of any recognised kind.</summary>
    [Fact]
    public void UnknownSectionMarkerDropsItsContent()
    {
        const string body = """
            --- xaml
            <Real/>
            --- futureSection
            this content must be dropped
            and also this line
            --- c#
            void M() { }
            """;
        var (_, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("<Real/>", x);
        Assert.Equal("void M() { }", c);
        Assert.DoesNotContain("must be dropped", x ?? "");
        Assert.DoesNotContain("must be dropped", c ?? "");
    }

    /// <summary>If the sidecar accidentally repeats a section, prefer the first
    /// occurrence (`??=` semantics) — a misformatted upstream file shouldn't
    /// silently overwrite earlier content.</summary>
    [Fact]
    public void DuplicateSectionPrefersFirst()
    {
        const string body = """
            --- header
            First header
            --- header
            Second header
            """;
        var (h, _, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("First header", h);
    }

    /// <summary>XAML content can legitimately contain `<!-- divider -->` style
    /// comments. Those must never be confused with `---` section markers since
    /// they start with `&lt;`, not `-`.</summary>
    [Fact]
    public void XamlCommentsAreNotMistakenForSectionMarkers()
    {
        const string body = """
            --- xaml
            <StackPanel>
              <!-- This is a comment, not a section marker -->
              <Button/>
            </StackPanel>
            """;
        var (_, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.NotNull(x);
        Assert.Contains("<!-- This is a comment", x!);
        Assert.Contains("<Button/>", x!);
    }

    /// <summary>Multi-line XAML and C# bodies preserve internal line breaks so the
    /// downstream truncator can find safe `>` / `}` boundaries.</summary>
    [Fact]
    public void MultiLineContentPreservesLineBreaks()
    {
        const string body = """
            --- xaml
            <StackPanel>
                <Button x:Name="Btn1"/>
                <Button x:Name="Btn2"/>
            </StackPanel>
            """;
        var (_, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.NotNull(x);
        Assert.Contains("\n", x!);
        Assert.StartsWith("<StackPanel>", x);
        Assert.EndsWith("</StackPanel>", x);
    }

    /// <summary>Leading + trailing whitespace inside a section must be trimmed so
    /// `HeaderText` doesn't render with stray newlines in the search output.</summary>
    [Fact]
    public void SectionContentIsTrimmed()
    {
        const string body = """
            --- header

                Padded header

            --- xaml

                <X/>

            """;
        var (h, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("Padded header", h);
        Assert.Equal("<X/>", x);
    }

    /// <summary>A section with only whitespace content (no real text) should yield
    /// null for that section rather than an empty string. Empty strings would
    /// shadow later fallback paths in <c>FetchControlPageAsync</c>.</summary>
    [Fact]
    public void EmptySectionContentYieldsNull()
    {
        const string body = """
            --- header
            --- xaml
            <X/>
            """;
        var (h, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Null(h);
        Assert.Equal("<X/>", x);
    }

    /// <summary>Section markers with extra dashes (`-----`) or extra whitespace
    /// around the name still parse — upstream is consistent with three dashes
    /// today but we tolerate small drift.</summary>
    [Fact]
    public void ExtraDashesAndWhitespaceAroundSectionNameAreTolerated()
    {
        const string body = "-----   header   \nA\n-----  xaml  \n<X/>";
        var (h, x, _) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("A", h);
        Assert.Equal("<X/>", x);
    }

    /// <summary>Real-world fixture from the WinUI-Gallery repo (AnnotatedScrollBar
    /// linked sample) — the canonical case where the sidecar's per-sample C# is
    /// dramatically more focused than the old code-behind walk.</summary>
    [Fact]
    public void RealWorldFixtureAnnotatedScrollBar()
    {
        const string body = """
            --- header
            AnnotatedScrollBar linked to a ScrollView.
            --- xaml
            <ScrollView x:Name="scrollView"
                Background="LightGray" MaxWidth="800">
                <!-- ... -->
            </ScrollView>

            <AnnotatedScrollBar x:Name="annotatedScrollBar"
                DetailLabelRequested="AnnotatedScrollBar_DetailLabelRequested"/>
            --- c#
            private void AnnotatedScrollBarPage_Loaded(object sender, Microsoft.UI.Xaml.RoutedEventArgs e)
            {
                scrollView.ScrollPresenter.VerticalScrollController = annotatedScrollBar.ScrollController;
            }
            """;
        var (h, x, c) = GalleryFetcher.ParseSampleSidecar(body);
        Assert.Equal("AnnotatedScrollBar linked to a ScrollView.", h);
        Assert.NotNull(x);
        Assert.Contains("<AnnotatedScrollBar", x!);
        Assert.Contains("DetailLabelRequested", x!);
        Assert.NotNull(c);
        Assert.Contains("AnnotatedScrollBarPage_Loaded", c!);
        Assert.Contains("ScrollController", c!);
        // Crucially: the C# section content must not have leaked into the XAML.
        Assert.DoesNotContain("AnnotatedScrollBarPage_Loaded", x!);
    }
}
