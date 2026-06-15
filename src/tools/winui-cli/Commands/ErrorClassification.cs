namespace WinUi.Cli.Commands;

// The inner winmd-cli and winui-search both collapse every failure to exit 1, with
// no usage-vs-execution discrimination. BENCH-2 surfaced this: hosts can't tell
// "you called me wrong" from "infrastructure broke." We discriminate by inspecting
// captured stderr for one of two contracts:
//
//   1. A `[USAGE]` sentinel prefix (preferred — see UsageError helper below).
//      Underlying CLIs that adopt the sentinel get robust classification with no
//      string matching at all.
//
//   2. A small allow-list of stable line-leading prefixes from the underlying CLIs
//      that haven't been migrated to the sentinel yet. These ARE brittle to
//      reword — every entry below is a contract with the upstream CLI source and
//      must be updated in lockstep if the wording changes. The marker comment on
//      each line points at the source-of-truth file.
//
// Anything else falls through to ExecutionError (exit 4).
internal static class ErrorClassification
{
    public const string UsageSentinel = "[USAGE]";

    // Each entry is matched at the start of a trimmed stderr line. Anchoring to
    // line-start avoids false positives from prose that happens to contain one of
    // these tokens further into a multi-line error.
    private static readonly string[] UsageLinePrefixes = new[]
    {
        "Error: ",                       // winmd-cli QueryEngine.cs: all "Error: <validation>" lines
        "Unknown command",               // winmd-cli Program.cs:81
        "Unknown option",                // winui-search Program.cs argument parser
        "Multiple projects cached",      // winmd-cli Program.cs:500
        "No .csproj",                    // winmd-cli Program.cs:528
        "--max must be",                 // winui-search Program.cs --max validation
        "Search query cannot be empty",  // winui-search Program.cs
    };

    public static ExitCode Classify(string captured)
    {
        if (string.IsNullOrWhiteSpace(captured)) return ExitCode.ExecutionError;
        if (captured.Contains(UsageSentinel, StringComparison.Ordinal)) return ExitCode.UsageError;

        foreach (var rawLine in captured.Split('\n'))
        {
            var line = rawLine.TrimStart();
            foreach (var prefix in UsageLinePrefixes)
            {
                if (line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return ExitCode.UsageError;
            }
        }
        return ExitCode.ExecutionError;
    }
}
