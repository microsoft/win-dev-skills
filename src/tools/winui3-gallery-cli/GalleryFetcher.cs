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
        "winui3-gallery", "cache");

    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders = { { "User-Agent", "winui3-gallery-cli/1.0" } }
    };

    [GeneratedRegex(@"<controls:ControlExample[\s\S]*?HeaderText=""([^""]+)""([\s\S]*?)(?=<controls:ControlExample[\s>]|</StackPanel>|</ScrollViewer>|$)", RegexOptions.IgnoreCase)]
    private static partial Regex ControlExampleRegex();

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

    /// <summary>Load scenarios: use cache if fresh, otherwise fetch from GitHub. Fallback to embedded.</summary>
    public static Scenario[] LoadScenarios()
    {
        var cacheFile = Path.Combine(CacheDir, "scenario-index.json");
        var timestampFile = Path.Combine(CacheDir, "last-updated.txt");

        // Check cache freshness
        if (File.Exists(cacheFile) && File.Exists(timestampFile))
        {
            if (DateTime.TryParse(File.ReadAllText(timestampFile).Trim(), out var lastUpdated)
                && DateTime.UtcNow - lastUpdated < CacheTtl)
            {
                try
                {
                    var cached = JsonSerializer.Deserialize(
                        File.ReadAllText(cacheFile),
                        JsonContext.Default.ScenarioArray);
                    if (cached != null && cached.Length > 0)
                    {
                        Console.Error.WriteLine($"[cache] Using cached data ({cached.Length} scenarios, expires {lastUpdated + CacheTtl:yyyy-MM-dd})");
                        return cached;
                    }
                }
                catch { /* fall through to fetch */ }
            }
        }

        // Try fetching from GitHub
        try
        {
            Console.Error.WriteLine("[fetch] Fetching latest data from WinUI Gallery...");
            var scenarios = FetchFromGitHub().GetAwaiter().GetResult();
            if (scenarios.Length > 0)
            {
                ApplyOverrides(scenarios);
                // Save cache
                Directory.CreateDirectory(CacheDir);
                File.WriteAllText(cacheFile, JsonSerializer.Serialize(scenarios, JsonContext.Default.ScenarioArray));
                File.WriteAllText(timestampFile, DateTime.UtcNow.ToString("o"));
                Console.Error.WriteLine($"[fetch] Cached {scenarios.Length} scenarios to {CacheDir}");
                return scenarios;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[fetch] GitHub fetch failed: {ex.Message}");
        }

        // Fallback to embedded
        Console.Error.WriteLine("[fallback] Using embedded data");
        return DataLoader.LoadScenarios();
    }

    private static async Task<Scenario[]> FetchFromGitHub()
    {
        // Step 1: Fetch ControlInfoData.json to get the list of controls and their page names
        var infoJson = await Http.GetStringAsync(ControlInfoUrl);
        using var doc = JsonDocument.Parse(infoJson);
        var groups = doc.RootElement.GetProperty("Groups");

        var controlPages = new List<(string uniqueId, string title, string? folder)>();
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
            }
        }

        Console.Error.WriteLine($"[fetch] Found {controlPages.Count} controls in ControlInfoData.json");

        // Step 2: Fetch each control page and parse ControlExample blocks
        var allScenarios = new List<Scenario>();
        var fetchTasks = new List<Task<List<Scenario>>>();

        // Batch fetches (limit concurrency)
        var semaphore = new SemaphoreSlim(10);
        foreach (var (uniqueId, title, folder) in controlPages)
        {
            fetchTasks.Add(FetchControlPageAsync(uniqueId, title, folder, semaphore));
        }

        var results = await Task.WhenAll(fetchTasks);
        foreach (var batch in results)
            allScenarios.AddRange(batch);

        Console.Error.WriteLine($"[fetch] Extracted {allScenarios.Count} scenarios");
        return allScenarios.ToArray();
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

            foreach (Match match in ControlExampleRegex().Matches(xamlContent))
            {
                var headerText = match.Groups[1].Value;
                var block = match.Value;

                // Extract code: external file or inline
                string? csharp = await ExtractCode(block, "CSharp", CSharpSourceRegex());
                string? xaml = await ExtractCode(block, "Xaml", XamlSourceRegex());

                // Try inline if external not found
                csharp ??= ExtractInlineCode(block, "CSharp");
                xaml ??= ExtractInlineCode(block, "Xaml");

                if (csharp == null && xaml == null) continue;

                scenarioIndex++;
                var slug = HeaderToSlug(headerText);
                var scenarioId = scenarioIndex == 1 ? controlId : $"{controlId}-{slug}";

                scenarios.Add(new Scenario
                {
                    Id = scenarioId,
                    ControlId = controlId,
                    ControlName = title,
                    HeaderText = headerText,
                    Xaml = xaml,
                    CSharp = csharp
                });
            }
        }
        catch { /* skip this control */ }
        finally { semaphore.Release(); }

        return scenarios;
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
            return CleanGalleryContent(code.Trim());
        }
        catch { return null; }
    }

    private static string? ExtractInlineCode(string block, string tagName)
    {
        var pattern = $@"<controls:ControlExample\.{tagName}>\s*<x:String[^>]*>([\s\S]*?)</x:String>\s*</controls:ControlExample\.{tagName}>";
        var match = Regex.Match(block, pattern, RegexOptions.IgnoreCase);
        if (!match.Success) return null;

        var code = UnescapeXml(match.Groups[1].Value).Trim();
        if (code.Contains("$("))
            code = SubstitutionRegex().Replace(code, "...");
        code = CleanGalleryContent(code);
        return string.IsNullOrWhiteSpace(code) ? null : code;
    }

    private static string CleanGalleryContent(string code)
    {
        code = SampleMediaRegex().Replace(code, "ms-appx:///Assets/YourImage.png");
        code = GalleryClassRegex().Replace(code, @"x:Class=""YourApp.YourPage""");
        code = SamplePageTypeRegex().Replace(code, "typeof(YourPage)");
        code = SamplePageNameRegex().Replace(code, "YourPage");
        code = Regex.Replace(code, @"using WinUIGallery[^;\n]*", "// adapt namespace to your app");
        code = Regex.Replace(code, @"using AppUIBasics[^;\n]*", "// adapt namespace to your app");
        code = Regex.Replace(code, @"namespace WinUIGallery[^{\n]*", "namespace YourApp");
        code = Regex.Replace(code, @"namespace AppUIBasics[^{\n]*", "namespace YourApp");
        code = Regex.Replace(code, @".*NavigationHelper.*\n?", "");
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

    private static string HeaderToSlug(string header)
    {
        return Regex.Replace(header.ToLowerInvariant(), @"[^a-z0-9\s]", "")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Take(4)
            .Aggregate((a, b) => a + "-" + b);
    }

    /// <summary>
    /// Override Gallery demo code with production-quality snippets where the
    /// original is known to mislead agents (e.g., TabView using Frame instead of direct content).
    /// </summary>
    private static void ApplyOverrides(Scenario[] scenarios)
    {
        foreach (var s in scenarios)
        {
            if (s.Id == "tabview" && s.CSharp != null && s.CSharp.Contains("Frame"))
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
}
