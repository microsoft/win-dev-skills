using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Analyzer;

internal sealed class InfoCommand : ICommand
{
    public string Name => "info";
    public string Description => "Print embedded analyzer version and rule summary";
    public string? UsageHint => "winui analyzer info";
    public string[] Examples => new[] { "winui analyzer info", "winui --json analyzer info" };

    public int Run(string[] args, GlobalOptions options)
    {
        if (args.Length > 0 && (args[0] is "--help" or "-h"))
        {
            HelpRenderer.RenderVerb("analyzer", this, options);
            return (int)ExitCode.Success;
        }
        var result = new AnalyzerInfoResultV1("winui.analyzer.info.v1", AnalyzerPayload.Version, AnalyzerPayload.Rules, AnalyzerPayload.Available);
        if (options.Json)
            Console.Out.WriteLine(JsonSerializer.Serialize(result, WinUiJsonContext.Default.AnalyzerInfoResultV1));
        else
        {
            Console.Out.WriteLine($"Microsoft.WindowsAppSDK.Analyzers: {result.Version}");
            Console.Out.WriteLine($"Embedded payload: {(result.EmbeddedPayloadAvailable ? "available" : "missing")}");
            foreach (var rule in result.Rules) Console.Out.WriteLine($"  - {rule}");
        }
        return (int)ExitCode.Success;
    }
}
