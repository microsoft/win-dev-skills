---
name: winui-uwp-migration
description: "Use immediately when migrating, porting, or converting a C# UWP app to WinUI 3 / Windows App SDK, including projects using Windows.UI.Xaml or UWP Package.appxmanifest files. C++/WinRT and Visual Basic UWP migrations are out of scope."
---

# UWP to WinUI 3 migration

Preserve the app; do not redesign it. Keep every page, control, resource, helper, navigation path, and user-visible behavior unless the API has no WinUI 3 desktop equivalent. Unsupported behavior must be reported explicitly, never omitted silently.

## Tool prerequisite

This workflow requires a `winapp` build that exposes `winapp migrate`. Verify `winapp migrate --help` before changing the project. If the command is unavailable, stop and report the missing tooling dependency; do not emulate migration with project-copy scripts or `dotnet new`.

## Ownership

- `winapp migrate` creates the WinUI project, copies the UWP source, performs safe mechanical transforms, and writes `migration-report.json`.
- The generated project owns its analyzer configuration. `winapp migrate` must attach `Microsoft.WindowsAppSDK.Analyzers`; the skill must not inject it through a temporary project file or helper build script.
- This skill builds one semantic migration plan, uses the report as evidence within that plan, then uses build-time diagnostics and a focused runtime smoke check to finish the migration.
- `migration-report.json` is a mechanical snapshot and evidence index. It is neither a semantic work schedule nor a complete inventory; an empty TODO list does not guarantee a buildable or runnable app.
- Do not call `winapp migrate analyze`, `winapp migrate scaffold`, `winapp migrate validate`, or `winui-analyze`.
- Do not use or create `BuildAndRun.ps1`. Build with `dotnet` and launch with `winapp run`.

## 1. Run the mechanical migration

The first substantive action after loading this skill is to run this command. Before it runs, inspect only enough workspace metadata to locate the UWP project and target directory. Do not inventory or read the source files first: the generated report and merged target are the starting point for semantic analysis.

```powershell
winapp migrate "<absolute-uwp-project-directory>" `
    --output "<absolute-new-winui-project-directory>"
```

Use `--name <ProjectName>` only when the user requires a specific target name. The output directory may be new, empty, or contain only supported control-plane metadata such as `.git` and `.github`; those entries are preserved. The command creates the official WinUI scaffold itself; never run `dotnet new winui` separately and never copy the project by hand.

If the command fails, fix the reported prerequisite or input problem and retry. Do not work around it with a second scaffold or a nested project copy.

Before editing, establish one whole-app semantic model:

1. Confirm `<target>/migration-report.json` exists.
2. Read it once.
3. Confirm `schemaVersion` is supported and `status` is `mechanical-migration-complete`.
4. Confirm the generated project references `Microsoft.WindowsAppSDK.Analyzers`. If it does not, stop and report a migration-tooling failure; do not recreate analyzer injection in the skill.
5. Read the complete project structure and the source, XAML, manifest, and project files needed to understand startup, navigation, shared state, resources, and every feature path.
6. Combine report residuals, source behavior, and analyzer-relevant UWP APIs into one migration inventory grouped by shared root cause.
7. Resolve every uncertain API mapping before editing. Prefer Microsoft Learn and repository-local guidance; do not launch a research subagent for routine API lookups.

Do not turn report categories, files, or locations into separate turns. The report points to evidence; the semantic inventory determines the edit plan.

## 2. Apply one coherent migration

Fix shared causes through shared abstractions before patching call sites. For example, establish an app-owned window reference or one HWND/orientation helper, then migrate every dependent page consistently. Preserve startup order and cross-page behavior.

Apply the planned changes as one coherent patch when practical. If the app is too large, split only at an architecture boundary that can build independently. Never use report order, one category per turn, or one file per turn as the partition.

Use report categories as checks within the patch:

- merge app resources without replacing the WinUI startup bootstrap;
- restore only compatible dependencies and manifest declarations required by preserved features;
- replace dispatcher and windowing APIs through shared WinUI 3 abstractions;
- reconcile shared-file conflicts without losing either source's required behavior;
- wire the initial page without replacing generated bootstrap or title-bar behavior.

For an unknown report category, use its `summary`, `reason`, and `locations` as evidence; do not guess from the ID. Preserve source XAML bindings, event handlers, default selection, initialization order, navigation reachability, AutomationIds, and observable feature outcomes. Do not rewrite working pages merely to make them look more idiomatic.

When an API mapping is uncertain, consult the official [UWP to Windows App SDK mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table). Never fabricate an equivalent or remove behavior merely because the first interop attempt fails. Use a visible fallback only when authoritative documentation confirms that the original behavior has no desktop equivalent. A fallback is a documented limitation, not evidence that the original feature was resolved.

## 3. Build and fix in batches

Read the target `.csproj`, then build it directly for the current architecture:

```powershell
$Platform = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }
$BlockingDiagnostics = "WUI0001;WUI0002;WUI0003;WUI0004;WUI0005;WUI2003;WUI2004;WUI2005"
dotnet build "<absolute-target-csproj>" `
    -c Debug `
    "-p:Platform=$Platform" `
    "--warnaserror:$BlockingDiagnostics"
```

On failure, read the complete error set, group it by root cause, and fix each group in one pass. Do not build after every file or diagnostic. Minimize rebuilds, but do not impose a fixed build-count limit on large projects.

Fix:

- compiler and XAML errors;
- migration-blocking compatibility/runtime diagnostics (`WUI0001`–`WUI0005` and `WUI2003`–`WUI2005`);
- missing content, resources, packages, and manifest declarations required by preserved features.

WinUI XAML compilation can take several minutes. A shell status saying the command is still running is not a build failure: continue reading that same shell. Do not terminate it or start a duplicate build unless the workflow reports an error or remains inactive beyond the benchmark or user-provided timeout.

Do not spend turns clearing advisory diagnostics unrelated to migration success. If repeated builds expose the same error, stop making speculative edits and inspect the full type, project, and call-site context.

## 4. Run one focused smoke check

Resolve the build output from the evaluated project rather than guessing a framework or RID path:

```powershell
$TargetDir = dotnet msbuild "<absolute-target-csproj>" `
    -nologo `
    "-p:Platform=$Platform" `
    "-p:Configuration=Debug" `
    -getProperty:TargetDir
winapp run "$TargetDir" --detach --json
```

Treat a missing `TargetDir`, nonzero `winapp` exit code, or missing PID as failure. Use the returned PID for one lightweight UI check:

```powershell
winapp ui status -a <PID> --json
winapp ui inspect -a <PID> --depth 2 --json
winapp ui wait-for "<expected-initial-content>" -a <PID> --timeout 5000 --json
```

This smoke check verifies:

1. The process owns a visible window with a non-empty top-level UI tree.
2. The expected initial content identified from the source behavior appears.
3. Startup does not immediately exit or throw.

If the app exits or turns blank, rerun `winapp run "$TargetDir" --debug-output` and fix the reported runtime cause before declaring completion.

Do not create temporary UI automation scripts or probe every page and selector by default. Use targeted interaction validation when the migration inventory identifies behavior that build diagnostics and the smoke check cannot prove. Lack of exhaustive interaction testing is not parity evidence; keep unverified behavior pending.

## 5. Finalize the report

Only after the app builds and the runtime smoke check succeeds, update `migration-report.json` once:

- set a TODO from `pending` to `resolved` only when the implemented code and available evidence establish that its required behavior is preserved;
- leave fallback behavior, blocked hardware-dependent behavior, and behavior not actually verified as `pending`, and report why it is blocked or unverified;
- do not delete TODOs, rewrite their original descriptions, or invent completion evidence.

Report unresolved behavior to the user. Do not claim behavioral parity from build success or a process launch, and do not claim the migration complete while required work remains pending.
