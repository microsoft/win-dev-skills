// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

internal static partial class GalleryFetcher
{
    private const string ControlInfoUrl =
        "https://raw.githubusercontent.com/microsoft/WinUI-Gallery/main/WinUIGallery/Samples/Data/ControlInfoData.json";
    private const string ControlPagesBase =
        "https://raw.githubusercontent.com/microsoft/WinUI-Gallery/main/WinUIGallery/Samples/ControlPages/";
    private const string SampleCodeBase =
        "https://raw.githubusercontent.com/microsoft/WinUI-Gallery/main/WinUIGallery/Samples/SampleCode/";

    private static readonly TimeSpan CacheTtl = TimeSpan.FromDays(7);

    private static readonly string CacheDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "winui-search", "cache", "gallery");

    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders = { { "User-Agent", "winui3-gallery-cli/1.0" } },
        Timeout = TimeSpan.FromSeconds(30)
    };

    [GeneratedRegex(@"<controls:ControlExample\b[^>]*?HeaderText=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex ControlExampleHeaderRegex();

    /// <summary>First XML comment in a XAML snippet — used as a fallback header when
    /// the upstream ControlExample omits HeaderText (common for Accessibility samples).</summary>
    [GeneratedRegex(@"<!--\s*([\s\S]*?)\s*-->")]
    private static partial Regex FirstXmlCommentRegex();

    [GeneratedRegex(@"CSharpSource=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex CSharpSourceRegex();

    [GeneratedRegex(@"XamlSource=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex XamlSourceRegex();

    [GeneratedRegex(@"<controls:ControlExample\.(Xaml|CSharp)>\s*<x:String[^>]*>([\s\S]*?)</x:String>\s*</controls:ControlExample\.\1>", RegexOptions.IgnoreCase)]
    private static partial Regex InlineCodeRegex();

    [GeneratedRegex(@"\$\([^)]+\)")]
    private static partial Regex SubstitutionRegex();

    [GeneratedRegex(@"ms-appx:///Assets/SampleMedia/[^""'\s]+")]
    private static partial Regex SampleMediaRegex();

    [GeneratedRegex(@"x:Class=""WinUIGallery\.[^""]+""")]
    private static partial Regex GalleryClassRegex();

    [GeneratedRegex(@"typeof\(SamplePage\d+\)")]
    private static partial Regex SamplePageTypeRegex();

    [GeneratedRegex(@"SamplePage\d+")]
    private static partial Regex SamplePageNameRegex();

    /// <summary>Load scenarios + tags: use cache if fresh, otherwise fetch from GitHub. Fallback to embedded.</summary>
    public static (Scenario[] scenarios, Dictionary<string, string[]> tags) Load()
    {
        var scenarioCache = Path.Combine(CacheDir, "scenarios.json");
        var tagCache = Path.Combine(CacheDir, "tags.json");
        var timestampFile = Path.Combine(CacheDir, "last-updated.txt");
        var versionFile = Path.Combine(CacheDir, "schema-version.txt");

        // Check cache freshness AND schema version
        if (File.Exists(scenarioCache) && File.Exists(tagCache) && File.Exists(timestampFile) && File.Exists(versionFile))
        {
            var cachedVersion = File.ReadAllText(versionFile).Trim();
            var lastUpdated = BackgroundUpdater.ReadTimestamp(timestampFile);
            if (cachedVersion == CacheVersion.Current
                && lastUpdated.HasValue
                && DateTime.UtcNow - lastUpdated.Value < CacheTtl)
            {
                try
                {
                    var s = JsonSerializer.Deserialize(File.ReadAllText(scenarioCache), JsonContext.Default.ScenarioArray);
                    var t = JsonSerializer.Deserialize(File.ReadAllText(tagCache), JsonContext.Default.DictionaryStringStringArray);
                    if (s != null && s.Length > 0 && t != null) return (s, t);
                }
                catch { /* fall through to fetch */ }
            }
        }

        // Cache miss: serve embedded data immediately (no GitHub fetch on hot path).
        // GitHub fetching can take 30-60s on first call, which the runtime may interrupt
        // with a "still running" message that masks the actual output. Embedded data is
        // up-to-date as of the last tool build. Use `winui-search update` to update.
        var fallbackScenarios = DataLoader.LoadGalleryScenarios();
        var fallbackTags = CleanTags(DataLoader.LoadGalleryTags());
        try
        {
            // Atomic per-file writes (temp + rename) so a crash mid-sequence can't
            // leave a truncated JSON. Order: data first, version next, timestamp LAST,
            // so a partially-renamed set is detected as still-stale on next read
            // (no fresh timestamp ⇒ Load() falls back to embedded again instead of
            // serving fresh-but-truncated data).
            BackgroundUpdater.AtomicWriteAllText(scenarioCache, JsonSerializer.Serialize(fallbackScenarios, JsonContext.Default.ScenarioArray));
            BackgroundUpdater.AtomicWriteAllText(tagCache, JsonSerializer.Serialize(fallbackTags, JsonContext.Default.DictionaryStringStringArray));
            BackgroundUpdater.AtomicWriteAllText(versionFile, CacheVersion.Current);
            BackgroundUpdater.AtomicWriteAllText(timestampFile, DateTime.UtcNow.ToString("o"));
        }
        catch { /* cache write best-effort */ }
        return (fallbackScenarios, fallbackTags);
    }

    /// <summary>Fetch fresh data from GitHub and update the cache. Used by the `update` command.</summary>
    public static void RefreshFromGitHub()
    {
        var scenarioCache = Path.Combine(CacheDir, "scenarios.json");
        var tagCache = Path.Combine(CacheDir, "tags.json");
        var timestampFile = Path.Combine(CacheDir, "last-updated.txt");
        var versionFile = Path.Combine(CacheDir, "schema-version.txt");
        var (scenarios, tags) = FetchFromGitHub().GetAwaiter().GetResult();
        if (scenarios.Length > 0)
        {
            ApplyOverrides(scenarios);
            scenarios = InjectMissing(scenarios);
            // Atomic per-file writes (see Load() comment for rationale and ordering).
            BackgroundUpdater.AtomicWriteAllText(scenarioCache, JsonSerializer.Serialize(scenarios, JsonContext.Default.ScenarioArray));
            BackgroundUpdater.AtomicWriteAllText(tagCache, JsonSerializer.Serialize(tags, JsonContext.Default.DictionaryStringStringArray));
            BackgroundUpdater.AtomicWriteAllText(versionFile, CacheVersion.Current);
            BackgroundUpdater.AtomicWriteAllText(timestampFile, DateTime.UtcNow.ToString("o"));
        }
    }

    private static async Task<(Scenario[], Dictionary<string, string[]>)> FetchFromGitHub()
    {
        // Step 1: Fetch ControlInfoData.json — list of controls + Subtitle/Description/RelatedControls/Docs
        var infoJson = await Http.GetStringAsync(ControlInfoUrl);
        using var doc = JsonDocument.Parse(infoJson);
        var groups = doc.RootElement.GetProperty("Groups");

        var controlPages = new List<(string uniqueId, string title, string? folder)>();
        var subtitles = new Dictionary<string, string>();        // controlId → "Title Subtitle Description" (tag-source text)
        var controlSubtitles = new Dictionary<string, string>(); // controlId → Subtitle alone (display-friendly one-liner)
        var apiNamespaces = new Dictionary<string, string>();    // controlId → "Microsoft.Windows.Notifications" etc.
        var relatedControls = new Dictionary<string, string[]>(); // controlId → ["Pivot","NavigationView",...]
        var docs = new Dictionary<string, DocLink[]>();           // controlId → [{Title,Uri},...]

        foreach (var group in groups.EnumerateArray())
        {
            string? folder = null;
            if (group.TryGetProperty("IsSpecialSection", out var isSpecial) && isSpecial.GetBoolean()
                && group.TryGetProperty("Folder", out var folderProp))
            {
                folder = folderProp.GetString();
            }

            if (!group.TryGetProperty("Items", out var items)) continue;
            foreach (var item in items.EnumerateArray())
            {
                var uniqueId = item.GetProperty("UniqueId").GetString() ?? "";
                var title = item.GetProperty("Title").GetString() ?? "";
                controlPages.Add((uniqueId, title, folder));

                var cid = uniqueId.ToLowerInvariant();
                string subtitle = "";
                if (item.TryGetProperty("Subtitle", out var sub)) subtitle = sub.GetString() ?? "";
                string description = "";
                if (item.TryGetProperty("Description", out var desc)) description = desc.GetString() ?? "";
                subtitles[cid] = $"{title} {subtitle} {description}".Trim();
                if (!string.IsNullOrWhiteSpace(subtitle)) controlSubtitles[cid] = subtitle;

                if (item.TryGetProperty("ApiNamespace", out var apiNs))
                {
                    var ns = apiNs.GetString();
                    if (!string.IsNullOrWhiteSpace(ns)) apiNamespaces[cid] = ns!;
                }

                if (item.TryGetProperty("RelatedControls", out var rel) && rel.ValueKind == JsonValueKind.Array)
                {
                    var list = new List<string>();
                    foreach (var r in rel.EnumerateArray())
                    {
                        var v = r.GetString();
                        if (!string.IsNullOrEmpty(v)) list.Add(v!);
                    }
                    if (list.Count > 0) relatedControls[cid] = list.ToArray();
                }

                if (item.TryGetProperty("Docs", out var dList) && dList.ValueKind == JsonValueKind.Array)
                {
                    var list = new List<DocLink>();
                    foreach (var d in dList.EnumerateArray())
                    {
                        var t = d.TryGetProperty("Title", out var tProp) ? (tProp.GetString() ?? "") : "";
                        var u = d.TryGetProperty("Uri",   out var uProp) ? (uProp.GetString() ?? "") : "";
                        if (!string.IsNullOrEmpty(u)) list.Add(new DocLink { Title = t, Uri = u });
                    }
                    if (list.Count > 0) docs[cid] = list.ToArray();
                }
            }
        }

        // Step 2: Fetch each control page and parse ControlExample blocks
        var allScenarios = new List<Scenario>();
        var fetchTasks = new List<Task<List<Scenario>>>();
        var semaphore = new SemaphoreSlim(10);
        foreach (var (uniqueId, title, folder) in controlPages)
        {
            fetchTasks.Add(FetchControlPageAsync(uniqueId, title, folder, semaphore));
        }
        var results = await Task.WhenAll(fetchTasks);
        foreach (var batch in results)
            allScenarios.AddRange(batch);

        // Stamp ControlInfoData metadata onto every scenario of that control.
        // ControlDescription comes from Subtitle (median 68 chars / max 129) — the longer
        // Description (median 144 / max 448) was retired during search-output compression.
        // Subtitle is small enough to surface in search list without bloating tokens.
        foreach (var s in allScenarios)
        {
            if (controlSubtitles.TryGetValue(s.ControlId, out var sub)) s.ControlDescription = sub;
            if (apiNamespaces.TryGetValue(s.ControlId, out var ns)) s.ApiNamespace = ns;
            if (relatedControls.TryGetValue(s.ControlId, out var r)) s.RelatedControls = r;
            if (docs.TryGetValue(s.ControlId, out var dl))           s.Docs = dl;
        }

        // Step 3: Build tags. For each control, prefer hand-curated embedded tags;
        // otherwise auto-derive from Title + Subtitle. Always strip stop words.
        var embeddedTags = DataLoader.LoadGalleryTags();
        var allTags = new Dictionary<string, string[]>();
        foreach (var (controlId, text) in subtitles)
        {
            if (embeddedTags.TryGetValue(controlId, out var manual))
            {
                allTags[controlId] = FilterStopWords(manual);
            }
            else
            {
                allTags[controlId] = ExtractTagsFromText(controlId, text);
            }
        }
        // Also include any embedded tags for controls not in ControlInfoData (jumplist-* etc.)
        foreach (var (k, v) in embeddedTags)
        {
            if (!allTags.ContainsKey(k)) allTags[k] = FilterStopWords(v);
        }

        return (allScenarios.ToArray(), allTags);
    }

    private static string[] FilterStopWords(string[] tags)
    {
        return global::StopWords.FilterTagList(tags);
    }

    private static string[] ExtractTagsFromText(string controlId, string text)
    {
        var tags = new List<string> { controlId };
        var seen = new HashSet<string> { controlId };
        // Split CamelCase/PascalCase into separate words too
        text = Regex.Replace(text, @"(?<=[a-z])(?=[A-Z])", " ");
        foreach (Match m in Regex.Matches(text.ToLowerInvariant(), @"[a-z]{3,}"))
        {
            var w = m.Value;
            if (global::StopWords.IsTagNoise(w)) continue;
            if (seen.Add(w)) tags.Add(w);
            if (tags.Count >= 12) break;
        }
        return tags.ToArray();
    }

    private static Dictionary<string, string[]> CleanTags(Dictionary<string, string[]> tags)
    {
        var result = new Dictionary<string, string[]>(tags.Count);
        foreach (var (k, v) in tags) result[k] = FilterStopWords(v);
        return result;
    }

    private static async Task<List<Scenario>> FetchControlPageAsync(
        string uniqueId, string title, string? folder, SemaphoreSlim semaphore)
    {
        var scenarios = new List<Scenario>();
        await semaphore.WaitAsync();
        try
        {
            var pagePath = folder != null
                ? $"{folder}/{uniqueId}Page.xaml"
                : $"{uniqueId}Page.xaml";
            var url = ControlPagesBase + pagePath;

            var response = await Http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return scenarios;

            var xamlContent = await response.Content.ReadAsStringAsync();
            var controlId = uniqueId.ToLowerInvariant();
            int scenarioIndex = 0;

            // Fetch matching .xaml.cs once per page (real working code).
            // Used by ExtractFromCodeBehind for symbol-closure extraction.
            // Without this, inline <ControlExample.CSharp> templates with $(...)
            // substitutions get returned and break agent builds (see storagepickers-3 etc.).
            string? xamlCsContent = null;
            try
            {
                var csResp = await Http.GetAsync(url + ".cs");
                if (csResp.IsSuccessStatusCode)
                    xamlCsContent = await csResp.Content.ReadAsStringAsync();
            }
            catch { /* no code-behind, fall through */ }

            foreach (var (rawHeader, block) in ExtractControlExampleBlocks(xamlContent))
            {
                // Code-behind extraction (real working code) — preferred when xaml.cs available.
                string? csharp = xamlCsContent != null
                    ? ExtractFromCodeBehind(xamlCsContent, block)
                    : null;

                // External .txt file — second choice (also templated, but cleaner than inline).
                csharp ??= await ExtractCode(block, "CSharp", CSharpSourceRegex());
                string? xaml = await ExtractCode(block, "Xaml", XamlSourceRegex());

                // Inline <ControlExample.CSharp/Xaml> blocks — last resort (templated with $(...)).
                csharp ??= ExtractInlineCode(block, "CSharp");
                xaml ??= ExtractInlineCode(block, "Xaml");

                if (csharp == null && xaml == null) continue;

                // Fallback header: when upstream omits HeaderText, the first XML comment
                // inside the sample is usually a good label (a11y samples in particular
                // self-document this way: <!-- Add a name to this ListView ... -->).
                // Done BEFORE truncation so the comment isn't lost if the snippet is long.
                string headerText = rawHeader;
                if (string.IsNullOrEmpty(headerText) && xaml != null)
                {
                    headerText = DeriveHeaderFromComment(xaml);
                }

                if (xaml != null) xaml = TruncateXaml(xaml, MaxXamlChars);
                if (csharp != null) csharp = TruncateCode(csharp, MaxCSharpChars, "// NOTE: snippet truncated — refer to full sample for additional code");

                scenarioIndex++;
                // Scenario IDs use a simple {controlId}-{N} format (1-indexed). Stable
                // within a single fetched cache; rebuilt fresh on each cache refresh.
                var scenarioId = $"{controlId}-{scenarioIndex}";

                scenarios.Add(new Scenario
                {
                    Id = scenarioId,
                    ControlId = controlId,
                    ControlName = title,
                    HeaderText = headerText,
                    Xaml = xaml,
                    CSharp = csharp,
                    Source = "gallery",
                });
            }
        }
        catch { /* skip this control */ }
        finally { semaphore.Release(); }

        return scenarios;
    }

    private const int MaxXamlChars = 2000;
    private const int MaxCSharpChars = 2500;

    [GeneratedRegex(@"<(/?)([A-Za-z_][\w:.\-]*)\b([^>]*?)(/?)>")]
    private static partial Regex AnyTagRegex();

    /// <summary>
    /// Find all top-level &lt;controls:ControlExample&gt; blocks via stack-aware tag matching,
    /// handling nested ScrollViewer/StackPanel inside ControlExample.Example.
    /// </summary>
    private static IEnumerable<(string headerText, string block)> ExtractControlExampleBlocks(string xaml)
    {
        const string OpenTag = "<controls:ControlExample";
        const string CloseTag = "</controls:ControlExample>";
        int searchStart = 0;
        while (true)
        {
            int openIdx = xaml.IndexOf(OpenTag, searchStart, StringComparison.OrdinalIgnoreCase);
            if (openIdx < 0) yield break;

            // Make sure this isn't ControlExample.Xaml or ControlExample.Example etc.
            int afterPrefix = openIdx + OpenTag.Length;
            if (afterPrefix < xaml.Length && (xaml[afterPrefix] == '.' || char.IsLetterOrDigit(xaml[afterPrefix])))
            {
                searchStart = openIdx + OpenTag.Length;
                continue;
            }

            // Find end of opening tag '>'
            int openTagEnd = xaml.IndexOf('>', afterPrefix);
            if (openTagEnd < 0) yield break;

            // Self-closing? Skip.
            if (xaml[openTagEnd - 1] == '/')
            {
                searchStart = openTagEnd + 1;
                continue;
            }

            // Extract header text from opening tag attributes
            string openingTag = xaml.Substring(openIdx, openTagEnd - openIdx + 1);
            var headerMatch = ControlExampleHeaderRegex().Match(openingTag);
            string headerText = headerMatch.Success ? headerMatch.Groups[1].Value : "";

            // Walk forward, balancing <controls:ControlExample> tags
            int depth = 1;
            int pos = openTagEnd + 1;
            int blockEnd = -1;
            while (pos < xaml.Length)
            {
                int nextOpen = xaml.IndexOf(OpenTag, pos, StringComparison.OrdinalIgnoreCase);
                int nextClose = xaml.IndexOf(CloseTag, pos, StringComparison.OrdinalIgnoreCase);
                if (nextClose < 0) break;
                if (nextOpen >= 0 && nextOpen < nextClose)
                {
                    int after = nextOpen + OpenTag.Length;
                    // Skip ControlExample.Xaml/.CSharp/.Example sub-properties (they don't open a new block)
                    if (after < xaml.Length && xaml[after] != '.' && !char.IsLetterOrDigit(xaml[after]))
                    {
                        int gt = xaml.IndexOf('>', after);
                        if (gt > 0 && xaml[gt - 1] != '/') depth++;
                        pos = gt > 0 ? gt + 1 : nextOpen + OpenTag.Length;
                        continue;
                    }
                    pos = after;
                }
                else
                {
                    depth--;
                    if (depth == 0)
                    {
                        blockEnd = nextClose + CloseTag.Length;
                        break;
                    }
                    pos = nextClose + CloseTag.Length;
                }
            }

            if (blockEnd < 0) yield break;
            yield return (headerText, xaml.Substring(openIdx, blockEnd - openIdx));
            searchStart = blockEnd;
        }
    }

    /// <summary>Pull a usable header from the first XML comment in a sample's XAML.
    /// Collapses whitespace, strips trailing punctuation, truncates at sentence boundary.
    /// Returns "" when no comment is found or the comment is too short to be a real header.</summary>
    private static string DeriveHeaderFromComment(string xaml)
    {
        var m = FirstXmlCommentRegex().Match(xaml);
        if (!m.Success) return "";

        var raw = m.Groups[1].Value;
        // Collapse all whitespace runs (newlines, tabs, multi-space) to single space.
        var collapsed = Regex.Replace(raw, @"\s+", " ").Trim();
        if (collapsed.Length < 4) return "";

        // Strip stray decoration sometimes used as section dividers (****, ====, ----)
        collapsed = collapsed.Trim('*', '=', '-', ' ');
        if (collapsed.Length < 4) return "";

        // Prefer the first sentence so very long explanatory comments stay short.
        const int MaxHeaderLen = 120;
        int firstStop = collapsed.IndexOfAny(new[] { '.', '!', '?', '\n' });
        if (firstStop > 0 && firstStop < MaxHeaderLen) collapsed = collapsed.Substring(0, firstStop);
        if (collapsed.Length > MaxHeaderLen) collapsed = collapsed.Substring(0, MaxHeaderLen).TrimEnd() + "…";

        return collapsed.Trim();
    }

    /// <summary>Truncate XAML at a safe boundary, appending closing tags for unclosed elements.</summary>
    private static string TruncateXaml(string xaml, int maxChars)
    {
        bool needsTruncate = xaml.Length > maxChars;
        string head;
        if (needsTruncate)
        {
            // Find a safe '>' boundary
            int cut = maxChars;
            while (cut > 0)
            {
                cut = xaml.LastIndexOf('>', cut - 1);
                if (cut < 0) return "";
                cut += 1;
                int lastLt = xaml.LastIndexOf('<', cut - 1);
                int lastGt = xaml.LastIndexOf('>', cut - 1);
                if (lastLt < lastGt) break;
                cut = lastLt;
            }
            if (cut <= 0) return "";
            head = xaml.Substring(0, cut);
        }
        else
        {
            head = xaml;
        }

        // Count open/close tags
        var stack = new Stack<string>();
        bool sawMismatch = false;
        foreach (Match m in AnyTagRegex().Matches(head))
        {
            bool isClose = m.Groups[1].Value == "/";
            bool isSelf = m.Groups[4].Value == "/";
            string name = m.Groups[2].Value;
            if (isSelf) continue;
            if (isClose)
            {
                if (stack.Count > 0 && stack.Peek() == name) stack.Pop();
                else sawMismatch = true;
            }
            else
            {
                stack.Push(name);
            }
        }

        // If balanced and not truncated, return original
        if (!needsTruncate && stack.Count == 0 && !sawMismatch) return xaml;

        var sb = new System.Text.StringBuilder(head.TrimEnd());
        while (stack.Count > 0) sb.Append("</").Append(stack.Pop()).Append('>');
        if (needsTruncate) sb.Append("\n<!-- ...truncated -->");
        return sb.ToString();
    }

    /// <summary>Truncate C# code at a brace-balanced boundary.
    /// Walks forward tracking depth (skipping strings/chars/comments/verbatim) and
    /// prefers the most recent depth=0 cut. When none exists in the prefix, cuts at
    /// the last newline and appends synthetic `}` braces equal to the open depth so
    /// agents can copy the snippet without the build breaking on unbalanced braces.</summary>
    private static string TruncateCode(string code, int maxChars, string marker)
    {
        if (code.Length <= maxChars) return code;

        if (code.Contains('{'))
        {
            int depth = 0, lastZeroPos = -1, finalDepth = 0;
            bool inStr = false, inChr = false, inLine = false, inBlk = false, inVerb = false;
            int lastBeforeMax = 0;
            for (int i = 0; i < code.Length && i < maxChars; i++)
            {
                char c = code[i]; char prev = i > 0 ? code[i - 1] : '\0';
                if (inLine) { if (c == '\n') inLine = false; continue; }
                if (inBlk)  { if (c == '/' && prev == '*') inBlk = false; continue; }
                if (inStr)
                {
                    if (inVerb) { if (c == '"' && (i + 1 >= code.Length || code[i + 1] != '"')) { inStr = false; inVerb = false; } else if (c == '"') i++; }
                    else if (c == '"' && prev != '\\') inStr = false;
                    continue;
                }
                if (inChr) { if (c == '\'' && prev != '\\') inChr = false; continue; }
                if (c == '/' && i + 1 < code.Length && code[i + 1] == '/') { inLine = true; continue; }
                if (c == '/' && i + 1 < code.Length && code[i + 1] == '*') { inBlk = true; continue; }
                if (c == '@' && i + 1 < code.Length && code[i + 1] == '"') { inStr = true; inVerb = true; i++; continue; }
                if (c == '"') { inStr = true; continue; }
                if (c == '\'') { inChr = true; continue; }
                if (c == '{') depth++;
                else if (c == '}') { depth--; if (depth == 0) lastZeroPos = i + 1; }
                lastBeforeMax = i + 1;
                finalDepth = depth;
            }
            if (lastZeroPos > 0)
                return code.Substring(0, lastZeroPos).TrimEnd() + "\n" + marker;
            int cut1 = code.LastIndexOf('\n', Math.Min(lastBeforeMax, code.Length) - 1);
            if (cut1 < 0) cut1 = lastBeforeMax;
            var prefix = code.Substring(0, cut1).TrimEnd();
            var closers = finalDepth > 0 ? "\n" + new string('}', finalDepth) : "";
            return prefix + closers + "\n" + marker;
        }

        int cut = code.LastIndexOf('\n', maxChars - 1);
        if (cut < 0) cut = maxChars;
        return code.Substring(0, cut).TrimEnd() + "\n" + marker;
    }

    private static async Task<string?> ExtractCode(string block, string type, Regex sourceRegex)
    {
        var sourceMatch = sourceRegex.Match(block);
        if (!sourceMatch.Success) return null;

        var relativePath = sourceMatch.Groups[1].Value.Replace('\\', '/');
        var url = SampleCodeBase + relativePath;

        try
        {
            var response = await Http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;
            var code = await response.Content.ReadAsStringAsync();
            // Reject the templated `_cs.txt` files that ship with WinUI Gallery —
            // they're explanatory prose with method-name comments, not compileable code
            // (e.g. `// ... Methods ...`, `// CustomDataObject class definition:`).
            // The code-behind extractor is preferred when the page has a real .xaml.cs.
            if (type == "CSharp" && IsExplanatoryStub(code)) return null;
            return CleanGalleryContent(code.Trim());
        }
        catch { return null; }
    }

    /// <summary>True if a Gallery `_cs.txt` is just a doc-style stub, not real compileable code.</summary>
    private static bool IsExplanatoryStub(string code)
    {
        return code.Contains("// ... Methods ...")
            || code.Contains("// C# code-behind")
            || code.Contains("// C# Code")
            || code.Contains("class definition:");
    }

    private static string? ExtractInlineCode(string block, string tagName)
    {
        var pattern = $@"<controls:ControlExample\.{tagName}>\s*<x:String[^>]*>([\s\S]*?)</x:String>\s*</controls:ControlExample\.{tagName}>";
        var match = Regex.Match(block, pattern, RegexOptions.IgnoreCase);
        if (!match.Success) return null;

        var code = UnescapeXml(match.Groups[1].Value).Trim();
        if (code.Contains("$("))
        {
            // C# inline templates with $(VarName) substitutions are bound to live UI
            // controls. Replacing with "..." produces literals like `Title = "..."`
            // and `Resize(new SizeInt32(..., ...))` that mislead agents into compiling
            // them. The code-behind extractor is the right path for C#; if it failed
            // (no .xaml.cs or no event/x:Bind/x:Name seeds), surface no csharp at all.
            if (tagName == "CSharp") return null;
            // For XAML, the placeholder substitution is generally cosmetic (color, size)
            // and the surrounding markup is still useful — keep the existing behavior.
            code = SubstitutionRegex().Replace(code, "...");
        }
        code = CleanGalleryContent(code);
        return string.IsNullOrWhiteSpace(code) ? null : code;
    }

    private static string CleanGalleryContent(string code)
    {
        code = SampleMediaRegex().Replace(code, "ms-appx:///Assets/YourImage.png");
        code = GalleryClassRegex().Replace(code, @"x:Class=""YourApp.YourPage""");
        code = SamplePageTypeRegex().Replace(code, "typeof(YourPage)");
        code = SamplePageNameRegex().Replace(code, "YourPage");
        code = Regex.Replace(code, @"using WinUIGallery[^;\n]*;?", "// adapt namespace to your app");
        code = Regex.Replace(code, @"using AppUIBasics[^;\n]*;?", "// adapt namespace to your app");
        code = Regex.Replace(code, @"namespace WinUIGallery[^{;\n]*;?", "namespace YourApp;");
        code = Regex.Replace(code, @"namespace AppUIBasics[^{;\n]*;?", "namespace YourApp;");
        code = Regex.Replace(code, @".*NavigationHelper.*\n?", "");

        // Clean demo-specific layout attributes (fixed sizes, negative margins, demo handlers)
        var lines = code.Split('\n').Where(line =>
        {
            var trimmed = line.Trim();
            if (Regex.IsMatch(trimmed, @"^(Min|Max)?(Height|Width)=""\d")) return false;
            if (Regex.IsMatch(trimmed, @"^Margin=""-")) return false;
            if (Regex.IsMatch(trimmed, @"^Loaded=""[^""]*_Loaded""")) return false;
            if (Regex.IsMatch(trimmed, @"^SelectedIndex=""\d+""")) return false;
            return true;
        });
        code = string.Join('\n', lines);

        // Clean substitution placeholders: replace known $(...) or "..." with defaults
        code = Regex.Replace(code, @"IsOpen=""(\$\(IsOpen\)|\.\.\.?)""", @"IsOpen=""True""");
        code = Regex.Replace(code, @"Severity=""(\$\(Severity\)|\.\.\.?)""", @"Severity=""Informational""");
        code = SubstitutionRegex().Replace(code, "...");

        code = Regex.Replace(code, @"\n\s*\n\s*\n", "\n\n");
        return code.Trim();
    }

    private static string UnescapeXml(string s)
    {
        return s.Replace("&lt;", "<")
                .Replace("&gt;", ">")
                .Replace("&amp;", "&")
                .Replace("&quot;", "\"")
                .Replace("&apos;", "'")
                .Replace("&#10;", "\n")
                .Replace("&#13;", "\r");
    }

    // ============================================================
    //  Code-behind extraction (real xaml.cs symbol-closure walk)
    // ------------------------------------------------------------
    //  Inline <controls:ControlExample.CSharp> blocks in Gallery
    //  XAML pages contain $(VarName) placeholders that this scraper
    //  used to flatten into "..." — producing non-compileable entries
    //  (see storagepickers-3 for a concrete example).
    //
    //  Instead, when we have the page's .xaml.cs, we walk the real
    //  working code: starting from event handlers + {x:Bind} +
    //  x:Name seeds in the <ControlExample.Example> sub-block,
    //  transitively pull in referenced methods, fields, and nested
    //  classes. This yields a self-contained, compileable C# snippet
    //  per example.
    // ============================================================

    [GeneratedRegex(@"x:Name=""(\w+)""")]
    private static partial Regex XNameRegex();

    [GeneratedRegex(@"<controls:ControlExample\.Example>([\s\S]*?)</controls:ControlExample\.Example>", RegexOptions.IgnoreCase)]
    private static partial Regex ExampleSubBlockRegex();

    // Match any XAML attribute whose value looks like `Foo_Bar` (WinUI Gallery's
    // universal event-handler naming convention: `BasicGridView_ItemClick`,
    // `OpenFileButton_Click`, etc.). Catches every ItemClick/Invoked/Drop/Pointer*/
    // Refresh*/etc. event without needing a hand-curated event-name whitelist.
    [GeneratedRegex(@"=""([A-Za-z][\w]*_[A-Za-z]\w*)""")]
    private static partial Regex EventHandlerRegex();

    [GeneratedRegex(@"\{x:Bind\s+(\w+)")]
    private static partial Regex XBindSeedRegex();

    [GeneratedRegex(@"x:DataType=""(?:[\w]+:)?(\w+)""")]
    private static partial Regex XDataTypeRegex();

    [GeneratedRegex(@"\b_[A-Za-z][A-Za-z0-9_]*\b")]
    private static partial Regex UnderscoreFieldRegex();

    /// <summary>
    /// Extract a self-contained, compileable C# snippet for one ControlExample.
    /// Returns null if no relevant code-behind found.
    /// </summary>
    private static string? ExtractFromCodeBehind(string xamlCsContent, string exampleBlock)
    {
        // Restrict seed collection to the .Example sub-block (skip .Options panel handlers
        // like SelectSuggestedFolderButton_Click that aren't part of the demo).
        var exMatch = ExampleSubBlockRegex().Match(exampleBlock);
        var ex = exMatch.Success ? exMatch.Groups[1].Value : exampleBlock;

        var seeds = new HashSet<string>(StringComparer.Ordinal);
        // Group 1 of EventHandlerRegex captures the handler name itself.
        foreach (Match m in EventHandlerRegex().Matches(ex)) seeds.Add(m.Groups[1].Value);
        foreach (Match m in XBindSeedRegex().Matches(ex))    seeds.Add(m.Groups[1].Value);
        foreach (Match m in XDataTypeRegex().Matches(ex))    seeds.Add(m.Groups[1].Value);

        // x:Name references are NOT methods/fields in xaml.cs (they live in the
        // generated .g.cs partial), so they get a different treatment: we look
        // up methods anywhere in xaml.cs that REFERENCE this name (e.g., the
        // ctor that does `BaseExample.ItemsSource = ...`).
        var xNames = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match m in XNameRegex().Matches(ex)) xNames.Add(m.Groups[1].Value);

        if (seeds.Count == 0 && xNames.Count == 0) return null;

        // Discover the page class name + body span once. We only accept members
        // that live INSIDE the page class — `Name` properties on nested data
        // classes (e.g. `Folder.Name`) shouldn't be extracted as top-level fields.
        string? pageClassName = null;
        int pageBodyStart = -1, pageBodyEnd = -1;
        var pageClsMatch = Regex.Match(xamlCsContent, @"\bpartial\s+class\s+(\w+Page)\b");
        if (pageClsMatch.Success)
        {
            pageClassName = pageClsMatch.Groups[1].Value;
            pageBodyStart = xamlCsContent.IndexOf('{', pageClsMatch.Index);
            if (pageBodyStart > 0)
                pageBodyEnd = FindMatchingBrace(xamlCsContent, pageBodyStart);
        }
        bool InPageClass(int pos) =>
            pageBodyStart < 0 || (pos > pageBodyStart && pos < pageBodyEnd);

        var extracted = new List<string>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var queue = new Queue<string>(seeds);
        bool ctorIncluded = false;

        while (queue.Count > 0)
        {
            var name = queue.Dequeue();
            if (!visited.Add(name)) continue;
            if (name == pageClassName) continue; // never inline the page class itself

            var method = ExtractMethodBody(xamlCsContent, name, InPageClass);
            if (method != null)
            {
                extracted.Add(method);
                foreach (var id in ScanIdentifiers(method)) queue.Enqueue(id);
                continue;
            }

            var field = ExtractFieldOrProperty(xamlCsContent, name, InPageClass);
            if (field != null)
            {
                extracted.Add(field);
                foreach (var typeName in ExtractTypeNames(field)) queue.Enqueue(typeName);
                // Empty-initialized collections (e.g., `= new();`) imply ctor-side population.
                if (!ctorIncluded && pageClassName != null
                    && (field.Contains("= new()") || Regex.IsMatch(field, @"=\s*new\s+\w+(<[^>]+>)?\s*\(\s*\)\s*;?\s*$")))
                {
                    var ctor = ExtractConstructor(xamlCsContent, pageClassName);
                    if (ctor != null)
                    {
                        extracted.Add(ctor);
                        foreach (var id in ScanIdentifiers(ctor)) queue.Enqueue(id);
                        ctorIncluded = true;
                    }
                }
                continue;
            }

            var cls = ExtractClass(xamlCsContent, name);
            if (cls != null)
            {
                extracted.Add(cls);
                continue;
            }
            // else: name resolves to a framework type or unrelated symbol — skip.
        }

        // Now handle x:Name references: find any methods anywhere in xaml.cs
        // that reference one of these names, and pull them in. Catches the
        // "data wired up in ctor" pattern (e.g., `BaseExample.ItemsSource = ...`).
        if (xNames.Count > 0 && pageClassName != null)
        {
            var nameRefMethods = FindMethodsReferencing(xamlCsContent, xNames, pageClassName, InPageClass);
            foreach (var (mName, mBody) in nameRefMethods)
            {
                if (visited.Contains(mName)) continue;
                visited.Add(mName);
                extracted.Add(mBody);
                // Walk identifiers from the new method's body to chase down referenced types/fields.
                foreach (var id in ScanIdentifiers(mBody))
                {
                    if (visited.Contains(id)) continue;
                    var f = ExtractFieldOrProperty(xamlCsContent, id, InPageClass);
                    if (f != null) { visited.Add(id); extracted.Add(f); continue; }
                    var c = ExtractClass(xamlCsContent, id);
                    if (c != null) { visited.Add(id); extracted.Add(c); }
                }
            }
        }

        if (extracted.Count == 0) return null;

        var usings = ExtractUsings(xamlCsContent);
        var raw = (usings.Length > 0 ? string.Join("\n", usings) + "\n\n" : "")
                + string.Join("\n\n", extracted);
        return CompressCSharp(raw);
    }

    /// <summary>
    /// Find methods (incl. constructor) in xaml.cs that reference any of the given XAML element
    /// names (i.e., the method body contains `Foo.Bar` or `Foo(...)` for some Foo in <paramref name="names"/>).
    /// </summary>
    private static IEnumerable<(string name, string body)> FindMethodsReferencing(
        string fileText, HashSet<string> names, string pageClassName, Func<int, bool> scopeFilter)
    {
        var methodSig = new Regex(
            $@"(?:public|private|protected|internal)(?:\s+(?:async|static|virtual|override|sealed|partial|new))*\s+(?:[\w<>\[\]?,\s\.]+?\s+)?(\w+)\s*\(");
        foreach (Match m in methodSig.Matches(fileText))
        {
            if (!scopeFilter(m.Index)) continue;
            var memberName = m.Groups[1].Value;
            if (memberName == "if" || memberName == "while" || memberName == "for") continue;

            int braceStart = fileText.IndexOf('{', m.Index);
            if (braceStart < 0) continue;
            int end = FindMatchingBrace(fileText, braceStart);
            if (end < 0) continue;
            var body = fileText.Substring(braceStart, end - braceStart + 1);

            bool referenced = false;
            foreach (var n in names)
            {
                if (Regex.IsMatch(body, $@"\b{Regex.Escape(n)}\b"))
                {
                    referenced = true;
                    break;
                }
            }
            if (!referenced) continue;

            yield return (memberName, fileText.Substring(m.Index, end - m.Index + 1));
        }
    }

    /// <summary>Find a method declaration by name and return its full text including signature and body.</summary>
    private static string? ExtractMethodBody(string fileText, string methodName, Func<int, bool>? scopeFilter = null)
    {
        var sigPattern = $@"(?:public|private|protected|internal)(?:\s+(?:async|static|virtual|override|sealed|partial|new))*\s+[\w<>\[\]?,\s\.]+?\s+{Regex.Escape(methodName)}\s*\(";
        foreach (Match sigMatch in Regex.Matches(fileText, sigPattern))
        {
            if (scopeFilter != null && !scopeFilter(sigMatch.Index)) continue;
            int braceStart = fileText.IndexOf('{', sigMatch.Index);
            if (braceStart < 0) continue;
            int end = FindMatchingBrace(fileText, braceStart);
            if (end < 0) continue;
            return fileText.Substring(sigMatch.Index, end - sigMatch.Index + 1);
        }
        return null;
    }

    /// <summary>Find the page class's constructor.</summary>
    private static string? ExtractConstructor(string fileText, string className)
    {
        var sigPattern = $@"(?:public|private|protected|internal)\s+{Regex.Escape(className)}\s*\(";
        var sigMatch = Regex.Match(fileText, sigPattern);
        if (!sigMatch.Success) return null;

        int braceStart = fileText.IndexOf('{', sigMatch.Index);
        if (braceStart < 0) return null;

        int end = FindMatchingBrace(fileText, braceStart);
        if (end < 0) return null;
        return fileText.Substring(sigMatch.Index, end - sigMatch.Index + 1);
    }

    /// <summary>Find a field or property declaration by name, including multi-line
    /// initializers, brace-bodied properties, and auto-properties (with or without
    /// an initializer). Honors string/char/comment context when matching the terminator.</summary>
    private static string? ExtractFieldOrProperty(string fileText, string name, Func<int, bool>? scopeFilter = null)
    {
        var startPattern = $@"(?:public|private|protected|internal)(?:\s+(?:readonly|static|const))*\s+[\w<>\[\]?,\s\.]+?\s+{Regex.Escape(name)}\b";
        foreach (Match m in Regex.Matches(fileText, startPattern))
        {
            if (scopeFilter != null && !scopeFilter(m.Index)) continue;

            int end = FindMemberEnd(fileText, m.Index + m.Length);
            if (end < 0) continue;
            return fileText.Substring(m.Index, end - m.Index + 1);
        }
        return null;
    }

    /// <summary>
    /// Locate the terminating character of a C# member declaration starting at
    /// <paramref name="start"/> (just past the matched signature). Handles:
    /// <list type="bullet">
    ///   <item>Fields and consts: scans forward for <c>;</c> at depth 0.</item>
    ///   <item>Brace-bodied properties (<c>{ get; set; }</c>, <c>{ get => ...; set { ... } }</c>):
    ///     returns the matching closing brace.</item>
    ///   <item>Auto-properties with initializer (<c>{ get; set; } = value;</c>):
    ///     returns the trailing <c>;</c> after the initializer.</item>
    ///   <item>Expression-bodied properties (<c>=&gt; expr;</c>): scans for <c>;</c> at depth 0.</item>
    /// </list>
    /// String/char/comment context is honored so that <c>"};"</c> or <c>// ;</c> inside
    /// initializers don't terminate the scan prematurely.
    /// </summary>
    private static int FindMemberEnd(string text, int start)
    {
        int p = start;
        while (p < text.Length && char.IsWhiteSpace(text[p])) p++;
        if (p >= text.Length) return -1;

        if (text[p] == '{')
        {
            int closeBrace = FindMatchingBrace(text, p);
            if (closeBrace < 0) return -1;

            int after = closeBrace + 1;
            while (after < text.Length && char.IsWhiteSpace(text[after])) after++;
            if (after < text.Length && text[after] == '=' && (after + 1 >= text.Length || text[after + 1] != '='))
            {
                int semi = FindSemicolonAtDepthZero(text, after);
                return semi < 0 ? closeBrace : semi;
            }
            return closeBrace;
        }

        return FindSemicolonAtDepthZero(text, p);
    }

    /// <summary>Scan forward for a <c>;</c> at brace-depth 0, ignoring strings, chars,
    /// and comments. Returns -1 if none found.</summary>
    private static int FindSemicolonAtDepthZero(string text, int start)
    {
        int depth = 0;
        bool inString = false, inChar = false, inBlockComment = false, inLineComment = false, inVerbatim = false;
        for (int i = start; i < text.Length; i++)
        {
            char c = text[i];
            char prev = i > 0 ? text[i - 1] : '\0';

            if (inLineComment) { if (c == '\n') inLineComment = false; continue; }
            if (inBlockComment) { if (c == '/' && prev == '*') inBlockComment = false; continue; }
            if (inString)
            {
                if (inVerbatim) { if (c == '"' && (i + 1 >= text.Length || text[i + 1] != '"')) { inString = false; inVerbatim = false; } else if (c == '"') { i++; } }
                else if (c == '"' && prev != '\\') inString = false;
                continue;
            }
            if (inChar) { if (c == '\'' && prev != '\\') inChar = false; continue; }

            if (c == '/' && i + 1 < text.Length && text[i + 1] == '/') { inLineComment = true; continue; }
            if (c == '/' && i + 1 < text.Length && text[i + 1] == '*') { inBlockComment = true; continue; }
            if (c == '@' && i + 1 < text.Length && text[i + 1] == '"') { inString = true; inVerbatim = true; i++; continue; }
            if (c == '"') { inString = true; continue; }
            if (c == '\'') { inChar = true; continue; }

            if (c == '{') depth++;
            else if (c == '}') depth--;
            else if (c == ';' && depth == 0) return i;
        }
        return -1;
    }

    /// <summary>Find a (nested) class declaration by name and return its full text.</summary>
    private static string? ExtractClass(string fileText, string className)
    {
        var pattern = $@"(?:public|internal)(?:\s+(?:sealed|abstract|partial|static))*\s+class\s+{Regex.Escape(className)}\b";
        var m = Regex.Match(fileText, pattern);
        if (!m.Success) return null;

        int braceStart = fileText.IndexOf('{', m.Index);
        if (braceStart < 0) return null;

        int end = FindMatchingBrace(fileText, braceStart);
        if (end < 0) return null;
        return fileText.Substring(m.Index, end - m.Index + 1);
    }

    /// <summary>Brace-aware scan starting at openBracePos. Skips braces inside strings and comments.</summary>
    private static int FindMatchingBrace(string text, int openBracePos)
    {
        int depth = 0;
        bool inString = false, inChar = false, inBlockComment = false, inLineComment = false, inVerbatim = false;
        for (int i = openBracePos; i < text.Length; i++)
        {
            char c = text[i];
            char prev = i > 0 ? text[i - 1] : '\0';

            if (inLineComment) { if (c == '\n') inLineComment = false; continue; }
            if (inBlockComment) { if (c == '/' && prev == '*') inBlockComment = false; continue; }
            if (inString)
            {
                if (inVerbatim) { if (c == '"' && (i + 1 >= text.Length || text[i + 1] != '"')) { inString = false; inVerbatim = false; } else if (c == '"') { i++; } }
                else if (c == '"' && prev != '\\') inString = false;
                continue;
            }
            if (inChar) { if (c == '\'' && prev != '\\') inChar = false; continue; }

            if (c == '/' && i + 1 < text.Length && text[i + 1] == '/') { inLineComment = true; continue; }
            if (c == '/' && i + 1 < text.Length && text[i + 1] == '*') { inBlockComment = true; continue; }
            if (c == '@' && i + 1 < text.Length && text[i + 1] == '"') { inString = true; inVerbatim = true; i++; continue; }
            if (c == '"') { inString = true; continue; }
            if (c == '\'') { inChar = true; continue; }

            if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) return i; }
        }
        return -1;
    }

    /// <summary>
    /// Extract `using X.Y.Z;` directives from the top of a .cs file, skipping internal Gallery
    /// namespaces. Stops at the first non-directive line so that C# 8+ `using` statement-declarations
    /// inside method bodies (e.g., `using IRandomAccessStream s = ...`) are NOT mistaken for directives.
    /// </summary>
    private static string[] ExtractUsings(string fileText)
    {
        var result = new List<string>();
        foreach (var rawLine in fileText.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            var trimmed = line.TrimStart();
            if (trimmed.Length == 0) continue;
            if (trimmed.StartsWith("//")) continue;
            if (trimmed.StartsWith("using ") && Regex.IsMatch(trimmed, @"^using\s+[\w\.]+\s*;\s*$"))
            {
                if (line.Contains("WinUIGallery") || line.Contains("AppUIBasics")) continue;
                result.Add(trimmed);
                continue;
            }
            // First non-using/non-comment/non-blank line — past the directive section.
            break;
        }
        return result.ToArray();
    }

    /// <summary>Extract identifiers from a code body that could refer to other class members.</summary>
    private static IEnumerable<string> ScanIdentifiers(string codeBody)
    {
        // Pascal-cased identifiers (likely properties, methods, types)
        foreach (Match m in Regex.Matches(codeBody, @"\b[A-Z][A-Za-z0-9_]+\b"))
            yield return m.Value;
        // Underscore-prefixed (private fields by convention)
        foreach (Match m in UnderscoreFieldRegex().Matches(codeBody))
            yield return m.Value;
    }

    /// <summary>Extract type-argument names (e.g. `ObservableCollection&lt;Folder&gt;` → ["Folder"]).</summary>
    private static IEnumerable<string> ExtractTypeNames(string fieldDecl)
    {
        foreach (Match m in Regex.Matches(fieldDecl, @"<([\w,\s\.]+)>"))
        {
            foreach (var t in m.Groups[1].Value.Split(','))
            {
                var name = t.Trim();
                int dot = name.LastIndexOf('.');
                if (dot >= 0) continue;
                if (Regex.IsMatch(name, @"^[A-Z]\w+$")) yield return name;
            }
        }
    }

    /// <summary>Tighten whitespace, drop license header + Gallery-internal helper lines.</summary>
    private static string CompressCSharp(string code)
    {
        // Strip Gallery's UIHelper.* accessibility helper calls (not portable, agent doesn't have it).
        code = Regex.Replace(code, @"^\s*UIHelper\.[^;]+;.*\n?", "", RegexOptions.Multiline);

        // Strip #region / #endregion preprocessor directives — they're noise and
        // can produce CS1038 errors when truncation cuts off the matching half.
        code = Regex.Replace(code, @"^\s*#(?:region|endregion)\b.*\n?", "", RegexOptions.Multiline);

        // Drop "// Copyright (c) Microsoft..." + "// Licensed under..." header pair.
        if (code.StartsWith("// Copyright"))
        {
            int nl1 = code.IndexOf('\n');
            if (nl1 > 0)
            {
                int nl2 = code.IndexOf('\n', nl1 + 1);
                if (nl2 > 0 && code.Substring(nl1 + 1, nl2 - nl1 - 1).TrimStart().StartsWith("// Licensed"))
                    code = code.Substring(nl2 + 1).TrimStart();
            }
        }

        // De-indent: turn 4-space indents into 2-space (saves ~12% per line).
        code = Regex.Replace(code, @"(?m)^( {4})+", m => new string(' ', m.Length / 2));

        // Collapse 3+ consecutive newlines into 2.
        code = Regex.Replace(code, @"\n[\t ]*\n[\t ]*\n+", "\n\n");
        return code.Trim();
    }

    /// <summary>
    /// Override Gallery demo code with production-quality snippets where the
    /// original is known to mislead agents (e.g., TabView using Frame instead of direct content).
    /// </summary>
    private static void ApplyOverrides(Scenario[] scenarios)
    {
        foreach (var s in scenarios)
        {
            if (s.Id == "tabview-1" && s.CSharp != null && s.CSharp.Contains("Frame"))
            {
                s.CSharp = """
                    private void TabView_AddButtonClick(TabView sender, object args)
                    {
                        sender.TabItems.Add(CreateNewTab(sender.TabItems.Count));
                    }

                    private void TabView_TabCloseRequested(TabView sender, TabViewTabCloseRequestedEventArgs args)
                    {
                        sender.TabItems.Remove(args.Tab);
                    }

                    private TabViewItem CreateNewTab(int index)
                    {
                        TabViewItem newItem = new TabViewItem();
                        newItem.Header = $"Document {index}";
                        newItem.IconSource = new SymbolIconSource() { Symbol = Symbol.Document };
                        newItem.IsClosable = true;

                        // Content can be any UIElement — TextBox, Grid, UserControl, etc.
                        var textBox = new TextBox
                        {
                            AcceptsReturn = true,
                            TextWrapping = TextWrapping.Wrap,
                            HorizontalAlignment = HorizontalAlignment.Stretch,
                            VerticalAlignment = VerticalAlignment.Stretch,
                            BorderThickness = new Thickness(0),
                        };
                        newItem.Content = textBox;

                        return newItem;
                    }
                    """;
            }
        }
    }

    /// <summary>Inject scenarios for controls that have no ControlExample code in the Gallery.</summary>
    private static Scenario[] InjectMissing(Scenario[] scenarios)
    {
        var ids = new HashSet<string>(scenarios.Select(s => s.ControlId));
        var injected = new List<Scenario>(scenarios);

        if (!ids.Contains("commandbar"))
        {
            injected.Add(new Scenario
            {
                Id = "commandbar-1",
                ControlId = "commandbar",
                ControlName = "CommandBar",
                HeaderText = "Primary and secondary commands",
                Xaml = """
                    <CommandBar DefaultLabelPosition="Right">
                        <AppBarButton Icon="Add" Label="Add" Click="AddButton_Click"/>
                        <AppBarButton Icon="Edit" Label="Edit" Click="EditButton_Click"/>
                        <AppBarButton Icon="Delete" Label="Delete" Click="DeleteButton_Click"/>
                        <AppBarSeparator/>
                        <AppBarButton Icon="Refresh" Label="Refresh" Click="RefreshButton_Click"/>
                        <CommandBar.SecondaryCommands>
                            <AppBarButton Icon="Setting" Label="Settings"/>
                            <AppBarButton Icon="Help" Label="About"/>
                        </CommandBar.SecondaryCommands>
                    </CommandBar>
                    """,
                CSharp = null
            });
        }

        // ItemsRepeater + UniformGridLayout for an image/photo grid is a very common
        // need (media galleries, photo organizers) but every upstream UniformGridLayout
        // sample in WinUI Gallery happens to demo something else (DataTemplateSelector,
        // SelectorBar, connected animation, etc.) so the layout is buried in noise.
        // Inject a clean canonical example so agents can copy it directly.
        // Pick the next free {controlId}-N suffix so the ID stays consistent with
        // the auto-numbered scenarios from the same control.
        var nextRepeaterIdx = injected
            .Where(s => s.ControlId == "itemsrepeater")
            .Select(s =>
            {
                var dash = s.Id.LastIndexOf('-');
                return (dash > 0 && int.TryParse(s.Id[(dash + 1)..], out var n)) ? n : 0;
            })
            .DefaultIfEmpty(0)
            .Max() + 1;
        injected.Add(new Scenario
        {
            Id = $"itemsrepeater-{nextRepeaterIdx}",
            ControlId = "itemsrepeater",
            ControlName = "ItemsRepeater",
            HeaderText = "Photo gallery: image grid (UniformGridLayout)",
            Description = "Canonical pattern for displaying a grid of images/thumbnails: ItemsRepeater + UniformGridLayout, wrapped in a ScrollView for scrolling. Use this instead of GridView+ItemsWrapGrid when you want the modern WinUI 3 collection layout.",
            Xaml = """
                <!--
                  ItemsRepeater is a layout primitive: it has NO selection and NO scrolling.
                  Wrap it in a ScrollView (or ScrollViewer) for scrolling.
                  UniformGridLayout sizes every cell uniformly — set MinItemWidth/Height
                  and the layout fills available width with as many columns as fit.
                -->
                <ScrollView>
                    <ItemsRepeater ItemsSource="{x:Bind ViewModel.Items, Mode=OneWay}">
                        <ItemsRepeater.Layout>
                            <UniformGridLayout MinItemWidth="200"
                                               MinItemHeight="200"
                                               MinRowSpacing="8"
                                               MinColumnSpacing="8"/>
                        </ItemsRepeater.Layout>
                        <ItemsRepeater.ItemTemplate>
                            <DataTemplate x:DataType="local:PhotoItem">
                                <Grid Width="200" Height="200"
                                      Background="{ThemeResource LayerFillColorDefaultBrush}"
                                      CornerRadius="4">
                                    <Image Source="{x:Bind Thumbnail}" Stretch="UniformToFill"/>
                                </Grid>
                            </DataTemplate>
                        </ItemsRepeater.ItemTemplate>
                    </ItemsRepeater>
                </ScrollView>
                """,
            CSharp = """
                public sealed partial class PhotoItem
                {
                    public string Thumbnail { get; set; } = "";
                }

                // ItemsSource:
                // public ObservableCollection<PhotoItem> Items { get; } = new();
                """,
            Source = "gallery"
        });

        // CommunityToolkit controls now come from toolkit-scenarios.json
        // Only CommandBar needs injection (no ControlExample in WinUI Gallery)

        return injected.ToArray();
    }
}

