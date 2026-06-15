namespace WinUi.Cli.Commands;

internal sealed record GlobalOptions(bool Json, bool NoColor, bool Quiet)
{
    public static (GlobalOptions Options, string[] Args) Parse(string[] args)
    {
        var rest = new List<string>();
        bool json = false, noColor = false, quiet = false;
        foreach (var arg in args)
        {
            switch (arg)
            {
                case "--json": json = true; noColor = true; break;
                case "--no-color": noColor = true; break;
                case "--quiet": quiet = true; break;
                default: rest.Add(arg); break;
            }
        }
        return (new GlobalOptions(json, noColor, quiet), rest.ToArray());
    }
}
