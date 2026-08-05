---
name: winui-uwp-migration
description: "Use immediately when migrating, porting, or converting a C# UWP app to WinUI 3 / Windows App SDK, including projects using Windows.UI.Xaml or UWP Package.appxmanifest files. C++/WinRT and Visual Basic UWP migrations are out of scope."
---

# UWP to WinUI 3 migration

Preserve the app; do not redesign it. Keep every page, control, resource, helper, navigation path, and user-visible behavior unless the API has no WinUI 3 desktop equivalent. Unsupported behavior must be reported explicitly, never omitted silently.

## Ownership

- `winapp migrate` creates the WinUI project, copies the UWP source, performs safe mechanical transforms, and writes `migration-report.json`.
- This skill resolves that report, then uses build-time diagnostics and runtime evidence to finish the migration.
- `migration-report.json` contains only residuals known to the mechanical pass. It is not a complete semantic inventory and an empty TODO list does not guarantee a buildable or runnable app.
- Do not call `winapp migrate analyze`, `winapp migrate scaffold`, `winapp migrate validate`, or `winui-analyze`.

Load the `winui-dev-workflow` skill before building or running. Its `BuildAndRun.ps1` injects the WinUI analyzer into the build and launches through `winapp run`.

## 1. Run the mechanical migration

Do this before manually copying, reading, or editing individual source files:

```powershell
winapp migrate "<absolute-uwp-project-directory>" `
    --output "<absolute-new-winui-project-directory>"
```

Use `--name <ProjectName>` only when the user requires a specific target name. The output directory must be new or empty. The command creates the official WinUI scaffold itself; never run `dotnet new winui` separately and never copy the project by hand.

If the command fails, fix the reported prerequisite or input problem and retry. Do not work around it with a second scaffold or a nested project copy.

Before editing:

1. Confirm `<target>/migration-report.json` exists.
2. Read it once.
3. Confirm `schemaVersion` is supported and `status` is `mechanical-migration-complete`.
4. Group all pending TODOs by `category`.

Do not turn each file or location into a separate task or turn.

## 2. Resolve known residuals by category

Process one category as one batch. Read only the listed locations plus enough enclosing context to make a correct change. Apply the same resolved pattern to every related location before moving to the next category.

If a category is too large to edit safely in one turn, split it by coherent API family or root cause. Never fall back to one turn per file or location.

| Category | Required action |
|---|---|
| `app-resources` | Merge required resources and startup behavior from the preserved `.uwp-source/App.xaml*.reference` files without replacing the WinUI startup bootstrap. |
| `project-dependencies` | Review the preserved UWP project reference. Add only packages, project references, content, and custom targets still required and compatible with WinUI 3 desktop. |
| `manifest` | Recreate required capabilities and supported extensions using the WinUI manifest. Never overwrite it with the UWP manifest. |
| `dispatcher` | Replace remaining CoreDispatcher operations with DispatcherQueue equivalents while preserving async and delegate behavior. |
| `windowing` | Replace `Window.Current` with explicit `Window`, `AppWindow`, or app-owned window references appropriate to each use. Null-guard window reads that can run during initial navigation. |
| `shared-file-conflicts` | Compare the conflicting source and shared files, retain all required behavior, and keep one coherent target file. |
| `app-shell` | Wire the initial page into `MainWindow` without replacing the generated WinUI bootstrap or title bar. |

For an unknown category, follow its `summary`, `reason`, and `locations`; do not guess from the ID alone.

The report is a handoff, not permission to ignore unlisted behavior. Preserve source XAML bindings, event handlers, default selection, initialization order, navigation reachability, AutomationIds, and observable feature outcomes. Do not rewrite working pages merely to make them look more idiomatic.

When an API mapping is uncertain, consult the official [UWP to Windows App SDK mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table). Never fabricate an equivalent. If no equivalent exists, keep the app usable with an explicit visible fallback and document the limitation.

## 3. Build and fix in batches

Run the `BuildAndRun.ps1` supplied by `winui-dev-workflow` in build-only mode:

```powershell
.\BuildAndRun.ps1 -SkipRun
```

On failure, read the complete error set, group it by root cause, and fix each group in one pass. Do not build after every file or diagnostic.

Fix:

- compiler and XAML errors;
- migration-blocking `WUI000X` diagnostics;
- missing content, resources, packages, and manifest declarations required by preserved features.

Do not spend turns clearing advisory diagnostics unrelated to migration success. If repeated builds expose the same error, stop making speculative edits and inspect the full type, project, and call-site context.

## 4. Run and verify behavior

Use `BuildAndRun.ps1` without `-SkipRun`; never launch the packaged executable directly.

Success requires more than obtaining a process:

1. The primary shell renders; a blank or template-only window is failure.
2. Startup navigation reaches the expected initial content.
3. Every migrated page remains reachable.
4. Exercise at least one primary interaction and verify an observable result.
5. Device-dependent pages show a visible unavailable-device state rather than crashing or rendering blank when hardware is absent.

If the app exits or turns blank, read the `winapp run --debug-output` diagnostics from the workflow and fix the runtime cause before declaring completion.

## 5. Finalize the report

Only after the app builds and the runtime smoke check succeeds, update `migration-report.json` once:

- set each completed TODO's `status` from `pending` to `resolved`;
- leave genuinely unresolved TODOs as `pending`;
- do not delete TODOs, rewrite their original descriptions, or invent completion evidence.

Report unresolved behavior to the user. Do not claim the migration is complete while any required TODO remains pending or the app fails to build, launch, render, navigate, or exercise its primary interaction.
