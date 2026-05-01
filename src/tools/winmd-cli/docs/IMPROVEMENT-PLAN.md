# winmd-cli — Improvement Plan

Tracks the gap between today's preview build and a "stable, externally
distributable" v1.0. See [`README.md`](../README.md) for what the tool
already does. Cross-referenced from the launch tracker §12.3 and the
`tool-winmd-improvement-plan` todo.

## v0.x → 1.0 (preview hardening)

- [ ] **Tests.** The tool currently has no automated tests. Minimum bar:
  - Unit tests for `Scoring.cs` (exact / prefix / contains / acronym /
    subsequence ordering) — pure functions, easy to cover.
  - Unit tests for `WinMdParser.cs` against a tiny fixture `.winmd`
    (e.g. one synthetic class with one `[Deprecated]` member) so the
    PE-metadata path is exercised without depending on the host SDK.
  - Integration test that runs `winmd update` + `winmd search TabView`
    against a checked-in minimal `project.assets.json` fixture and
    asserts a non-empty result. Run on Windows CI only.
- [ ] **Cache invalidation.** Today the cache is rebuilt only when
  `project.assets.json` is newer than the cached manifest. Misses:
  - Windows SDK upgrades (UnionMetadata path changes) — add a hash of
    the resolved `Windows.winmd` mtime + size to the manifest.
  - WinAppSDK runtime upgrades (`Get-AppxPackage` version drift) — add
    the resolved runtime version to the manifest and invalidate on
    change.
  - User-driven `winmd update --force` flag for the "I just edited the
    cache by hand, please rebuild" case.
- [ ] **JSON output mode.** Every query command should accept
  `--format json` and emit a stable schema (versioned via a top-level
  `"schema": 1` field). Unblocks consumption from non-CLI hosts (MCP
  server, IDE extensions, etc.). The text format stays the default for
  agent and human use.
- [ ] **Exit codes.** Standardize:
  - `0` — success, results found
  - `1` — success, no results (currently conflated with error)
  - `2` — usage error (bad args, missing project)
  - `3` — cache miss / `update` required
  - `4` — internal error
  Document in `README.md` and in `--help` output.
- [ ] **ARM64 CI.** `pr-validation.yml`'s `winmd-cli-provenance` job
  builds/publishes for the host arch only. Add a cross-publish job
  (`-r win-arm64`) that smoke-tests `winmd --version` under x64 emulation
  to catch AOT trimming regressions on ARM64 before users hit them.

## v1.0 distribution decision

Pick one (tracker §12.4 / `skill-distribution-decision` todo):

1. **Publish as a `dotnet tool` on NuGet** — `dotnet tool install -g
   microsoft.winmd-cli`. Csproj already has the metadata fields; needs
   `PackAsTool=true`, a versioning policy (semver from a git tag), and
   a release workflow modelled on the analyzer's `release.yml`.
2. **Fold into [`microsoft/winappcli`](https://github.com/microsoft/winappcli)
   as `winapp winmd <subcommand>`.** Avoids a separate install step for
   anyone who already has `winapp` for `run` / `launch`. Trade-off: the
   tool's lifecycle gets coupled to `winappcli`'s release cadence.
3. **Keep shipping the prebuilt exe inside the `winui-dev-workflow`
   skill payload.** Acceptable for now; the `winmd-cli-provenance` CI
   job proves the committed exe matches HEAD. Long-term we still want
   one of (1) or (2).

The decision lives with the broader skill-distribution call. Until it
lands, ship the exe in-tree (status quo).

## Out of scope (for now)

- **Telemetry.** The tool is read-only against local metadata; it
  should never phone home.
- **A long-running daemon mode.** AOT cold start is already <50ms on
  cached queries. Not worth the complexity.
- **Cross-platform support.** WinMD is a Windows-only metadata format.
  Linux / macOS hosts have no story here.
