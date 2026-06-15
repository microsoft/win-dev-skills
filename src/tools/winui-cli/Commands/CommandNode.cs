namespace WinUi.Cli.Commands;

internal abstract class CommandNode : ICommand
{
    private readonly Dictionary<string, ICommand> _children = new(StringComparer.OrdinalIgnoreCase);
    protected CommandNode(string name, string description)
    {
        Name = name;
        Description = description;
    }

    public string Name { get; }
    public string Description { get; }
    public virtual bool Hidden => false;
    public virtual string? UsageHint => null;
    public virtual string[] Examples => Array.Empty<string>();
    public virtual string? TipLine => null;
    public IEnumerable<ICommand> Children => _children.Values;

    protected void Register(ICommand command) => _children.Add(command.Name, command);

    public virtual int Run(string[] args, GlobalOptions options)
    {
        if (args.Length == 0 || args[0] is "--help" or "-h" or "help")
        {
            HelpRenderer.RenderNode(this, options);
            return (int)ExitCode.Success;
        }
        if (_children.TryGetValue(args[0], out var command))
            return command.Run(args[1..], options);
        return Output.Error("unknown_command", $"Unknown command under '{Name}': {args[0]}", ExitCode.UsageError, options);
    }
}
