// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json;

/// <summary>
/// Data contributed by a search provider: its scenarios plus the per-control
/// tag and keyword dictionaries. Tag/keyword keys are bare controlIds — the
/// engine namespaces them by provider id (<c>{providerId}:{controlId}</c>).
/// </summary>
internal sealed record ProviderData(
    Scenario[] Scenarios,
    Dictionary<string, string[]> Tags,
    Dictionary<string, string[]> Keywords)
{
    public static ProviderData Empty { get; } =
        new(Array.Empty<Scenario>(), new(), new());
}

/// <summary>
/// A source of WinUI scenarios (WinUI Gallery, Community Toolkit, …). A single
/// stable <see cref="Id"/> ties together everything downstream: it is the
/// <c>Scenario.Source</c> value, the on-disk cache subdirectory, the scenario
/// id prefix (<c>{Id}-…</c>), the <c>--source</c> token, and the composite
/// tag/keyword key namespace. Register a new provider in
/// <see cref="ProviderRegistry.All"/> and the rest of the tool picks it up.
/// </summary>
internal interface ISearchProvider
{
    /// <summary>Lowercase, stable identifier, e.g. <c>"gallery"</c> / <c>"toolkit"</c>.</summary>
    string Id { get; }

    /// <summary>Human-readable heading used by <c>winui-search list</c>.</summary>
    string DisplayName { get; }

    /// <summary>Hot-path load: cached or embedded data. Never hits the network.</summary>
    ProviderData Load();

    /// <summary><c>update</c>-path refresh: fetch from GitHub and rewrite the cache.</summary>
    Task RefreshFromGitHubAsync();
}

/// <summary>
/// Boilerplate shared by every GitHub-backed provider: the on-disk cache
/// protocol (schema-version stamp + 7-day TTL + atomic writes) and the
/// embedded-snapshot fallback. Concrete providers only supply their identity,
/// their embedded snapshot, and their GitHub fetch.
/// </summary>
internal abstract class CachedProviderBase : ISearchProvider
{
    public abstract string Id { get; }
    public abstract string DisplayName { get; }

    private static readonly TimeSpan CacheTtl = TimeSpan.FromDays(7);

    private string CacheDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "winui-search", "cache", Id);

    /// <summary>Fully-prepared embedded snapshot (tags already cleaned).</summary>
    protected abstract ProviderData LoadEmbedded();

    /// <summary>Fully-prepared GitHub fetch (tags already cleaned). Return
    /// <see cref="ProviderData.Empty"/> to leave the cache untouched.</summary>
    protected abstract Task<ProviderData> FetchAsync();

    /// <summary>Hook to re-normalize tags read back from cache. Defaults to
    /// identity; providers that clean tags on write override this to match.</summary>
    protected virtual Dictionary<string, string[]> NormalizeTagsOnRead(
        Dictionary<string, string[]> tags) => tags;

    public ProviderData Load()
    {
        var cached = TryReadCache();
        if (cached != null) return cached;

        // Cache miss/stale: serve embedded data immediately (no GitHub fetch on
        // the hot path) and prime the cache from it. A stale GitHub refresh is
        // kicked off separately by BackgroundUpdater.
        var embedded = LoadEmbedded();
        TryWriteCache(embedded);
        return embedded;
    }

    public async Task RefreshFromGitHubAsync()
    {
        var data = await FetchAsync();
        if (data.Scenarios.Length > 0) TryWriteCache(data);
    }

    private ProviderData? TryReadCache()
    {
        var scenariosPath = Path.Combine(CacheDir, "scenarios.json");
        var tagsPath = Path.Combine(CacheDir, "tags.json");
        var keywordsPath = Path.Combine(CacheDir, "keywords.json");
        var timestampPath = Path.Combine(CacheDir, "last-updated.txt");
        var versionPath = Path.Combine(CacheDir, "schema-version.txt");

        if (!File.Exists(scenariosPath) || !File.Exists(tagsPath)
            || !File.Exists(timestampPath) || !File.Exists(versionPath))
            return null;

        try
        {
            if (File.ReadAllText(versionPath).Trim() != CacheVersion.Current) return null;
            var lastUpdated = BackgroundUpdater.ReadTimestamp(timestampPath);
            if (!lastUpdated.HasValue || DateTime.UtcNow - lastUpdated.Value >= CacheTtl)
                return null;

            var scenarios = JsonSerializer.Deserialize(
                File.ReadAllText(scenariosPath), JsonContext.Default.ScenarioArray);
            var tags = JsonSerializer.Deserialize(
                File.ReadAllText(tagsPath), JsonContext.Default.DictionaryStringStringArray);
            if (scenarios == null || scenarios.Length == 0 || tags == null) return null;

            Dictionary<string, string[]>? keywords = null;
            if (File.Exists(keywordsPath))
            {
                try
                {
                    keywords = JsonSerializer.Deserialize(
                        File.ReadAllText(keywordsPath), JsonContext.Default.DictionaryStringStringArray);
                }
                catch { keywords = null; }
            }

            return new ProviderData(scenarios, NormalizeTagsOnRead(tags), keywords ?? new());
        }
        catch { return null; }
    }

    private void TryWriteCache(ProviderData data)
    {
        try
        {
            var scenariosPath = Path.Combine(CacheDir, "scenarios.json");
            var tagsPath = Path.Combine(CacheDir, "tags.json");
            var keywordsPath = Path.Combine(CacheDir, "keywords.json");
            var timestampPath = Path.Combine(CacheDir, "last-updated.txt");
            var versionPath = Path.Combine(CacheDir, "schema-version.txt");

            // Atomic per-file writes (temp + rename) so a crash mid-sequence can't
            // leave truncated JSON. Order: data first, version next, timestamp LAST,
            // so a partially-written set is detected as still-stale on next read
            // (no fresh timestamp ⇒ Load() falls back to embedded again).
            BackgroundUpdater.AtomicWriteAllText(scenariosPath,
                JsonSerializer.Serialize(data.Scenarios, JsonContext.Default.ScenarioArray));
            BackgroundUpdater.AtomicWriteAllText(tagsPath,
                JsonSerializer.Serialize(data.Tags, JsonContext.Default.DictionaryStringStringArray));
            if (data.Keywords.Count > 0)
                BackgroundUpdater.AtomicWriteAllText(keywordsPath,
                    JsonSerializer.Serialize(data.Keywords, JsonContext.Default.DictionaryStringStringArray));
            BackgroundUpdater.AtomicWriteAllText(versionPath, CacheVersion.Current);
            BackgroundUpdater.AtomicWriteAllText(timestampPath, DateTime.UtcNow.ToString("o"));
        }
        catch { /* cache write is best-effort */ }
    }
}

/// <summary>
/// The ordered set of scenario providers. This is the single place to register
/// a new source; <see cref="Program"/> and <see cref="SearchEngine"/> are
/// driven entirely off this list (plus the special-cased curated core patterns).
/// </summary>
internal static class ProviderRegistry
{
    /// <summary>All scenario providers, in display order (gallery first).</summary>
    public static readonly ISearchProvider[] All =
    {
        new GalleryProvider(),
        new ToolkitProvider(),
        new ReactorProvider(),
    };

    /// <summary>Provider ids plus the pseudo-source <c>"core"</c> — the valid
    /// values for <c>--source</c>.</summary>
    public static IEnumerable<string> SourceFilterValues =>
        All.Select(p => p.Id).Append("core");

    public static bool IsValidSourceFilter(string source) =>
        SourceFilterValues.Any(s => string.Equals(s, source, StringComparison.OrdinalIgnoreCase));

    /// <summary>Provider whose <c>{Id}-</c> prefix matches <paramref name="scenarioId"/>, if any.</summary>
    public static ISearchProvider? ForScenarioId(string scenarioId) =>
        All.FirstOrDefault(p => scenarioId.StartsWith($"{p.Id}-", StringComparison.Ordinal));
}
