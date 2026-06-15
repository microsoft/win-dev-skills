using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands;

internal static class Output
{
    public static int Error(string code, string message, ExitCode exitCode, GlobalOptions options)
    {
        if (options.Json)
        {
            Console.Out.WriteLine(JsonSerializer.Serialize(new ErrorEnvelopeV1("winui.error.v1", new ErrorBodyV1(code, message)), WinUiJsonContext.Default.ErrorEnvelopeV1));
        }
        else
        {
            Console.Error.WriteLine($"ERROR {code}: {message}");
        }
        return (int)exitCode;
    }

    public static void Deprecation(string alias, string replacement, GlobalOptions options)
    {
        if (!options.Json && !options.Quiet)
            Console.Error.WriteLine($"DEPRECATED: 'winui {alias}' will be removed after one release. Use 'winui {replacement}' instead.");
    }
}
