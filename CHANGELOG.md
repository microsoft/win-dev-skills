# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the project is in `0.x` (preview), **minor** version bumps may include
breaking changes — see the README warning. Once we ship `1.0.0` we will follow
strict SemVer.

## [Unreleased]

<!--
Maintainers: do NOT edit this section in feature PRs.
The promotion PR (staging → main) moves entries from here into a new
`## [X.Y.Z] — YYYY-MM-DD` section above and bumps the version in:
  - plugins/winui/plugin.json (version)
  - .github/plugin/marketplace.json (metadata.version, plugins[].version)
  - .claude-plugin/marketplace.json (version, plugins[].version)
The `version-bump` and `changelog-entry` CI jobs enforce this.
-->

### Added

### Changed

### Fixed

### Removed

### Deprecated

## [0.3.1] — 2026-05-19

### Added

- `winui-dev` agent: window sizing rubric, screenshot validation step, and
  anti-self-delegation guardrails (#84).
- `winui-search`: batched CLI mode, background cache refresh, BM25-based
  ranking, and upgraded WinUI Gallery + Community Toolkit data fetchers (#83).

### Changed

- CI: `pr-validation` workflow now also runs on PRs targeting `staging`.
- Bumped `coverlet.collector` from 10.0.0 to 10.0.1 (#87).

## [0.3.0] — 2026-05-13

Baseline entry covering everything currently shipped on `main` at the time the
release process was introduced. Future releases will list per-PR changes here.

### Added

- Initial public preview of the `winui` plugin: `winui-dev` agent and the eight
  skills (`winui-dev-workflow`, `winui-design`, `winui-code-review`,
  `winui-ui-testing`, `winui-packaging`, `winui-wpf-migration`,
  `winui-session-report`, `winui-setup`).
- In-repo tools: `Microsoft.WindowsAppSDK.Analyzers` (Roslyn analyzer),
  `winui-search` (Native AOT search over WinUI Gallery + Community Toolkit),
  `winmd-cli` (Native AOT WinRT/.NET metadata indexer).
- CI provenance jobs guarding the committed analyzer DLL and `winui-search.exe`
  against source drift.
- Marketplace manifest under `.github/plugin/marketplace.json` and Claude Code
  marketplace manifest under `.claude-plugin/marketplace.json`.
