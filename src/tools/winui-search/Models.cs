// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false)]
[JsonSerializable(typeof(CorePattern[]))]
[JsonSerializable(typeof(Dictionary<string, string[]>))]
[JsonSerializable(typeof(Dictionary<string, ControlEntry>))]
internal partial class JsonContext : JsonSerializerContext
{
    // Relaxed encoder so XAML angle brackets (<, >) and ampersands (&) are
    // written as-is instead of \u003C/\u003E/\u0026. This cuts ~30% off
    // gallery-scenarios.json (XAML-heavy) and makes the file human-readable
    // / git-diffable. Safe because the JSON is never embedded in HTML.
    private static readonly JsonSerializerOptions RelaxedOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };

    private static readonly JsonSerializerOptions RelaxedIndentedOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    /// <summary>Compact relaxed encoding for runtime cache files.</summary>
    public static JsonContext Relaxed { get; } = new(RelaxedOptions);

    /// <summary>Indented relaxed encoding for embedded Data/*.json snapshots (human-readable, git-diffable).</summary>
    public static JsonContext RelaxedIndented { get; } = new(RelaxedIndentedOptions);
}

internal sealed class Scenario
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("controlId")] public string ControlId { get; set; } = "";
    [JsonPropertyName("controlName")] public string ControlName { get; set; } = "";
    [JsonPropertyName("headerText")] public string HeaderText { get; set; } = "";
    [JsonPropertyName("xaml")] public string? Xaml { get; set; }
    [JsonPropertyName("csharp")] public string? CSharp { get; set; }
    /// <summary>"gallery" or "toolkit". Drives id prefix and metadata output.</summary>
    [JsonPropertyName("source")] public string Source { get; set; } = "gallery";
    /// <summary>NuGet package required to use this control (toolkit only).</summary>
    [JsonPropertyName("nugetPackage")] public string? NuGetPackage { get; set; }
    /// <summary>XAML namespace declarations needed (e.g., xmlns:controls="...") (toolkit only).</summary>
    [JsonPropertyName("xmlnsImports")] public string[] XmlnsImports { get; set; } = [];
    /// <summary>Longer description from ControlInfoData.json (Gallery only).</summary>
    [JsonPropertyName("description")] public string? Description { get; set; }
    /// <summary>Control-level one-line concept summary. For gallery: ControlInfoData.Subtitle
    /// (short, median 68 chars). For toolkit: md frontmatter description. Surfaced in search
    /// list as "[gallery] Name — &lt;summary&gt;".</summary>
    [JsonPropertyName("controlDescription")] public string? ControlDescription { get; set; }
    /// <summary>Related WinUI 3 controls — names of "see also" alternatives/pairings (Gallery only).</summary>
    [JsonPropertyName("relatedControls")] public string[] RelatedControls { get; set; } = [];
    /// <summary>API namespace from ControlInfoData.json (Gallery only). Surfaced in output
    /// only when non-default — helps agents pick the right `using`/`xmlns` for long-tail
    /// controls in Microsoft.Windows.*, Microsoft.UI.Windowing, etc. Empty when unknown
    /// or when the standard Microsoft.UI.Xaml.Controls namespace is enough.</summary>
    [JsonPropertyName("apiNamespace")] public string? ApiNamespace { get; set; }
}

internal sealed class CorePattern
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("scenario")] public string Scenario { get; set; } = "";
    [JsonPropertyName("tags")] public string[] Tags { get; set; } = [];
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("prerequisites")] public string[] Prerequisites { get; set; } = [];
    [JsonPropertyName("xaml")] public string? Xaml { get; set; }
    [JsonPropertyName("csharp")] public string CSharp { get; set; } = "";
    [JsonPropertyName("notes")] public string[] Notes { get; set; } = [];
}

/// <summary>
/// Hierarchical control entry: shared metadata + child scenarios.
/// This is the on-disk format for gallery-scenarios.json and toolkit-scenarios.json.
/// </summary>
internal sealed class ControlEntry
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("description")] public string? Description { get; set; }
    [JsonPropertyName("tags")] public string[] Tags { get; set; } = [];
    /// <summary>Author-curated high-weight keywords (toolkit only).</summary>
    [JsonPropertyName("keywords")] public string[] Keywords { get; set; } = [];
    /// <summary>"gallery" or "toolkit".</summary>
    [JsonPropertyName("source")] public string Source { get; set; } = "gallery";
    [JsonPropertyName("relatedControls")] public string[] RelatedControls { get; set; } = [];
    [JsonPropertyName("apiNamespace")] public string? ApiNamespace { get; set; }
    /// <summary>NuGet package required (toolkit only).</summary>
    [JsonPropertyName("nugetPackage")] public string? NuGetPackage { get; set; }
    /// <summary>XAML namespace declarations needed (toolkit only).</summary>
    [JsonPropertyName("xmlnsImports")] public string[] XmlnsImports { get; set; } = [];
    [JsonPropertyName("scenarios")] public ScenarioEntry[] Scenarios { get; set; } = [];
}

/// <summary>A single code sample within a control.</summary>
internal sealed class ScenarioEntry
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("headerText")] public string HeaderText { get; set; } = "";
    [JsonPropertyName("xaml")] public string? Xaml { get; set; }
    [JsonPropertyName("csharp")] public string? CSharp { get; set; }
    /// <summary>Per-scenario description (distinct from control-level description).</summary>
    [JsonPropertyName("description")] public string? Description { get; set; }
}
