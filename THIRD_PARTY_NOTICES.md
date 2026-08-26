# Third-Party Notices

This repository incorporates material from the projects listed below. The
original copyright notices and licenses apply to those portions; the rest of
the repository is licensed under the [MIT License](LICENSE).

This file is informational and is updated whenever vendored content,
embedded data snapshots, or significant runtime dependencies change. For
machine-readable component governance metadata, see
[`cgmanifest.json`](cgmanifest.json).

## NuGet runtime dependencies

The C# tools under `src/tools/` reference the following NuGet packages.
Each package's license is declared in its own `.nuspec` and is consumed
under those terms:

- `Microsoft.CodeAnalysis.CSharp` — Apache-2.0
- `Microsoft.CodeAnalysis.Analyzers` — Apache-2.0

Transitive dependencies are tracked by the SDK at restore time and are not
duplicated here. See `cgmanifest.json` for the canonical machine-readable
list.
