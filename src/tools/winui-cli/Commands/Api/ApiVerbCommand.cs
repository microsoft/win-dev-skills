using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Api;

internal sealed class ApiVerbCommand : ICommand
{
    private readonly string _verb;
    public string Name => _verb;
    public string Description { get; }
    public string? UsageHint { get; }
    public string[] Examples { get; }
    public string SchemaId { get; }

    public ApiVerbCommand(string verb, string description, string? usageHint = null, string[]? examples = null)
    {
        _verb = verb;
        Description = description;
        UsageHint = usageHint;
        Examples = examples ?? Array.Empty<string>();
        SchemaId = $"winui.api.{verb}.v1";
    }

    public int Run(string[] args, GlobalOptions options)
    {
        if (args.Length > 0 && (args[0] is "--help" or "-h"))
        {
            HelpRenderer.RenderVerb("api", this, options);
            return (int)ExitCode.Success;
        }

        global::WinMdInvocation.CommandPrefix = "winui api";
        var forwarded = new[] { _verb }.Concat(args).ToArray();

        if (!options.Json)
        {
            // Even in non-JSON mode we capture stderr so we can re-classify exit codes.
            // Stream stdout straight through so the user sees output live.
            using var stderrCapture = new StringWriter();
            var rawExit = global::WinMdCliRunner.Run(forwarded, Console.Out, new TeeWriter(Console.Error, stderrCapture), options.Json);
            if (rawExit == 0) return 0;
            return (int)ErrorClassification.Classify(stderrCapture.ToString());
        }

        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var exit = global::WinMdCliRunner.Run(forwarded, stdout, stderr, options.Json);
        if (exit != 0)
        {
            var classified = ErrorClassification.Classify(stderr.ToString() + " " + stdout.ToString());
            return Output.Error($"api_{_verb}_failed", First(stderr.ToString(), stdout.ToString(), $"api {_verb} failed."), classified, options);
        }
        Console.Out.WriteLine(SerializeForVerb(SchemaId, exit, stdout.ToString()));
        return exit;
    }

    // Each api verb has its own [WinUiJsonSchema] record (same shape today, but
    // distinct types so per-verb shape changes show up in `-CheckSchemaDrift`).
    // Source-gen forbids dispatching by Type at runtime; switch is the price.
    // Each api verb has its own [WinUiJsonSchema] record (same shape today, but
    // distinct types so per-verb shape changes show up in `-CheckSchemaDrift`).
    // Source-gen forbids dispatching by Type at runtime; switch is the price.
    // No silent fallback: a missing case means someone added a verb without
    // also adding a [WinUiJsonSchema] record + JsonContext registration, which
    // would silently ship under the wrong schema id. Fail loudly instead.
    private static string SerializeForVerb(string schema, int exit, string output) => schema switch
    {
        "winui.api.search.v1"         => JsonSerializer.Serialize(new ApiSearchResultV1(schema, exit, output),         WinUiJsonContext.Default.ApiSearchResultV1),
        "winui.api.update.v1"         => JsonSerializer.Serialize(new ApiUpdateResultV1(schema, exit, output),         WinUiJsonContext.Default.ApiUpdateResultV1),
        "winui.api.members.v1"        => JsonSerializer.Serialize(new ApiMembersResultV1(schema, exit, output),        WinUiJsonContext.Default.ApiMembersResultV1),
        "winui.api.types.v1"          => JsonSerializer.Serialize(new ApiTypesResultV1(schema, exit, output),          WinUiJsonContext.Default.ApiTypesResultV1),
        "winui.api.enums.v1"          => JsonSerializer.Serialize(new ApiEnumsResultV1(schema, exit, output),          WinUiJsonContext.Default.ApiEnumsResultV1),
        "winui.api.check-property.v1" => JsonSerializer.Serialize(new ApiCheckPropertyResultV1(schema, exit, output),  WinUiJsonContext.Default.ApiCheckPropertyResultV1),
        "winui.api.namespaces.v1"     => JsonSerializer.Serialize(new ApiNamespacesResultV1(schema, exit, output),     WinUiJsonContext.Default.ApiNamespacesResultV1),
        "winui.api.packages.v1"       => JsonSerializer.Serialize(new ApiPackagesResultV1(schema, exit, output),       WinUiJsonContext.Default.ApiPackagesResultV1),
        "winui.api.projects.v1"       => JsonSerializer.Serialize(new ApiProjectsResultV1(schema, exit, output),       WinUiJsonContext.Default.ApiProjectsResultV1),
        "winui.api.stats.v1"          => JsonSerializer.Serialize(new ApiStatsResultV1(schema, exit, output),          WinUiJsonContext.Default.ApiStatsResultV1),
        _                              => throw new InvalidOperationException($"No [WinUiJsonSchema] record registered for {schema}. Add a record to Schemas/JsonPayloads.cs and a case here."),
    };

    private static string First(params string[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? "Command failed.";
}
