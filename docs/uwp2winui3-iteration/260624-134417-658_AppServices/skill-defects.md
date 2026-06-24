# Skill defects — `AppServices` (WILL change skill)

## 1. Bootstrap copies stale UWP `bin`/`obj` build output into the migrated tree
- **Problem:** Step 1 of `Initialize-UwpMigration.ps1` copies `.cs` by extension only,
  with no directory exclusion, so .NET-Native ILC generated sources
  (`obj\<arch>\Release\ilc\**\*.g.cs`, `*.McgInterop\ImplTypes.g.cs`) from the
  `AppServicesClient`/`AppServicesProvider` sub-projects were imported and compiled by
  the SDK-style `**/*.cs` glob → **173,913** errors; build hung; app never launched; 0/100.
- **Evidence:** `winui-build-first-errors.txt`; `migration-score.json` `winui_build_status`;
  `session-log.txt` L1339-1342 and the >600s build hang at TURN 60-64.
- **Skill state:** **wrong** — Step 1 copy (L60-85) lacks the `bin`/`obj` exclusion that
  Step 3 (L106), `Validate-UwpMigration.ps1` (L81) and `Test-AppLaunch.ps1` (L115) all have.
- **Fix:** Add the `$excludeDirs` directory filter to the Step 1 copy; add a
  `MIGRATION-PATTERNS.md` build-error entry as a diagnostic backstop.
- **Generalizes:** Any previously-built UWP source has `bin`/`obj`; nested sub-project
  `bin`/`obj` escape MSBuild's project-root-only default exclusion. Prevention fixes the
  whole scenario class.
