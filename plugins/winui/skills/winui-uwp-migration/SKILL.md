---
name: winui-uwp-migration
description: "Use immediately when porting / migrating / converting a **C# UWP** application to WinUI 3 / Windows App SDK, or whenever the user mentions `Windows.UI.Xaml`, `Package.appxmanifest`, `.resw`, or shows a UWP `.csproj`. Preserves every page, control, and helper class unless an API is explicitly unsupported. Also covers replacing legacy `Windows.UI.Xaml` APIs and fixing build errors from prior UWP-to-WinUI 3 ports. **C++/WinRT and VB UWP projects are out of scope** — refuse the request."
---

> 🛑 **STOP — run [Step 0 — Bootstrap](#step-0--bootstrap-mandatory) first.** Do not view, read, or analyse any source file before the bootstrap completes — its output IS the inventory.

## Principles

Migrate, don't redesign. Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless it hits an API that's unsupported on WinUI 3 desktop, in which case it must be **explicitly deferred** with a written reason. Silent omission is a defect.

## Prerequisites

- **.NET SDK** matching the target TFM (read `<TargetFramework>` from the source `.csproj`).
- **Windows App SDK** — pulled in via the `Microsoft.WindowsAppSDK` NuGet package.
- **`winapp` CLI** — comes transitively via `Microsoft.Windows.SDK.BuildTools.WinApp`. See the `winui-dev-workflow` skill for standalone install.

## Unsupported on WinUI 3 desktop

Some UWP features have no WinUI 3 desktop equivalent. See [Unsupported on WinUI 3 Desktop](./MIGRATION-PATTERNS.md#unsupported-on-winui-3-desktop-no-migration-path) in MIGRATION-PATTERNS.md; the machine-readable form is [`scripts/unsupported-api-inventory.json`](./scripts/unsupported-api-inventory.json), consumed by the bootstrap and validator.

## Process

Four scripts do every mechanical step. Your job is the judgement between them.

| Script | When | Purpose |
|---|---|---|
| `scripts/Initialize-UwpMigration.ps1` | Once, at Step 0 | Inventory + scaffolding |
| `scripts/Get-MigrationPattern.ps1`    | Per TODO, in Step 1/3 | Fetch one anchor from PATTERNS.md |
| `scripts/Get-WinUIDefaultStyle.ps1`   | On a Step 1d WARN (custom Template with UWP-era residue) | Read the WinUI 3 default Style for a built-in control — reference for surgical edits, do not paste-the-world |
| `scripts/Validate-UwpMigration.ps1`   | Once, at Step 4 | Gate before declaring done |

**Prefer `Get-MigrationPattern.ps1` over opening MIGRATION-PATTERNS.md directly** — the full file is API-name-dense and loading it floods your context.

### Step 0 — Bootstrap (mandatory)

🛑 **Your first three powershell commands MUST be:**

```powershell
# 1. Scaffold WinUI 3 shell
dotnet new winui -n <ProjectName>

# 2. Bootstrap
& "<skill-root>/scripts/Initialize-UwpMigration.ps1" `
    -Source "<absolute-path-to-uwp-cs-folder>" `
    -Target "<absolute-path-to-scaffolded-winui3-project-root>"

# 3. MUST print True; otherwise the bootstrap failed — fix the cause and re-run.
Test-Path "<winui3-project-root>/MIGRATION-MAPPING.md"
```

Do **not** view, plan, or edit source files before step 3 prints `True`. The bootstrap script *is* the inventory; inventorying by hand first wastes turns and misses files (especially shared XAML in cross-language SDK Sample layouts). If step 2 errors, fix the cause (broken sln, missing nuget, etc.) — never patch by copying files yourself. The script prints `=== BOOTSTRAP COMPLETE ===` with what it did and what to do next; read that block instead of browsing the tree.

### Step 1 — Migrate, file by file

Open `MIGRATION-MAPPING.md`. Every row already has a Triage label (`migrate-as-is`, `migrate-with-adaptation`, `defer`). The bootstrap injected `// TODO[migrate-NNN]: see PATTERNS.md#<anchor>` (or `<!-- … -->` in XAML) above every line that needs adaptation, and a per-file execution mode in `.bootstrap-meta.json` (`perFileMode`):

- **`BATCH`** — fix every TODO in the file in one pass, build once. Default.
- **`SEQUENTIAL`** — fix one TODO, build, repeat. Used when API names trigger model output-safety filters; pacing edits keeps each turn small.

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
- **Batch independent edits** in a single turn. If a file has 5 TODOs with the same anchor, fix all 5 in one edit call.
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

**Do not modify `MainWindow.xaml`.** The bootstrap replaces the template's empty grid with `<Frame x:Name="RootFrame">` and injects the `RootFrame.Navigate(typeof(MainPage))` call — the shell is fully wired. Drop your NavView + content into `MainPage.xaml` (and any other pages); leave the `MainWindow` shell, its TitleBar, and its `Activate()` call in `App.OnLaunched` alone. Rewriting MainWindow loses the Mica backdrop and titlebar treatment that other migrated samples have.

### Step 2 — Reconcile the project file

The scaffold's `.csproj` is wired for WinAppSDK; the UWP `.csproj.reference` at `.uwp-source/` is your reference for extras to merge. Fetch the cheat-sheet:

```powershell
& "<skill-root>/scripts/Get-MigrationPattern.ps1" -Anchor csproj
```

Do **not** overwrite the scaffold's `.csproj` with the UWP one — the two formats are incompatible.

### Step 3 — Build, fix what tooling missed

```bash
winapp build
winapp run    # never run the .exe directly
```

After verifying the app launches correctly, **always unregister** to avoid stale AppX registrations that interfere with subsequent deployments:

```bash
winapp unregister --force --quiet
```

When a build error points at a UWP API, fetch the relevant anchor (e.g. `CS0246` on `Window.Current` → `-Anchor windowing`; analyzer warning on `CoreDispatcher` → `-Anchor threading`). One anchor at a time.

> **Build command discipline:** prefer `winapp build`/`winapp run` (clean final line). If you must use `dotnet build` from the powershell tool in **async** mode, do NOT pipe through a `Where-Object` filter — on a clean build the filter swallows every line and subsequent `read_powershell` returns nothing. Either run **sync**, leave output unfiltered, or append a sentinel: `dotnet build -c Debug; "BUILD_EXIT=$LASTEXITCODE"`.

### Step 4 — Validate (mandatory before declaring done)

🛑 **You are NOT done until `Validate-UwpMigration.ps1` reports PASS.** The most common failure pattern: agents finish most files, see no obvious errors, and declare success — while leaving pages on UWP namespaces or rows stuck at `Status = copied`.

```powershell
& "<skill-root>/scripts/Validate-UwpMigration.ps1" -Target "<winui3-project-root>"
```

Validator checks: residue grep (no `Windows.UI.Xaml` / unsupported APIs in non-deferred files); TODO marker residue; MAPPING integrity (row count matches seed; no `Status = copied`); DEFERRED consistency; `Package.appxmanifest` (Windows.Desktop target, rescap + `runFullTrust`); clean `dotnet build` with zero WUI analyzer warnings.

`[FAIL]` lines show only `file:line`; full diagnostics are in `.validator-diagnostics.txt` at the project root — **open that file** before deciding the fix. Re-run until PASS. **Do not report done with a FAIL.** After PASS, do a final `winapp build` to confirm.

## Critical Rules

### Fidelity (highest priority)

- Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless explicitly deferred with a cited unsupported API.
- Silent omission is a defect. If `MIGRATION-MAPPING.md` is missing a file you expected, the bootstrap input was wrong — fix the `-Source` path and re-run, do not patch by hand.
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

### Comment hygiene

Don't name UWP API identifiers in code comments, commit messages, or anywhere they'll be re-fed into context — comments like `// Replaces SomeOldType.SomeMethod()` inflate API-name density in later turns and the validator's residue grep also matches inside comments. Instead use anchor references: when you fix a TODO, **delete the TODO line entirely** in the same edit; if you genuinely need a future-reader note, write `// See PATTERNS.md#<anchor>` and stop there.

### Defensive UI for device-dependent features

Pages depending on physical hardware (camera, microphone, location, sensors, Bluetooth, NFC) often run on machines that lack the device. Silent device-init failure leaves a blank window, indistinguishable from a crash to anyone looking at it.

**Rule:** wrap device acquisition / init in `try/catch`; on catch, swap the page's main content for a visible fallback (centred `TextBlock` saying *"This sample requires a <device-kind> device that is not available on this machine."* + the exception's `Message`). Don't just log and return — a two-line fallback keeps the page visible instead of showing a blank screen on machines without the device.

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