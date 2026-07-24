---
name: winui-uwp-migration
description: "Use immediately when porting / migrating / converting a **C# UWP** application to WinUI 3 / Windows App SDK, or whenever the user mentions `Windows.UI.Xaml`, `Package.appxmanifest`, `.resw`, or shows a UWP `.csproj`. Preserves every page, control, and helper class unless an API is explicitly unsupported. Also covers replacing legacy `Windows.UI.Xaml` APIs and fixing build errors from prior UWP-to-WinUI 3 ports. **C++/WinRT and VB UWP projects are out of scope** — refuse the request."
---

> 🛑 **STOP — run [Step 0 — Bootstrap](#step-0--bootstrap-mandatory) first.** Do not view, read, or analyse any source file before the bootstrap completes — the `winapp migrate analyze` plan IS the inventory.

## Principles

Migrate, don't redesign. Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless it hits an API that's unsupported on WinUI 3 desktop, in which case it must be **explicitly deferred** with a written reason. Silent omission is a defect.

## Prerequisites

- **.NET SDK** matching the target TFM (read `<TargetFramework>` from the source `.csproj`).
- **Windows App SDK** — pulled in via the `Microsoft.WindowsAppSDK` NuGet package.
- **`winapp` CLI** — the skill's only tool dependency. All mechanical steps run through `winapp migrate <verb> --from-uwp` (scaffold / analyze / validate) plus `winapp build`/`run`. The analyzer that powers analyze/validate is bundled inside `winapp`; you never call it directly. See the `winui-dev-workflow` skill for standalone install.

## Unsupported on WinUI 3 desktop

Some UWP features have no WinUI 3 desktop equivalent. `winapp migrate analyze` flags them per-file as `disposition: defer` and per-line as `severity: unsupported`. For the human-readable catalogue and the WinUI 3 alternatives, see [Unsupported on WinUI 3 Desktop](./MIGRATION-PATTERNS.md#unsupported-on-winui-3-desktop-no-migration-path) in MIGRATION-PATTERNS.md.

## Process

Three `winapp` subcommands do every mechanical step. Your job is the judgement between them.

| Command | When | Purpose |
|---|---|---|
| `winapp migrate scaffold --from-uwp` | Once, at Step 0 | Copy UWP source into the WinUI 3 project + apply mechanical transforms (namespaces, csproj RID, RootFrame, `.uwp-source`) |
| `winapp migrate analyze --from-uwp`  | Once, at Step 0 (re-run only if you add source) | Produce the migration **plan** (JSON): per-file disposition + per-line findings + severity + fix refs + feature area |
| `winapp migrate validate --from-uwp` | Once, at Step 4 | Gate before declaring done (residue / single-project / manifest) |

**To fetch a fix recipe**, read the anchor named in a finding's `fix.ref` (e.g. `MIGRATION-PATTERNS#getforcurrentview`) directly from `MIGRATION-PATTERNS.md` — `grep -n` the anchor slug to find the heading, then `view_range` that one section. Do **not** load the whole `MIGRATION-PATTERNS.md`; it is API-name-dense and floods your context.

### Step 0 — Bootstrap (mandatory)

🛑 **Your first commands MUST be, in order:**

```powershell
# 1. Scaffold the empty WinUI 3 shell
dotnet new winui -n <ProjectName>

# 2. Copy UWP source in + apply mechanical transforms
winapp migrate scaffold "<absolute-path-to-uwp-cs-folder>" `
    --target "<absolute-path-to-scaffolded-winui3-project-root>" --from-uwp

# 3. Produce the migration plan (JSON) — this is your inventory
winapp migrate analyze "<winui3-project-root>" --from-uwp > "<winui3-project-root>/migration-plan.json"

# 4. MUST be a non-empty JSON file with a "files" array; otherwise Step 0 failed — fix the cause and re-run.
Test-Path "<winui3-project-root>/migration-plan.json"
```

Do **not** view, plan, or edit source files before `migration-plan.json` exists. `scaffold` copies every source file (including shared XAML in cross-language SDK Sample layouts) and does the deterministic transforms; `analyze` is the inventory. Inventorying by hand first wastes turns and misses files. If `scaffold` or `analyze` errors, fix the cause (broken sln, missing nuget, wrong `-Source` path) — never patch by copying files yourself. `scaffold` prints `=== SCAFFOLD COMPLETE ===` with what it did; read that block instead of browsing the tree.

**What `scaffold` already did** (do not redo by hand): verbatim source copy, sibling `shared/` + repo-wide `SharedContent/` merge, `Windows.UI.Xaml → Microsoft.UI.Xaml` rewrite, csproj RuntimeIdentifier patch for x86/x64/ARM64 F5, original `.csproj`/`.appxmanifest` preserved under `.uwp-source/`, content-filter-prone helper neutralization, and MainWindow `RootFrame` + deferred initial `Navigate` wiring.

### Step 1 — Migrate, file by file

Read `migration-plan.json`. Each entry in `files[]` has a `path`, a `disposition`, an optional `featureArea`, and a `findings[]` array. This is your roadmap — **do NOT read entire source files**.

```json
{
  "path": "MainPage.xaml.cs",
  "disposition": "migrate",
  "featureArea": "capture",
  "findings": [
    { "id": "WUI1002", "severity": "startup-crash",
      "detected": "Windows.System.Display.DisplayRequest",
      "location": { "file": "MainPage.xaml.cs", "line": 42, "column": 10 },
      "fix": { "ref": "MIGRATION-PATTERNS#display-request", "summary": "..." } }
  ]
}
```

**Route each file by `disposition`:**

| `disposition` | What you do |
|---|---|
| `migrate` | Ordinary migration. Resolve every finding in the file, then build once (**BATCH**). |
| `sequential-manual` | Sensitive API family (`featureArea` says which — camera/mic/sensors/speech). **Pace across turns:** resolve one feature-area group of findings per turn, keeping each turn's emitted edits small, then let the turn end before the next group. Also add a `try/catch` + visible fallback here (see *Defensive UI*). |
| `defer` | Contains an unsupported API with no equivalent. Add the file to `MIGRATION-DEFERRED.md` with a one-line rationale, and exclude it from the build / navigation. Do **not** attempt to migrate it. |
| `residue-check` | Nothing to author — a validator concern. Skip in Step 1. |

**Build cadence is per-FILE, never per-finding.** Resolve *all* of a file's findings, then build once. Building after every individual finding is the single biggest source of wasted turns and token blow-up — do not do it, regardless of disposition.

**Why `sequential-manual` paces by turn, not by build:** the model **output-safety filter** trips on how many sensitive API identifiers a *single assistant turn* emits. The turn boundary is what lowers output density and dodges the filter — **not** the build. Resolve one feature-area group per turn, let the turn end (e.g. by grepping the next `fix.ref` anchor), then continue. Build **once**, after all the file's findings are resolved, exactly like BATCH.

**Resolve a finding:**

1. `view_range` ±5 lines around `location.line`. If that isn't enough context (method boundary, field declarations, using directives, async context), widen to ±20 lines or the enclosing method.
2. Read the recipe named in `fix.ref` — `grep -n "<anchor-slug>" MIGRATION-PATTERNS.md`, then `view_range` that section only. `fix.summary` is the one-line intent.
3. Apply the pattern at `location.line`. Group findings by `fix.ref` — read the recipe once, apply it to every line that shares that anchor.
4. `severity: startup-crash` findings are **must-fix** — see the API-level rules. Never resolve one with a keep-comment.

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

**Do not modify `MainWindow.xaml`.** `scaffold` replaced the template's empty grid with `<Frame x:Name="RootFrame">` and injected a **deferred** `RootFrame.Navigate(typeof(MainPage))` call (dispatched via `DispatcherQueue.TryEnqueue` so it runs after `App.OnLaunched` assigns the static window) — the shell is fully wired. Drop your NavView + content into `MainPage.xaml` (and any other pages); leave the `MainWindow` shell, its TitleBar, and its `Activate()` call in `App.OnLaunched` alone. Rewriting MainWindow loses the Mica backdrop and titlebar treatment that other migrated samples have.

**Never read a static window reference (`App.MainWindow`, `App.Window`, `Window.Current`, etc.) synchronously from a Page constructor, `OnNavigatedTo`, or a `SelectionChanged`/`Loaded` handler that can fire during the first navigation.** `App.MainWindow = new MainWindow()` assigns the RHS *after* the constructor (and any synchronous navigation it triggers) completes, so such reads see `null` and crash the app at launch (E_POINTER / `NullReferenceException`, exit `0xc000027b`) — a build-clean, run-fail zero. Always null-guard these reads (`App.MainWindow is not null && …`, never the `!` null-forgiving operator), or defer them off the initial navigation.

### Step 2 — Reconcile the project file

The scaffold's `.csproj` is already wired for WinAppSDK; the UWP `.csproj.reference` at `.uwp-source/` is your reference for extras to merge (extra `PackageReference`s, `<None>`/asset globs, custom targets). Merge only what the app actually needs.

Do **not** overwrite the scaffold's `.csproj` with the UWP one — the two formats are incompatible. If the UWP manifest declared `<Extension>` categories (scaffold prints a warning listing them), handle them per [manifest-extensions](./MIGRATION-PATTERNS.md#manifest-extensions) — do not copy them verbatim; they fail AppX registration.

### Step 3 — Build, fix what tooling missed

```bash
winapp build
winapp run    # never run the .exe directly
```

After verifying the app launches correctly, **always unregister** to avoid stale AppX registrations that interfere with subsequent deployments:

```bash
winapp unregister --force --quiet
```

When a build error points at a UWP API, read the matching anchor in `MIGRATION-PATTERNS.md` (e.g. `CS0246` on `Window.Current` → `#windowing`; analyzer warning on `CoreDispatcher` → `#threading`). One anchor at a time.

> **Never create a nested copy of the project.** Do not copy the project tree into a sub-folder (a stray `AppX\` source copy is the usual offender) to "make an AppX package". The packaging AppX layout is **build output** that MSBuild emits under `bin\...\AppX\` — it is never a source folder you author. A nested project copy silently breaks the outer build: SDK-style projects only auto-exclude their own `bin`/`obj`, so the copy's `obj\*.cs` (AssemblyInfo / AssemblyAttributes) get globbed into compilation and the build dies with a wall of `CS0579: Duplicate '...Attribute'` errors. Keep exactly one `.csproj` in the project tree. (`winapp migrate validate` flags this.)

> **Launch ≠ render.** `winapp run` returning a process is not success — a page that throws during load (a residual `GetForCurrentView()`, camera init on a machine with no camera, etc.) leaves the window **blank** while the process stays alive. Confirm the shell renders its scenario list AND that navigating into a scenario shows that scenario's content, not an empty pane. A blank window = a defect to fix (usually a missing `try/catch` or a kept runtime-crash API), not a pass.

> **Build command discipline:** prefer `winapp build`/`winapp run` (clean final line). If you must use `dotnet build` from the powershell tool in **async** mode, do NOT pipe through a `Where-Object` filter — on a clean build the filter swallows every line and subsequent `read_powershell` returns nothing. Either run **sync**, leave output unfiltered, or append a sentinel: `dotnet build -c Debug; "BUILD_EXIT=$LASTEXITCODE"`.

### Step 4 — Validate (mandatory before declaring done)

🛑 **Run `winapp migrate validate --from-uwp` before declaring done.** The most common failure pattern: agents finish most files, see no obvious errors, and declare success — while leaving pages on UWP namespaces or a manifest missing `runFullTrust`. The validator catches this. (It is a completion *gate*, not an infinite polishing loop — see the re-run cap below.)

```bash
winapp migrate validate "<winui3-project-root>" --from-uwp
```

Validator checks (source-only static gate): UWP API residue (analyzer-backed) + namespace/csproj marker residue in non-deferred files; single project (no nested duplicate `.csproj` / stray `AppX\` copy); MainWindow shell wiring (`RootFrame` intact, no destructive `Content =` override); `Package.appxmanifest` packaging (Windows.Desktop target, image refs resolvable, rescap namespace + `runFullTrust`). Deferred files are read from `MIGRATION-DEFERRED.md` and excluded. Build/run health is covered separately by `winapp build` / `winapp run`.

`[FAIL]` lines show only `file:line`; full diagnostics are in `.validator-diagnostics.txt` at the project root — **open that file** before deciding the fix. The command returns non-zero while any `[FAIL]` remains. **Re-run cap: at most 2 re-validation cycles.** If the validator still reports FAILs after your 2nd fix cycle, stop iterating: for any *remaining* FAIL that is a cosmetic residue in a file already listed in `MIGRATION-DEFERRED.md`, record it there with a one-line rationale and treat the file as done. Only true build breaks (compile errors, missing pages) and must-fix residue must block completion. **Do not enter an open-ended validate→fix→re-validate loop** — that is a major token sink for near-zero score gain. **Do not report done with a build-breaking FAIL.** After the app builds clean, do a final `winapp build` to confirm.

## Critical Rules

### Fidelity (highest priority)

- Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless explicitly deferred with a cited unsupported API.
- Silent omission is a defect. If `migration-plan.json` is missing a file you expected, the scaffold input was wrong — fix the `-Source`/`--target` paths, re-run scaffold + analyze, do not patch by hand.
- Do not regenerate XAML from scratch. Copy each `*.xaml` verbatim (scaffold already did), then transform — controls, names, and event handlers must be preserved so the code-behind continues to compile.
- **Preserve binding wiring verbatim.** Specific anti-patterns observed: (a) rewriting `Click="{x:Bind ViewModel.Method}"` (valid WinUI 3) into `Click="X_Click"` + code-behind — breaks UI automation invoke; (b) "defensively" adding `FallbackValue=False` / `TargetNullValue=False` to `IsEnabled` bindings — control is silently disabled until first `PropertyChanged`; (c) changing `Mode=OneWay`/`TwoWay` to `OneTime`. Keep the source's binding mode, target, and method-binding syntax unchanged.
- Preserve the source app's startup navigation and initial visible content state. If the UWP app selects a default scenario, navigates to a page on launch, or initializes the content pane before user interaction, the migrated app must do the same.
- Preserve initialization order and event guards. If the source sets control state before creating a dependent object, keep any null checks / early returns that protect `SelectionChanged`, `Toggled`, `Loaded`, or similar handlers during startup.
- Scenario navigation must switch the visible content to the matching page or control, not just update selection state in the navigation UI.
- Preserve the sample's primary interaction behaviors end-to-end, especially command actions, item-click navigation, selection-driven content changes, and detail-page transitions.
- Preserve feature-specific semantics, not just compilability. Do not replace a specialized UWP behavior with a weaker generic API unless the user-visible result is still equivalent; if no equivalent exists, document it explicitly in `MIGRATION-DEFERRED.md` instead of silently degrading the scenario.
- For each migrated scenario, preserve at least one concrete observable outcome from the source flow: a status text update, a newly added item, a navigation to the detail page, a scenario-specific control appearing, or another visible end-state the user can verify.

### API-level

- Never fabricate API calls. If unsure of the WinUI 3 equivalent, read the finding's `fix.ref` anchor in `MIGRATION-PATTERNS.md`, or consult the official [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table).
- **Do not add new `defer` files.** `analyze` already decided which files are deferred (any file with an unsupported-API hit → `disposition: defer`). Refine the rationale in `MIGRATION-DEFERRED.md` if needed, but do not downgrade a `migrate` file to deferred to dodge a hard finding. "Looks complex" / "not core to demo" / "redundant" are **not** valid reasons.
- **Never resolve a finding by keeping a runtime-crash API.** View-scoped `GetForCurrentView()` (ApplicationView / DisplayInformation / UIViewSettings / SystemNavigationManager / InputPane / ResourceLoader) and `DisplayRequest.RequestActive()` **throw at runtime** in WinUI 3 — there is no per-view singleton. Left in a constructor or `OnNavigatedTo`, the unhandled exception crashes the page to a **blank window** (the app launches but renders nothing). A `// migrate-keep: … optional for desktop` comment is a defect, not a resolution — replace or remove per `MIGRATION-PATTERNS.md#getforcurrentview` / `#display-request`. These findings carry `"severity": "startup-crash"`.
- **Defensive UI is mandatory on device/view-init pages.** Wrap `OnNavigatedTo`, page constructors, and device-acquisition (`StartCameraAsync`, sensor `GetDefault()`, etc.) in `try/catch` with a visible fallback (`MIGRATION-PATTERNS.md#defensive-ui`). Device pages (camera / sensor / mic / location) are the ones with `disposition: sequential-manual`; add the guard there even though no per-line finding is emitted for it. An unhandled throw here is a blank-window crash.

### Comment hygiene

Don't name UWP API identifiers in code comments, commit messages, or anywhere they'll be re-fed into context — comments like `// Replaces SomeOldType.SomeMethod()` inflate API-name density in later turns and the validator's residue check also matches inside comments. Instead use anchor references: when you fix a finding, if you genuinely need a future-reader note, write `// See MIGRATION-PATTERNS.md#<anchor>` and stop there.

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
