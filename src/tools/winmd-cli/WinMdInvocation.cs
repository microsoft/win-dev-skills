// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Single source of truth for the user-facing command prefix used inside winmd
// error messages and usage strings. Defaults to "winmd" when invoked as the
// standalone winmd.exe; the winui-cli sidecar sets this to "winui api" before
// dispatching, so messages like "Run '<prefix> update' first." stay accurate
// across both invocation paths.
public static class WinMdInvocation
{
	public static string CommandPrefix { get; set; } = "winmd";
}
