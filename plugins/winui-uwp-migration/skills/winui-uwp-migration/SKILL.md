---
name: winui-uwp-migration
description: "Migrate **C# UWP** applications to WinUI 3 / Windows App SDK, preserving every page, control, and helper class unless an API is explicitly unsupported. Also covers replacing legacy `Windows.UI.Xaml` APIs and fixing build errors from prior UWP-to-WinUI 3 ports. **C++/WinRT and VB UWP projects are out of scope** — refuse the request."
---

## Principles

This skill migrates code, it does not redesign it. Every page, UserControl, helper class, and XAML element in the source must appear in the target — **unless** it touches an API unsupported on WinUI 3 desktop, in which case it must be explicitly deferred with a written reason. Silent omission is a defect.

## Prerequisites

- **.NET SDK** matching the target TFM (read `<TargetFramework>` from the project `.csproj`).
- **Windows App SDK** — pulled in via the `Microsoft.WindowsAppSDK` NuGet package.
- **`winapp` CLI** — installed transitively via the `Microsoft.Windows.SDK.BuildTools.WinApp` NuGet reference (no separate install needed when running via `dotnet run`). For standalone terminal use:
  ```powershell
  winget install Microsoft.WinAppCli --source winget
  ```

## Unsupported on WinUI 3 desktop

Some UWP features have no WinUI 3 desktop equivalent. See the [Unsupported on WinUI 3 Desktop](./MIGRATION-PATTERNS.md#unsupported-on-winui-3-desktop-no-migration-path) section of MIGRATION-PATTERNS.md for the inventory; the machine-readable form lives at [`scripts/unsupported-api-inventory.json`](./scripts/unsupported-api-inventory.json) and is used by both the bootstrap and the validator.

## Process

Four scripts do every mechanical step. Your job is the judgement work in between — fixing each TODO at the marked line, the shell conversion, and reading the diagnostics.

- `scripts/Initialize-UwpMigration.ps1` — bootstrap; runs once at the start of Step 0.
- `scripts/Get-MigrationPattern.ps1` — fetches a single anchored section from `MIGRATION-PATTERNS.md`. Used to resolve each `TODO[migrate-NNN]`. **Prefer this over opening MIGRATION-PATTERNS.md directly** — the full patterns file is API-name-dense and loading it floods your context.
- `scripts/Test-AppLaunch.ps1` — launches the built app and tells you whether it survived startup; on a crash it captures the real exception (native code + .NET type/stack) and points at the fix. Your launch step throughout Step 3.
- `scripts/Validate-UwpMigration.ps1` — final-validation gate at the end of Step 4.

### Step 0 — Bootstrap (mandatory)

🛑 **Before any file edit, any `view` of the source, any analysis** — your literal first three powershell commands when this skill is invoked MUST be:

```powershell
# 1. Scaffold the WinUI 3 shell in the target directory
dotnet new winui -n <ProjectName>

# 2. Run the bootstrap
& "<skill-root>/scripts/Initialize-UwpMigration.ps1" `
    -Source "<absolute-path-to-uwp-cs-folder>" `
    -Target "<absolute-path-to-scaffolded-winui3-project-root>"

# 3. Self-check — this MUST print True. If False, the bootstrap failed; fix the cause and re-run.
Test-Path "<winui3-project-root>/MIGRATION-MAPPING.md"
```

**Hard rules:**

Don't:

- Inventory the source first, then "decide" whether to run the bootstrap. The bootstrap *is* the inventory.
- Copy / rewrite files by hand if step 2 errors. Fix the cause (broken sln, missing nuget, etc.) and re-run the script.
- Proceed past step 3 if the `Test-Path` check returns `False`.

Do:

- Only after step 3 returns `True` may you read source files, plan transformations, or edit anything.

The script prints a structured `=== BOOTSTRAP COMPLETE ===` block telling you exactly what it did, what artifacts now exist, and what to do next. Read that block; do not re-derive the same info by browsing the tree.

### Step 1 — Migrate, file by file

Open `MIGRATION-MAPPING.md`. Every row already has a final Triage label (`migrate-as-is`, `migrate-with-adaptation`, `defer`). The bootstrap also injected `// TODO[migrate-NNN]: see PATTERNS.md#<anchor>` (or `<!-- … -->` in XAML) above every line that needs adaptation, and recorded a per-file execution mode in `.bootstrap-meta.json`.

**Per-file execution mode** — open `.bootstrap-meta.json` and find the entry for the file you're about to edit under `perFileMode`:

- **`BATCH`** — fix every `TODO[migrate-NNN]` in the file in one pass, then build once. This is the default for files that touch only safe APIs.
- **`SEQUENTIAL`** — fix one `TODO[migrate-NNN]` at a time, build immediately after each, then move to the next. The bootstrap marks a file SEQUENTIAL when it touches a namespace family whose API names trigger the model provider's output-safety filter; pacing the edits keeps each turn small.

For files with no entry in `perFileMode`, no TODO was injected — those are either `migrate-as-is` (namespace rewrite is enough) or `defer` (skip them; they are already listed in `MIGRATION-DEFERRED.md`).

**How to resolve a TODO:**

1. Read the anchor in the TODO text (e.g. `PATTERNS.md#windowing`).
2. Fetch just that section — do NOT open the full `MIGRATION-PATTERNS.md`:
   ```powershell
   & "<skill-root>/scripts/Get-MigrationPattern.ps1" -Anchor windowing
   ```
3. Apply the pattern at the marked line (the TODO sits on the line *above* the offending code; the offending line is the next one). Delete the TODO line in the same edit.
4. Don't survey the whole file before editing. Find the first remaining TODO, fix it, repeat.

Walk each row by its Triage label:

- **`migrate-as-is`** — namespace rewrite is already done; flip `Status` to `done` once the file appears in your final build.
- **`migrate-with-adaptation`** — work through its TODOs in the mode above.
- **`defer`** — exclude from build and navigation. The row is already pre-seeded in `MIGRATION-DEFERRED.md`; refine the rationale only if the anchor list is wrong.

Flip `Status` from `copied` → `done` (or `deferred`) as each row is finished.

**Shell conversion** is the one structural change LLM judgement decides. UWP's `Frame`-rooted app model has no direct WinUI 3 desktop equivalent. Pick the closest WinUI 3 idiom of the source shell:

| Source shell pattern (UWP) | Suggested WinUI 3 target |
|---|---|
| `MainPage` + `ListView` + `Frame` (SDK-sample idiom) | `NavigationView` + `Frame` |
| `Pivot` | `TabView` (top), or `Pivot` from WinUI Community Toolkit if behaviour parity matters |
| `Hub` | `NavigationView` with grouped items, or hand-rolled `ScrollViewer` |
| `TabView` (UWP) | `TabView` (WinUI 3) — namespace change only |
| Plain `Frame` (single page) | Single `Page` hosted directly under the `Window` |

If the source shell doesn't match anything above, preserve its structure as faithfully as controls allow.

**Navigation invariants** (apply regardless of shell control choice):

1. Every non-deferred source scenario / page is reachable from the target's primary navigation surface.
2. Order matches the source.
3. Titles match the source (modulo trivial wording cleanup — capitalization, punctuation).
4. Deferred items are **omitted** from the navigation surface — do not include disabled or broken entries. They are accounted for in `MIGRATION-DEFERRED.md`.

### Step 2 — Reconcile the project file

The scaffold's `.csproj` is wired for WinAppSDK; the UWP `.csproj` at `.uwp-source/` is your reference for what extras to merge. Fetch the cheat-sheet:

```powershell
& "<skill-root>/scripts/Get-MigrationPattern.ps1" -Anchor csproj
```

Do **not** copy the UWP `.csproj` over the scaffold's — the two formats are incompatible.

### Step 3 — Build, fix what tooling missed

Work in a tight loop: **build → fix the first error → launch → repeat.** For the **launch** step, use `Test-AppLaunch.ps1` rather than a bare `winapp run`:

```powershell
winapp build                                                                # compile; never run the .exe directly
& "<skill-root>/scripts/Test-AppLaunch.ps1" -Target "<winui3-project-root>"  # launch AND verify it survives startup
```

A WinUI 3 app can build cleanly and still crash the instant it starts, so "it compiled" is not "it runs." `Test-AppLaunch.ps1` is your launch step *because* it answers both questions at once: it launches the built app and reports whether it stayed alive — and if it didn't, it captures the real reason from Windows Error Reporting (native exception **code** from event 1000 + managed .NET exception **type + stack** from event 1026) and points you at the matching cause in [Diagnosing Startup Crashes](./MIGRATION-PATTERNS.md#startup-crashes). Making this your normal launch command means a startup crash hands you its exception immediately — you never end up guessing.

When a **build** error points at a UWP API, fetch the relevant anchor and apply the pattern. For example, a CS0246 on `Window.Current` → `Get-MigrationPattern.ps1 -Anchor windowing`; an analyzer warning about `CoreDispatcher` → `Get-MigrationPattern.ps1 -Anchor threading`. Open `MIGRATION-PATTERNS.md` directly only as a last resort — one anchor at a time keeps each turn small.

When the app **crashes at launch**, fix the frame the captured stack names — then build and launch again. Do **not** sprinkle `File.WriteAllText` traces through `Program.cs` / `App.xaml.cs` and re-run in a loop: blind tracing is the single biggest time sink in this phase, and the exception `Test-AppLaunch.ps1` already captured tells you where the throw is. (Note: a custom `Program.Main` for WinUI 3 **correctly** uses `[STAThread]` — that is not the bug.)

> **Build command discipline (avoid agent stalls):**
>
> - Prefer `winapp build` to compile and `Test-AppLaunch.ps1` to launch — both exit cleanly with an obvious final line. (A bare `winapp run` works too, but `Test-AppLaunch.ps1` also tells you *why* on a crash.)
> - If you must shell out to `dotnet build` / `dotnet run`, **do not** pipe the output through a filter like `Where-Object { $_ -match "error|warning|success|failed" }` while running in **async / background** mode. On a clean build the filter swallows every line, and any subsequent `read_powershell` returns no output even though the process has already exited — the agent ends up polling an empty buffer for the rest of its budget.
> - When using `dotnet` from the powershell tool, either (a) run **sync**, or (b) leave output unfiltered, or (c) append an exit sentinel so there is always a final line to read, e.g. `dotnet build -c Debug; "BUILD_EXIT=$LASTEXITCODE"`.

### Step 4 — Validate (mandatory before declaring done)

🛑 **You are NOT done until `Validate-UwpMigration.ps1` reports PASS.** Skipping this is the single most common failure pattern: agents finish transforming most files, see no obvious errors in their last few edits, and declare success — while leaving entire pages still on UWP namespaces, or rows stuck at `Status = copied`, or unresolved `TODO[migrate-NNN]` markers in source. The validator runs every mechanical check in one shot:

```powershell
& "<skill-root>/scripts/Validate-UwpMigration.ps1" -Target "<winui3-project-root>"
```

The validator covers:

1. **Residue grep** — no leftover `Windows.UI.Xaml`, unsupported APIs in non-deferred files, or UWP-only csproj markers.
2. **TODO marker residue** — every `TODO[migrate-NNN]` from the bootstrap is resolved.
3. **`MIGRATION-MAPPING.md` integrity** — `.bootstrap-meta.json` present + parses; row count matches the seeded count; every row has a resolved Triage label; no row stuck at `Status = copied`.
4. **`MIGRATION-DEFERRED.md` consistency** — every defer row in mapping has a matching row in the deferred file.
5. **`Package.appxmanifest`** — image references resolve; `Windows.Desktop` target; rescap namespace + `runFullTrust` capability.
6. **`dotnet build` healthcheck** — clean build, zero WUI analyzer warnings.
7. **Runtime smoke launch** — launches the built app (via `Test-AppLaunch.ps1`) and **fails** if it registers but crashes at startup, capturing the real exception (native code + .NET type) so you can fix the named frame. See [Diagnosing Startup Crashes](./MIGRATION-PATTERNS.md#startup-crashes). A genuine deploy/environment failure (e.g. Developer Mode off) is reported as a non-fatal WARN, not a FAIL.

The validator's stdout is intentionally terse: `[FAIL]` lines show only `file:line` (plus an error code where applicable). The full diagnostic text — code snippets, compiler error messages — is written to `.validator-diagnostics.txt` at the project root. **Open that file** to read the details before deciding the fix.

If any check fails, read the diagnostic, fix the root cause, re-run. **Do not report done with a FAIL.** Common fixes by check:

- *TODO residue* → open the file at the reported line, fetch the anchor via `Get-MigrationPattern.ps1`, apply, delete the marker.
- *Residue grep hit in a file* → check `.validator-diagnostics.txt` for the offending line; either fix in place or move the row to `defer` (and add to DEFERRED).
- *Mapping row count mismatch* → you added or deleted rows. Restore the seed; edit only `Triage label` and `Status`.
- *`Status = copied` rows* → those files were never finished. Either complete the migration and flip to `done`, or defer with rationale.
- *Build healthcheck FAIL* → open `.validator-diagnostics.txt`; for each unique CS#### code, look up the pattern in PATTERNS.md via `Get-MigrationPattern.ps1`.

After PASS, do a final `winapp build` to confirm the build is still clean. Only then declare done.

## Critical Rules

### Fidelity (highest priority)

- Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless explicitly deferred with a cited unsupported API.
- Silent omission is a defect. If `MIGRATION-MAPPING.md` is missing a file you expected, the bootstrap input was wrong — fix the `-Source` path and re-run, do not patch by hand.
- Do not regenerate XAML from scratch. Copy each `*.xaml` verbatim, then transform — controls, names, and event handlers must be preserved so the code-behind continues to compile.

### API-level

- Never fabricate API calls. If unsure of the WinUI 3 equivalent, fetch the relevant anchor via `Get-MigrationPattern.ps1`, or consult the official [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table).
- **Do not add new `defer` rows.** The bootstrap already decided which files are deferred (any file with an unsupported-API hit). Refine the rationale in `MIGRATION-DEFERRED.md` if needed, but do not move a row from `migrate-with-adaptation` → `defer` to dodge a hard TODO. "Looks complex" / "not core to demo" / "redundant" are **not** valid reasons.

### Comment hygiene

Don't:

- Name UWP API identifiers in code comments, commit messages, or anywhere they will be re-fed into your context. Comments like `// Replaces SomeOldType.SomeMethod()` or `// Was OldNamespace.Foo - use new equivalent` inflate API-name density in subsequent turns and the validator's residue grep also matches inside comments.

Do:

- Use anchor references instead. The bootstrap already inserts `// TODO[migrate-NNN]: see PATTERNS.md#<anchor>` — when you fix a TODO, **delete the TODO line entirely** in the same edit. Do not leave a "for posterity" comment naming the original API.
- If you genuinely need to leave a note for future readers, write `// See PATTERNS.md#<anchor>` and stop there.

### Defensive UI for device-dependent features

Pages that depend on physical hardware (camera, microphone, location, sensors, Bluetooth, NFC, etc.) often run on machines that lack the device — including the validation environment. A page that silently fails its device-init leaves a blank window, which is **indistinguishable from a crash** to a screenshot-based reviewer and produces three byte-identical screenshots that fail blank-frame checks.

**Rule:** every device-dependent page must show a visible fallback when device acquisition or initialization throws. The fallback can be as simple as a centred `TextBlock` saying *"This sample requires a <device-kind> device that is not available on this machine."* plus the exception's `Message` underneath. Wrap the init call in `try/catch`; on catch, swap the page's main content for the fallback (don't only log and return).

This is not optional polish — without it, the runtime smoke check (`Validate-UwpMigration.ps1` Section 7) will still pass the process-alive gate, but the benchmark's later screenshot-diff check will penalise the trial. A two-line fallback prevents a ~20-point score loss.

## Post-Migration

### Restore sandboxing (if needed)

If the UWP app relied on AppContainer isolation, evaluate [Win32 App Isolation](https://learn.microsoft.com/windows/win32/secauthz/app-isolation-overview).

## References

- [Migrate from UWP to the Windows App SDK — overview](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/migrate-to-windows-app-sdk-ovw)
- [What's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported)
- [Mapping UWP APIs and libraries to Windows App SDK](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table)
- [Feature area guides](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/feature-area-guides-ovw)
- Case study: [PhotoLab (C#)](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/case-study-1)