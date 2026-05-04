# Roadmap

Tracks the path to a stable 1.0 and beyond. See `RULES.md` for the current rule catalog
and `CHANGELOG.md` for shipped changes.

## v0.x (alpha → beta)

- [x] **Project context detector** — UWP-migration vs greenfield project heuristic
      so migration-only rules don't flag pure WinUI 3 codebases.
      ([`ProjectContext.cs`](../src/Microsoft.WindowsAppSDK.Analyzers/ProjectContext.cs))
- [x] **Per-rule allowlist mechanism** — generalized the `ConnectedAnimationService`
      carve-out into reusable infrastructure.
      ([`Allowlists.cs`](../src/Microsoft.WindowsAppSDK.Analyzers/Allowlists.cs))
- [x] **Suppression regression tests** — every rule has a `#pragma warning disable WUIxxxx`
      test. ([`SuppressionTests.cs`](../tests/Microsoft.WindowsAppSDK.Analyzers.Tests/Rules/SuppressionTests.cs))
- [x] **Real-world corpus regression script** — runs the analyzer over WinUI Gallery
      (and any other repos added to the list) on a weekly CI job.
      ([`tools/run-corpus.ps1`](../tools/run-corpus.ps1))
- [x] **Release pipeline scaffold** — pack, optional sign, NuGet publish, GitHub Release
      on tag push. Signing step is a placeholder until an HSM/Key Vault is wired.
      ([`.github/workflows/release.yml`](../.github/workflows/release.yml))
- [ ] **Semantic-only audit pass** — re-verify every rule uses `SemanticModel` for type
      checks; ban identifier-name-only matches except for unique tokens. Tracked as a
      review item; the new `WUI1xxx` rules are already 100% semantic.
- [ ] **Skill-template flip** — once the package ships to NuGet, update
      `microsoft/win-dev-skills` `winui3-dev-workflow` skill to inject via
      `<PackageReference>` instead of the in-tree DLL drop.
- [ ] Coverage ≥90% (CI enforced).

## v1.0

- [ ] Authenticode signing wired to a real cert/HSM (uncomment placeholder in
      `release.yml`, add secrets, validate end-to-end).
- [ ] First stable release published to NuGet.org.
- [ ] Corpus expanded to ≥3 repos building reliably in CI (Files, DevHome, etc.).
- [ ] Diagnostic baseline file committed so the corpus job hard-fails on new flags.

## Coverage expansion (post-1.0)

- [x] **Codify the WinAppSDK API mapping table** — ~30 mappings in
      [`ApiMappings.g.cs`](../src/Microsoft.WindowsAppSDK.Analyzers/ApiMappings.g.cs). Adding more is a data PR.
- [x] **Codify the feature mapping table** — 8 feature areas in
      [`FeatureMappings.g.cs`](../src/Microsoft.WindowsAppSDK.Analyzers/FeatureMappings.g.cs).
- [ ] **Migration overview gaps** — most overview content overlaps with the API/feature
      tables now codified. Remaining gaps: `IInitializeWithWindow` for pickers/dialogs,
      multi-instancing (`AppInstance`), Win32 App Isolation hints. Tracked as
      `WUI0005`–`WUI0008` candidates.
- [ ] **Build-time scraper** — replace hand-curated `*.g.cs` with a CI step that fetches
      Microsoft Learn pages and regenerates them, gated on a manual review of the diff.

## Out of scope (for now)

- **CodeFix providers.** Tracked separately. Will revisit after 1.0 if there's demand.
- **Telemetry.** The analyzer never phones home and never writes diagnostic logs to disk.
