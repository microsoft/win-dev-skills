# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Until v1.0 there is no SemVer commitment — see the preview banner in the
[README](README.md). Skill names, on-disk layout, agent configuration,
analyzer rule IDs, and CLI tool surfaces may change between minor releases.

## [Unreleased]

This section tracks work landing on `main` since v0.2.3, including the
public-launch readiness pass tracked in `.launch/public-launch-tracker.md`.

### Added

- **WinUI 3 Roslyn analyzer ported in-tree as `Microsoft.WindowsAppSDK.Analyzers`** (`src/tools/winui3-analyzer/Microsoft.WindowsAppSDK.Analyzers/`). Replaces the previous `WinUI3.Analyzer` skeleton with the full source from the standalone `microsoft/WindowsAppSDK-Analyzers` repo (v0.1.0-alpha): categorized 4-digit IDs (`WUI0xxx`–`WUI4xxx`, immutable, sparse-retired), severity ceiling = `Warning`, `helpLinkUri` on every rule, `ProjectContext` UWP-vs-greenfield gate, declarative `Allowlists`, data-driven `ApiMappingAnalyzer` consuming `ApiMappings.g.cs` + `FeatureMappings.g.cs` from Microsoft Learn migration tables, plus a brand-new xUnit test project (47 tests, including a `SuppressionTests` regression suite verifying `#pragma warning disable` round-trips). Repo plumbing (`Directory.Build.props`, `.editorconfig`, `global.json` pinning .NET 10, `.slnx`) is scoped to the analyzer subtree only — intentionally NOT at repo root, where `TreatWarningsAsErrors=true` would break unrelated C# projects (`winui-search`, `winmd-cli`). The skill payload now ships `Microsoft.WindowsAppSDK.Analyzers.dll` + `.targets` (was `WinUI3.Analyzer.dll`); the standalone repo will be archived. **Breaking:** rule IDs renumbered from the old `WUI001`-style 3-digit scheme to the categorized 4-digit scheme (e.g. `WUI001` → `WUI2001`, `WUI008` → `WUI3001`, `WUI013-015` → `WUI4101-4103`); see `src/tools/winui3-analyzer/RULES.md` for the full migration table. Existing `#pragma warning disable WUIxxx` directives must be updated.
- **Initial WinUI 3 Roslyn analyzer scaffolding** (`src/tools/winui3-analyzer/`) shipping as a
  prebuilt DLL alongside the `winui-dev-workflow` skill, with a CI
  provenance check that hash-compares the committed DLL against a fresh
  CI build and fails the PR on drift.
- **`winmd` CLI** (`src/tools/winmd-cli/`) — native-AOT WinRT/.NET
  metadata indexer with `search`, `members`, `check-property`, `types`,
  `enums`, `namespaces`, `packages`, `projects`, `stats` commands. Reads
  XML doc comments from NuGet packages (the same source VS IntelliSense
  uses) and surfaces `[Deprecated]` / `GetForCurrentView()` warnings.
- **`winui-search` CLI** (`src/tools/winui-search/`) — native-AOT search
  over WinUI Gallery and Community Toolkit scenarios with embedded JSON
  snapshots and on-demand GitHub fetch (`GalleryFetcher`,
  `ToolkitFetcher`).
- Skills renamed from `winapp-*` to `winui-*` to reflect the WinUI 3
  focus.

### Public-launch readiness (in progress, on the `launch-prep` branch — not yet merged)

- Governance bundle: `LICENSE` (MIT, Microsoft Corporation and
  Contributors), `CODE_OF_CONDUCT.md`, `SUPPORT.md` adapted from
  `microsoft/winappcli` with this repo's skill-area label taxonomy and
  preview/no-SLA callout. `SECURITY.md` verified against the
  microsoft/winappcli template.
- `THIRD_PARTY_NOTICES.md` and `cgmanifest.json` registering
  `microsoft/WinUI-Gallery` and `CommunityToolkit/Windows` as runtime
  dependencies (MIT) plus the Roslyn NuGet packages.
- Issue and PR templates: `bug-report.yml` (with affected-skill
  dropdown and `session-report.md` prompt), `feature_request.yml`,
  `documentation.yml`, `config.yml` (blank issues disabled),
  `PULL_REQUEST_TEMPLATE.md` (with analyzer-rebuild checkbox and
  `<!-- ai-description-start/end -->` markers).
- CI workflows: `codeql.yml` (csharp + actions), `pr-validation.yml`
  (build all 3 C# tools with `-warnaserror`, validate `plugin.json`,
  validate every SKILL.md frontmatter, analyzer DLL provenance check,
  analyzer `.targets` sync check), `stale-issues.yml`,
  `dependency-review.yml`, `dependabot.yml` (weekly NuGet for the 3
  csprojs + github-actions).
- README additions: top-of-file preview/v0.x WARNING banner,
  `Network access` section disclosing the GitHub fetches by
  `winui-search`, and a `Bundled tools and binaries` section listing
  every unsigned artifact that ships from the repo together with its
  long-term home (NuGet, dotnet tool, fold into `winappcli`, or
  sunset).
- Per-skill `> [!NOTE]` preview blocks under each `SKILL.md`'s
  frontmatter, each carrying a hand-written one-line limitation
  specific to that skill.
- `winui-session-report` skill: new
  `Privacy and sensitivity — read before sharing` section warning
  users that `session-report.md` includes file contents, prompts
  verbatim, tool output, and error messages with no redaction —
  the user is responsible for what they share.
- `plugin.json` description prefixed with `[Preview]`; "Agent" →
  "Agents"; "WinUI (WinUI3)" → "WinUI 3".

### Fixed

- `winui-code-review/SKILL.md`: removed dead reference to a
  nonexistent `check.ps1`; clarified that the analyzer auto-loads on
  every `dotnet build` / `winapp build`.
- `winui-wpf-migration/SKILL.md`: removed the trailing References
  section that pointed at a `references/` directory that doesn't
  exist.
- `winui-session-report/SKILL.md`: typo "rosylyn" → "Roslyn".
- `winui-packaging/SKILL.md`: replaced placeholder
  `winapp store <args>` snippet with Microsoft Partner Center upload
  guidance (no first-party submit CLI exists yet); corrected the
  install-action reference — `microsoft/setup-winapp@v1` was the
  wrong slug, the real action is `microsoft/setup-WinAppCli@v0.1`.
- `src/tools/winmd-cli/README.md`: replaced references to a
  nonexistent `scripts/build-winmd.ps1` with direct `dotnet publish`
  invocations covering host-arch, cross-arm64, and plain build
  flows.
- `BuildAndRun.ps1`: wrapped the build invocation in `try`/`finally`
  so the temporary `Directory.Build.props` we drop into the user's
  project is removed even on Ctrl-C, exception, or unexpected exit.
- `Analyze-Session.ps1`: stripped leading UTF-8 BOM.
- `README.md`: typos (`automaticly` → `automatically`,
  `VisualStudio` → `Visual Studio`, `Winui3` → `WinUI 3`,
  `-6 skills` → `- 7 skills`, curly `'` → `'`).
- Removed orphan `scripts/winmd-cli/` Debug build output (working
  tree only — was never tracked in git).

## [0.2.3] — 2026-04-16

### Added

- Documentation for cutting a release (`docs/create-release.md`).

### Changed

- Revised installation notes; removed the build-release section from
  the README.

> v0.2.2 and v0.2.3 point at the same commit (`58c7d1a`); they are
> equivalent.

## [0.2.1] — 2026-04-13

### Added

- Initial Microsoft Learn documentation pointers across skills.

### Changed

- README: switched to a structured prerequisites + quick-start layout;
  fixed WinAppCLI link formatting.
- `plugin.json`: refreshed metadata.
- Internal: started restructuring the skill-builder workflow.

## [0.1.7] — 2026-03-24

### Added

- Retrospective step in the agent loop.
- Richer winapp-cli skill content with .NET vs non-.NET examples.
- Reference docs split out from `SKILL.md` (3 KB target) for several
  skills.
- Orchestrator-style agent (replaces the earlier orchestrator branch).

### Changed

- Plugin layout reworked under `nm/plugin-rething`; merged to main.
- Window-vs-`UIElement` guidance expanded based on user feedback.
- Multiple install-script and skills-path fixes.

### Fixed

- Install script bugs (#35).
- Various small fixes from early-adopter sessions.

## [0.1.6] — 2026-03 (intermediate)

### Changed

- Migrated to the orchestrator-style agent.

> v0.1.5 and v0.1.6 point at very close commits; treat them as a
> single rolling release.

## [0.1.5] — 2026-03 (intermediate)

### Added

- Uninstall script.

### Changed

- Design improvements; simplified skills and agents.

## Earlier (pre-0.1.5)

Initial experiments with the plugin layout, skill structure, and
reference-doc extraction. See `git log` for full history; everything
before 0.1.5 was iteration toward the current shape and is not
re-cataloged here.

[Unreleased]: https://github.com/microsoft/win-dev-skills/compare/v0.2.3...HEAD
[0.2.3]: https://github.com/microsoft/win-dev-skills/compare/v0.2.1...v0.2.3
[0.2.1]: https://github.com/microsoft/win-dev-skills/compare/v0.1.7...v0.2.1
[0.1.7]: https://github.com/microsoft/win-dev-skills/compare/v0.1.5...v0.1.7
[0.1.6]: https://github.com/microsoft/win-dev-skills/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/microsoft/win-dev-skills/releases/tag/v0.1.5
