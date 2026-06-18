// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Reflection;
using System.Text.Json;

internal static class DataLoader
{
    public static (Scenario[] scenarios, Dictionary<string, string[]> tags, Dictionary<string, string[]> keywords) LoadGallery()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("gallery-scenarios.json")!;
        var controls = JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringControlEntry)!;
        return Expand(controls);
    }

    public static (Scenario[] scenarios, Dictionary<string, string[]> tags, Dictionary<string, string[]> keywords) LoadToolkit()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("toolkit-scenarios.json")!;
        var controls = JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringControlEntry)!;
        return Expand(controls);
    }

    public static CorePattern[] LoadCorePatterns()
    {
        using var stream = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("core-patterns.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.CorePatternArray)!;
    }

    /// <summary>Expand hierarchical ControlEntry dict into flat Scenario[] + tags dict + keywords dict
    /// that SearchEngine expects.</summary>
    internal static (Scenario[] scenarios, Dictionary<string, string[]> tags, Dictionary<string, string[]> keywords) Expand(
        Dictionary<string, ControlEntry> controls)
    {
        var scenarios = new List<Scenario>();
        var tags = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        var keywords = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var (controlId, ctrl) in controls)
        {
            if (ctrl.Tags.Length > 0) tags[controlId] = ctrl.Tags;
            if (ctrl.Keywords.Length > 0) keywords[controlId] = ctrl.Keywords;

            foreach (var s in ctrl.Scenarios)
            {
                scenarios.Add(new Scenario
                {
                    Id = s.Id,
                    ControlId = controlId,
                    ControlName = ctrl.Name,
                    HeaderText = s.HeaderText,
                    Xaml = s.Xaml,
                    CSharp = s.CSharp,
                    Source = ctrl.Source,
                    NuGetPackage = ctrl.NuGetPackage,
                    XmlnsImports = ctrl.XmlnsImports,
                    Description = s.Description,
                    ControlDescription = ctrl.Description,
                    RelatedControls = ctrl.RelatedControls,
                    ApiNamespace = ctrl.ApiNamespace,
                });
            }
        }

        return (scenarios.ToArray(), tags, keywords);
    }
}
