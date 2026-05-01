// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

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

        // Force-refresh on update
        if (command == "update")
        {
            ForceFetch();
        }

        var (galleryScenarios, galleryTags) = GalleryFetcher.Load();
        var (toolkitScenarios, toolkitTags) = ToolkitFetcher.Load();
        var allScenarios = galleryScenarios.Concat(toolkitScenarios).ToArray();

        // Merge gallery + toolkit tags
        var allTags = new Dictionary<string, string[]>(galleryTags);
        foreach (var kv in toolkitTags)
            allTags[kv.Key] = kv.Value;

        var engine = new SearchEngine(
            allScenarios,
            DataLoader.LoadCorePatterns(),
            allTags
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
            Console.Error.WriteLine("Usage: winui-search search <query> [--max N]");
            return 1;
        }

        var results = engine.Search(query, max);
        if (results.Count == 0)
        {
            Console.WriteLine($"No patterns found for: \"{query}\"");
            return 0;
        }

        Console.WriteLine($"Found {results.Count} matches for \"{query}\":");
        Console.WriteLine();
        foreach (var r in results)
        {
            Console.WriteLine($"  {r.Id}");
            Console.WriteLine($"    {r.Scenario}");
            Console.WriteLine();
        }
        Console.WriteLine("To get full code: winui-search get <id>");
        return 0;
    }

    private static int RunGet(SearchEngine engine, string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: winui-search get <pattern-id>");
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
            string type;
            if (id.StartsWith("gallery-")) type = "Gallery (WinUI 3)";
            else if (id.StartsWith("toolkit-")) type = "CommunityToolkit";
            else type = "Core platform patterns";

            if (type != lastType)
            {
                if (lastType != null) Console.WriteLine();
                Console.WriteLine($"## {type}");
                lastType = type;
            }
            Console.WriteLine($"  - {id}: {scenario}");
        }
        return 0;
    }

    private static void ForceFetch()
    {
        // Delete entire cache root to force re-fetch of both Gallery + Toolkit
        var cacheDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "winui-search", "cache");
        if (Directory.Exists(cacheDir))
        {
            try { Directory.Delete(cacheDir, true); } catch { }
        }
    }

    private static int PrintUsage()
    {
        Console.WriteLine("winui-search - WinUI 3 control pattern search");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  search <query> [--max N]   Search for controls by description");
        Console.WriteLine("  get <id>                   Get full XAML + C# code for a pattern");
        Console.WriteLine("  list                       List all available patterns");
        Console.WriteLine("  update                     Force refresh from GitHub (clears cache)");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  winui-search search \"tabbed document interface\"");
        Console.WriteLine("  winui-search get gallery-tabview");
        Console.WriteLine("  winui-search get jumplist-recent-files");
        return 1;
    }
}

