// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Reflection;
using System.Text.Json;

internal static class DataLoader
{
    public static Scenario[] LoadGalleryScenarios()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("gallery-scenarios.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.ScenarioArray)!;
    }

    public static Scenario[] LoadToolkitScenarios()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("toolkit-scenarios.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.ScenarioArray)!;
    }

    public static CorePattern[] LoadCorePatterns()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("core-patterns.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.CorePatternArray)!;
    }

    public static Dictionary<string, string[]> LoadGalleryTags()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("gallery-tags.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringStringArray)!;
    }

    public static Dictionary<string, string[]> LoadToolkitTags()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("toolkit-tags.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringStringArray)!;
    }

    /// <summary>Author-curated keywords from toolkit md frontmatter — short
    /// list of high-quality intent terms scored at higher BM25 weight than
    /// auto-extracted tags. Empty/missing → no extra signal.</summary>
    public static Dictionary<string, string[]> LoadToolkitKeywords()
    {
        var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("toolkit-keywords.json");
        if (stream == null) return new();
        using (stream)
        {
            return JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringStringArray) ?? new();
        }
    }
}
