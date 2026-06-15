namespace WinUi.Cli.Commands.Aliases;

internal sealed class SearchAliasCommand : ICommand
{
    public string Name => "search";
    public string Description => "Deprecated alias for 'controls search'";
    public bool Hidden => true;

    public int Run(string[] args, GlobalOptions options)
    {
        Output.Deprecation("search", "controls search", options);
        var forwarded = new[] { "search" }.Concat(args).ToArray();
        return new Controls.ControlsCommand().Run(forwarded, options);
    }
}
