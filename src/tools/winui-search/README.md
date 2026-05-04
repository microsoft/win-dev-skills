# winui-search — WinUI 3 Gallery & Community Toolkit Scenario Search

A native-AOT CLI that searches for sample scenarios across two WinUI 3 reference
codebases ([WinUI Gallery](https://github.com/microsoft/WinUI-Gallery) and the
[Windows Community Toolkit](https://github.com/CommunityToolkit/Windows)) plus a
small curated catalog of core WinUI 3 patterns. Designed to be invoked by the
`winui-design` and `winui-dev-workflow` skills so a Copilot agent can answer
"what's the canonical WinUI sample for X?" without reading hundreds of XAML
files at runtime.

## What it indexes

| Source | How it's loaded |
|---|---|
| WinUI Gallery samples | Embedded JSON snapshot baked into the exe at build time, refreshable on demand via `winui-search update` (which re-fetches from `microsoft/WinUI-Gallery@main`). |
| Community Toolkit samples | Same pattern — embedded snapshot + on-demand GitHub fetch from `CommunityToolkit/Windows@main`. |
| Core WinUI 3 patterns | Hand-curated `Data/core-patterns.json` baked in. Used for foundational layouts (NavigationView, MVVM scaffolds, etc.) where pulling a Gallery scenario is overkill. |
| Tag dictionaries | `Data/gallery-tags.json` / `Data/toolkit-tags.json`, also embedded — used by the BM25 scoring to bias results toward category matches. |

The on-demand `update` mode does live `https://raw.githubusercontent.com` fetches
to refresh the cached payloads. Snapshots ship with the exe so the tool works
fully offline; `update` is opt-in.

> **Same-team caveat.** Both WinUI Gallery and Community Toolkit are owned by
> the same Microsoft team that ships this repo, so the embedded data isn't
> third-party vendoring in the legal sense — but it does still drift, and the
> `update` mode + the long-term plan in launch tracker §10.3 cover the
> cron-regenerate option.

## Building

Requires the .NET 10 SDK. From the repo root:

```powershell
# Plain build (faster iteration; no AOT)
dotnet build src/tools/winui-search/winui-search.csproj -c Release

# Native-AOT single-file exe for the host architecture (x64 or arm64)
dotnet publish src/tools/winui-search/winui-search.csproj -c Release

# Cross-publish for ARM64 from an x64 host
dotnet publish src/tools/winui-search/winui-search.csproj -c Release -r win-arm64
```

`dotnet publish` produces a self-contained ~15 MB single-file `winui-search.exe`
under `src/tools/winui-search/bin/Release/net10.0/<rid>/publish/`. Copy that into
the consuming skill folder (currently distributed via `winui-design` /
`winui-dev-workflow`).

For a one-shot rebuild of all three tools (analyzer DLL refresh + AOT exes for
host arch), use [`scripts/build-tools.ps1`](../../../scripts/build-tools.ps1)
from the repo root.

## Architecture

* `Program.cs` — entry point, command parsing.
* `DataLoader.cs` — loads the embedded JSON snapshots into memory at startup.
* `GalleryFetcher.cs` / `ToolkitFetcher.cs` — `update`-mode network code that
  re-pulls snapshots from GitHub.
* `SearchEngine.cs` + `BM25.cs` — BM25 scoring with stop-word filtering
  (`StopWords.cs`) and synonym expansion (`Synonyms.cs`).
* `Notes.cs` — embeds extra context strings appended to result snippets when
  the agent benefits from a hint (e.g. "this scenario lives under
  `Samples/CommandBar/CommandBarPage.xaml`, but the canonical control template
  is in `CommonStyles/CommandBar.xaml` — read both").
* `Models.cs` — the `Scenario` / `Tag` POCOs the search engine operates on.

## Usage

```text
winui-search <query>           Search across all sources, ranked by BM25 score.
winui-search --source gallery <query>    Restrict to WinUI Gallery.
winui-search --source toolkit <query>    Restrict to Community Toolkit.
winui-search --source core <query>       Restrict to core patterns.
winui-search update             Re-fetch the GitHub snapshots and rebuild caches.
```

Output is one result per line, prefixed with a `[score]` tag (`[100]` is a
perfect match) so it parses cleanly when consumed by an agent.

## Tests

None yet. Tracked by the `tool-winui-search-improvement-plan` todo and
launch tracker §12.3.

## Status

**Preview / unsigned**, ships from this repo as a committed prebuilt exe inside
the consuming skill payload. Long-term homes under consideration: publish as a
`dotnet tool` on NuGet, or fold into [`microsoft/winappcli`](https://github.com/microsoft/winappcli)
as a `winapp search` subcommand. Decision tracked in launch tracker §12.4 +
the open `skill-distribution-decision` todo.
