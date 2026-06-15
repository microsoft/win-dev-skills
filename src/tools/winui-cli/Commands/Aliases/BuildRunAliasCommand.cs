namespace WinUi.Cli.Commands.Aliases;

internal sealed class BuildRunAliasCommand : ICommand
{
    public string Name => "build-run";
    public string Description => "Deprecated alias for project build";
    public bool Hidden => true;

    public int Run(string[] args, GlobalOptions options)
    {
        Output.Deprecation("build-run", "project build", options);
        return new Project.BuildCommand().Run(args, options);
    }
}
