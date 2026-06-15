namespace WinUi.Cli.Commands;

internal enum ExitCode
{
    Success = 0,
    UsageError = 2,
    NotFound = 3,
    ExecutionError = 4,
    DependencyMissing = 5
}
