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
            TryDeleteWithRetry(payloadDir, recursive: true);
            if (!options.Quiet && !options.Json)
                Console.Error.WriteLine("--> Microsoft.WindowsAppSDK.Analyzers: skipped (extraction failed)");
            return new AnalyzerInjection(null, null);
        }
    }

    public void Dispose() => Cleanup(null);

    // BENCH-4: MSBuild may still hold a handle on Directory.Build.props or the
    // extracted analyzer DLL right after a failed post-build target. Retry with
    // backoff; if still failing, surface a warning (non-JSON only) so the user
    // knows to delete the stray file themselves.
    public void Cleanup(GlobalOptions? options)
    {
        var propsLeak = _tempPropsFile != null && !TryDeleteWithRetry(_tempPropsFile, recursive: false);
        var payloadLeak = _tempPayloadDir != null && !TryDeleteWithRetry(_tempPayloadDir, recursive: true);

        if (options is null || options.Json || options.Quiet) return;
        if (propsLeak)
            Console.Error.WriteLine($"--> Microsoft.WindowsAppSDK.Analyzers: warning — could not delete '{_tempPropsFile}'. Remove it manually.");
        if (payloadLeak)
            Console.Error.WriteLine($"--> Microsoft.WindowsAppSDK.Analyzers: warning — could not delete '{_tempPayloadDir}'.");
    }

    private static bool TryDeleteWithRetry(string path, bool recursive)
    {
        // 3 tries with 100ms backoff. MSBuild can hold a handle on
        // Directory.Build.props or the extracted analyzer DLL for a few ms after a
        // failed post-build target exits. After the loop we return whether the
        // path is gone — the caller surfaces a user-visible warning if not.
        for (int attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                if (recursive && Directory.Exists(path)) Directory.Delete(path, true);
                else if (!recursive && File.Exists(path)) File.Delete(path);
                return true;
            }
            catch (IOException) when (attempt < 2) { Thread.Sleep(100); }
            catch (UnauthorizedAccessException) when (attempt < 2) { Thread.Sleep(100); }
            catch { /* final attempt failed — fall through to existence check */ }
        }
        return !PathStillExists(path);
    }

    private static bool PathStillExists(string path) => File.Exists(path) || Directory.Exists(path);

    private static string EscapeAttribute(string value) =>
        value.Replace("&", "&amp;").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");
}
