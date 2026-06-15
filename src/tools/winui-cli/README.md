# winui-cli (`winui.exe`)

Native-AOT sidecar that exposes a single `winui <noun> <verb>` surface over
the other in-repo WinUI tooling (the WinUI 3 / Windows App SDK Roslyn
analyzer, `winmd-cli`, and `winui-search`). It exists so framework-agnostic
hosts (e.g. [`winappcli`](https://github.com/microsoft/winappcli)) can
sideload one binary and get everything the `winui` plugin needs at
runtime, instead of bundling four exes and three install paths.

The published artifact lives at `plugins/winui/winui.exe`. JSON-mode
payload schemas live alongside it at `plugins/winui/schemas/*.json` and
are regenerated from source by the bundled `winui-schema-emit` tool.

## Surface

Four nouns, ~19 verbs total. Run `winui --help` for the live tree.

| Noun | Verbs | Backed by |
|---|---|---|
| `api` | `search`, `members`, `signature`, `lookup-attribute`, `list-namespaces`, `list-types`, `update`, `info`, `path`, `prune` | `src/tools/winmd-cli` (library) |
| `controls` | `search`, `detail`, `update` | `src/tools/winui-search` (library) |
| `project` | `build` (transiently injects the embedded analyzer per build, then hands off to `winapp run`) | scaffolding + MSBuild driver |
| `analyzer` | `info` | embedded analyzer DLL payload (read-only) |

Every verb accepts `--json` and produces a payload tagged with a
`schema: "winui.<noun>.<verb>.v1"` field. Errors and help output share the
same envelope shape (`winui.error.v1`, `winui.help.v1`) so hosts only
have to parse one error contract.

## Building

```powershell
# Build everything (analyzer + winmd-cli + winui-search + winui-cli + schemas).
./scripts/build-tools.ps1

# Quick local iteration — skip tests and payload copy.
./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh

# Verify committed plugins/winui/schemas/*.json match source. Use in CI.
./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh -CheckSchemaDrift
```

The script AOT-publishes `winui.exe` to
`src/tools/winui-cli/bin/Release/net10.0/win-x64/publish/` and (unless
`-SkipPayloadRefresh`) copies it to `plugins/winui/winui.exe`.

## JSON schemas

`SchemaGen/` is a small `MetadataLoadContext`-based console tool that walks
every record in `Schemas/JsonPayloads.cs` tagged with
`[WinUiJsonSchema("winui.<noun>.<verb>.v1")]` and emits a JSON Schema
(Draft 2020-12) plus a `manifest.json` with SHA-256 hashes.

The contract is: **never hand-edit a file under `plugins/winui/schemas/`**.
Change the record in `Schemas/JsonPayloads.cs`, re-run
`./scripts/build-tools.ps1`, and commit the regenerated schemas. The
`-CheckSchemaDrift` flag fails the build if the staged schema set
(added / changed / removed) doesn't match the committed copy.

## Why one exe instead of three

Hosts can sideload `winui.exe` once and get a single help tree, a single
JSON contract, and a single set of versioned schemas. Each `<noun> <verb>`
still maps to the same underlying tool source — the libraries under
`src/tools/winmd-lib/` and `src/tools/winui-search-lib/` share source with
the standalone `winmd-cli` and `winui-search` exes so behavior stays in
lockstep.
