using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Api;

internal sealed class ApiCommand : CommandNode
{
    public ApiCommand() : base("api", "WinRT and Windows App SDK API lookup")
    {
        Register(Verb("update", "Refresh the WinMD project cache (run this first)",
            usageHint: "winui api update [--project-dir <dir>] [--winappsdk-runtime <ver>]",
            examples: new[] { "winui api update", "winui api update --project-dir ./src/MyApp" }));
        Register(Verb("search", "Full-text search across cached WinMD APIs",
            usageHint: "winui api search <query> [--max <n>] [--filter <regex>]",
            examples: new[] { "winui api search TabView", "winui api search \"app window\" --max 10" }));
        Register(Verb("members", "List members of a specific type",
            usageHint: "winui api members <FullyQualifiedTypeName>",
            examples: new[] { "winui api members Microsoft.UI.Xaml.Window" }));
        Register(Verb("types", "List types matching a query",
            usageHint: "winui api types <query>",
            examples: new[] { "winui api types Button" }));
        Register(Verb("enums", "List enum types and values",
            usageHint: "winui api enums <query>",
            examples: new[] { "winui api enums Visibility" }));
        Register(Verb("check-property", "Check whether a type defines a property",
            usageHint: "winui api check-property <TypeName> <PropertyName>",
            examples: new[] { "winui api check-property Grid Row", "winui api check-property TextBox Icon" }));
        Register(Verb("namespaces", "List cached namespaces (filterable)",
            usageHint: "winui api namespaces [--filter <regex>]",
            examples: new[] { "winui api namespaces", "winui api namespaces --filter Microsoft.UI" }));
        Register(Verb("packages", "List NuGet packages contributing WinMD to the current project",
            usageHint: "winui api packages"));
        Register(Verb("projects", "List projects known to the local cache",
            usageHint: "winui api projects"));
        Register(Verb("stats", "Print cache statistics",
            usageHint: "winui api stats"));
    }

    private static WrappingVerbCommand Verb(string verb, string description, string? usageHint = null, string[]? examples = null) =>
        new("api", verb, description,
            runner: global::WinMdCliRunner.Run,
            setInnerPrefix: s => global::WinMdInvocation.CommandPrefix = s,
            usageHint: usageHint, examples: examples);

    public override string? TipLine =>
        "Tip: run 'winui api update' once per project to build the WinMD cache before searching.";
}

