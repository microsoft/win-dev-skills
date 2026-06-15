using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Controls;

internal sealed class ControlsVerbCommand : ICommand
{
    private readonly string _verb;
    public string Name => _verb;
    public string Description { get; }
    public string? UsageHint { get; }
    public string[] Examples { get; }
    public bool Hidden { get; }
    public string SchemaId { get; }

    public ControlsVerbCommand(string verb, string description, string? usageHint = null, string[]? examples = null, bool hidden = false)
    {
        _verb = verb;
        Description = description;
        UsageHint = usageHint;
        Examples = examples ?? Array.Empty<string>();
        Hidden = hidden;
        SchemaId = $"winui.controls.{verb}.v1";
    }

    public int Run(string[] args, GlobalOptions options)
    {
        if (args.Length > 0 && (args[0] is "--help" or "-h"))
        {
            HelpRenderer.RenderVerb("controls", this, options);
            return (int)ExitCode.Success;
        }

        global::WinUiSearchInvocation.CommandPrefix = "winui controls";
        var forwarded = new[] { _verb }.Concat(args).ToArray();

        if (!options.Json)
        {
            using var stderrCapture = new StringWriter();
            var rawExit = global::WinUiSearchRunner.Run(forwarded, Console.Out, new TeeWriter(Console.Error, stderrCapture), options.Json);
            if (rawExit == 0) return 0;
            return (int)ErrorClassification.Classify(stderrCapture.ToString());
        }

        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var exit = global::WinUiSearchRunner.Run(forwarded, stdout, stderr, options.Json);
        if (exit != 0)
        {
            var classified = ErrorClassification.Classify(stderr.ToString() + " " + stdout.ToString());
            return Output.Error($"controls_{_verb}_failed", First(stderr.ToString(), stdout.ToString(), $"controls {_verb} failed."), classified, options);
        }
        Console.Out.WriteLine(SerializeForVerb(SchemaId, exit, stdout.ToString()));
        return exit;
    }

    private static string SerializeForVerb(string schema, int exit, string output) => schema switch
    {
        "winui.controls.search.v1" => JsonSerializer.Serialize(new ControlsSearchResultV1(schema, exit, output), WinUiJsonContext.Default.ControlsSearchResultV1),
        "winui.controls.get.v1"    => JsonSerializer.Serialize(new ControlsGetResultV1(schema, exit, output),    WinUiJsonContext.Default.ControlsGetResultV1),
        "winui.controls.list.v1"   => JsonSerializer.Serialize(new ControlsListResultV1(schema, exit, output),   WinUiJsonContext.Default.ControlsListResultV1),
        "winui.controls.update.v1" => JsonSerializer.Serialize(new ControlsUpdateResultV1(schema, exit, output), WinUiJsonContext.Default.ControlsUpdateResultV1),
        _                          => JsonSerializer.Serialize(new ControlsSearchResultV1(schema, exit, output), WinUiJsonContext.Default.ControlsSearchResultV1),
    };

    private static string First(params string[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? "Command failed.";
}
