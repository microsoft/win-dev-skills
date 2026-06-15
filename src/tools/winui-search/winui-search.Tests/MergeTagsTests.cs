// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Xunit;

namespace WinUISearch.Tests;

/// <summary>
/// Tests for <see cref="GalleryFetcher.MergeTags(string, string[], string[], string)"/>
/// — the pure function that combines tag sources for a single control in
/// priority order: upstream (PR 2185 <c>Tags</c>) → embedded (gallery-tags.json)
/// → text-extraction fallback. Lowercases, deduplicates, and strips stop words.
/// </summary>
public sealed class MergeTagsTests
{
    [Fact]
    public void UpstreamComesFirst()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "button",
            upstream: new[] { "click", "push button", "command" },
            embedded: new[] { "button", "action" },
            subtitleText: "");
        Assert.Equal(new[] { "click", "push button", "command", "button", "action" }, result);
    }

    [Fact]
    public void UpstreamOnlyWhenEmbeddedIsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "xamlresources",
            upstream: new[] { "ResourceDictionary", "StaticResource", "ThemeResource" },
            embedded: null,
            subtitleText: "");
        // Casing normalised to lowercase
        Assert.Equal(new[] { "resourcedictionary", "staticresource", "themeresource" }, result);
    }

    [Fact]
    public void EmbeddedOnlyWhenUpstreamIsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "jumplist-system",
            upstream: null,
            embedded: new[] { "jumplist", "taskbar", "shortcut" },
            subtitleText: "");
        Assert.Equal(new[] { "jumplist", "taskbar", "shortcut" }, result);
    }

    [Fact]
    public void DeduplicatesAcrossSourcesPreservingOrder()
    {
        // Embedded duplicates upstream's "click" — should appear only once,
        // at the upstream position.
        var result = GalleryFetcher.MergeTags(
            controlId: "button",
            upstream: new[] { "click", "command" },
            embedded: new[] { "button", "click", "action" },
            subtitleText: "");
        Assert.Equal(new[] { "click", "command", "button", "action" }, result);
    }

    [Fact]
    public void CaseInsensitiveDedupe()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "button",
            upstream: new[] { "Click", "Command" },
            embedded: new[] { "click", "command", "press" },
            subtitleText: "");
        Assert.Equal(new[] { "click", "command", "press" }, result);
    }

    [Fact]
    public void TextExtractionFallsBackOnlyWhenBothEmpty()
    {
        // When upstream + embedded both have content, the text extractor must
        // NOT run — otherwise the subtitle's noise words ("simple", "demo") would
        // pollute the curated tag list.
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: new[] { "alpha" },
            embedded: new[] { "beta" },
            subtitleText: "simple demo of the alpha control");
        Assert.Equal(new[] { "alpha", "beta" }, result);
    }

    [Fact]
    public void TextExtractionRunsWhenBothEmpty()
    {
        // Both null + subtitle present → fallback extraction kicks in.
        // ExtractTagsFromText always prepends the controlId, then adds 3+ char
        // alphabetic words after stop-word filtering. Words chosen here are
        // deliberately NOT in StopWords so the assertion is robust to stop-list
        // expansions.
        var result = GalleryFetcher.MergeTags(
            controlId: "myctrl",
            upstream: null,
            embedded: null,
            subtitleText: "Sketchpad composition primitive");
        Assert.Contains("myctrl", result);
        Assert.Contains("sketchpad", result);
        Assert.Contains("composition", result);
        Assert.Contains("primitive", result);
    }

    [Fact]
    public void StopWordsFilteredFromFinalOutput()
    {
        // "the" and "use" are in StopWords.Common — even when explicitly passed
        // via embedded, the final pass should drop them. "real"/"tag"/"moose"
        // are deliberately non-stopwords so we can assert they survive.
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: new[] { "the", "real", "tag" },
            embedded: new[] { "use", "moose" },
            subtitleText: "");
        Assert.DoesNotContain("the", result);
        Assert.DoesNotContain("use", result);
        Assert.Contains("real", result);
        Assert.Contains("tag", result);
        Assert.Contains("moose", result);
    }

    [Fact]
    public void WhitespaceAndEmptyEntriesSkipped()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: new[] { "", "  ", "valid", "\t\n" },
            embedded: new[] { "  also-valid  " },
            subtitleText: "");
        Assert.Equal(new[] { "valid", "also-valid" }, result);
    }

    [Fact]
    public void AllSourcesEmptyReturnsEmpty()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: null,
            embedded: null,
            subtitleText: "");
        Assert.Empty(result);
    }

    [Fact]
    public void EmptyArraysTreatedSameAsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: System.Array.Empty<string>(),
            embedded: System.Array.Empty<string>(),
            subtitleText: "alpha beta");
        // Both arrays empty → fallback to text extraction
        Assert.Contains("alpha", result);
        Assert.Contains("beta", result);
    }
}
