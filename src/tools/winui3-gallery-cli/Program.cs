internal class Program
{
    private static int Main(string[] args)
    {
        if (args.Length == 0)
        {
            PrintUsage();
            return 1;
        }

        var command = args[0].ToLowerInvariant();

        // Load scenarios: cached GitHub data > fresh fetch > embedded fallback
        var scenarios = command == "update"
            ? ForceFetch()
            : GalleryFetcher.LoadScenarios();

        var engine = new SearchEngine(
            scenarios,
            DataLoader.LoadCorePatterns(),
            DataLoader.LoadEnrichmentTags()
        );

        return command switch
        {
            "search" => RunSearch(engine, args.Skip(1).ToArray()),
            "get" => RunGet(engine, args.Skip(1).ToArray()),
            "list" => RunList(engine),
            "update" => 0, // already fetched above
            _ => PrintUsage()
        };
    }

    private static int RunSearch(SearchEngine engine, string[] args)
    {
        int max = 5;
        var queryParts = new List<string>();

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--max" && i + 1 < args.Length)
            {
                int.TryParse(args[++i], out max);
            }
            else if (!args[i].StartsWith('-'))
            {
                queryParts.Add(args[i]);
            }
        }

        var query = string.Join(" ", queryParts);
        if (string.IsNullOrWhiteSpace(query))
        {
            Console.Error.WriteLine("Usage: winui3-gallery search <query> [--max N]");
            return 1;
        }

        var results = engine.Search(query, max);
        if (results.Count == 0)
        {
            Console.WriteLine($"No patterns found for: \"{query}\"");
            return 0;
        }

        Console.WriteLine($"Found {results.Count} matches for \"{query}\":");
        foreach (var r in results)
        {
            Console.WriteLine($"  - {r.Id}: {r.Scenario}");
        }
        Console.WriteLine();
        Console.WriteLine("Use: winui3-gallery get <id>");
        return 0;
    }

    private static int RunGet(SearchEngine engine, string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: winui3-gallery get <pattern-id>");
            return 1;
        }

        var (formatted, found) = engine.GetPattern(args[0]);
        Console.WriteLine(formatted);
        return found ? 0 : 1;
    }

    private static int RunList(SearchEngine engine)
    {
        Console.WriteLine("Available patterns:");
        Console.WriteLine();

        string? lastType = null;
        foreach (var (id, scenario) in engine.ListAll())
        {
            var type = id.StartsWith("gallery-") ? "Gallery" : "Core";
            if (type != lastType)
            {
                if (lastType != null) Console.WriteLine();
                Console.WriteLine($"## {type} Patterns");
                lastType = type;
            }
            Console.WriteLine($"  - {id}: {scenario}");
        }
        return 0;
    }

    private static Scenario[] ForceFetch()
    {
        // Delete cache to force re-fetch
        var cacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "winui3-gallery", "cache");
        if (Directory.Exists(cacheDir))
        {
            try { Directory.Delete(cacheDir, true); } catch { }
        }
        return GalleryFetcher.LoadScenarios();
    }

    private static int PrintUsage()
    {
        Console.WriteLine("winui3-gallery - WinUI 3 control pattern search");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  search <query> [--max N]   Search for controls by description");
        Console.WriteLine("  get <id>                   Get full XAML + C# code for a pattern");
        Console.WriteLine("  list                       List all available patterns");
        Console.WriteLine("  update                     Force refresh from GitHub (clears cache)");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  winui3-gallery search \"tabbed document interface\"");
        Console.WriteLine("  winui3-gallery get gallery-tabview");
        Console.WriteLine("  winui3-gallery get jumplist-recent-files");
        return 1;
    }
}
