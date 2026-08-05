---
name: winui-uwp-migration
description: "Use immediately when migrating, porting, or converting a C# UWP app to WinUI 3 / Windows App SDK, including projects using Windows.UI.Xaml or UWP Package.appxmanifest files. C++/WinRT and Visual Basic UWP migrations are out of scope."
---

# UWP to WinUI 3 migration

Preserve the app; do not redesign it. Keep every page, control, resource, helper, navigation path, and user-visible behavior unless the API has no WinUI 3 desktop equivalent. Unsupported behavior must be reported explicitly, never omitted silently.

## Ownership

- `winapp migrate` creates the WinUI project, copies the UWP source, performs safe mechanical transforms, and writes `migration-report.json`.
- This skill builds one semantic migration plan, uses the report as evidence within that plan, then uses build-time diagnostics and a focused runtime smoke check to finish the migration.
- `migration-report.json` is a mechanical snapshot and evidence index. It is neither a semantic work schedule nor a complete inventory; an empty TODO list does not guarantee a buildable or runnable app.
- Do not call `winapp migrate analyze`, `winapp migrate scaffold`, `winapp migrate validate`, or `winui-analyze`.

Load the `winui-dev-workflow` skill before building or running. Its `BuildAndRun.ps1` injects the WinUI analyzer into the build and launches through `winapp run`.

## 1. Run the mechanical migration

Do this before manually copying or editing source files:

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
4. Read the complete project structure and the source, XAML, manifest, and project files needed to understand startup, navigation, shared state, resources, and every feature path.
5. Combine report residuals, source behavior, and analyzer-relevant UWP APIs into one migration inventory grouped by shared root cause.
6. Resolve every uncertain API mapping before editing. Prefer Microsoft Learn and repository-local guidance; do not launch a research subagent for routine API lookups.

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

Run the `BuildAndRun.ps1` supplied by `winui-dev-workflow` in build-only mode:

```powershell
.\BuildAndRun.ps1 -SkipRun
```

On failure, read the complete error set, group it by root cause, and fix each group in one pass. Do not build after every file or diagnostic. Target no more than three grouped builds: initial convergence, root-cause correction, and final confirmation.

Fix:

- compiler and XAML errors;
- migration-blocking `WUI000X` diagnostics;
- missing content, resources, packages, and manifest declarations required by preserved features.

Do not spend turns clearing advisory diagnostics unrelated to migration success. If repeated builds expose the same error, stop making speculative edits and inspect the full type, project, and call-site context.

## 4. Run one focused smoke check

Use `BuildAndRun.ps1` without `-SkipRun`; never launch the packaged executable directly.

The default smoke check verifies:

1. The primary shell renders; a blank or template-only window is failure.
2. Startup navigation reaches the expected initial content.
3. Startup does not immediately exit or throw.

If the app exits or turns blank, read the `winapp run --debug-output` diagnostics from the workflow and fix the runtime cause before declaring completion.

Do not load a UI-testing skill, create temporary UI automation scripts, or probe every page and selector by default. Use UI automation only when the user explicitly requests exhaustive interaction validation or when a specific observed runtime failure cannot be diagnosed from build/run output. Lack of an exhaustive UI test is not parity evidence; keep unverified behavior pending.

## 5. Finalize the report

Only after the app builds and the runtime smoke check succeeds, update `migration-report.json` once:

- set a TODO from `pending` to `resolved` only when the implemented code and available evidence establish that its required behavior is preserved;
- leave fallback behavior, blocked hardware-dependent behavior, and behavior not actually verified as `pending`, and report why it is blocked or unverified;
- do not delete TODOs, rewrite their original descriptions, or invent completion evidence.

Report unresolved behavior to the user. Do not claim behavioral parity from build success or a process launch, and do not claim the migration complete while required work remains pending.
