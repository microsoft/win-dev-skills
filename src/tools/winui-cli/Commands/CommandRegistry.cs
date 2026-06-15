namespace WinUi.Cli.Commands;

internal sealed class CommandRegistry : CommandNode
{
    public CommandRegistry() : base("winui", "WinUI sidecar CLI")
    {
        Register(new Api.ApiCommand());
        Register(new Controls.ControlsCommand());
        Register(new Project.ProjectCommand());
        Register(new Analyzer.AnalyzerCommand());
    }
}
