---
name: winui-uwp-migration
description: "Use immediately when migrating, porting, or converting a C# UWP app to WinUI 3 / Windows App SDK, including projects using Windows.UI.Xaml or UWP Package.appxmanifest files. C++/WinRT and Visual Basic UWP migrations are out of scope."
---

# UWP to WinUI 3 migration

Preserve the app; do not redesign it. Keep every page, control, resource, helper, navigation path, and user-visible behavior unless the API has no WinUI 3 desktop equivalent. Unsupported behavior must be reported explicitly, never omitted silently.

## Ownership

- `winapp migrate` creates the WinUI project, classifies the source files, performs safe mechanical transforms, migrates deterministic project items, verifies its mechanical postconditions, and writes `migration-report.json`.
- `winapp migrate verify <target>` refreshes namespace residual and project-item verification after relevant target edits. It owns `mechanicalVerification` and the deterministic `UWMIG011`/`UWMIG012` TODOs.
- This skill builds one semantic migration plan, uses the report as evidence within that plan, then uses build-time diagnostics and source-to-target state replay to finish the migration.
- Do not duplicate CLI-owned checks with extension lists or repository-wide searches for legacy XAML namespaces, `.resw` keys, copied-file coverage, or `Content`/`PRIResource` items. The skill owns semantic decisions and behavioral validation; an empty TODO list still does not guarantee a buildable, runnable, or behaviorally equivalent app.

Load the `winui-dev-workflow` skill before building or running. Its `BuildAndRun.ps1` injects the WinUI analyzer into the build and launches through `winapp run`.

## 1. Run the mechanical migration

The first substantive action after loading this skill is to run this command. Before it runs, inspect only enough workspace metadata to locate the UWP project and target directory. Do not inventory or read the source files first: the generated report and merged target are the starting point for semantic analysis.

```powershell
winapp migrate "<absolute-uwp-project-directory>" `
    --output "<absolute-new-winui-project-directory>"
```

Use `--name <ProjectName>` only when the user requires a specific target name. The output directory may be new, empty, or contain only supported control-plane metadata such as `.git` and `.github`; those entries are preserved. The command creates the official WinUI scaffold itself; never run `dotnet new winui` separately and never copy the project by hand.

If the command fails before writing `migration-report.json`, fix the reported prerequisite or input problem and retry. Do not work around it with a second scaffold or a nested project copy. If the report exists with `status: mechanical-verification-failed`, fix the exact reported mechanical residuals in the existing target and run `winapp migrate verify "<target>"`; do not scaffold again.

Before editing, establish one whole-app semantic model:

1. Confirm `<target>/migration-report.json` exists.
2. Read it once.
3. Confirm `schemaVersion` is supported, `status` is `mechanical-migration-complete`, and `mechanicalVerification.status` is `passed`.
4. Read the complete project structure and the source, XAML, manifest, and project files needed to understand startup, navigation, shared state, resources, and every feature path.
5. Combine report residuals, source behavior, and analyzer-relevant UWP APIs into one migration inventory grouped by shared root cause.
6. Resolve every uncertain API mapping before editing. Prefer Microsoft Learn and repository-local guidance; do not launch a research subagent for routine API lookups.

Do not turn report categories, files, or locations into separate turns. The report points to evidence; the semantic inventory determines the edit plan.

## 2. Capture the source behavior baseline

Before editing the target, follow [Behavioral validation](references/behavioral-validation.md) to persist the state plan declared by `migration-report.json` and capture the source baseline for the semantic inventory. Complete its bounded source-recovery and evidence-fallback process before declaring a state unavailable. If usable source evidence still cannot be obtained, record the affected states as `unverified`; never infer parity from source code or build success. Treat a newly observed source window as a successful launch even when the launch tool call or its output transport remains pending. Finish the source-capture phase, including its independently verified exact-window cleanup, before editing the target.

## 3. Apply one coherent migration

The semantic inventory from step 1 and the completed source state plan from step 2 define the full migration scope. Treat report categories and the common checks below as evidence within that scope, not as an exhaustive worklist or completion definition.

Fix shared causes through shared abstractions before patching call sites. For example, establish an app-owned window reference or one HWND/orientation helper, then migrate every dependent page consistently. Preserve startup order and cross-page behavior.

Apply the planned changes as one coherent patch when practical. If the app is too large, split only at an architecture boundary that can build independently. Never use report order, one category per turn, or one file per turn as the partition.

Common checks include:

- merge app resources without replacing the WinUI startup bootstrap;
- restore only compatible dependencies and manifest declarations required by preserved features;
- replace dispatcher and windowing APIs through shared WinUI 3 abstractions;
- reconcile shared-file conflicts without losing either source's required behavior;
- wire the initial page without replacing generated bootstrap or title-bar behavior.

Use `dependencyAnalysis` as the deterministic inventory of the source project-reference closure, not as a replacement recommendation. For each dependency marked `review-required`, inventory the contract actually consumed by the source before changing packages. Choose exactly one strategy:

1. use a target-compatible package only when its consumed API contract is compatible;
2. when the capability exists but the API contract differs, create a target-owned adapter at an appropriate solution boundary;
3. when no compatible binary exists but maintainable source is available, port that source into the target solution;
4. otherwise implement a behaviorally equivalent target-owned replacement.

Keep adapters and ports in the migrated solution; never add app-specific compatibility code to the CLI or this skill. A package search that finds no matching namespace or a build that reports missing types after a package swap proves contract mismatch, not impossibility. Do not declare the migration blocked or incomplete merely because the required adapter, source port, or equivalent implementation is substantial. Only an unmet external prerequisite may block that work. For a large project-reference graph, independent projects may be delegated separately, but one owner must integrate the graph and run the shared build.

For an unknown report category, use its `summary`, `reason`, and `locations` as evidence; do not guess from the ID. Preserve source XAML bindings, event handlers, default selection, initialization order, navigation reachability, AutomationIds, and observable feature outcomes. Do not rewrite working pages merely to make them look more idiomatic.

When an API mapping is uncertain, consult the official [UWP to Windows App SDK mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table). Never fabricate an equivalent or remove behavior merely because the first interop attempt fails. Use a visible fallback only when authoritative documentation confirms that the original behavior has no desktop equivalent. A fallback is a documented limitation, not evidence that the original feature was resolved.

## 4. Build and fix in batches

After the coherent migration patch, run `winapp migrate verify "<target>"` before the first build only when the patch changed project/build files, resource files or dictionaries, copied/deleted files, or namespaces in bulk. Do not run it after ordinary C# API fixes, before every build, or after runtime experiments. Do not repeat its successful checks with `rg`.

Run the `BuildAndRun.ps1` supplied by `winui-dev-workflow` in build-only mode:

```powershell
.\BuildAndRun.ps1 -SkipRun
```

On failure, read the complete error set, group it by root cause, and fix every occurrence in each group in one pass. Do not build after every file or diagnostic, and do not build merely to test a hypothesis that static inspection can decide. Target three grouped builds—initial convergence, root-cause correction, and final confirmation—but allow another build when the preceding result exposed a genuinely new signature. If the same diagnostic signature survives two builds, stop speculative edits and inspect the complete type, project-item, generated-code, and call-site context before changing anything else.

`BuildAndRun.ps1` prints a build-state JSON path whose `outputLog` contains the complete deterministic diagnostic set. If the shell remains open after output stops, inspect that state file before waiting again. A terminal `status` of `succeeded` or `failed` means the build is complete even if the tool output channel remains open: read `outputLog`, stop the retained shell once, and continue from that result. Do not start a plain `dotnet build`, `CoreCompile`, or another workflow build to recover diagnostics already present in that log. Treat XAML local-type or `LocalAssembly` failures as downstream until the log proves that the intermediate C# assembly was generated successfully.

Common checks include:

- compiler and XAML errors;
- migration-blocking compatibility/runtime diagnostics (`WUI0001`–`WUI0005` and `WUI2003`–`WUI2005`);
- missing content, resources, packages, and manifest declarations required by preserved features.

WinUI XAML compilation can take several minutes. A shell status saying the command is still running is not by itself a build failure: inspect the persisted build state, then continue reading the same shell only while that state remains `running` and the log is advancing. Do not launch a subagent to reinterpret the same deterministic build log or continue the same investigation in parallel.

Do not spend turns clearing advisory diagnostics unrelated to migration success.

## 5. Replay and compare the migrated app

After step 4 succeeds, do not invoke `BuildAndRun.ps1` again. Follow [Behavioral validation](references/behavioral-validation.md) and launch the existing target output only with `winapp run "<target.csproj>" --no-build --detach --json`, replay the persisted source state plan from step 2, and classify every planned state. Treat failed states as migration defects: return to steps 3 and 4, fix their shared root causes, then replay the affected states. When a process exits during a semantic UI action, complete the reference's automation-sensitive transition diagnosis before declaring the path unresolved; an app crash or app-owned visual-tree race is `failed`, not an external `blocked` prerequisite. Do not finalize the report from build success, process launch, or target-only evidence.

## 6. Finalize the report

Only after the app builds and planned target states have been replayed, update `migration-report.json` once:

- set a TODO from `pending` to `resolved` when its migration work is implemented and source semantics plus successful target evidence establish the required outcome; paired source runtime evidence is not required when the original behavior is unambiguous from source and the only missing evidence is that the legacy source could not launch;
- leave a TODO `pending` when implementation is incomplete, the mapping or original behavior remains ambiguous, a fallback replaces the behavior, or its target replay is blocked or failed;
- do not delete TODOs, rewrite their original descriptions, or invent completion evidence.

Before this update, run `winapp migrate verify "<target>"` only if a CLI-owned mechanical-risk file changed since its last passing result. Confirm `mechanicalVerification.status` is `passed`. Do not manually edit `mechanicalVerification`, `UWMIG011`, or `UWMIG012`; the CLI owns them. This final check does not replace build or runtime evidence.

Summarize the persisted state plan through the report's version 1.1 `validation` object. Keep its `statePlan` and evidence roots, update both phase statuses and state ID lists, and derive `parityStatus` using the completion gate in the reference. TODO resolution records completed migration work; `validation.parityStatus` records whether paired source/target runtime parity was established. Keep parity `unverified` when no source runtime evidence is available even if individually evidenced TODOs are resolved.

Report unresolved behavior and the behavioral-validation status to the user. Do not claim behavioral or visual parity from build success or a process launch, and do not claim the migration complete while required work remains pending.
