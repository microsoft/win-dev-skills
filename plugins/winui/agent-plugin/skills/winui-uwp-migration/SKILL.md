---
name: winui-uwp-migration
description: "Migrates or repairs a C# UWP application as WinUI 3 / Windows App SDK when the user explicitly asks to port, migrate, or fix an existing UWP-to-WinUI conversion. UWP artifacts such as Package.appxmanifest, .resw files, Windows.UI.Xaml, or a UWP .csproj confirm the source only when paired with migration intent. Preserves every page, control, and helper class unless an API is explicitly unsupported. The automation scripts target C#; for C++/WinRT or VB, provide applicable migration guidance without claiming the scripts support that project."
---

> 🛑 **STOP — perform only the bounded source/startup audit below, then run [Step 0 — Bootstrap](#step-0--bootstrap-mandatory).** Do not inventory or broadly inspect source files by hand before bootstrap.

## Principles

Migrate, don't redesign. Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless it hits an API that's unsupported on WinUI 3 desktop, in which case it must be **explicitly deferred** with a written reason. Silent omission is a defect.

UWP runs in an AppContainer by default; WinUI 3 desktop normally runs full trust. Preserve the source behavior, but audit security boundaries, capabilities, file-system access, and brokered API assumptions instead of treating the loss of AppContainer isolation as a mechanical namespace change.

## Prerequisites

- **.NET SDK** matching the WinUI 3 target TFM. Determine it from the target project/template, not the UWP source TFM.
- **Windows App SDK** — pulled in via the `Microsoft.WindowsAppSDK` NuGet package.
- **`winapp` CLI 0.6+** — install or upgrade through `winui-setup`; NuGet package references do not place the CLI on `PATH`.

## Unsupported on WinUI 3 desktop

Some UWP features have no WinUI 3 desktop equivalent. See [Unsupported on WinUI 3 Desktop](./MIGRATION-PATTERNS.md#unsupported-on-winui-3-desktop-no-migration-path) in MIGRATION-PATTERNS.md; the machine-readable form is [`scripts/unsupported-api-inventory.json`](./scripts/unsupported-api-inventory.json), consumed by the bootstrap and validator.

## Process

Four scripts do every mechanical step. Your job is the judgement between them.

| Script | When | Purpose |
|---|---|---|
| `scripts/Initialize-UwpMigration.ps1` | Once, at Step 0 | Inventory + scaffolding |
| `scripts/Get-MigrationPattern.ps1`    | Per TODO, in Step 1/3 | Fetch one anchor from MIGRATION-PATTERNS.md |
| `scripts/Get-WinUIDefaultStyle.ps1`   | On a Step 1d WARN (custom Template with UWP-era residue) | Read the WinUI 3 default Style for a built-in control — reference for surgical edits, do not paste-the-world |
| `scripts/Validate-UwpMigration.ps1`   | Once, at Step 4 | Gate before declaring done |

**Prefer `Get-MigrationPattern.ps1` over opening MIGRATION-PATTERNS.md directly** — the full file is API-name-dense and loading it floods your context.

### Step 0 — Bootstrap (mandatory)

Before scaffolding, do one bounded audit: read the source project file, `Package.appxmanifest`, and only the startup files (`App.xaml`, `App.xaml.cs`, and the page/window named by startup navigation). Record the real entry page, linked project items, AppContainer-sensitive capabilities, and whether this is a fresh migration or repair of an already bootstrapped target. Do not expand this into a full source inventory; the bootstrap owns that.

For a fresh migration, use the shared WinApp CLI template contract:

```powershell
# 1. Scaffold WinUI 3 shell; winapp owns template discovery and installation.
winapp new --name <ProjectName> --template winui-mvvm --template-version latest --use-defaults

# 2. Bootstrap
& "<skill-root>/scripts/Initialize-UwpMigration.ps1" `
    -Source "<absolute-path-to-uwp-cs-folder>" `
    -Target "<absolute-path-to-scaffolded-winui3-project-root>"

# 3. MUST print True; otherwise the bootstrap failed — fix the cause and re-run.
Test-Path "<winui3-project-root>/MIGRATION-MAPPING.md"
```

If the user asks to repair an existing migration and the target already contains `.bootstrap-meta.json` plus `MIGRATION-MAPPING.md`, do not scaffold or bootstrap over it. Validate the metadata, inspect only the failing mapped/startup files, and continue from the appropriate step. If bootstrap reports an overlap, initialized target, unsupported project expression, or unresolved startup page, stop and resolve that explicit blocker; never bypass it by copying files manually.

Do **not** inventory source files beyond the bounded audit before step 3 prints `True`. The bootstrap script *is* the complete inventory and catches shared/linked project content. Read its `=== BOOTSTRAP COMPLETE ===` summary instead of browsing the whole tree.

### Step 1 — Migrate, file by file

Open `MIGRATION-MAPPING.md`. Every row already has a Triage label (`migrate-as-is`, `migrate-with-adaptation`, `defer`). The bootstrap injected `// TODO[migrate-NNN]: see MIGRATION-PATTERNS.md#<anchor>` (or `<!-- … -->` in XAML) above every line that needs adaptation, and a per-file execution mode in `.bootstrap-meta.json` (`perFileMode`):

**Build cadence is per-file, never per TODO.** Resolve a coherent file-sized batch, then build once. For a large or dependency-sensitive file, use smaller anchor-based batches and fetch each pattern on demand; do not create artificial turn boundaries or build after every marker.

- **`BATCH`** (default) — resolve every TODO in the file in one turn, then build once.
- **`SEQUENTIAL`** — resolve dependency-ordered anchor groups so each edit remains reviewable, then build after the file's related groups are complete.

Files with no `perFileMode` entry got no TODO — they're either `migrate-as-is` (namespace rewrite only) or `defer` (already in `MIGRATION-DEFERRED.md`).

**Use `todoIndex` from `.bootstrap-meta.json`** — it lists every TODO with its line number and anchor:

```json
"todoIndex": {
  "MainPage.xaml.cs": [
    { "line": 60, "id": "migrate-001", "anchor": "windowing" },
    { "line": 73, "id": "migrate-002", "anchor": "threading" }
  ]
}
```

This is your roadmap. **Do NOT read entire files.** Start with `view_range` ±5 lines around each TODO; if the surrounding context is insufficient (e.g. you need to see the full method signature, class fields, or using declarations), widen to ±20 lines or the enclosing method. Group TODOs by anchor — fetch the pattern once, then apply to all lines with that anchor.

**Resolve a TODO:**

1. Look up the anchor from `todoIndex` (e.g. `windowing`).
2. Fetch just that section — do NOT open the full `MIGRATION-PATTERNS.md`:
   ```powershell
   & "<skill-root>/scripts/Get-MigrationPattern.ps1" -Anchor windowing
   ```
3. `view_range` around the TODO line (e.g. lines 58-65 for a TODO at line 60). If ±5 lines doesn't show enough context (method boundary, variable declarations, async context), expand to ±20 lines or the full method.
4. Apply the pattern at the line *below* the TODO. Delete the TODO line in the same edit.
5. Move to the next TODO with the same anchor; then the next anchor group.

Walk each row: `migrate-as-is` → flip to `done` when the file appears in the final build; `migrate-with-adaptation` → resolve its TODOs; `defer` → exclude from build/nav (pre-seeded in `MIGRATION-DEFERRED.md`; refine rationale only).

**Efficiency tips:**
- **Batch independent edits** in one edit. If a file has five TODOs with the same anchor, fetch the pattern once and fix them together.
- **Never duplicate code-behind methods.** The bootstrap copies `.xaml.cs` files with their existing event handlers and helper methods. When fixing TODOs, modify the existing method body — do NOT add a second copy. `CS0111` (duplicate member) means you added a method that already exists in the file.

**Shell conversion** is the one judgement call. Pick the closest WinUI 3 idiom of the source shell:

| Source shell pattern (UWP) | Suggested WinUI 3 target |
|---|---|
| `MainPage` + `ListView` + `Frame` (SDK-sample idiom) | `NavigationView` + `Frame` |
| `Pivot` | `TabView` (top), or `Pivot` from Community Toolkit if parity matters |
| `Hub` | `NavigationView` with grouped items, or hand-rolled `ScrollViewer` |
| `TabView` (UWP) | `TabView` (WinUI 3) — namespace change only |
| Plain `Frame` (single page) | Single `Page` hosted directly under `Window` |

**Navigation invariants:** every non-deferred page is reachable from primary navigation; order matches source; titles match source (modulo trivial casing/punctuation); deferred items are **omitted** (not shown disabled).

**Shared sample-shell invariants:** when the source uses the common SDK-sample shell pattern (`ScenarioControl` + content `Frame` + footer links / logos / sample title), preserve that shell's visible structure and startup behavior end-to-end. Do not drop footer links, branding, or automation IDs from the primary shell, and do not leave scenario content unreachable behind a shell-only page.

**Preserve `MainWindow.xaml` only after verifying the bootstrap wired it successfully.** Confirm `RootFrame` exists, startup navigation targets the source app's actual entry page, navigation occurs after the static Window assignment, and the first page renders functional content. If any condition is missing, adapt the startup shell surgically; a compile-only frame, no-op navigation, or unreachable content is not "fully wired." Keep the scaffold's backdrop/title-bar treatment where compatible.

**Never read a static window reference (`App.MainWindow`, `App.Window`, `Window.Current`, etc.) synchronously from a Page constructor, `OnNavigatedTo`, or a `SelectionChanged`/`Loaded` handler that can fire during the first navigation.** `App.MainWindow = new MainWindow()` assigns the RHS *after* the constructor (and any synchronous navigation it triggers) completes, so such reads see `null` and crash the app at launch (E_POINTER / `NullReferenceException`, exit `0xc000027b`) — a build-clean, run-fail zero. Always null-guard these reads (`App.MainWindow is not null && …`, never the `!` null-forgiving operator), or defer them off the initial navigation.

### Step 2 — Reconcile the project file

The scaffold's `.csproj` is wired for WinAppSDK; the UWP `.csproj.reference` at `.uwp-source/` is your reference for extras to merge. Fetch the cheat-sheet:

```powershell
& "<skill-root>/scripts/Get-MigrationPattern.ps1" -Anchor csproj
```

Do **not** overwrite the scaffold's `.csproj` with the UWP one — the two formats are incompatible.

### Step 3 — Build, fix what tooling missed

```powershell
& "<skill-root>/../winui-dev-workflow/BuildAndRun.ps1" "<project.csproj>" --no-launch
winapp run "<project.csproj>"    # never run the .exe directly
```

When a build error points at a UWP API, fetch the relevant anchor (e.g. `CS0246` on `Window.Current` → `-Anchor windowing`; analyzer warning on `CoreDispatcher` → `-Anchor threading`). One anchor at a time.

> **Never create a nested copy of the project.** Do not copy the project tree into a sub-folder (a stray `AppX\` source copy is the usual offender) to "make an AppX package". The packaging AppX layout is **build output** that MSBuild emits under `bin\...\AppX\` — it is never a source folder you author. A nested project copy silently breaks the outer build: SDK-style projects only auto-exclude their own `bin`/`obj`, so the copy's `obj\*.cs` (AssemblyInfo / AssemblyAttributes) get globbed into compilation and the build dies with a wall of `CS0579: Duplicate '...Attribute'` errors. Keep exactly one `.csproj` in the project tree.

> **Launch ≠ render.** `winapp run` returning a process is not success — a page that throws during load (a residual `GetForCurrentView()`, camera init on a machine with no camera, etc.) leaves the window **blank** while the process stays alive. Confirm the shell renders its scenario list AND that navigating into a scenario shows that scenario's content, not an empty pane. A blank window = a defect to fix (usually a missing `try/catch` or a kept runtime-crash API), not a pass.

> **Build command discipline:** use the sibling `BuildAndRun.ps1 <project> --no-launch` for analyzer-enabled builds, then `winapp run <project>` for runtime validation. If `winapp` is missing or older than 0.6, report setup as blocked and use `winui-setup`; do not invent a `winapp build` fallback.

### Step 4 — Validate (mandatory before declaring done)

🛑 **Run `Validate-UwpMigration.ps1` before declaring done.** The most common failure pattern: agents finish most files, see no obvious errors, and declare success — while leaving pages on UWP namespaces or rows stuck at `Status = copied`. The validator catches this. (It is a completion *gate*, not an infinite polishing loop — see the re-run cap below.)

```powershell
& "<skill-root>/scripts/Validate-UwpMigration.ps1" -Target "<winui3-project-root>"
```

Validator checks: residue grep (no `Windows.UI.Xaml` / unsupported APIs in non-deferred files); TODO marker residue; single project (no nested duplicate `.csproj` / stray `AppX\` copy); MAPPING integrity (row count matches seed; no `Status = copied`); DEFERRED consistency; `Package.appxmanifest` (Windows.Desktop target and restricted-capability `runFullTrust`); analyzer-enabled build through the sibling `BuildAndRun.ps1`; and project-mode `winapp run` smoke launch.

`[FAIL]` lines show only `file:line`; full diagnostics are in `.validator-diagnostics.txt` at the project root — **open that file** before deciding the fix. Re-run at most two fix-and-validation cycles. Only exit code `0` permits completion; exit code `1` means failed gates, while exit code `2` means runtime validation is blocked/unverified. Neither nonzero result may be waived through a deferred label or an ordinary final build. Report the exact remaining gate and diagnostics, and do not enter an open-ended retry loop.

## Critical Rules

### Fidelity (highest priority)

- Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless explicitly deferred with a cited unsupported API.
- Silent omission is a defect. If `MIGRATION-MAPPING.md` is missing a file you expected, preserve the current target, correct the `-Source` path, and bootstrap into a fresh separate scaffold; the one-shot guard intentionally rejects rerunning over existing migration edits.
- Do not regenerate XAML from scratch. Copy each `*.xaml` verbatim, then transform — controls, names, and event handlers must be preserved so the code-behind continues to compile.
- **Preserve binding wiring verbatim.** Specific anti-patterns observed: (a) rewriting `Click="{x:Bind ViewModel.Method}"` (valid WinUI 3) into `Click="X_Click"` + code-behind — breaks UI automation invoke; (b) "defensively" adding `FallbackValue=False` / `TargetNullValue=False` to `IsEnabled` bindings — control is silently disabled until first `PropertyChanged`; (c) changing `Mode=OneWay`/`TwoWay` to `OneTime`. Keep the source's binding mode, target, and method-binding syntax unchanged.
- Preserve the source app's startup navigation and initial visible content state. If the UWP app selects a default scenario, navigates to a page on launch, or initializes the content pane before user interaction, the migrated app must do the same.
- Preserve initialization order and event guards. If the source sets control state before creating a dependent object, keep any null checks / early returns that protect `SelectionChanged`, `Toggled`, `Loaded`, or similar handlers during startup.
- Scenario navigation must switch the visible content to the matching page or control, not just update selection state in the navigation UI.
- Preserve the sample's primary interaction behaviors end-to-end, especially command actions, item-click navigation, selection-driven content changes, and detail-page transitions.
- Preserve feature-specific semantics, not just compilability. Do not replace a specialized UWP behavior with a weaker generic API unless the user-visible result is still equivalent; if no equivalent exists, document it explicitly in `MIGRATION-DEFERRED.md` instead of silently degrading the scenario.
- For each migrated scenario, preserve at least one concrete observable outcome from the source flow: a status text update, a newly added item, a navigation to the detail page, a scenario-specific control appearing, or another visible end-state the user can verify.

### API-level

- Never fabricate API calls. If unsure of the WinUI 3 equivalent, fetch the relevant anchor via `Get-MigrationPattern.ps1`, or consult the official [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table).
- **Do not add new `defer` rows.** The bootstrap already decided which files are deferred (any file with an unsupported-API hit). Refine the rationale in `MIGRATION-DEFERRED.md` if needed, but do not move a row from `migrate-with-adaptation` → `defer` to dodge a hard TODO. "Looks complex" / "not core to demo" / "redundant" are **not** valid reasons.
- **Never resolve a TODO by keeping a runtime-crash API.** View-scoped `GetForCurrentView()` (ApplicationView / DisplayInformation / UIViewSettings / SystemNavigationManager / InputPane / ResourceLoader) and `DisplayRequest.RequestActive()` **throw at runtime** in WinUI 3 — there is no per-view singleton. Left in a constructor or `OnNavigatedTo`, the unhandled exception crashes the page to a **blank window** (the app launches but renders nothing). A `// migrate-keep: … optional for desktop` comment is a defect, not a resolution — replace or remove per `MIGRATION-PATTERNS.md#getforcurrentview` / `#display-request`. These are tagged `"severity":"runtime-crash"` in the inventory.
- **Handle known hardware/environment failures at the operation boundary.** Catch expected camera, sensor, microphone, location, Bluetooth, permission, and device-unavailable failures around acquisition/initialization, then show a visible fallback (`MIGRATION-PATTERNS.md#defensive-ui`). Do not blanket-catch every page constructor or startup error; unrelated programming failures must remain visible.

### Comment hygiene

When you fix a TODO, delete its marker in the same edit. Avoid comments that merely restate the replaced API because the validator intentionally detects unsupported identifiers in comments too; document the behavior or link to `MIGRATION-PATTERNS.md#<anchor>` when a future reader needs context.

### Defensive UI for device-dependent features

Pages depending on physical hardware (camera, microphone, location, sensors, Bluetooth, NFC) often run on machines that lack the device. Silent device-init failure leaves a blank window, indistinguishable from a crash to anyone looking at it.

**Rule:** catch the documented device-unavailable, access-denied, and initialization failures around device acquisition/init; on catch, swap the page's main content for a visible fallback (centred `TextBlock` saying *"This sample requires a <device-kind> device that is not available on this machine."* plus a safe diagnostic). Don't swallow unrelated exceptions from the rest of the constructor or navigation path.

### List/Grid item accessibility

`<ListView>`/`<GridView>` `<DataTemplate>` roots whose items are ViewModels need `AutomationProperties.Name="{x:Bind <DisplayProperty>}"` on the template root — otherwise the automation tree falls back to `Item.ToString()` and leaks the full type name (e.g. `MyApp.ViewModels.MediaItemViewModel`). Add this on every migrated DataTemplate, even when the UWP source didn't have it:

```xml
<DataTemplate x:DataType="vm:MediaItemViewModel">
    <Grid AutomationProperties.Name="{x:Bind Title}">
        <TextBlock Text="{x:Bind Title}" />
    </Grid>
</DataTemplate>
```

## References

[Migration overview](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/migrate-to-windows-app-sdk-ovw) · [what's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported) · [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table) · [feature-area guides](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/feature-area-guides-ovw) · [PhotoLab case study](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/case-study-1). If the UWP source relied on AppContainer isolation, also consider [Win32 App Isolation](https://learn.microsoft.com/windows/win32/secauthz/app-isolation-overview).