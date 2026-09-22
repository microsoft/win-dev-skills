# Microsoft.WindowsAppSDK.Analyzers — WinUI 3 / Windows App SDK Roslyn Analyzer

A Roslyn analyzer that catches common WinUI 3 / Windows App SDK pitfalls at
build time — UWP→WinUI 3 compatibility issues, runtime traps, MVVM
regressions, and interop bugs. Every diagnostic ships at `Warning` severity
(no rule is `Error`) and includes a `helpLinkUri`.

> **Retained development source, not the plugin's analyzer distribution.**
> The active implementation, tests, and package publishing now live in
> [`microsoft/winappCli/src/winapp-Analyzer`](https://github.com/microsoft/winappCli/tree/main/src/winapp-Analyzer).
> The plugin consumes **`Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`** from
> NuGet; its assembly is still `Microsoft.WindowsAppSDK.Analyzers`.
> This tree remains for reconciliation of pending work, including
> [#140](https://github.com/microsoft/win-dev-skills/pull/140). Local rule or
> driver changes do not automatically reach that package.

## Layout

```
src/tools/winui-analyzer/
├── Microsoft.WindowsAppSDK.Analyzers/         # the analyzer assembly (netstandard2.0)
│   ├── DiagnosticIds.cs / DiagnosticCategories.cs / HelpLinks.cs
│   ├── ProjectContext.cs                      # UWP-vs-greenfield project gate
│   ├── Allowlists.cs                          # declarative per-rule carve-outs
│   ├── ApiMappings.g.cs / FeatureMappings.g.cs # data-driven from Microsoft Learn
│   └── Rules/                                 # 9 DiagnosticAnalyzers
├── Microsoft.WindowsAppSDK.Analyzers.Tests/   # xUnit test project (net10.0)
├── docs/ROADMAP.md                            # what's planned next
├── RULES.md                                   # full rule catalog + ID methodology
├── CHANGELOG.md                               # analyzer-scoped changelog
├── Directory.Build.props                      # scoped — TWaE only inside this subtree
├── global.json                                # pins .NET 10 SDK
└── Microsoft.WindowsAppSDK.Analyzers.slnx     # solution file
```

The `Directory.Build.props` and `global.json` are intentionally scoped to this
subtree (not at repo root) so `TreatWarningsAsErrors=true` doesn't affect
unrelated projects.

## Rule categories

Rules use a 4-digit categorized ID scheme (`WUIcXxx` where `c` is the
category). IDs are immutable — once assigned, never reused, even if the rule
is removed. See [`RULES.md`](RULES.md) for the full per-rule catalog and the
migration table from the older `WUIxxx` 3-digit scheme.

| Category | Range | What it covers |
|---|---|---|
| UWP → WinUI 3 API compatibility | `WUI0xxx` | `Window.Current`, `CoreDispatcher`, `GetForCurrentView`, `using Windows.UI.Xaml` |
| Migration-table data-driven | `WUI1xxx` | UWP API has WinAppSDK equivalent / no equivalent / feature-area hint (driven by `ApiMappings.g.cs` + `FeatureMappings.g.cs`) |
| Runtime / layout / XAML pitfalls | `WUI2xxx` | Raw `TabView` content, nested `x:Bind` without fallback, `x:Bind` without `Mode`, null `Converter`, missing `AutomationId`, attached-property syntax |
| MVVM patterns | `WUI3xxx` | Old `[ObservableProperty]` field syntax |
| Interop | `WUI4xxx` | `WebView2` not initialized, removed ONNX Runtime GenAI APIs |

## Building & testing

Requires the .NET 10 SDK (a `global.json` in this directory pins to 10.0.x).

```powershell
# From this directory (src/tools/winui-analyzer/)
dotnet build Microsoft.WindowsAppSDK.Analyzers.slnx -c Release
dotnet test  Microsoft.WindowsAppSDK.Analyzers.slnx -c Release

# Or, from the repo root
dotnet build src/tools/winui-analyzer/Microsoft.WindowsAppSDK.Analyzers.slnx -c Release
```

The build emits `Microsoft.WindowsAppSDK.Analyzers.dll` under
`Microsoft.WindowsAppSDK.Analyzers/bin/Release/netstandard2.0/`. Do not commit
or copy it into a skill. Local source builds are for development and tests,
not a substitute for verifying the published package's integration.

For a one-shot build and test, use the repo-root helper:

```powershell
# Builds and tests the retained analyzer without producing a plugin payload.
./scripts/build-tools.ps1
```

## Distribution

There is no analyzer payload in the plugin and no local payload-provenance
gate. App projects reference the upstream NuGet package, whose targets
automatically supply the analyzer's XAML inputs.

The local project's historical package metadata is retained, with automatic
packing disabled. **Do not enable a parallel publication path here.**
Coordinate shipping changes upstream and retain the local build/test CI until
pending source work and compliance ownership are reconciled.

## Status

**Preview / `0.1.0-alpha`.** Rule IDs are immutable, but the rule set itself
will grow. Every rule has a `helpLinkUri` pointing at relevant Microsoft Learn
documentation. Ships at `Warning` severity (never `Error`) so adding a rule
can never break someone's build by default — they have to opt into
`TreatWarningsAsErrors` for the analyzer's diagnostics.

## Contributing

* Add new rules under `Microsoft.WindowsAppSDK.Analyzers/Rules/`. Reserve a
  fresh ID in `DiagnosticIds.cs` (don't reuse retired ones), wire a
  `helpLinkUri` into `HelpLinks.cs`, and add positive / negative / FP-guard
  tests under `Microsoft.WindowsAppSDK.Analyzers.Tests/Rules/`. Update
  `RULES.md` and `CHANGELOG.md`.
* Do not bump local package metadata to publish; package releases belong upstream.
* Don't put `Directory.Build.props` at the repo root — it would force
  `TreatWarningsAsErrors` onto unrelated projects.
