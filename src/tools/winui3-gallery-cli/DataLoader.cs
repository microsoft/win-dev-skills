using System.Reflection;
using System.Text.Json;

internal static class DataLoader
{
    public static Scenario[] LoadScenarios()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("scenario-index.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.ScenarioArray)!;
    }

    public static CorePattern[] LoadCorePatterns()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("core-patterns.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.CorePatternArray)!;
    }

    public static Dictionary<string, string[]> LoadEnrichmentTags()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("enrichment-tags.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringStringArray)!;
    }
}
