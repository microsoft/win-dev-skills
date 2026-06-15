using System.Reflection;
using System.Text.Json;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Analyzer;

internal static class AnalyzerPayload
{
    public const string DllName = "Microsoft.WindowsAppSDK.Analyzers.dll";
    public const string TargetsName = "Microsoft.WindowsAppSDK.Analyzers.targets";
    private const string DllResource = "analyzer/" + DllName;
    private const string TargetsResource = "analyzer/" + TargetsName;

    public static bool Available => Assembly.GetExecutingAssembly().GetManifestResourceStream(DllResource) != null
        && Assembly.GetExecutingAssembly().GetManifestResourceStream(TargetsResource) != null;

    public static string[] Rules => new[]
    {
        "WUI0001-WUI0004 UWP-to-WinUI API compatibility",
        "WUI1001-WUI1010 migration mapping hints",
        "WUI2001-WUI2030 XAML/layout/accessibility pitfalls",
        "WUI3001 MVVM pattern guidance",
        "WUI4001-WUI4103 interop and GenAI API guidance"
    };

    public static string Version => typeof(AnalyzerPayload).Assembly.GetName().Version?.ToString() ?? "unknown";

    public static void ExtractTo(string targetDir)
    {
        Directory.CreateDirectory(targetDir);
        WriteResource(DllResource, Path.Combine(targetDir, DllName));
        WriteResource(TargetsResource, Path.Combine(targetDir, TargetsName));
    }

    private static void WriteResource(string logicalName, string destination)
    {
        using var source = Assembly.GetExecutingAssembly().GetManifestResourceStream(logicalName)
            ?? throw new FileNotFoundException($"Embedded resource missing: {logicalName}");
        using var target = File.Create(destination);
        source.CopyTo(target);
    }
}
