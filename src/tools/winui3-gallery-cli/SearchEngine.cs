internal sealed class SearchEngine
{
    private readonly Scenario[] _scenarios;
    private readonly CorePattern[] _corePatterns;
    private readonly Dictionary<string, string[]> _enrichmentTags;
    private readonly Dictionary<string, List<Scenario>> _scenariosByControl;
    private readonly string[] _uniqueControls;

    public SearchEngine(Scenario[] scenarios, CorePattern[] corePatterns, Dictionary<string, string[]> enrichmentTags)
    {
        _scenarios = scenarios;
        _corePatterns = corePatterns;
        _enrichmentTags = enrichmentTags;

        _scenariosByControl = new();
        foreach (var s in scenarios)
        {
            if (!_scenariosByControl.TryGetValue(s.ControlId, out var list))
            {
                list = new List<Scenario>();
                _scenariosByControl[s.ControlId] = list;
            }
            list.Add(s);
        }
        _uniqueControls = _scenariosByControl.Keys.ToArray();
    }

    public record SearchResult(string Id, string Scenario, string Type, double Score);

    /// <summary>Two-layer search: find controls first, then pick best scenario.</summary>
    public List<SearchResult> Search(string query, int maxResults = 5)
    {
        var queryWords = BM25.Tokenize(query);
        if (queryWords.Length == 0) return [];
        var queryLower = query.ToLowerInvariant();

        // Build docs for core patterns
        var coreDocs = _corePatterns.Select(p => BM25.BuildDoc(
            (string.Join(" ", p.Tags), 3.0),
            (p.Scenario, 2.0),
            (p.Description, 1.0),
            (p.Id, 1.0)
        )).ToArray();

        // Build docs for gallery controls
        var controlDocs = _uniqueControls.Select(controlId =>
        {
            var enrichTags = _enrichmentTags.TryGetValue(controlId, out var tags) ? tags : [];
            var scenarios = _scenariosByControl[controlId];
            var controlName = scenarios[0].ControlName;
            return BM25.BuildDoc(
                (controlName, 3.0),
                (controlId, 3.0),
                (string.Join(" ", enrichTags), 3.0),
                (scenarios[0].HeaderText, 1.5)
            );
        }).ToArray();

        var allDocs = coreDocs.Concat(controlDocs).ToArray();
        var corpus = BM25.BuildCorpus(allDocs);

        var results = new List<SearchResult>();

        // Score core patterns
        for (int i = 0; i < _corePatterns.Length; i++)
        {
            var s = BM25.Score(coreDocs[i], queryWords, corpus);
            if (s > 0) results.Add(new(_corePatterns[i].Id, _corePatterns[i].Scenario, "core", s));
        }

        // Score gallery controls, then pick best scenario
        for (int i = 0; i < _uniqueControls.Length; i++)
        {
            var s = BM25.Score(controlDocs[i], queryWords, corpus);
            var controlName = _scenariosByControl[_uniqueControls[i]][0].ControlName;
            if (controlName.Length > 0 && queryLower.Contains(controlName.ToLowerInvariant()))
                s *= 2.0;
            if (s <= 0) continue;

            var scenarios = _scenariosByControl[_uniqueControls[i]];
            var bestScenario = PickBestScenario(scenarios, queryWords);
            results.Add(new($"gallery-{bestScenario.Id}", $"{bestScenario.ControlName}: {bestScenario.HeaderText}", "gallery", s));
        }

        results.Sort((a, b) => b.Score.CompareTo(a.Score));
        return results.Take(maxResults).ToList();
    }

    private Scenario PickBestScenario(List<Scenario> scenarios, string[] queryWords)
    {
        if (scenarios.Count == 1) return scenarios[0];

        var scenDocs = scenarios.Select(s => BM25.BuildDoc(
            (s.HeaderText, 2.0),
            (s.ControlName, 1.0)
        )).ToArray();
        var corpus = BM25.BuildCorpus(scenDocs);

        int bestIdx = 0;
        double bestScore = 0;
        for (int i = 0; i < scenarios.Count; i++)
        {
            var s = BM25.Score(scenDocs[i], queryWords, corpus);
            if (s > bestScore) { bestScore = s; bestIdx = i; }
        }
        return scenarios[bestIdx];
    }

    public (string formatted, bool found) GetPattern(string id)
    {
        // Check core patterns
        var core = _corePatterns.FirstOrDefault(p => p.Id == id);
        if (core != null) return (FormatCorePattern(core), true);

        // Check gallery scenarios
        var galleryId = id.StartsWith("gallery-") ? id[8..] : id;
        var scenario = _scenarios.FirstOrDefault(s => s.Id == galleryId)
                    ?? _scenarios.FirstOrDefault(s => s.ControlId == galleryId);
        if (scenario != null) return (FormatScenario(scenario), true);

        return ($"Pattern '{id}' not found.", false);
    }

    public IEnumerable<(string id, string scenario)> ListAll()
    {
        foreach (var p in _corePatterns)
            yield return (p.Id, p.Scenario);

        var seen = new HashSet<string>();
        foreach (var s in _scenarios)
        {
            if (seen.Add(s.ControlId))
                yield return ($"gallery-{s.Id}", $"{s.ControlName}: {s.HeaderText}");
        }
    }

    private static string FormatCorePattern(CorePattern p)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"## {p.Scenario}");
        sb.AppendLine();
        sb.AppendLine(p.Description);
        if (p.Prerequisites.Length > 0)
        {
            sb.AppendLine();
            sb.AppendLine("**Prerequisites:**");
            foreach (var pre in p.Prerequisites) sb.AppendLine($"- {pre}");
        }
        if (p.Xaml != null)
        {
            sb.AppendLine();
            sb.AppendLine("**XAML:**");
            sb.AppendLine("```xml");
            sb.AppendLine(p.Xaml);
            sb.AppendLine("```");
        }
        sb.AppendLine();
        sb.AppendLine("**C#:**");
        sb.AppendLine("```csharp");
        sb.AppendLine(p.CSharp);
        sb.AppendLine("```");
        if (p.Notes.Length > 0)
        {
            sb.AppendLine();
            sb.AppendLine("**Important:**");
            foreach (var n in p.Notes) sb.AppendLine($"- {n}");
        }
        return sb.ToString();
    }

    private static string FormatScenario(Scenario s)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"## {s.ControlName}: {s.HeaderText}");
        sb.AppendLine();
        sb.AppendLine(s.HeaderText);
        if (s.Xaml != null)
        {
            sb.AppendLine();
            sb.AppendLine("**XAML:**");
            sb.AppendLine("```xml");
            sb.AppendLine(s.Xaml);
            sb.AppendLine("```");
        }
        if (s.CSharp != null)
        {
            sb.AppendLine();
            sb.AppendLine("**C#:**");
            sb.AppendLine("```csharp");
            sb.AppendLine(s.CSharp);
            sb.AppendLine("```");
        }
        var notes = Notes.GetNotes(s.ControlName);
        if (notes.Length > 0)
        {
            sb.AppendLine();
            sb.AppendLine("**Important:**");
            foreach (var n in notes) sb.AppendLine($"- {n}");
        }
        return sb.ToString();
    }
}
