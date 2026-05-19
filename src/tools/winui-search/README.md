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
| Community Toolkit samples | Same pattern — embedded snapshot + on-demand GitHub fetch from `CommunityToolkit/Windows@main`. C# samples have platform `#if WINAPPSDK / #else / #endif` folded so emitted code compiles cleanly against WinAppSDK. |
| Toolkit author keywords | `Data/toolkit-keywords.json` — hand-picked terms from each sample's `.md` frontmatter `keywords:` list, surfaced as a higher-weighted BM25 field separate from auto-extracted tags. |
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

For a deeper breakdown of every input — which GitHub paths are scraped, how
tags/keywords are derived, and how each `Data\*.json` file is regenerated —
see [`DATA_SOURCES.md`](DATA_SOURCES.md).

## Building

Requires the .NET 10 SDK. From the repo root:

```powershell
# Plain build (faster iteration; no AOT)
dotnet build src/tools/winui-search/winui-search.csproj -c Release

# Native-AOT publish + deploy to src/skills/winui-search/winui-search.exe
.\scripts\build-search.ps1

# Cross-publish for ARM64 from an x64 host
.\scripts\build-search.ps1 -Runtime win-arm64

# Build only, don't deploy to the skill folder
.\scripts\build-search.ps1 -SkipPublish
```

`build-search.ps1` produces a self-contained ~8 MB single-file `winui-search.exe`
under `src/tools/winui-search/bin/Release/net10.0/<rid>/publish/` and copies it
into `src/skills/winui-search/winui-search.exe` (currently distributed via the
`winui-search` skill, which `winui-design` and `winui-dev-workflow` depend on).

For a one-shot rebuild of all three tools (analyzer DLL refresh + AOT exes for
host arch), use [`scripts/build-tools.ps1`](../../../scripts/build-tools.ps1)
from the repo root.

## Architecture

* `Program.cs` — entry point, command parsing, opportunistic background-refresh
  hook on hot-path commands.
* `DataLoader.cs` — loads the embedded JSON snapshots into memory at startup.
* `GalleryFetcher.cs` / `ToolkitFetcher.cs` — `update`-mode network code that
  re-pulls snapshots from GitHub. `ToolkitFetcher` also folds platform `#if`
  blocks (`#if WINAPPSDK / #else / #endif`) so emitted samples are clean
  WinAppSDK code without UWP/Uno preprocessor noise.
* `BackgroundUpdater.cs` — stale-while-revalidate refresher: hot-path commands
  spawn a detached `winui-search update --background` child if the GitHub cache
  is older than 7 days. Concurrency-safe (atomic `update.lock`, 10-min TTL,
  1-hour failure backoff). See "Background updates" below.
* `CacheVersion.cs` — single source of truth for cache schema versioning. Both
  fetchers stamp `CacheVersion.Current` into `schema-version.txt`; mismatched
  caches are discarded on read so embedded JSON wins until the next refresh.
* `SearchEngine.cs` + `BM25.cs` — BM25 scoring with stop-word filtering
  (`StopWords.cs`) and synonym expansion (`Synonyms.cs`).
* `Notes.cs` — embeds extra context strings appended to result snippets when
  the agent benefits from a hint (e.g. "this scenario lives under
  `Samples/CommandBar/CommandBarPage.xaml`, but the canonical control template
  is in `CommonStyles/CommandBar.xaml` — read both").
* `Models.cs` — the `Scenario` / `Tag` POCOs the search engine operates on.

## Usage

```text
winui-search search <query> [<query2> ...] [--max N] [--source S]
    Search for control patterns by description. Multiple queries are batched
    into a single response, grouped by control.

winui-search get <id> [<id2> ...]
    Get full XAML + C# code (plus NuGet/xmlns prereqs and pitfall notes) for
    one or more scenario ids. Skill convention is ≤3 ids per call.

winui-search list [--source S]
    List all available patterns.

winui-search debug <query>
    Diagnostic dump: query preprocessing, token expansion, top-N grouped
    matches without the score floor. Useful for tuning queries / synonyms.

winui-search update
    Force a synchronous re-fetch from GitHub (clears the on-disk cache and
    repopulates it). Takes ~10s. Normally not needed — see "Background
    updates" below.
```

`--source <gallery|toolkit|core>` restricts results to a single source on
both `search` and `list` (case-insensitive, single value). Useful when you
already know the answer is a Toolkit-only control or a curated core pattern
and want to skip Gallery noise.

Output is compact text designed for agent consumption — `search` returns a
short header per match, `get` returns fenced XAML/C# blocks plus prerequisite
hints separated by `---`.

## Background updates

Hot-path commands (`search` / `get` / `list` / `debug`) never block on a
GitHub fetch. After answering, they consult `BackgroundUpdater.TryKickoffIfStale()`,
which spawns a detached `winui-search update --background` child when:

1. `last-github-update.txt` is older than 7 days (or absent), AND
2. `last-github-attempt.txt` is older than 1 hour (rate-limit on failures), AND
3. No other process holds `update.lock` (atomic `FileMode.CreateNew`; a 10-min
   TTL reaps locks orphaned by a crashed child).

The child fetches GitHub and updates the cache while the user has already
received their answer. Detach is true fire-and-forget on Windows: the parent
exits within ~1.5 s on a cold cache, and the child outlives it without
blocking pipes.

Environment overrides:

| Variable | Effect |
|---|---|
| `WINUI_SEARCH_NO_BACKGROUND=1` | Skip the spawn entirely. Use in CI, sandboxed networks, or when offline. |
| `WINUI_SEARCH_DEBUG=1` | Emit a trace to `%LOCALAPPDATA%\winui-search\cache\background.log` for diagnosing the spawn / fetch / lock lifecycle. |

The internal `--background` flag on `winui-search update` is for the spawned
child only — it suppresses console output, skips the cache wipe (so the lock
file survives), and writes only the timestamp markers. Don't pass it manually.

## Cache layout

```
%LOCALAPPDATA%\winui-search\cache\
  schema-version.txt        # Stamped with CacheVersion.Current
  last-github-update.txt    # Last successful GitHub fetch (UTC ISO)
  last-github-attempt.txt   # Last attempted fetch (success or failure)
  update.lock               # Held by spawned child while fetching
  background.log            # Optional trace (WINUI_SEARCH_DEBUG=1 only)
  gallery\
    scenarios.json
    tags.json
    schema-version.txt
    last-updated.txt
  toolkit\
    scenarios.json
    tags.json
    keywords.json
    schema-version.txt
    last-updated.txt
```

The on-disk cache is per-user and discarded when `CacheVersion.Current` bumps;
embedded JSON in the exe is the safety net.

## Tests

None yet. Tracked by the `tool-winui-search-improvement-plan` todo and
launch tracker §12.3.

## Status

**Preview / unsigned**, ships from this repo as a committed prebuilt exe inside
the consuming skill payload. Long-term homes under consideration: publish as a
`dotnet tool` on NuGet, or fold into [`microsoft/winappcli`](https://github.com/microsoft/winappcli)
as a `winapp search` subcommand. Decision tracked in launch tracker §12.4 +
the open `skill-distribution-decision` todo.
