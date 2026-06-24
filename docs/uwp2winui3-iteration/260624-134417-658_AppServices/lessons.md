# Lessons — `AppServices` UWP→WinUI 3 migration (score 0/100)

## Headline
The migrated project **never built** (`dotnet build` → 173,913 errors, then a build that
hung >600s). Every scenario FAILed on reachability — the app never launched. One root
cause explains all of it.

## Root cause
`Initialize-UwpMigration.ps1` **Step 1 copy** recurses the UWP `Source` and copies every
`.cs` **including build output** — it is the *only* step missing the `bin`/`obj`
exclusion that Step 3, `Validate-UwpMigration.ps1`, and `Test-AppLaunch.ps1` all apply.
The AppServices sample is multi-project (`AppServicesClient` + `AppServicesProvider`),
each previously built, so their `obj\<arch>\Release\ilc\**\*.g.cs` and
`*.McgInterop\ImplTypes.g.cs` .NET-Native generated sources were copied into the target.
The SDK-style WinUI `.csproj` globs `**/*.cs`; MSBuild's default `bin`/`obj` exclusion
only covers the **project-root** `bin`/`obj`, so the **nested** sub-project ones were
compiled → CS0101 duplicate types, CS0227 unsafe, CS0234 missing namespace, WMC9999.

## Dev-agent struggle
In the last turns the agent just re-ran `dotnet build` against the poisoned tree; the
final build hung past 600s and the session ended unresolved. It never traced the CS0101
flood back to copied-in `*\obj\...\ilc\*.g.cs`.

## Takeaway (general)
Build output is never source. The bootstrap must guarantee that only real inputs
(`.xaml/.cs/.resw/.appxmanifest`/assets) — and never `bin`/`obj` — enter the migrated
tree. This recurs for **any** UWP project that was built before migration, and acutely
for multi-project samples whose nested `bin`/`obj` escape the SDK default exclusion.

## Out of scope (eval limitation)
UWP UIA returned 0 elements for the CoreWindow on this machine, leaving the Scenario-2
behavioral baseline empty. That is an `uwp-app-runner`/`winui3-parity-check` measurement
limitation — deferred to human, not a migration-skill change.
