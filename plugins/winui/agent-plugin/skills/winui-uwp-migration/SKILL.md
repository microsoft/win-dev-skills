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

## 1. Run the mechanical migration and classify risk

The first substantive action after loading this skill is to run this command. Before it runs, inspect only enough workspace metadata to identify the exact entry UWP `.csproj` and target directory. Pass the directory that directly contains that entry project; never pass a repository or solution root merely because it contains the project recursively. If the intended entry project is ambiguous, resolve that ambiguity before migration. Do not inventory or read the source files first: the generated report and merged target are the starting point for semantic analysis.

```powershell
winapp migrate "<absolute-uwp-project-directory>" `
    --output "<absolute-new-winui-project-directory>"
```

Use `--name <ProjectName>` only when the user requires a specific target name. The output directory may be new, empty, or contain only supported control-plane metadata such as `.git` and `.github`; those entries are preserved. The command creates the official WinUI scaffold itself; never run `dotnet new winui` separately and never copy the project by hand.

If the command fails before writing `migration-report.json`, fix the reported prerequisite or input problem and retry. Do not work around it with a second scaffold or a nested project copy. If the report exists with `status: mechanical-verification-failed`, fix the exact reported mechanical residuals in the existing target and run `winapp migrate verify "<target>"`; do not scaffold again.

Before editing, establish the migration scope:

1. Confirm `<target>/migration-report.json` exists.
2. Read it once.
3. Confirm `schemaVersion` is supported, `status` is `mechanical-migration-complete`, `mechanicalVerification.status` is `passed`, and `source.projectFile` identifies the exact entry project selected above. A missing or different entry project invalidates the report; rerun migration from the correct containing directory instead of continuing with partial evidence.
4. Read startup, the feature registry or navigation shell, the dependency graph, and enough source to classify the migration as fast or expanded.
5. Identify the source behavior that proves the app's primary purpose and any user-critical flow.

Use the **fast path** when the primary behavior is page-local, its dependencies and APIs have direct target mappings, and it crosses no uncertain project, lifetime, activation, window, native-host, or shared asynchronous boundary. Read only the startup shell, capability-bearing manifest entries, relevant pages, and their custom controls or resources. Do not create a semantic finding ledger before a real finding exists.

Use the **expanded path** when a critical behavior depends on a `review-required` dependency; spans projects; requires an adapter, source port, or equivalent implementation; crosses activation, background, multi-window, native-host, lifecycle, shared-state, or asynchronous ownership boundaries; or when the first build or runtime probe exposes an unknown shared failure. Once a migration expands, do not downgrade it merely because a local workaround compiles.

On the expanded path, follow [Semantic migration protocol](references/semantic-migration-protocol.md) to select at most three migration-critical seams. Each seam joins a source behavior to the target architecture through an uncertain dependency, lifetime, state, or platform boundary. Choose one sentinel flow that proves startup plus the highest-risk seam; add another only when it covers a genuinely independent risk. Do not inventory peripheral features before these seams are understood.

Do not turn report categories, files, or locations into separate turns. The report provides facts; migration risk determines the next read, edit, and validation scope.

## 2. Capture the source behavior baseline

Follow [Behavioral validation](references/behavioral-validation.md) to persist the full state plan declared by `migration-report.json`. Before editing, capture startup and the fast-path primary sentinel, or every expanded-path seam sentinel. Capture remaining source states before implementing or validating their corresponding target feature; do not require peripheral baseline capture before the first architecture slice. Complete the bounded source-recovery and evidence-fallback process before declaring any attempted state unavailable. If usable source evidence still cannot be obtained, record the affected states as `unverified`; never infer parity from source code or build success. Treat a newly observed source window as a successful launch even when the launch tool call or its output transport remains pending. Complete exact-window cleanup after each source-capture session before editing the target.

## 3. Build the first viable slice

The state plan defines the eventual migration scope, but the current path determines the first implementation slice. Treat report categories and the common checks below as evidence within that scope, not as an exhaustive worklist or completion definition.

Fix shared causes through shared abstractions before patching call sites. For example, establish an app-owned window reference or one HWND/orientation helper, then migrate every dependent page consistently. Preserve startup order and cross-page behavior.

On the fast path, migrate the complete small behavior surface as one coherent patch when practical. On the expanded path, implement the smallest architecture slice that can build and exercise startup plus the active sentinel: its consumed dependency contract, owning projects, shared abstraction, and direct call path. Defer unrelated panels, leaf mappings, and polish until the sentinel proves the architecture. Never use report order, one category per turn, or one file per turn as the partition.

Common checks include:

- merge app resources without replacing the WinUI startup bootstrap;
- restore only compatible dependencies and manifest declarations required by preserved features;
- replace dispatcher and windowing APIs through shared WinUI 3 abstractions;
- reconcile shared-file conflicts without losing either source's required behavior;
- wire the initial page without replacing generated bootstrap or title-bar behavior.

Use the schema 1.2 `dependencyAnalysis` as the deterministic inventory of the source project-reference closure, not as a replacement recommendation. Follow [Dependency contracts](references/dependency-contracts.md) for every `review-required` dependency and for any package replacement, adapter, source port, or equivalent implementation. If dependency analysis is `incomplete`, resolve or explicitly account for every listed inspection issue before making dependency decisions. For a large project-reference graph, independent projects may be delegated separately, but one owner must integrate the graph and run the shared build.

For an unknown report category, use its `summary`, `reason`, and `locations` as evidence; do not guess from the ID. Resolve mappings that block the current slice or govern a shared root cause; defer unrelated leaf substitutions until their feature enters coverage. Preserve source XAML bindings, event handlers, default selection, initialization order, navigation reachability, AutomationIds, and observable feature outcomes. Do not rewrite working pages merely to make them look more idiomatic.

When the active sentinel traverses a custom template for a framework-owned control, or a transition dynamically changes navigation-item topology together with selection or lifetime, treat that path as a migration-sensitive seam even when namespace conversion and compilation succeed. Verify the target runtime contract and preserve the observable source outcome rather than assuming that the source visual tree or collection representation remains valid. Follow [Platform semantic differences](references/platform-semantic-differences.md) for the bounded review.

When an API mapping is uncertain, consult the official [UWP to Windows App SDK mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table). Use [Platform semantic differences](references/platform-semantic-differences.md) as a non-exhaustive review accelerator, not as a coverage checklist. Never fabricate an equivalent or remove behavior merely because the first interop attempt fails. Use a visible fallback only when authoritative documentation confirms that the original behavior has no desktop equivalent. A fallback is a documented limitation, not evidence that the original feature was resolved.

## 4. Build and fix in batches

After the current migration slice, run `winapp migrate verify "<target>"` before the first build only when the patch changed project/build files, resource files or dictionaries, copied/deleted files, or namespaces in bulk. Do not run it after ordinary C# API fixes, before every build, or after runtime experiments. Do not repeat its successful checks with `rg`.

Run the `BuildAndRun.ps1` supplied by `winui-dev-workflow` in build-only mode:

```powershell
.\BuildAndRun.ps1 -SkipRun
```

On failure, read the complete error set, group it by root cause, and fix every occurrence in each group in one pass. Do not build after every file or diagnostic, and do not build merely to test a hypothesis that static inspection can decide. Target three grouped builds—initial convergence, root-cause correction, and final confirmation—but allow another build when the preceding result exposed a genuinely new signature. If the same diagnostic signature survives two builds, stop speculative edits and inspect the complete type, project-item, generated-code, and call-site context before changing anything else.

On the fast path, create the semantic finding ledger only when a non-deterministic dependency, build, or runtime issue first appears; that issue upgrades the migration to expanded. On the expanded path, record each new root cause and its affected locations before correcting it. A successful build closes only findings whose completion condition is compile-time; it does not close dependency behavior or runtime findings.

Before another build can reuse the same temporary paths, copy each terminal build-state JSON and its `outputLog` into a unique `<target>/.migration-evidence/builds/<iteration-id>/` directory and record the root-cause signature. Preserve failed iterations and the final successful analyzer build; evidence and findings must reference these durable copies, not only the reusable temporary paths. This is iteration evidence, not a reason to create a finding for a deterministic compile fix.

`BuildAndRun.ps1` prints a build-state JSON path whose `outputLog` contains the complete deterministic diagnostic set. If the shell remains open after output stops, inspect that state file before waiting again. A terminal `status` of `succeeded` or `failed` means the build is complete even if the tool output channel remains open: read `outputLog`, stop the retained shell once, and continue from that result. Do not start a plain `dotnet build`, `CoreCompile`, or another workflow build to recover diagnostics already present in that log. Treat XAML local-type or `LocalAssembly` failures as downstream until the log proves that the intermediate C# assembly was generated successfully.

Common checks include:

- compiler and XAML errors;
- migration-blocking compatibility/runtime diagnostics (`WUI0001`–`WUI0005` and `WUI2003`–`WUI2005`);
- missing content, resources, packages, and manifest declarations required by preserved features.

WinUI XAML compilation can take several minutes. A shell status saying the command is still running is not by itself a build failure: inspect the persisted build state, then continue reading the same shell only while that state remains `running` and the log is advancing. Do not launch a subagent to reinterpret the same deterministic build log or continue the same investigation in parallel.

Do not spend turns clearing advisory diagnostics unrelated to migration success.

## 5. Prove the architecture, then expand coverage

After the first successful build, do not continue peripheral migration. Follow [Behavioral validation](references/behavioral-validation.md), launch the existing output with `winapp run "<target.csproj>" --no-build --detach --json`, and replay the active sentinel immediately. A sentinel passes only when the semantic action reaches its intended observable outcome; control existence or process survival is insufficient.

If the sentinel fails, it becomes the active migration frontier. Pause broader coverage, create or update its finding, return to steps 3 and 4, and correct the shared root cause. When a process exits during startup or an action, complete the reference's runtime call-chain diagnosis. An unavailable pointer-input comparison is missing comparison evidence, not an external blocker for the app-owned crash.

After every sentinel passes, expand progressively to the remaining feature paths and source states. Group features that share a dependency or architecture boundary, and replay each group before moving to an independent group. If later coverage exposes a new shared-risk boundary, add a seam and return to the expanded-path slice; do not restart mechanical migration.

## 6. Falsify and finalize

After all target changes, start one fresh no-build process from the canonical initial state and replay the primary sentinel followed by every runnable planned state. Persist that run's launch command, PID, selected HWND, and target fingerprint before interaction. Every final action, UI tree, screenshot, and health observation must name that same PID and HWND; a diagnostic restart creates a new run whose evidence cannot be combined with the earlier run.

This final pass attempts to disprove completion: do not reuse a development process or old evidence, and reopen a finding when the clean sequence changes the signature or fails. Development observations such as reaching an earlier page, surviving longer, or capturing a transient window cannot resolve a runtime finding.

Only after the analyzer-enabled build remains current, the final clean replay completes, and the semantic finding ledger has no open actionable app-owned finding, update `migration-report.json` once:

- set a TODO from `pending` to `resolved` when its migration work is implemented and source semantics plus successful target evidence establish the required outcome; paired source runtime evidence is not required when the original behavior is unambiguous from source and the only missing evidence is that the legacy source could not launch;
- leave a TODO `pending` when implementation is incomplete, the mapping or original behavior remains ambiguous, a fallback replaces the behavior, or its target replay is blocked or failed;
- do not delete TODOs, rewrite their original descriptions, or invent completion evidence.

Before this update, run `winapp migrate verify "<target>"` only if a CLI-owned mechanical-risk file changed since its last passing result. Confirm `mechanicalVerification.status` is `passed`. Do not manually edit `mechanicalVerification`, `UWMIG011`, or `UWMIG012`; the CLI owns them. This final check does not replace build or runtime evidence.

Runtime parity and migration completion are separate claims. Paired source/target evidence may establish `validation.parityStatus: verified` while a CLI-owned required TODO remains pending, but the migration is not complete until every required TODO is resolved by its owner. A passing `mechanicalVerification.status` does not by itself resolve a pending CLI-owned TODO; report an inconsistent verify/TODO result rather than editing either field manually.

Reconcile the state plan, semantic findings, and report against the final evidence before making any claim. A replayed state cannot remain `not-run`, and a finding whose completion condition is established cannot remain open; update them together or keep the completion claim unverified.

Summarize the persisted state plan through the report's version 1.2 `validation` object. Keep its `statePlan` and evidence roots, update both phase statuses and state ID lists, and derive `parityStatus` using the completion gate in the reference. TODO resolution records completed migration work; `validation.parityStatus` records whether paired source/target runtime parity was established. Keep parity `unverified` when no source runtime evidence is available even if individually evidenced TODOs are resolved.

Report unresolved behavior and the behavioral-validation status to the user. Do not claim behavioral or visual parity from build success or a process launch, and do not claim the migration complete while required work remains pending.
