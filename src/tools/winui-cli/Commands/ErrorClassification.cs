namespace WinUi.Cli.Commands;

// Heuristic: the inner winmd-cli and winui-search both collapse every failure to
// exit 1, with no usage-vs-execution discrimination. The bench surfaced this as
// BENCH-2 — hosts can't tell "you called me wrong" from "infrastructure broke."
// We pattern-match the captured stderr/stdout for known usage-error indicators
// and re-map to UsageError (exit 2). Everything else stays ExecutionError (exit 4).
internal static class ErrorClassification
{
    private static readonly string[] UsagePhrases = new[]
    {
        "must be a positive integer",
        "must be a non-negative integer",
        "cannot be empty",
        "is required.",
        "Multiple projects cached",
        "Unknown command",
        "Unknown option",
        "Invalid argument",
        "Pass --project",
        "No .csproj",
        "search query is required",
    };

    public static ExitCode Classify(string captured)
    {
        if (string.IsNullOrWhiteSpace(captured)) return ExitCode.ExecutionError;
        foreach (var phrase in UsagePhrases)
        {
            if (captured.Contains(phrase, StringComparison.OrdinalIgnoreCase))
                return ExitCode.UsageError;
        }
        return ExitCode.ExecutionError;
    }
}
