using System.Reflection;
using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands;

internal static class HelpRenderer
{
    public static void RenderRoot(CommandRegistry registry, GlobalOptions options)
    {
        if (options.Json)
        {
            var verbs = registry.Children
                .Where(c => !c.Hidden)
                .Select(c => new HelpVerbV1(c.Name, c.Description, null, false))
                .ToArray();
            var payload = new HelpEnvelopeV1(
                "winui.help.v1",
                "winui",
                "WinUI sidecar CLI",
                "winui <noun> <verb> [args] [--json] [--no-color] [--quiet]",
                verbs,
                Array.Empty<string>(),
                null);
            Console.Out.WriteLine(JsonSerializer.Serialize(payload, WinUiJsonContext.Default.HelpEnvelopeV1));
            return;
        }
        Console.WriteLine("winui - WinUI sidecar CLI");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  winui <noun> <verb> [args]");
        Console.WriteLine("  winui --version | --help");
        Console.WriteLine();
        Console.WriteLine("Global flags:");
        Console.WriteLine("  --json       Emit machine-readable JSON and disable ANSI/progress");
        Console.WriteLine("  --no-color   Disable ANSI color");
        Console.WriteLine("  --quiet      Suppress non-essential human output");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        foreach (var child in registry.Children.Where(c => !c.Hidden))
            Console.WriteLine($"  {child.Name,-10} {child.Description}");
    }

    public static void RenderNode(CommandNode node, GlobalOptions options)
    {
        if (options.Json)
        {
            var verbs = node.Children
                .Where(c => !c.Hidden)
                .Select(c => new HelpVerbV1(c.Name, c.Description, c.UsageHint, false))
                .ToArray();
            var payload = new HelpEnvelopeV1(
                $"winui.{node.Name}.help.v1",
                $"winui {node.Name}",
                node.Description,
                $"winui {node.Name} <verb> [args] [--json] [--help]",
                verbs,
                Array.Empty<string>(),
                node.TipLine);
            Console.Out.WriteLine(JsonSerializer.Serialize(payload, WinUiJsonContext.Default.HelpEnvelopeV1));
            return;
        }
        Console.WriteLine($"winui {node.Name} - {node.Description}");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine($"  winui {node.Name} <verb> [args] [--json] [--help]");
        Console.WriteLine();
        Console.WriteLine("Verbs:");
        var verbsList = node.Children.Where(c => !c.Hidden).ToList();
        var width = verbsList.Count == 0 ? 4 : Math.Max(4, verbsList.Max(v => v.Name.Length) + 2);
        foreach (var child in verbsList)
            Console.WriteLine($"  {child.Name.PadRight(width)}{child.Description}");
        if (!string.IsNullOrEmpty(node.TipLine))
        {
            Console.WriteLine();
            Console.WriteLine(node.TipLine);
        }
        Console.WriteLine();
        Console.WriteLine($"Run 'winui {node.Name} <verb> --help' for verb-specific usage and examples.");
    }

    public static void RenderVerb(string noun, ICommand verb, GlobalOptions options)
    {
        if (options.Json)
        {
            var payload = new HelpEnvelopeV1(
                $"winui.{noun}.{verb.Name}.help.v1",
                $"winui {noun} {verb.Name}",
                verb.Description,
                verb.UsageHint ?? $"winui {noun} {verb.Name} [args]",
                Array.Empty<HelpVerbV1>(),
                verb.Examples,
                null);
            Console.Out.WriteLine(JsonSerializer.Serialize(payload, WinUiJsonContext.Default.HelpEnvelopeV1));
            return;
        }
        Console.WriteLine($"winui {noun} {verb.Name} - {verb.Description}");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine($"  {verb.UsageHint ?? $"winui {noun} {verb.Name} [args]"}");
        if (verb.Examples.Length > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Examples:");
            foreach (var ex in verb.Examples)
                Console.WriteLine($"  {ex}");
        }
    }

    public static string Version => Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString()
        ?? "0.0.0";
}
