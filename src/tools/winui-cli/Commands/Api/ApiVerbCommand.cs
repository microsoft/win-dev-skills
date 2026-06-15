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
        Console.Out.WriteLine(JsonSerializer.Serialize(new ApiSearchResultV1(SchemaId, exit, stdout.ToString()), WinUiJsonContext.Default.ApiSearchResultV1));
        return exit;
    }

    private static string First(params string[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? "Command failed.";
}
