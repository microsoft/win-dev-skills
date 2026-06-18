// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

internal static partial class GalleryFetcher
{
    private const string ControlInfoUrl =
        "https://raw.githubusercontent.com/microsoft/WinUI-Gallery/main/WinUIGallery/SampleSupport/Data/ControlInfoData.json";
    // PR 2175 (May 2026): every control page moved from Samples/ControlPages/<X>Page.xaml
    // to Samples/<UniqueId>/<UniqueId>Page.xaml, and each <ControlExample> block now
    // points at a sidecar `SampleDefinition="<sub>\<sample>.txt"` that holds the
    // canonical header + raw XAML. The old `Samples/ControlPages/` and
    // `Samples/SampleCode/` directories were deleted upstream.
    private const string SamplesBase =
        "https://raw.githubusercontent.com/microsoft/WinUI-Gallery/main/WinUIGallery/Samples/";

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

    /// <summary>PR 2175 `SampleDefinition` attribute on a ControlExample — relative
    /// path (Windows-style backslashes) to a sidecar `.txt` under `Samples/` with
    /// the canonical `--- header` and `--- xaml` sections.</summary>
    [GeneratedRegex(@"<controls:ControlExample\b[^>]*?SampleDefinition=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex SampleDefinitionRegex();

    /// <summary>First XML comment in a XAML snippet — used as a fallback header when
    /// the upstream ControlExample omits HeaderText (common for Accessibility samples).</summary>
    [GeneratedRegex(@"<!--\s*([\s\S]*?)\s*-->")]
    private static partial Regex FirstXmlCommentRegex();

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
    public static (Scenario[] scenarios, Dictionary<string, string[]> tags, Dictionary<string, string[]> keywords) Load()
    {
        var cacheFile = Path.Combine(CacheDir, "scenarios.json");
        var timestampFile = Path.Combine(CacheDir, "last-updated.txt");
        var versionFile = Path.Combine(CacheDir, "schema-version.txt");

        // Check cache freshness AND schema version
        if (File.Exists(cacheFile) && File.Exists(timestampFile) && File.Exists(versionFile))
        {
            var cachedVersion = File.ReadAllText(versionFile).Trim();
            var lastUpdated = BackgroundUpdater.ReadTimestamp(timestampFile);
            if (cachedVersion == CacheVersion.Current
                && lastUpdated.HasValue
                && DateTime.UtcNow - lastUpdated.Value < CacheTtl)
            {
                try
                {
                    var controls = JsonSerializer.Deserialize(File.ReadAllText(cacheFile), JsonContext.Relaxed.DictionaryStringControlEntry);
                    if (controls != null && controls.Count > 0) return DataLoader.Expand(controls);
                }
                catch { /* fall through to embedded */ }
            }
        }

        // Cache miss: serve embedded data immediately.
        return DataLoader.LoadGallery();
    }

    /// <summary>Fetch fresh data from GitHub and update the cache. Used by the `update` command.</summary>
    public static void RefreshFromGitHub()
    {
        var cacheFile = Path.Combine(CacheDir, "scenarios.json");
        var timestampFile = Path.Combine(CacheDir, "last-updated.txt");
        var versionFile = Path.Combine(CacheDir, "schema-version.txt");
        var controls = FetchFromGitHub().GetAwaiter().GetResult();
        if (controls.Count > 0)
        {
            controls = InjectMissing(controls);
            BackgroundUpdater.AtomicWriteAllText(cacheFile, JsonSerializer.Serialize(controls, JsonContext.Relaxed.DictionaryStringControlEntry));
            BackgroundUpdater.AtomicWriteAllText(versionFile, CacheVersion.Current);
            BackgroundUpdater.AtomicWriteAllText(timestampFile, DateTime.UtcNow.ToString("o"));
        }
    }

    private static async Task<Dictionary<string, ControlEntry>> FetchFromGitHub()
    {
        // Step 1: Fetch ControlInfoData.json — list of controls + metadata
        var infoJson = await Http.GetStringAsync(ControlInfoUrl);
        using var doc = JsonDocument.Parse(infoJson);
        var groups = doc.RootElement.GetProperty("Groups");

        // PR 2175 flattened all pages into per-control subdirs (Samples/<UniqueId>/<UniqueId>Page.xaml);
        // ControlInfoData.json no longer carries a Folder field on groups or items, so we don't track one.
        var controlPages = new List<(string uniqueId, string title)>();
        var controlSubtitles = new Dictionary<string, string>(); // controlId → Subtitle alone (display-friendly one-liner)
        var apiNamespaces = new Dictionary<string, string>();    // controlId → "Microsoft.Windows.Notifications" etc.
        var relatedControls = new Dictionary<string, string[]>(); // controlId → ["Pivot","NavigationView",...]
        // PR 2185 (May 2026): upstream now ships a curated `Tags` array on each
        // ControlInfoData item — these are the Gallery team's hand-picked search
        // terms ("hamburger menu", "push button", "tab control"). Highest-priority
        // tag source — see MergeTags() for the merge order.
        var upstreamTags = new Dictionary<string, string[]>();   // controlId → ["click","push button","command"]

        foreach (var group in groups.EnumerateArray())
        {
            if (!group.TryGetProperty("Items", out var items)) continue;
            foreach (var item in items.EnumerateArray())
            {
                var uniqueId = item.GetProperty("UniqueId").GetString() ?? "";
                var title = item.GetProperty("Title").GetString() ?? "";
                controlPages.Add((uniqueId, title));

                var cid = uniqueId.ToLowerInvariant();
                string subtitle = "";
                if (item.TryGetProperty("Subtitle", out var sub)) subtitle = sub.GetString() ?? "";
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

                // Upstream curated Tags (PR 2185). Stored verbatim (case preserved
                // until MergeTags() normalises to lowercase) so the test fixture
                // can compare against the raw upstream wording if needed.
                if (item.TryGetProperty("Tags", out var tagsArr) && tagsArr.ValueKind == JsonValueKind.Array)
                {
                    var list = new List<string>();
                    foreach (var t in tagsArr.EnumerateArray())
                    {
                        var v = t.GetString();
                        if (!string.IsNullOrWhiteSpace(v)) list.Add(v!);
                    }
                    if (list.Count > 0) upstreamTags[cid] = list.ToArray();
                }
            }
        }

        // Step 2: Fetch each control page and parse ControlExample blocks
        var allScenarios = new List<Scenario>();
        var fetchTasks = new List<Task<List<Scenario>>>();
        var semaphore = new SemaphoreSlim(10);
        foreach (var (uniqueId, title) in controlPages)
        {
            fetchTasks.Add(FetchControlPageAsync(uniqueId, title, semaphore));
        }
        var results = await Task.WhenAll(fetchTasks);
        foreach (var batch in results)
            allScenarios.AddRange(batch);

        // Step 3: Build tags by merging upstream curated + embedded synonyms.
        var embeddedTags = LoadEmbeddedTags();
        var allTags = new Dictionary<string, string[]>();
        foreach (var cid in controlSubtitles.Keys.Concat(upstreamTags.Keys).Distinct())
        {
            upstreamTags.TryGetValue(cid, out var up);
            embeddedTags.TryGetValue(cid, out var emb);
            allTags[cid] = MergeTags(cid, up, emb);
        }
        foreach (var (k, v) in embeddedTags)
        {
            if (!allTags.ContainsKey(k)) allTags[k] = FilterStopWords(v);
        }

        // Step 4: Assemble hierarchical ControlEntry dictionary.
        var controlEntries = new Dictionary<string, ControlEntry>();
        var scenariosByControl = allScenarios.GroupBy(s => s.ControlId);
        foreach (var group in scenariosByControl)
        {
            var cid = group.Key;
            var entry = new ControlEntry
            {
                Name = group.First().ControlName,
                Description = controlSubtitles.GetValueOrDefault(cid),
                Tags = allTags.GetValueOrDefault(cid, []),
                Source = "gallery",
                RelatedControls = relatedControls.GetValueOrDefault(cid, []),
                ApiNamespace = apiNamespaces.GetValueOrDefault(cid),
                Scenarios = group.Select(s => new ScenarioEntry
                {
                    Id = s.Id,
                    HeaderText = s.HeaderText,
                    Xaml = s.Xaml,
                    CSharp = s.CSharp,
                    Description = s.Description,
                }).ToArray()
            };
            controlEntries[cid] = entry;
        }

        // Include tag-only controls not in ControlInfoData (jumplist-* etc.)
        foreach (var (k, v) in allTags)
        {
            if (!controlEntries.ContainsKey(k))
                controlEntries[k] = new ControlEntry { Name = k, Tags = v, Source = "gallery" };
        }

        return controlEntries;
    }

    /// <summary>
    /// Merge tag sources for one control in priority order:
    /// <list type="number">
    ///   <item><b>Upstream curated</b> tags from <c>ControlInfoData.json</c> (PR 2185).</item>
    ///   <item><b>Embedded</b> tags from <c>gallery-tags.json</c> (hand-maintained synonyms).</item>
    /// </list>
    /// All tokens are lowercased and deduplicated (preserving first-seen order, since
    /// BM25 ranking gives earlier tokens slightly more weight). Final pass through
    /// <see cref="FilterStopWords"/> strips low-information terms.
    /// </summary>
    internal static string[] MergeTags(string controlId, string[]? upstream, string[]? embedded)
    {
        var merged = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        void Add(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return;
            var t = raw.Trim().ToLowerInvariant();
            if (t.Length > 0 && seen.Add(t)) merged.Add(t);
        }
        if (upstream != null) foreach (var t in upstream) Add(t);
        if (embedded != null) foreach (var t in embedded) Add(t);
        return FilterStopWords(merged.ToArray());
    }

    private static string[] FilterStopWords(string[] tags)
    {
        return global::StopWords.FilterTagList(tags);
    }

    /// <summary>Load the embedded gallery-tags.json (hand-maintained synonyms).</summary>
    private static Dictionary<string, string[]> LoadEmbeddedTags()
    {
        using var stream = System.Reflection.Assembly.GetExecutingAssembly()
            .GetManifestResourceStream("gallery-tags.json")!;
        return JsonSerializer.Deserialize(stream, JsonContext.Default.DictionaryStringStringArray)!;
    }

    private static async Task<List<Scenario>> FetchControlPageAsync(
        string uniqueId, string title, SemaphoreSlim semaphore)
    {
        var scenarios = new List<Scenario>();
        await semaphore.WaitAsync();
        try
        {
            // PR 2175: pages live at `Samples/<UniqueId>/<UniqueId>Page.xaml`.
            var url = $"{SamplesBase}{uniqueId}/{uniqueId}Page.xaml";

            var response = await Http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return scenarios;

            var xamlContent = await response.Content.ReadAsStringAsync();
            var controlId = uniqueId.ToLowerInvariant();
            int scenarioIndex = 0;

            foreach (var (rawHeader, block) in ExtractControlExampleBlocks(xamlContent))
            {
                // PR 2175 path: SampleDefinition="<sub>\<sample>.txt" points at a
                // sidecar with the canonical, non-templated header + XAML + C#.
                // The sidecar is the contract — upstream hand-curates exactly what
                // each sample needs, including deciding "no C# section" = no C#
                // is required to use this control.
                string? sidecarHeader = null;
                string? sidecarXaml = null;
                string? sidecarCsharp = null;
                var sdMatch = SampleDefinitionRegex().Match(block);
                if (sdMatch.Success)
                {
                    var rel = sdMatch.Groups[1].Value.Replace('\\', '/');
                    var sidecarUrl = SamplesBase + rel;
                    try
                    {
                        var sResp = await Http.GetAsync(sidecarUrl);
                        if (sResp.IsSuccessStatusCode)
                        {
                            var sBody = await sResp.Content.ReadAsStringAsync();
                            (sidecarHeader, sidecarXaml, sidecarCsharp) = ParseSampleSidecar(sBody);
                        }
                    }
                    catch { /* sidecar missing or unreadable — fall back to inline */ }
                }

                // C# / XAML priority. PR 2175 moved 96% of upstream samples to
                // sidecar txt files; the remaining 4% (AccessibilityKeyboard /
                // AccessibilityScreenReader) still use inline <ControlExample.Xaml>
                // and <ControlExample.CSharp>. Both paths are sample-scoped and
                // safe — we never scrape the page's .xaml.cs anymore, because
                // page-level handlers serve the <ControlExample.Options> demo
                // controls (RadioButtons that swap layouts at runtime, NumberBoxes
                // that tweak properties), not the sample itself, and pulling them
                // in produced 80-line "sample" bodies that misled agents into
                // thinking the control was complicated.
                string? csharp = sidecarCsharp ?? ExtractInlineCode(block, "CSharp");
                string? xaml = sidecarXaml ?? ExtractInlineCode(block, "Xaml");

                if (csharp == null && xaml == null) continue;

                // Header priority: sidecar `--- header` → page-level `HeaderText=` attr →
                // first XML comment in the snippet. All resolved before truncation so a
                // long XAML doesn't lose its comment-derived label.
                string headerText = !string.IsNullOrEmpty(sidecarHeader) ? sidecarHeader! : rawHeader;
                if (string.IsNullOrEmpty(headerText) && xaml != null)
                {
                    headerText = DeriveHeaderFromComment(xaml);
                }

                if (xaml != null) xaml = TruncateXaml(CleanGalleryContent(xaml), MaxXamlChars);
                if (csharp != null) csharp = TruncateCode(CleanGalleryContent(csharp), MaxCSharpChars, "// NOTE: snippet truncated — refer to full sample for additional code");

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

    /// <summary>
    /// Parse a PR 2175 sample sidecar (`Samples/&lt;Control&gt;/&lt;Sample&gt;.txt`) into its
    /// header, XAML, and C# sections. Sidecar format is a tiny line-oriented grammar:
    /// <code>
    /// --- header
    /// One-line free text describing the sample
    /// --- xaml
    /// &lt;Raw XAML here, NOT html-escaped&gt;
    /// --- c#
    /// // Real, non-templated C# code (hand-curated per sample)
    /// </code>
    /// Sections may appear in any order; any may be absent. Both `c#` and `csharp`
    /// are accepted as the C# section name (upstream currently uses `c#`).
    /// Any other `--- <name>` line is treated as an unknown future section: its
    /// content is dropped so it can't bleed into the previous section's buffer.
    /// </summary>
    /// <remarks>Exposed as <c>internal</c> for unit-test access via
    /// <see cref="System.Runtime.CompilerServices.InternalsVisibleToAttribute"/>.</remarks>
    internal static (string? header, string? xaml, string? csharp) ParseSampleSidecar(string body)
    {
        if (string.IsNullOrEmpty(body)) return (null, null, null);

        string? header = null;
        string? xaml = null;
        string? csharp = null;
        var current = (string?)null;
        var buf = new System.Text.StringBuilder();

        void Flush()
        {
            if (current == null) return;
            var v = buf.ToString().Trim();
            if (v.Length > 0)
            {
                if (current == "header") header ??= v;
                else if (current == "xaml") xaml ??= v;
                else if (current == "csharp") csharp ??= v;
            }
            buf.Clear();
        }

        // Split on \n; trim \r so Windows line-endings don't bleed into section names.
        foreach (var rawLine in body.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            var trimmed = line.TrimStart();
            // Section markers are "---{whitespace}{name}" — 3+ dashes, then at
            // least one whitespace char before the section name. Requiring the
            // whitespace rejects glued-together lines like "---something" that
            // could appear in raw XAML/Markdown content; tolerating extra dashes
            // (`------ header`) keeps the parser forgiving of upstream drift.
            bool isSectionMarker = false;
            string name = "";
            if (trimmed.StartsWith("---"))
            {
                var afterDashes = trimmed.TrimStart('-');
                if (afterDashes.Length == 0 || char.IsWhiteSpace(afterDashes[0]))
                {
                    isSectionMarker = true;
                    name = afterDashes.Trim().ToLowerInvariant();
                    // Normalise: upstream uses `c#`; older drafts and our own embedded
                    // fallback also use `csharp`. Map both to the same internal bucket.
                    if (name == "c#") name = "csharp";
                }
            }
            if (isSectionMarker)
            {
                Flush();
                // Known section → start buffering it. Unknown / empty name →
                // future-proofing: stop accumulating so its content can't bleed
                // into the previous section.
                current = (name == "header" || name == "xaml" || name == "csharp") ? name : null;
                continue;
            }
            if (current != null) buf.AppendLine(line);
        }
        Flush();

        return (header, xaml, csharp);
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

    // NOTE: ExtractFromCodeBehind + 12 helpers + 7 regexes were removed
    // after upstream WinUI-Gallery PR 2175 made sidecar txt files the
    // single source of truth for sample code. See the C# priority comment
    // above in FetchControlPageAsync for context.


    /// <summary>Inject scenarios for controls that have no ControlExample code in the Gallery.</summary>
    private static Dictionary<string, ControlEntry> InjectMissing(Dictionary<string, ControlEntry> controls)
    {
        // ItemsRepeater + UniformGridLayout for an image/photo grid is a very common
        // need (media galleries, photo organizers) but every upstream UniformGridLayout
        // sample in WinUI Gallery happens to demo something else (DataTemplateSelector,
        // SelectorBar, connected animation, etc.) so the layout is buried in noise.
        // Inject a clean canonical example so agents can copy it directly.
        if (controls.TryGetValue("itemsrepeater", out var repeaterEntry))
        {
            var nextIdx = repeaterEntry.Scenarios
                .Select(s =>
                {
                    var dash = s.Id.LastIndexOf('-');
                    return (dash > 0 && int.TryParse(s.Id[(dash + 1)..], out var n)) ? n : 0;
                })
                .DefaultIfEmpty(0)
                .Max() + 1;

            var injectedScenario = new ScenarioEntry
            {
                Id = $"itemsrepeater-{nextIdx}",
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
            };
            repeaterEntry.Scenarios = [.. repeaterEntry.Scenarios, injectedScenario];
        }

        return controls;
    }
}

