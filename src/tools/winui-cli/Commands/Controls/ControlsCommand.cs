namespace WinUi.Cli.Commands.Controls;

internal sealed class ControlsCommand : CommandNode
{
    public ControlsCommand() : base("controls", "WinUI control and pattern lookup (Gallery + Toolkit)")
    {
        Register(Verb("search", "Search WinUI Gallery + Community Toolkit scenarios",
            usageHint: "winui controls search \"<query>\" [\"<query2>\" ...] [--max N] [--source gallery|toolkit|core]",
            examples: new[] { "winui controls search \"settings card\"", "winui controls search \"file picker\" --source core" }));
        Register(Verb("get", "Fetch full XAML + C# for one or more pattern IDs",
            usageHint: "winui controls get <id> [<id2> ...]",
            examples: new[] { "winui controls get gallery-tabview-1", "winui controls get toolkit-settingscard-9 gallery-infobar-1" }));
        Register(Verb("list", "List all available patterns (optionally filtered by source)",
            usageHint: "winui controls list [--source gallery|toolkit|core]",
            examples: new[] { "winui controls list", "winui controls list --source toolkit" }));
        Register(Verb("update", "Force-refresh the cache from GitHub",
            usageHint: "winui controls update",
            examples: new[] { "winui controls update" }));
        Register(Verb("debug", "Diagnostic dump for a query (tokens, synonyms, top matches)",
            usageHint: "winui controls debug \"<query>\"",
            examples: new[] { "winui controls debug \"settings card with toggle\"" },
            hidden: true));
    }

    private static WrappingVerbCommand Verb(string verb, string description, string? usageHint = null, string[]? examples = null, bool hidden = false) =>
        new("controls", verb, description,
            runner: global::WinUiSearchRunner.Run,
            setInnerPrefix: s => global::WinUiSearchInvocation.CommandPrefix = s,
            usageHint: usageHint, examples: examples, hidden: hidden);

    public override string? TipLine =>
        "Tip: 'search' returns IDs; pass IDs to 'get' for full XAML + C#. Cache auto-refreshes; run 'update' to force.";
}

