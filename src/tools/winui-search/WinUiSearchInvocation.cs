// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Single source of truth for the user-facing command prefix in winui-search
// hint/usage strings. Defaults to "winui-search" when invoked as the standalone
// exe; the winui-cli sidecar sets this to "winui controls" before dispatching
// so messages like "Usage: <prefix> get <id>" stay accurate across both
// invocation paths.
public static class WinUiSearchInvocation
{
    public static string CommandPrefix { get; set; } = "winui-search";
}
