# Third-Party Notices

This repository is licensed under the [MIT License](LICENSE). Any third-party
material added to the plugin must retain its original copyright notices and
licenses.

This file is informational and is updated whenever vendored content,
embedded data snapshots, or significant runtime dependencies change. For
machine-readable component governance metadata, see
[`cgmanifest.json`](cgmanifest.json).

## External development tools

The plugin does not vendor the WinUI analyzer, its NuGet dependencies, or the
metadata CLI. WinApp CLI and `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`
are installed separately and used under their respective licenses.

The removed C# source and test dependencies are no longer registrations in
`cgmanifest.json`; their build and dependency governance belong upstream in
[`microsoft/winappCli`](https://github.com/microsoft/winappCli).
