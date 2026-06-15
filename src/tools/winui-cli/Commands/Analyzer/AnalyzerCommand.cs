namespace WinUi.Cli.Commands.Analyzer;

internal sealed class AnalyzerCommand : CommandNode
{
    public AnalyzerCommand() : base("analyzer", "Inspect the embedded WinUI Roslyn analyzer payload")
    {
        Register(new InfoCommand());
    }

    public override string? TipLine =>
        "Tip: 'winui project build' auto-injects this analyzer transiently per build. 'analyzer info' shows the embedded version and rule summary.";
}
