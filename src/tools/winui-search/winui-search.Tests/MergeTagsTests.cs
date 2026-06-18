// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Xunit;

namespace WinUISearch.Tests;

/// <summary>
/// Tests for <see cref="GalleryFetcher.MergeTags(string, string[], string[])"/>
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
            embedded: new[] { "button", "action" });
        Assert.Equal(new[] { "click", "push button", "command", "button", "action" }, result);
    }

    [Fact]
    public void UpstreamOnlyWhenEmbeddedIsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "xamlresources",
            upstream: new[] { "ResourceDictionary", "StaticResource", "ThemeResource" },
            embedded: null);
        // Casing normalised to lowercase
        Assert.Equal(new[] { "resourcedictionary", "staticresource", "themeresource" }, result);
    }

    [Fact]
    public void EmbeddedOnlyWhenUpstreamIsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "jumplist-system",
            upstream: null,
            embedded: new[] { "jumplist", "taskbar", "shortcut" });
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
            embedded: new[] { "button", "click", "action" });
        Assert.Equal(new[] { "click", "command", "button", "action" }, result);
    }

    [Fact]
    public void CaseInsensitiveDedupe()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "button",
            upstream: new[] { "Click", "Command" },
            embedded: new[] { "click", "command", "press" });
        Assert.Equal(new[] { "click", "command", "press" }, result);
    }

    [Fact]
    public void BothSourcesMergeNormally()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: new[] { "alpha" },
            embedded: new[] { "beta" });
        Assert.Equal(new[] { "alpha", "beta" }, result);
    }

    [Fact]
    public void BothNullReturnsEmpty()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "myctrl",
            upstream: null,
            embedded: null);
        Assert.Empty(result);
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
            embedded: new[] { "use", "moose" });
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
            embedded: new[] { "  also-valid  " });
        Assert.Equal(new[] { "valid", "also-valid" }, result);
    }

    [Fact]
    public void EmptyArraysTreatedSameAsNull()
    {
        var result = GalleryFetcher.MergeTags(
            controlId: "x",
            upstream: System.Array.Empty<string>(),
            embedded: System.Array.Empty<string>());
        Assert.Empty(result);
    }
}
