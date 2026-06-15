using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands;

// Verb that forwards to an inner CLI runner (winmd-cli, winui-search) and wraps
// the result as a winui.text-result.v1 JSON payload tagged with the noun+verb.
//
// Replaces what used to be ApiVerbCommand + ControlsVerbCommand — two
// byte-identical classes differing only in (1) which runner to call, (2) which
// CommandPrefix global to set, (3) the noun string used in help/error/payload.
// Lifting those into constructor parameters lets a single class cover every
// "wrap an inner CLI as a winui noun" verb. Adding a third such noun is now a
// constructor call instead of a new file.
internal sealed class WrappingVerbCommand : ICommand
{
    // (args, stdout, stderr, json) -> exitCode. Matches both WinMdCliRunner.Run
    // and WinUiSearchRunner.Run signatures exactly.
    public delegate int InnerRunner(string[] args, TextWriter stdout, TextWriter stderr, bool json);

    private readonly string _noun;
    private readonly string _verb;
    private readonly InnerRunner _runner;
    private readonly Action<string> _setInnerPrefix;

    public string Name => _verb;
    public string Description { get; }
    public string? UsageHint { get; }
    public string[] Examples { get; }
    public bool Hidden { get; }

    public WrappingVerbCommand(
        string noun,
        string verb,
        string description,
        InnerRunner runner,
        Action<string> setInnerPrefix,
        string? usageHint = null,
        string[]? examples = null,
        bool hidden = false)
    {
        _noun = noun;
        _verb = verb;
        _runner = runner;
        _setInnerPrefix = setInnerPrefix;
        Description = description;
        UsageHint = usageHint;
        Examples = examples ?? Array.Empty<string>();
        Hidden = hidden;
    }

    public int Run(string[] args, GlobalOptions options)
    {
        if (args.Length > 0 && (args[0] is "--help" or "-h"))
        {
            HelpRenderer.RenderVerb(_noun, this, options);
            return (int)ExitCode.Success;
        }

        _setInnerPrefix($"winui {_noun}");
        var forwarded = new[] { _verb }.Concat(args).ToArray();

        if (!options.Json)
        {
            // Even in non-JSON mode we capture stderr so we can re-classify exit codes.
            // Stream stdout straight through so the user sees output live.
            using var stderrCapture = new StringWriter();
            var rawExit = _runner(forwarded, Console.Out, new TeeWriter(Console.Error, stderrCapture), options.Json);
            if (rawExit == 0) return 0;
            return (int)ErrorClassification.Classify(stderrCapture.ToString());
        }

        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var exit = _runner(forwarded, stdout, stderr, options.Json);
        if (exit != 0)
        {
            var classified = ErrorClassification.Classify(stderr.ToString() + " " + stdout.ToString());
            return Output.Error($"{_noun}_{_verb}_failed", First(stderr.ToString(), stdout.ToString(), $"{_noun} {_verb} failed."), classified, options);
        }
        // Text-wrapper payload — see TextResultV1 comment in JsonPayloads.cs.
        var payload = new TextResultV1("winui.text-result.v1", $"{_noun}.{_verb}", exit, stdout.ToString());
        Console.Out.WriteLine(JsonSerializer.Serialize(payload, WinUiJsonContext.Default.TextResultV1));
        return exit;
    }

    private static string First(params string[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v))?.Trim() ?? "Command failed.";
}
