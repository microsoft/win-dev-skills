namespace WinUi.Cli.Commands.Aliases;

internal sealed class WinMdAliasCommand : ICommand
{
    public string Name => "winmd";
    public string Description => "Deprecated alias for 'api <verb>'";
    public bool Hidden => true;

    public int Run(string[] args, GlobalOptions options)
    {
        Output.Deprecation("winmd", "api <verb>", options);
        return new Api.ApiCommand().Run(args, options);
    }
}
