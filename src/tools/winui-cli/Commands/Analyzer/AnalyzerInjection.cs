using System.Reflection;

namespace WinUi.Cli.Commands.Analyzer;

// Transient injection of the embedded WinUI analyzer for `winui project build`.
//
// Mirrors BuildAndRun.ps1 step 4a: extract the embedded analyzer DLL + .targets
// to a temp dir, then write a temp Directory.Build.props next to the .csproj
// that points MSBuild at them. Dispose tears both back down in finally so a
// subsequent vanilla `dotnet build` doesn't see a stray analyzer reference.
//
// If the project already owns a Directory.Build.props, we leave it alone — the
// user's file wins and the analyzer is silently skipped (same as BuildAndRun.ps1).
internal sealed class AnalyzerInjection : IDisposable
{
    private readonly string? _tempPropsFile;
    private readonly string? _tempPayloadDir;

    private AnalyzerInjection(string? tempPropsFile, string? tempPayloadDir)
    {
        _tempPropsFile = tempPropsFile;
        _tempPayloadDir = tempPayloadDir;
    }

    public static AnalyzerInjection Prepare(string projectPath, GlobalOptions options)
    {
        if (!AnalyzerPayload.Available)
        {
            if (!options.Quiet && !options.Json)
                Console.Error.WriteLine("--> Microsoft.WindowsAppSDK.Analyzers: skipped (embedded payload missing)");
            return new AnalyzerInjection(null, null);
        }

        var projectFull = Path.GetFullPath(projectPath);
        var projectDir = Path.GetDirectoryName(projectFull) ?? Directory.GetCurrentDirectory();
        var propsFile = Path.Combine(projectDir, "Directory.Build.props");

        if (File.Exists(propsFile))
        {
            if (!options.Quiet && !options.Json)
                Console.Error.WriteLine("--> Microsoft.WindowsAppSDK.Analyzers: skipped (existing Directory.Build.props)");
            return new AnalyzerInjection(null, null);
        }

        var payloadDir = Path.Combine(Path.GetTempPath(), "winui-analyzer-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(payloadDir);
        try
        {
            AnalyzerPayload.ExtractTo(payloadDir);
            var dllPath = Path.Combine(payloadDir, AnalyzerPayload.DllName);
            var targetsPath = Path.Combine(payloadDir, AnalyzerPayload.TargetsName);

            var contents = $@"<Project>
  <ItemGroup>
    <Analyzer Include=""{EscapeAttribute(dllPath)}"" />
  </ItemGroup>
  <Import Project=""{EscapeAttribute(targetsPath)}"" />
</Project>
";
            File.WriteAllText(propsFile, contents);
            if (!options.Quiet && !options.Json)
                Console.Error.WriteLine("--> Microsoft.WindowsAppSDK.Analyzers: enabled");
            return new AnalyzerInjection(propsFile, payloadDir);
        }
        catch
        {
            // Best-effort cleanup if extraction or write failed; never block the build.
            TryDelete(payloadDir, recursive: true);
            if (!options.Quiet && !options.Json)
                Console.Error.WriteLine("--> Microsoft.WindowsAppSDK.Analyzers: skipped (extraction failed)");
            return new AnalyzerInjection(null, null);
        }
    }

    public void Dispose()
    {
        if (_tempPropsFile != null) TryDelete(_tempPropsFile, recursive: false);
        if (_tempPayloadDir != null) TryDelete(_tempPayloadDir, recursive: true);
    }

    private static void TryDelete(string path, bool recursive)
    {
        try
        {
            if (recursive && Directory.Exists(path)) Directory.Delete(path, true);
            else if (!recursive && File.Exists(path)) File.Delete(path);
        }
        catch { /* best-effort cleanup */ }
    }

    private static string EscapeAttribute(string value) =>
        value.Replace("&", "&amp;").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");
}
