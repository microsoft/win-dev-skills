namespace WinUi.Cli.Commands.Project;

internal sealed class ProjectCommand : CommandNode
{
    public ProjectCommand() : base("project", "WinUI project authoring helpers")
    {
        Register(new BuildCommand());
    }

    public override string? TipLine =>
        "Tip: 'winui project build' is a temporary MSBuild workaround for the XAML compiler. It hands off to 'winapp run' on success.";
}
