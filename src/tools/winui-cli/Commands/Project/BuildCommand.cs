using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Threading.Tasks;
using WinUi.Cli.Schemas;

namespace WinUi.Cli.Commands.Project;

internal sealed class BuildCommand : ICommand
{
    public string Name => "build";
    public string Description => "Build a WinUI project and hand off to winapp run";
    public string? UsageHint => "winui project build [--project <path>] [--skip-run] [--detach] [--configuration <cfg>] [--platform <platform>] [-- <MSBuild args>]";
    public string[] Examples => new[]
    {
        "winui project build",
        "winui project build --project ./src/MyApp",
        "winui project build --configuration Release --platform x64",
        "winui project build --skip-run",
        "winui project build --detach",
        "winui project build --force  # bypass WinUI project check",
    };

    public int Run(string[] args, GlobalOptions options)
    {
        var parsed = BuildArgs.Parse(args);
        if (parsed.Help)
        {
            HelpRenderer.RenderVerb("project", this, options);
            return (int)ExitCode.Success;
        }
        if (!OperatingSystem.IsWindows())
            return Output.Error("windows_required", "winui project build requires Windows.", ExitCode.ExecutionError, options);

        if (!CheckDeveloperMode() && !parsed.SkipDeveloperModeCheck)
            return Output.Error("developer_mode_disabled", "Developer Mode is not enabled. Enable Settings > System > For developers > Developer Mode.", ExitCode.ExecutionError, options);

        var project = ResolveProject(parsed.Project);
        if (project == null)
            return Output.Error("project_not_found", "No .csproj file found, or multiple projects exist. Pass --project <path>.", ExitCode.UsageError, options);

        if (!parsed.Force && !IsWinUiProject(project))
            return Output.Error("not_a_winui_project", $"Project '{Path.GetFileName(project)}' does not reference Microsoft.WindowsAppSDK. Re-run with --force to build anyway, or point --project at a WinUI .csproj.", ExitCode.UsageError, options);

        string platform = parsed.Platform ?? (RuntimeInformation.OSArchitecture == Architecture.Arm64 ? "ARM64" : "x64");
        string configuration = parsed.Configuration ?? "Debug";
        var extra = parsed.ExtraArgs.ToList();
        EnsureProperty(extra, "Platform", platform);
        EnsureProperty(extra, "Configuration", configuration);
        if (!extra.Any(a => Regex.IsMatch(a, "^[/|-](restore|t:restore)$|^--restore$", RegexOptions.IgnoreCase)))
            extra.Insert(0, "/restore");

        var msbuild = FindMsBuild();
        var buildArgs = msbuild != null
            ? new[] { "/nologo", "/v:m" }.Concat(extra).Concat(new[] { project }).ToArray()
            : ToDotnetArgs(project, extra);

        if (!options.Quiet && !options.Json)
            Console.Error.WriteLine($"Building with {(msbuild != null ? "MSBuild" : "dotnet build")} (Platform: {platform}, Config: {configuration})");

        // Transiently inject the embedded analyzer via a temp Directory.Build.props
        // next to the .csproj. Mirrors BuildAndRun.ps1 step 4a: only writes the
        // file when there isn't already a user-owned one, and always cleans it up
        // in finally so a subsequent vanilla `dotnet build` doesn't see a stray
        // file pointing at an analyzer that isn't on disk.
        var analyzerInjection = Commands.Analyzer.AnalyzerInjection.Prepare(project, options);
        try
        {
            var buildExit = RunProcess(msbuild ?? "dotnet", buildArgs, options.Json ? null : Console.Out, options.Json ? null : Console.Error, out var buildOut, out var buildErr);
            if (buildExit != 0)
            {
                if (options.Json)
                    return Output.Error("build_failed", string.IsNullOrWhiteSpace(buildErr) ? "Build failed." : buildErr.Trim(), ExitCode.ExecutionError, options);
                return buildExit;
            }

            var outputDir = FindOutputDir(project, platform, configuration);
            bool runAttempted = false;
            int finalExit = 0;
            if (!parsed.SkipRun && outputDir != null)
            {
                var winapp = FindOnPath("winapp.exe") ?? FindOnPath("winapp");
                if (winapp != null)
                {
                    runAttempted = true;
                    var runArgs = parsed.Detach ? new[] { "run", outputDir, "--detach", "--json" } : new[] { "run", outputDir, "--debug-output" };
                    finalExit = RunProcess(winapp, runArgs, options.Json ? null : Console.Out, options.Json ? null : Console.Error, out _, out _);
                }
                else if (!options.Quiet && !options.Json)
                {
                    Console.Error.WriteLine("WARNING: winapp CLI not found in PATH -- skipping run");
                    Console.Out.WriteLine($"Build output at: {outputDir}");
                }
            }

            if (options.Json)
            {
                Console.Out.WriteLine(JsonSerializer.Serialize(new ProjectBuildResultV1("winui.project.build.v1", true, runAttempted, outputDir, finalExit), WinUiJsonContext.Default.ProjectBuildResultV1));
            }
            else if (!options.Quiet)
            {
                Console.Error.WriteLine("BUILD SUCCEEDED");
                if (parsed.SkipRun) Console.Error.WriteLine("Skipping run (--skip-run)");
            }
            return finalExit;
        }
        finally
        {
            // BENCH-4: widened to wrap ALL post-build work so the temp
            // Directory.Build.props gets cleaned up even when a post-build MSBuild
            // target (e.g. winapp create-debug-identity) fails or the JSON emit
            // throws. Cleanup retries with backoff because MSBuild may still hold
            // file handles for a moment after a failure exit.
            analyzerInjection.Cleanup(options);
        }
    }

    private static void PrintUsage()
    {
        // Kept for any legacy callers; new help path goes through HelpRenderer.RenderVerb.
        Console.WriteLine("Usage: winui project build [--project <path>] [--skip-run] [--detach] [--configuration <cfg>] [--platform <platform>] [MSBuild args]");
    }

    private static bool CheckDeveloperMode()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock");
            return Convert.ToInt32(key?.GetValue("AllowDevelopmentWithoutDevLicense") ?? 0) == 1;
        }
        catch { return false; }
    }

    private static string? ResolveProject(string? project)
    {
        if (!string.IsNullOrWhiteSpace(project))
        {
            var full = Path.GetFullPath(project);
            if (Directory.Exists(full))
            {
                var inDir = Directory.GetFiles(full, "*.csproj", SearchOption.TopDirectoryOnly);
                return inDir.Length == 1 ? inDir[0] : null;
            }
            return File.Exists(full) && full.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) ? full : null;
        }
        var files = Directory.GetFiles(Directory.GetCurrentDirectory(), "*.csproj", SearchOption.TopDirectoryOnly);
        return files.Length == 1 ? files[0] : null;
    }

    private static bool IsWinUiProject(string csprojPath)
    {
        try
        {
            var text = File.ReadAllText(csprojPath);
            // Look for the WindowsAppSDK package reference; that's the load-bearing signal.
            return text.Contains("Microsoft.WindowsAppSDK", StringComparison.OrdinalIgnoreCase)
                || text.Contains("UseWinUI", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string? FindMsBuild()
    {
        var vswhere = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft Visual Studio", "Installer", "vswhere.exe");
        if (!File.Exists(vswhere)) return null;
        var psi = new ProcessStartInfo(vswhere, "-latest -requires Microsoft.Component.MSBuild -property installationPath") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        using var p = Process.Start(psi);
        if (p == null) return null;
        var install = p.StandardOutput.ReadToEnd().Trim();
        p.WaitForExit(15000);
        var candidate = Path.Combine(install, "MSBuild", "Current", "Bin", "MSBuild.exe");
        return File.Exists(candidate) ? candidate : null;
    }

    private static string? FindOnPath(string name)
    {
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            var candidate = Path.Combine(dir.Trim(), name);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static void EnsureProperty(List<string> args, string name, string value)
    {
        if (!args.Any(a => Regex.IsMatch(a, $"^[/|-]p:{Regex.Escape(name)}=", RegexOptions.IgnoreCase)))
            args.Add($"/p:{name}={value}");
    }

    private static string[] ToDotnetArgs(string project, List<string> args)
    {
        var result = new List<string> { "build", project };
        foreach (var a in args)
        {
            if (Regex.IsMatch(a, "^[/|-](restore|t:restore)$", RegexOptions.IgnoreCase)) continue;
            var m = Regex.Match(a, "^[/|-]p:(.+)$", RegexOptions.IgnoreCase);
            result.Add(m.Success ? $"-p:{m.Groups[1].Value}" : a);
        }
        return result.ToArray();
    }

    private static string? FindOutputDir(string project, string platform, string configuration)
    {
        var projectDir = Path.GetDirectoryName(Path.GetFullPath(project)) ?? Directory.GetCurrentDirectory();
        var binDir = Path.Combine(projectDir, "bin", platform, configuration);
        if (!Directory.Exists(binDir)) return null;
        var tfm = Directory.GetDirectories(binDir, "net*").OrderByDescending(Path.GetFileName).FirstOrDefault();
        if (tfm == null) return null;
        var rid = Path.Combine(tfm, "win-" + platform.ToLowerInvariant());
        return Directory.Exists(rid) ? rid : tfm;
    }

    private static int RunProcess(string fileName, string[] args, TextWriter? stdout, TextWriter? stderr, out string capturedOut, out string capturedErr)
    {
        var captureOut = stdout == null;
        var captureErr = stderr == null;
        var psi = new ProcessStartInfo(fileName) { UseShellExecute = false, RedirectStandardOutput = captureOut, RedirectStandardError = captureErr };
        foreach (var arg in args) psi.ArgumentList.Add(arg);
        using var process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start {fileName}.");

        // Drain both streams concurrently to avoid the classic Process pipe-buffer deadlock:
        // if either pipe fills (~4-64KB) while the parent is blocked on the other, the child
        // process stalls before it can exit. Real MSBuild output easily exceeds that.
        var outTask = captureOut ? process.StandardOutput.ReadToEndAsync() : Task.FromResult("");
        var errTask = captureErr ? process.StandardError.ReadToEndAsync() : Task.FromResult("");
        Task.WaitAll(outTask, errTask);
        process.WaitForExit();

        capturedOut = outTask.Result;
        capturedErr = errTask.Result;
        if (stdout != null && capturedOut.Length > 0) stdout.Write(capturedOut);
        if (stderr != null && capturedErr.Length > 0) stderr.Write(capturedErr);
        return process.ExitCode;
    }

    private sealed record BuildArgs(string? Project, bool SkipRun, bool Detach, string? Configuration, string? Platform, bool Help, bool SkipDeveloperModeCheck, bool Force, List<string> ExtraArgs)
    {
        public static BuildArgs Parse(string[] args)
        {
            string? project = null, config = null, platform = null;
            bool skipRun = false, detach = false, help = false, skipDevMode = false, force = false;
            var extra = new List<string>();
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--help": case "-h": help = true; break;
                    case "--project" when i + 1 < args.Length: project = args[++i]; break;
                    case "--skip-run": case "-SkipRun": skipRun = true; break;
                    case "--detach": case "-Detach": detach = true; break;
                    case "--configuration" when i + 1 < args.Length: config = args[++i]; extra.Add($"/p:Configuration={config}"); break;
                    case "--platform" when i + 1 < args.Length: platform = args[++i]; extra.Add($"/p:Platform={platform}"); break;
                    case "--skip-developer-mode-check": skipDevMode = true; break;
                    case "--force": force = true; break;
                    default:
                        if (project == null && args[i].EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)) project = args[i];
                        else extra.Add(args[i]);
                        break;
                }
            }
            return new(project, skipRun, detach, config, platform, help, skipDevMode, force, extra);
        }
    }
}
