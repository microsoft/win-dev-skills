# winui-cli (`winui.exe`)

Native-AOT sidecar that exposes a single `winui <noun> <verb>` surface over
the other in-repo WinUI tooling (the WinUI 3 / Windows App SDK Roslyn
analyzer, `winmd-cli`, and `winui-search`). It exists so framework-agnostic
hosts (e.g. [`winappcli`](https://github.com/microsoft/winappcli)) can
sideload one binary and get everything the `winui` plugin needs at
runtime, instead of bundling four exes and three install paths.

The AOT-published artifact is built to
`src/tools/winui-cli/bin/Release/net10.0/win-x64/publish/winui.exe`.
JSON-mode payload schemas live at `src/tools/winui-cli/schemas/*.json` and
are regenerated from source by the bundled `winui-schema-emit` tool.

## Surface

Four nouns, ~19 verbs total. Run `winui --help` for the live tree.

| Noun | Verbs | Backed by |
|---|---|---|
| `api` | `update`, `search`, `members`, `types`, `enums`, `check-property`, `namespaces`, `packages`, `projects`, `stats` | `src/tools/winmd-cli` (library) |
| `controls` | `search`, `get`, `list`, `update` | `src/tools/winui-search` (library) |
| `project` | `build` (transiently injects the embedded analyzer per build, then hands off to `winapp run`) | scaffolding + MSBuild driver |
| `analyzer` | `info` | embedded analyzer DLL payload (read-only) |

Every verb accepts `--json` and produces one of two payload shapes:

- **`winui.text-result.v1`** — for verbs that wrap the underlying CLI's text
  output (most `api` and `controls` verbs today). Carries `schema`,
  `verb` (e.g. `"api.update"`, `"controls.search"`), `exitCode`, `output`.
  Consumers dispatch on the `verb` field.
- **Structured payloads** — verbs whose output has real typed fields get
  their own schema (e.g. `winui.project.build.v1`,
  `winui.analyzer.info.v1`). New structured schemas are added when a verb
  graduates beyond opaque text.

Errors and help share envelope shapes (`winui.error.v1`, `winui.help.v1`)
so hosts only have to parse one error contract.

Every emitted shape has a committed schema under `src/tools/winui-cli/schemas/`.
The build's `-CheckSchemaDrift` gate fails if a record's shape changes
without regenerating the schema, so the `schema` discriminator in every
payload corresponds to a contract the host can rely on.

## Building

```powershell
# Build everything (analyzer + winmd-cli + winui-search + winui-cli + schemas).
./scripts/build-tools.ps1

# Quick local iteration — skip tests and payload copy.
./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh

# Verify committed src/tools/winui-cli/schemas/*.json match source. Use in CI.
./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh -CheckSchemaDrift
```

The script AOT-publishes `winui.exe` to
`src/tools/winui-cli/bin/Release/net10.0/win-x64/publish/`.

## JSON schemas

`SchemaGen/` is a small `MetadataLoadContext`-based console tool that walks
every record in `Schemas/JsonPayloads.cs` tagged with
`[WinUiJsonSchema("winui.<name>.v1")]` and emits a JSON Schema
(Draft 2020-12) plus a `manifest.json` with SHA-256 hashes. The `schema`
field on every record is locked to its declared id via JSON Schema `const`
so a payload claiming a shape it doesn't have fails validation.

The contract is: **never hand-edit a file under `src/tools/winui-cli/schemas/`**.
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
