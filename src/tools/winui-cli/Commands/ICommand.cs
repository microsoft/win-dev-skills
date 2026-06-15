namespace WinUi.Cli.Commands;

internal interface ICommand
{
    string Name { get; }
    string Description { get; }
    bool Hidden => false;
    string? UsageHint => null;
    string[] Examples => Array.Empty<string>();
    int Run(string[] args, GlobalOptions options);
}
