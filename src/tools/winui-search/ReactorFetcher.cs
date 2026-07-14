// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Net.Http;
using System.Text.Json;

/// <summary>
/// microsoft-ui-reactor ReactorGallery scenarios. Reads the purpose-built
/// <c>reactor-search-index.json</c> (a schema the Reactor team owns) and maps it
/// onto the internal <see cref="Scenario"/> model. Reactor samples are C#-only
/// declarative WinUI (<c>UseMemo</c>, <c>DataGrid(...)</c>, <c>Column&lt;T&gt;(...)</c>) —
/// kept verbatim, never run through the gallery/toolkit sample cleaners. There is
/// no XAML, so <see cref="Scenario.Xaml"/> stays null.
///
/// Each control's curated <c>keywords</c> become the 3.0-weighted enrichment tag
/// field (<see cref="ProviderData.Tags"/>); they are served VERBATIM — not
/// stop-word cleaned — so multi-word intent terms like "css layout" survive
/// (cleaning would drop the TagOnly stop word "layout" and break searches such as
/// "flex layout"). The 4 controls that declare control-level <c>usings</c>
/// (data-grid, docking, flex, property-grid) get those folded into each sample's
/// C# so the emitted snippet compiles standalone.
/// </summary>
internal static class ReactorFetcher
{
    private const string IndexUrl =
        "https://raw.githubusercontent.com/microsoft/microsoft-ui-reactor/main/samples/ReactorGallery/reactor-search-index.json";

    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders = { { "User-Agent", "winui-search/1.0" } },
        Timeout = TimeSpan.FromSeconds(30)
    };

    /// <summary>Embedded snapshot baked into the exe at build time — the offline
    /// fallback served when the on-disk cache is missing or stale. Tags are already
    /// verbatim (no cleaning applied on write, so none on read either).</summary>
    internal static (Scenario[] scenarios, Dictionary<string, string[]> tags) LoadEmbedded()
        => (DataLoader.LoadReactorScenarios(), DataLoader.LoadReactorTags());

    /// <summary>Fetch fresh scenarios + tags from GitHub (used by the `update`
    /// command). Reactor C# and curated keywords are kept verbatim.</summary>
    internal static async Task<(Scenario[] scenarios, Dictionary<string, string[]> tags)> FetchAsync()
    {
        var json = await Http.GetStringAsync(IndexUrl);
        return Parse(json);
    }

    /// <summary>Map the <c>reactor-search-index.json</c> document to
    /// <see cref="Scenario"/>[] + the per-control tag dictionary. Parsed with
    /// <see cref="JsonDocument"/> (AOT-safe, no reflection).</summary>
    internal static (Scenario[] scenarios, Dictionary<string, string[]> tags) Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var scenarios = new List<Scenario>();
        var tags = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("controls", out var controls)
            || controls.ValueKind != JsonValueKind.Array)
        {
            return (Array.Empty<Scenario>(), tags);
        }

        foreach (var control in controls.EnumerateArray())
        {
            var controlId = GetString(control, "id");
            if (string.IsNullOrEmpty(controlId)) continue;

            var controlName = GetString(control, "name");
            var controlDescription = GetString(control, "description");
            var apiNamespace = GetString(control, "apiNamespace");
            var nugetPackage = GetString(control, "nugetPackage");
            var relatedControls = GetStringArray(control, "relatedControls");
            var usings = GetStringArray(control, "usings");
            var keywords = GetStringArray(control, "keywords");

            // Curated keywords -> 3.0-weighted enrichment tag field, verbatim.
            if (keywords.Length > 0) tags[controlId] = keywords;

            // For controls that declare usings, prepend `using X;` lines + a blank
            // line to EACH sample's code so the declarative snippet compiles alone.
            var usingsPrefix = usings.Length > 0
                ? string.Concat(usings.Select(u => $"using {u};\n")) + "\n"
                : "";

            if (!control.TryGetProperty("samples", out var samples)
                || samples.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            var index = 0;
            foreach (var sample in samples.EnumerateArray())
            {
                index++;
                var header = GetString(sample, "header");
                var code = GetString(sample, "code");

                scenarios.Add(new Scenario
                {
                    Id = $"{controlId}-{index}",
                    ControlId = controlId,
                    ControlName = controlName,
                    HeaderText = header,
                    Xaml = null,
                    CSharp = usingsPrefix + code,
                    Source = "reactor",
                    NuGetPackage = string.IsNullOrEmpty(nugetPackage) ? null : nugetPackage,
                    ApiNamespace = string.IsNullOrEmpty(apiNamespace) ? null : apiNamespace,
                    ControlDescription = string.IsNullOrEmpty(controlDescription) ? null : controlDescription,
                    RelatedControls = relatedControls,
                });
            }
        }

        return (scenarios.ToArray(), tags);
    }

    private static string GetString(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? ""
            : "";

    private static string[] GetStringArray(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var v) || v.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();

        var list = new List<string>();
        foreach (var item in v.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String) continue;
            var s = item.GetString();
            if (!string.IsNullOrEmpty(s)) list.Add(s);
        }
        return list.ToArray();
    }
}
