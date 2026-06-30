---
name: winui-uwp-migration
description: "Use immediately when porting / migrating / converting a **C# UWP** application to WinUI 3 / Windows App SDK, or whenever the user mentions `Windows.UI.Xaml`, `Package.appxmanifest`, `.resw`, or shows a UWP `.csproj`. Preserves every page, control, and helper class unless an API is explicitly unsupported. Also covers replacing legacy `Windows.UI.Xaml` APIs and fixing build errors from prior UWP-to-WinUI 3 ports. **C++/WinRT and VB UWP projects are out of scope** — refuse the request."
---

## Principles

Migrate, don't redesign. Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless it hits an API that's unsupported on WinUI 3 desktop, in which case it must be **explicitly deferred** with a written reason. Silent omission is a defect.

## Prerequisites

- **.NET SDK** matching the target TFM (read `<TargetFramework>` from the source `.csproj`).
- **Windows App SDK** — pulled in via the `Microsoft.WindowsAppSDK` NuGet package.
- **`winapp` CLI** — comes transitively via `Microsoft.Windows.SDK.BuildTools.WinApp`. See the `winui-dev-workflow` skill for standalone install.

## Unsupported on WinUI 3 desktop

Some UWP features have no WinUI 3 desktop equivalent. See [Unsupported on WinUI 3 Desktop](./MIGRATION-PATTERNS.md#unsupported-on-winui-3-desktop-no-migration-path) in MIGRATION-PATTERNS.md for the full list. Key unsupported APIs include: InkCanvas, Virtual key gamepad input, Single-app kiosk, Xbox/HoloLens targets, and CoreWindow-based APIs.

## Process

### Step 0 — Scaffold and Inventory

1. **Scaffold** the WinUI 3 project shell:
   ```powershell
   dotnet new winui -n <ProjectName>
   ```
2. **Manually inventory** the UWP source: list every `.cs`, `.xaml`, `.resw`, and asset file. Identify which files use UWP-only APIs that need adaptation vs. those that only need namespace changes.
3. **Copy source files** into the scaffolded project. For each file, determine its migration category:
   - `migrate-as-is` — only namespace changes needed (`Windows.UI.Xaml` → `Microsoft.UI.Xaml`)
   - `migrate-with-adaptation` — uses APIs that moved or changed (windowing, threading, pickers, etc.)
   - `defer` — depends on APIs with no WinUI 3 equivalent (document the reason)

### Step 1 — Migrate, file by file

Walk each source file:

- **Namespace replacements:** All `Windows.UI.Xaml.*` → `Microsoft.UI.Xaml.*`. In XAML: `xmlns:local` stays, but platform namespaces update.
- **For files needing adaptation**, consult [MIGRATION-PATTERNS.md](./MIGRATION-PATTERNS.md) for the correct WinUI 3 pattern. Key sections:
  - `#windowing` — `Window.Current` / `ApplicationView` / `CoreWindow` → `AppWindow` + HWND
  - `#threading` — `CoreDispatcher` → `DispatcherQueue`
  - `#pickers` — `InitializeWithWindow` required
  - `#dialogs` — `MessageDialog` → `ContentDialog` with `XamlRoot`
  - `#getforcurrentview` — per-API replacement table
  - `#media` — `MediaElement` → `MediaPlayerElement`
  - `#background-tasks` — `BackgroundTaskBuilder` changes
  - `#resources` — MRT → MRT Core

**Shell conversion** — pick the closest WinUI 3 idiom:

| Source shell pattern (UWP) | Suggested WinUI 3 target |
|---|---|
| `MainPage` + `ListView` + `Frame` (SDK-sample idiom) | `NavigationView` + `Frame` |
| `Pivot` | `TabView` (top), or `Pivot` from Community Toolkit if parity matters |
| `Hub` | `NavigationView` with grouped items, or hand-rolled `ScrollViewer` |
| Plain `Frame` (single page) | Single `Page` hosted directly under `Window` |

**Navigation invariants:** every non-deferred page is reachable from primary navigation; order matches source; titles match source; deferred items are **omitted** (not shown disabled).

**Shared sample-shell invariants:** when the source uses the common SDK-sample shell pattern (`ScenarioControl` + content `Frame` + footer links / logos / sample title), preserve that shell's visible structure and startup behavior end-to-end.

**Do not modify `MainWindow.xaml`.** The `dotnet new winui` template already provides the correct shell (TitleBar + IconSource + MicaBackdrop + `Frame x:Name="RootFrame"`). Drop your NavView + content into `MainPage.xaml`.

### Step 2 — Reconcile the project file

The scaffold's `.csproj` is wired for WinAppSDK. Merge only what's needed from the UWP project:
- Additional NuGet packages the app depends on
- Content/asset includes (images, media, `.resw`)
- Custom build properties (RuntimeIdentifiers, PublishProfiles)

Do **not** overwrite the scaffold's `.csproj` with the UWP one — the two formats are incompatible.

### Step 3 — Build, fix what tooling missed

```bash
winapp build
winapp run    # never run the .exe directly
```

After verifying the app launches correctly, **always unregister**:

```bash
winapp unregister --force --quiet
```

When a build error points at a UWP API, look up the corresponding section in MIGRATION-PATTERNS.md (e.g. `CS0246` on `Window.Current` → see `#windowing`; analyzer warning on `CoreDispatcher` → see `#threading`).

> **Build command discipline:** prefer `winapp build`/`winapp run` (clean final line). If you must use `dotnet build` from the powershell tool in **async** mode, do NOT pipe through a `Where-Object` filter — on a clean build the filter swallows every line and subsequent `read_powershell` returns nothing.

### Step 4 — Validate

Verify the migration is complete:
- No `Windows.UI.Xaml` residue in non-deferred `.cs`/`.xaml` files
- No TODO markers left behind
- Every source file accounted for (migrated or explicitly deferred with reason)
- `Package.appxmanifest` targets `Windows.Desktop` with `rescap:Capability Name="runFullTrust"`
- Clean `dotnet build` with zero WUI analyzer warnings
- App launches and shows expected UI

## Critical Rules

### Fidelity (highest priority)

- Every page, UserControl, helper class, and XAML element in the source must appear in the target — unless explicitly deferred with a cited unsupported API.
- Silent omission is a defect.
- Do not regenerate XAML from scratch. Copy each `*.xaml` verbatim, then transform — controls, names, and event handlers must be preserved so the code-behind continues to compile.
- **Preserve binding wiring verbatim.** Do not rewrite `Click="{x:Bind ViewModel.Method}"` into `Click="X_Click"` + code-behind. Do not add `FallbackValue`/`TargetNullValue` to `IsEnabled` bindings. Keep the source's binding mode, target, and method-binding syntax unchanged.
- Preserve the source app's startup navigation and initial visible content state.
- Preserve initialization order and event guards.
- Scenario navigation must switch the visible content to the matching page or control, not just update selection state.
- Preserve the sample's primary interaction behaviors end-to-end.
- Preserve feature-specific semantics, not just compilability.
- For each migrated scenario, preserve at least one concrete observable outcome from the source flow.

### API-level

- Never fabricate API calls. If unsure of the WinUI 3 equivalent, consult MIGRATION-PATTERNS.md or the official [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table).
- **Do not add new `defer` entries without a cited unsupported API.** "Looks complex" / "not core to demo" / "redundant" are **not** valid reasons.

### Manifest extensions — NEVER add "Remove" extensions

UWP manifest extensions `windows.dialProtocol`, `windows.appService`, `windows.backgroundTasks` must NEVER appear in the WinUI 3 manifest — they cause AppX registration failure (`0x80073CF6`). The underlying APIs still function without the manifest extension.

### Comment hygiene

Don't name UWP API identifiers in code comments — comments like `// Replaces SomeOldType.SomeMethod()` inflate API-name density. When you fix a migration issue, just delete the old code; if you genuinely need a future-reader note, write `// See MIGRATION-PATTERNS.md#<anchor>` and stop there.

### Defensive UI for device-dependent features

Pages depending on physical hardware (camera, microphone, sensors, Bluetooth) often run on machines that lack the device. Wrap device acquisition in `try/catch`; on catch, show a visible fallback TextBlock ("This sample requires a <device-kind> device...") instead of leaving a blank window.

### List/Grid item accessibility

`<ListView>`/`<GridView>` `<DataTemplate>` roots need `AutomationProperties.Name="{x:Bind <DisplayProperty>}"` on the template root.

## References

[Migration overview](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/migrate-to-windows-app-sdk-ovw) · [what's supported](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/what-is-supported) · [API mapping table](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/api-mapping-table) · [feature-area guides](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/guides/feature-area-guides-ovw) · [PhotoLab case study](https://learn.microsoft.com/windows/apps/windows-app-sdk/migrate-to-windows-app-sdk/case-study-1).
