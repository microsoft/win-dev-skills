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

        // Force-refresh on update: clear cache, then pull fresh data from GitHub.
        // Hot path commands (search/get/list) never fetch from GitHub — they hit cache
        // or embedded fallback for fast, reliable response. They DO opportunistically
        // spawn a background `update --background` child if the cache is >7 days old.
        if (command == "update")
        {
            bool isBackground = BackgroundUpdater.IsBackgroundInvocation(args);
            BackgroundUpdater.DebugLogPublic($"update entered (isBackground={isBackground})");
            bool gallerySucceeded = false;
            bool toolkitSucceeded = false;
            // Foreground update participates in the same lock protocol as the
            // background updater so a hot-path-spawned `update --background` child
            // doesn't write the same cache files concurrently with us. Background
            // invocations already hold the lock (acquired by TryKickoffIfStale before
            // spawn), so we only acquire here for the foreground path.
            bool acquiredForeground = false;
            if (!isBackground)
            {
                acquiredForeground = BackgroundUpdater.TryAcquireLock();
                if (!acquiredForeground)
                {
                    Console.Error.WriteLine(
                        "Note: a background refresh appears to be in progress. " +
                        "Proceeding with foreground update anyway (atomic writes prevent corruption).");
                }
            }
            try
            {
                if (!isBackground) ForceFetch();
                try
                {
                    GalleryFetcher.RefreshFromGitHub();
                    gallerySucceeded = true;
                    BackgroundUpdater.DebugLogPublic("Gallery refresh OK");
                }
                catch (Exception e)
                {
                    BackgroundUpdater.DebugLogPublic($"Gallery refresh failed: {e.GetType().Name}: {e.Message}");
                    if (!isBackground) Console.Error.WriteLine($"Gallery refresh failed: {e.Message}");
                }
                try
                {
                    ToolkitFetcher.RefreshFromGitHub();
                    toolkitSucceeded = true;
                    BackgroundUpdater.DebugLogPublic("Toolkit refresh OK");
                }
                catch (Exception e)
                {
                    BackgroundUpdater.DebugLogPublic($"Toolkit refresh failed: {e.GetType().Name}: {e.Message}");
                    if (!isBackground) Console.Error.WriteLine($"Toolkit refresh failed: {e.Message}");
                }
                if (!isBackground)
                {
                    if (gallerySucceeded && toolkitSucceeded)
                    {
                        Console.WriteLine("Cache refreshed from GitHub.");
                    }
                    else if (gallerySucceeded || toolkitSucceeded)
                    {
                        Console.WriteLine(
                            $"Cache partially refreshed: gallery={(gallerySucceeded ? "OK" : "FAILED")}, " +
                            $"toolkit={(toolkitSucceeded ? "OK" : "FAILED")} (failed sources fall back to embedded snapshots)");
                    }
                    else
                    {
                        Console.WriteLine("Cache refresh failed (search still works via embedded snapshots).");
                    }
                }
            }
            finally
            {
                if (gallerySucceeded && toolkitSucceeded) BackgroundUpdater.MarkSuccess();
                else BackgroundUpdater.MarkAttempt();
                // Release the lock we own — for background invocations that's the lock
                // TryKickoffIfStale acquired before spawning us; for foreground that's
                // the lock we acquired above (only release if we successfully acquired).
                if (isBackground || acquiredForeground) BackgroundUpdater.ReleaseLock();
            }
            return (gallerySucceeded && toolkitSucceeded) ? 0 : 1;
        }

        var (galleryScenarios, galleryTags) = GalleryFetcher.Load();
        var (toolkitScenarios, toolkitTags, toolkitKeywords) = ToolkitFetcher.Load();
        var allScenarios = galleryScenarios.Concat(toolkitScenarios).ToArray();

        // Merge gallery + toolkit tags/keywords using composite "{source}:{controlId}"
        // keys so colliding controlIds (gallery + toolkit both expose `colorpicker`,
        // `wrappanel`) don't overwrite each other. SearchEngine looks them up by the
        // same composite key it uses for scenario grouping.
        var allTags = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in galleryTags) allTags[$"gallery:{kv.Key}"] = kv.Value;
        foreach (var kv in toolkitTags) allTags[$"toolkit:{kv.Key}"] = kv.Value;

        var allKeywords = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in toolkitKeywords) allKeywords[$"toolkit:{kv.Key}"] = kv.Value;

        var engine = new SearchEngine(
            allScenarios,
            DataLoader.LoadCorePatterns(),
            allTags,
            allKeywords
        );

        return command switch
        {
            "search" => RunWithBackgroundRefresh(() => RunSearch(engine, args.Skip(1).ToArray())),
            "get" => RunWithBackgroundRefresh(() => RunGet(engine, args.Skip(1).ToArray())),
            "list" => RunWithBackgroundRefresh(() => RunList(engine, args.Skip(1).ToArray())),
            "debug" => RunWithBackgroundRefresh(() => RunDebug(engine, args.Skip(1).ToArray())),
            _ => PrintUsage()
        };
    }

    /// <summary>Run a hot-path command, then opportunistically spawn a background
    /// cache refresh if the GitHub cache is stale (>7d). The spawn is fire-and-forget;
    /// the user has already received their answer by the time it kicks off.</summary>
    private static int RunWithBackgroundRefresh(Func<int> action)
    {
        var exit = action();
        BackgroundUpdater.TryKickoffIfStale();
        return exit;
    }

    private static int RunDebug(SearchEngine engine, string[] args)
    {
        var query = string.Join(" ", args);
        Console.WriteLine($"Query: \"{query}\"");
        Console.WriteLine($"Preprocessed: \"{Synonyms.Preprocess(query)}\"");
        var tokens = BM25.Tokenize(Synonyms.Preprocess(query));
        Console.WriteLine($"Tokens: [{string.Join(", ", tokens)}]");
        Console.WriteLine($"Expanded: [{string.Join(", ", Synonyms.Expand(tokens))}]");
        Console.WriteLine();
        var groups = engine.SearchGrouped(query, maxControls: 20, maxScenariosPerControl: 1, applyFloor: false);
        Console.WriteLine($"Top {groups.Count} groups (no floor):");
        foreach (var g in groups)
        {
            var boostMark = g.HasNameBoost ? "★" : " ";
            Console.WriteLine($"  {boostMark} {g.Score,7:F3}  [{g.Source}] {g.ControlName}  ({g.Scenarios[0].Id})");
        }
        return 0;
    }

    private static int RunSearch(SearchEngine engine, string[] args)
    {
        int max = 3;
        var queries = new List<string>();
        string? sourceFilter = null;

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--max" && i + 1 < args.Length)
            {
                int.TryParse(args[++i], out max);
            }
            else if (args[i] == "--source" && i + 1 < args.Length)
            {
                var raw = args[++i];
                sourceFilter = raw.ToLowerInvariant();
                if (sourceFilter is not ("gallery" or "toolkit" or "core"))
                {
                    Console.Error.WriteLine($"--source must be one of: gallery, toolkit, core (got: {raw})");
                    return 1;
                }
            }
            else if (!args[i].StartsWith('-'))
            {
                queries.Add(args[i]);
            }
        }

        if (queries.Count == 0)
        {
            Console.Error.WriteLine("Usage: winui-search search \"<query>\" [\"<query2>\" ...] [--max N] [--source gallery|toolkit|core]");
            Console.Error.WriteLine("       Pass each query as a SEPARATE quoted argument to batch them in one call.");
            return 1;
        }

        // Single query: legacy behaviour (treat all positional args as one phrase if just one was passed)
        if (queries.Count == 1)
        {
            return EmitSearch(engine, queries[0], max, header: false, sourceFilter: sourceFilter);
        }

        // Batch: emit each query under its own header.
        // NOTE: do NOT emit blank separator lines anywhere in this output — the
        // Copilot CLI tool-result capture collapses runs of blank lines, which would
        // glue "### Query N" headers onto the previous query's last row. Single
        // newlines (one per logical line) survive intact and keep markers parseable.
        var batchSuffix = sourceFilter != null ? $" (--source {sourceFilter})" : "";
        Console.WriteLine($"Batch search: {queries.Count} queries{batchSuffix}");
        // Track control IDs already shown in this batch. When a later query would
        // re-surface the same control with a noticeably weaker score, suppress it
        // and emit a one-line back-reference instead — saves tokens AND signals to
        // the agent that they already have this info.
        var shownControls = new Dictionary<string, (int queryIndex, double topScore)>(StringComparer.OrdinalIgnoreCase);
        int rc = 0;
        for (int i = 0; i < queries.Count; i++)
        {
            Console.WriteLine($"### Query {i + 1}: \"{queries[i]}\"");
            int qrc = EmitSearch(engine, queries[i], max, header: true, queryIndex: i + 1, shownControls: shownControls, sourceFilter: sourceFilter);
            if (qrc != 0) rc = qrc;
        }
        Console.WriteLine("To get full code, pass one or more IDs to: winui-search get <id> [<id2> ...]");
        return rc;
    }

    private static int EmitSearch(
        SearchEngine engine, string query, int max, bool header,
        int queryIndex = 0,
        Dictionary<string, (int queryIndex, double topScore)>? shownControls = null,
        string? sourceFilter = null)
    {
        var groups = engine.SearchGrouped(query, maxControls: max, maxScenariosPerControl: 3, sourceFilter: sourceFilter);
        if (groups.Count == 0)
        {
            var noMatchSuffix = sourceFilter != null ? $" (--source {sourceFilter})" : "";
            Console.WriteLine($"No patterns found for: \"{query}\"{noMatchSuffix}");
            return 0;
        }
        if (!header) Console.WriteLine($"Found {groups.Count} matches for \"{query}\":");
        foreach (var g in groups)
        {
            // Batch-level dedup: if this control already appeared in a previous query
            // and the current query's score isn't materially higher (≥1.3×), emit only
            // a back-reference. This handles the SettingsCard/SettingsExpander overlap
            // and similar agent-side query duplication.
            var dedupKey = g.Source == "core"
                ? $"core:{g.Scenarios[0].Id}"
                : $"{g.Source}:{g.ControlName}";
            if (shownControls != null
                && shownControls.TryGetValue(dedupKey, out var prev)
                && prev.queryIndex != queryIndex
                && g.Score < prev.topScore * 1.3)
            {
                Console.WriteLine($"  [{g.Source}] {g.ControlName} → see Query {prev.queryIndex}");
                continue;
            }
            if (shownControls != null && !shownControls.ContainsKey(dedupKey))
                shownControls[dedupKey] = (queryIndex, g.Score);

            // Header line: e.g. "[gallery] MenuFlyout (7 scenarios)" / "[core]"
            if (g.Source == "core")
            {
                // Core patterns are single-row; flat output with no group header.
                var row = g.Scenarios[0];
                Console.WriteLine($"  {row.Id}: {CompressHeader(row.Header, controlName: "")}");
                continue;
            }

            // Compact control header: "[source] Name — <Subtitle>" (when available).
            // Subtitle (median 68 chars) is short enough to keep tokens reasonable while
            // giving the agent a one-liner so it can decide whether to drill into `get`.
            // The earlier scenario-count summary ("showing top 3 of 8") stays dropped —
            // low information density per token.
            var ctrlSummary = !string.IsNullOrEmpty(g.ControlDescription)
                ? $" — {g.ControlDescription}"
                : "";
            Console.WriteLine($"  [{g.Source}] {g.ControlName}{ctrlSummary}");
            foreach (var row in g.Scenarios)
            {
                // Compact: "<id>: <header>" — saves ~10-15 chars/row vs. fixed-width padding,
                // and the colon stays scannable for both humans and agents.
                var compactHeader = CompressHeader(row.Header, g.ControlName);
                var rowDesc = !string.IsNullOrEmpty(row.Description) && row.Description != g.ControlDescription
                    ? $" — {row.Description}"
                    : "";
                Console.WriteLine($"    {row.Id}: {compactHeader}{rowDesc}");
            }
        }
        if (!header) Console.WriteLine("To get full code: winui-search get <id> [<id2> ...]");
        return 0;
    }

    /// <summary>
    /// Trim filler from a scenario header at display time. Cheap, deterministic,
    /// reversible (full text still in cache). Specifically:
    ///   • Drop leading article ("A "/"An "/"The ").
    ///   • Drop trailing " by &lt;ControlName&gt;" / " using &lt;ControlName&gt;" — the
    ///     control name is already shown on the group header above.
    ///   • Replace "with support for" → "supports".
    /// Saves ~10–15 chars per row across a typical search result.
    /// </summary>
    private static string CompressHeader(string h, string controlName)
    {
        if (string.IsNullOrEmpty(h)) return h;

        // Leading article — "A "/"An "/"The " at the very start. We don't require the
        // next char to be uppercase because some headers are "A basic …" (lowercase b)
        // and we still want the article gone. False-positive risk is negligible —
        // no real header begins with "A "+single-letter token.
        if (h.StartsWith("A ", StringComparison.Ordinal))   h = h[2..];
        else if (h.StartsWith("An ", StringComparison.Ordinal))  h = h[3..];
        else if (h.StartsWith("The ", StringComparison.Ordinal)) h = h[4..];

        if (!string.IsNullOrEmpty(controlName))
        {
            var byPattern    = " by "    + controlName;
            var usingPattern = " using " + controlName;
            if (h.EndsWith(byPattern,    StringComparison.OrdinalIgnoreCase))
                h = h[..^byPattern.Length];
            else if (h.EndsWith(usingPattern, StringComparison.OrdinalIgnoreCase))
                h = h[..^usingPattern.Length];
        }

        h = System.Text.RegularExpressions.Regex.Replace(
            h, @"\bwith support for\b", "supports",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        return h.TrimEnd();
    }

    private static int RunGet(SearchEngine engine, string[] args)
    {
        if (args.Length == 0)
        {
            Console.Error.WriteLine("Usage: winui-search get <pattern-id> [<pattern-id2> ...]");
            Console.Error.WriteLine("       Pass multiple ids to batch them in one call.");
            return 1;
        }

        // Single id: print directly (no separator), preserve legacy output
        if (args.Length == 1)
        {
            var (formatted, found) = engine.GetPattern(args[0]);
            Console.WriteLine(formatted);
            return found ? 0 : 1;
        }

        // Batch: print each pattern with a clear separator and surface any not-found ids.
        // The separator is just "---" on its own line — surrounding blank lines would be
        // collapsed by the Copilot CLI tool-result capture (gluing it to neighboring
        // content), so we emit the separator alone.
        bool anyMissing = false;
        for (int i = 0; i < args.Length; i++)
        {
            if (i > 0)
            {
                Console.WriteLine("---");
            }
            var (formatted, found) = engine.GetPattern(args[i]);
            Console.WriteLine(formatted);
            if (!found) anyMissing = true;
        }
        return anyMissing ? 1 : 0;
    }

    private static int RunList(SearchEngine engine, string[] args)
    {
        string? sourceFilter = null;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--source" && i + 1 < args.Length)
            {
                var raw = args[++i];
                sourceFilter = raw.ToLowerInvariant();
                if (sourceFilter is not ("gallery" or "toolkit" or "core"))
                {
                    Console.Error.WriteLine($"--source must be one of: gallery, toolkit, core (got: {raw})");
                    return 1;
                }
            }
        }

        Console.WriteLine($"Available patterns{(sourceFilter != null ? $" (--source {sourceFilter})" : "")}:");
        Console.WriteLine();

        string? lastType = null;
        foreach (var (id, scenario) in engine.ListAll())
        {
            string type;
            string source;
            if (id.StartsWith("gallery-")) { type = "Gallery (WinUI 3)"; source = "gallery"; }
            else if (id.StartsWith("toolkit-")) { type = "CommunityToolkit"; source = "toolkit"; }
            else { type = "Core platform patterns"; source = "core"; }

            if (sourceFilter != null && source != sourceFilter) continue;

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
        // Delete only the per-source data subdirectories. Crucially, do NOT touch
        // the cache root, because BackgroundUpdater stores its coordination files
        // there (update.lock, last-github-update.txt, last-github-attempt.txt,
        // background.log). A recursive delete of the root would wipe the lock file
        // we may currently hold and break the single-writer guarantee against an
        // in-flight background updater.
        var cacheRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "winui-search", "cache");
        foreach (var sub in new[] { "gallery", "toolkit" })
        {
            var subDir = Path.Combine(cacheRoot, sub);
            if (Directory.Exists(subDir))
            {
                try { Directory.Delete(subDir, recursive: true); } catch { }
            }
        }
    }

    private static int PrintUsage()
    {
        Console.WriteLine("winui-search - WinUI 3 control pattern search");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  search \"<q1>\" [\"<q2>\" ...] [--max N] [--source S]   Search controls (batch one focused query per feature)");
        Console.WriteLine("  get <id1> [<id2> ...]                                Get full XAML + C# (batch up to 3 IDs per call)");
        Console.WriteLine("  list [--source S]                                    List all available patterns");
        Console.WriteLine("  debug \"<query>\"                                      Diagnostic dump: tokens, synonym expansion, top matches (no score floor)");
        Console.WriteLine("  update                                               Force refresh from GitHub (clears cache; auto-runs in background when stale)");
        Console.WriteLine();
        Console.WriteLine("  --source S    Restrict to one of: gallery, toolkit, core (applies to search + list)");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  winui-search search \"tabbed document interface\" \"settings card\" \"info bar status\"");
        Console.WriteLine("  winui-search search \"file picker\" --source core");
        Console.WriteLine("  winui-search list --source toolkit");
        Console.WriteLine("  winui-search get gallery-tabview-1 toolkit-settingscard-9 gallery-infobar-1");
        Console.WriteLine("  winui-search get jumplist-recent-files");
        Console.WriteLine("  winui-search debug \"settings card with toggle\"");
        return 1;
    }
}

