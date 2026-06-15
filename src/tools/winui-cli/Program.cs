using WinUi.Cli.Commands;

var (options, remainingArgs) = GlobalOptions.Parse(args);
var registry = new CommandRegistry();

if (remainingArgs.Length == 0 || remainingArgs[0] is "--help" or "-h" or "help")
{
    HelpRenderer.RenderRoot(registry, options);
    return (int)ExitCode.Success;
}

if (remainingArgs[0] == "--version")
{
    Console.WriteLine(HelpRenderer.Version);
    return (int)ExitCode.Success;
}

return registry.Run(remainingArgs, options);
