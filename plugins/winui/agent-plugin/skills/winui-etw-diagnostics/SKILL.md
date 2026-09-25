---
name: winui-etw-diagnostics
description: "Collect native WinUI ETW without elevation using private logging, with optional WPR for startup and system-wide CPU evidence. Diagnose lifecycle, UI-thread stalls, layout, rendering, images, input, scrolling, virtualization, controls, device loss, and XAML Islands."
---

# WinUI ETW diagnostics

## When to Use

Use this skill when runtime behavior matters more than a static code review: slow startup,
long or dropped frames, repeated layout, delayed images, input lag or reentrancy, scrolling
or virtualization problems, XAML Island initialization, suspend/resume issues, device loss,
or an expensive WinUI control. It applies to applications consuming shipped WinUI binaries;
a WinUI source checkout or source build is not required.

## Providers

| Provider | GUID | Default use |
|---|---|---|
| `Microsoft-Windows-XAML` | `{531A35AB-63CE-4BCF-AA98-F88C7A89E455}` | Primary lifecycle, scheduling, and performance stream. Contains manifest events and self-describing TraceLogging events. |
| `Microsoft.UI.Xaml` | `{2DC72F6E-E4D1-5F58-3245-09A4243799DD}` | Operational events such as fail-fast context, resource-lookup boundaries, device state, first frame, runtime aggregates, and connected animation. |
| `Microsoft.UI.Xaml.Controls.Perf` | `{F55F7011-988D-4674-A724-E01B39DC7AF6}` | Informational control-specific performance messages. |
| `Microsoft.UI.Xaml.Controls.Debug` | `{AFE0AE07-66A7-55BB-12FF-01116BC08C1A}` | Informational and verbose control implementation messages. Enable only for short, focused traces. |
| `Microsoft-Windows-XAML-Diagnostics` | `{59E7A714-73A4-4147-B47E-0957048C75C4}` | Optional visual-tree, binding, source-info, and input diagnostics. It can be high volume. |
| `Microsoft.UI.Xaml.Controls` | `{21E0AE07-56A7-55B5-12F9-011E6BC08CCA}` | Product telemetry. Do not enable by default; it is rarely needed for app performance diagnosis. |
| `WindowsUIXaml` (WPP) | `{CB18E7B3-F5B0-412F-9F18-5D87FEFCD663}` | Optional debugging messages for DirectManipulation, resource loading, and ListViewBase chrome. Requires matching symbols/TMF metadata to decode reliably. |

Provider names and event availability vary somewhat by Windows App SDK version. GUIDs are
the reliable capture identity. The included WPR profile uses GUIDs so it also works when a
provider is not registered by name.

`Microsoft-Windows-XAML-Profiler` is intentionally excluded. Its tree instrumentation is
compiled into special debug framework builds and is not an expected surface of shipped
retail WinUI binaries. XAML compiler markers are build-time logging, not runtime WinUI ETW.

## Collect without elevation (default)

Use the bundled `Collect-WinUITrace.ps1` for an already-running WinUI desktop app.
It collects **native ETW**, not EventPipe, using a PID-filtered private file logger.
It requires **no elevation, Performance Log Users membership, ACL changes, privileged
service, or changes to the app**. Windows still enforces access to the target process:
use an accessible desktop app running as the same user at the same integrity level.
Do not promise access to elevated, protected, other-user, or AppContainer processes.

Resolve the script relative to this installed skill's directory, not the app repository.
Keep its `assets\PrivateEtwSession.cs` beside it in the original directory layout.
Run from normal 64-bit PowerShell 5.1+ on Windows 10 version 1703 or later:

```powershell
$skillPath = "<winui-etw-diagnostics skill directory>"
& "$skillPath\Collect-WinUITrace.ps1" -ProcessId <PID> `
  -OutputDirectory .\winui-private -DurationSeconds 30
# Reproduce in the app while the command says "Recording".
```

The script requires a new or empty output directory and writes `winui.etl` (potentially
with a PID suffix) plus `capture.json` containing the process lifetime, loaded WinUI DLL
version/path, enabled providers, capture interval, and available loss statistics.
It stops only its own session, including on normal PowerShell cancellation. Do not
forcibly kill the collector. Captures are bounded to 30 seconds and 128 MB by default;
`-DurationSeconds` and `-MaximumFileSizeMB` override these within bounded ranges.
A full file can truncate the capture: always inspect coverage, not just file existence.

Default providers match `WinUIEvents` below. Add `-ControlsDebug` or `-Diagnostics`
only for short, focused captures; either switch can be used independently.
No tools or packages are downloaded. If PowerShell policy blocks the script or `Add-Type`,
report the limitation; do not relax policy or fall back to elevation/permission grants.

Private logging provides an event timeline, **not live ETW streaming or kernel CPU/wait
analysis**. It misses events before attachment, including initial app startup, and does
not capture compositor/GPU work in other processes. Do not infer CPU usage or ready-thread
delay from event durations. If elevation is unavailable, report those evidence gaps and,
for managed apps, use the EventPipe companion below.

See [private capture and decoding](references/private-capture.md) for no-admin ETL
decoding, troubleshooting, and the underlying ETW API contract.

## Optional elevated WPR collection

Use WPR only when elevation is explicitly available and system-wide CPU/wait evidence
or pre-launch startup collection is needed. **Do not choose this workflow when elevation
or tracing-permission changes are disallowed.**

Prefer a short trace containing one clean reproduction. Resolve `assets\winui-etw.wprp`
relative to this installed skill's directory. If the host does not expose installed
skill paths, copy the bundled WPRP asset to a writable local directory and use that path.
Run from an elevated PowerShell window. Do not cancel someone else's WPR recording:

```powershell
$wprpPath = Join-Path "<winui-etw-diagnostics skill directory>" "assets\winui-etw.wprp"
wpr -start "${wprpPath}!WinUIEvents" -filemode
# Launch or activate the app, then reproduce the problem once.
wpr -stop .\winui-events.etl "WinUI lifecycle/performance reproduction"
```

The command-line `wpr.exe` is available in-box on current Windows releases, but do not
assume Visual Studio installed the full Windows Performance Toolkit. Install the Windows
ADK and select **Windows Performance Toolkit** when `wpa.exe`, WPRUI, or the current toolkit
components are missing. Check what is available before directing the user to install
anything:

```powershell
Get-Command wpr, wpa -ErrorAction SilentlyContinue
```

Use `WinUICPU` when the symptom is a hang, long frame, slow layout/rendering, or unexplained
UI-thread time. It adds sampled CPU, context switches, ready-thread stacks, process/thread,
and image-load data:

```powershell
$wprpPath = Join-Path "<winui-etw-diagnostics skill directory>" "assets\winui-etw.wprp"
wpr -start "${wprpPath}!WinUICPU" -filemode
# Reproduce once.
wpr -stop .\winui-cpu.etl "WinUI CPU reproduction"
```

Use `WinUIDiagnostics` only for a focused source-info, visual-tree, binding,
accessibility, detailed-input, or control-implementation investigation. It combines the
high-volume diagnostics and controls-debug providers, so keep the capture especially short:

```powershell
$wprpPath = Join-Path "<winui-etw-diagnostics skill directory>" "assets\winui-etw.wprp"
wpr -start "${wprpPath}!WinUIDiagnostics" -filemode
# Reproduce the narrow diagnostic scenario once.
wpr -stop .\winui-diagnostics.etl "WinUI diagnostics reproduction"
```

If WPR cannot start the custom profile, inspect the available profiles and confirm the
command is running from an elevated shell:

```powershell
$wprpPath = Join-Path "<winui-etw-diagnostics skill directory>" "assets\winui-etw.wprp"
wpr -profiles $wprpPath
```

Capture startup by starting WPR before launching the process. For an already-running app,
record its PID and the exact reproduction interval. These WPR sessions are
machine-wide, unlike the PID-filtered private collector; always filter the analysis to
the target process and its lifetime.

## Managed .NET companion diagnostics

`dotnet-trace`, `dotnet-monitor`, and `dotnet-counters` use the .NET runtime's EventPipe
transport. They can complement ETW when the WinUI app hosts CoreCLR, but they **cannot
collect the native WinUI providers in this skill**. Do not pass `Microsoft-Windows-XAML`,
`Microsoft.UI.Xaml`, or the controls provider names to an EventPipe `--providers` option;
matching provider syntax does not bridge native ETW into EventPipe.

The similar terminology is easy to misread. A managed `EventSource` can publish its events
through both EventPipe and ETW, but an EventPipe collector is not an ETW session. Native
WinUI providers register directly with ETW through `EventRegister` or TraceLogging and
require an ETW collector. In a controlled Windows test, `dotnet-trace` enabled and captured
a managed `EventSource` in the target process while a native `EventWriteString` emitted
from that same process under the exact `Microsoft-Windows-XAML` GUID produced no records in
the `.nettrace`.

| Tool | Use it for | WinUI ETW limitation |
|---|---|---|
| `dotnet-trace` | Managed CPU samples, GC, JIT, exceptions, loader/threading events, and app `EventSource` events | Produces a process-specific `.nettrace`; no native WinUI, kernel, compositor, or native call stacks |
| `dotnet-monitor` | Production/remote collection of managed traces, dumps, logs, and metrics, including trigger-based collection | Its trace endpoint is EventPipe-based; it does not expose native WinUI ETW |
| `dotnet-counters` | Low-overhead first-level monitoring of `System.Runtime`, `EventCounter`, and `Meter` values | Metrics only; no WinUI event timeline, start/stop durations, or native stacks |

First confirm the target is a diagnosable .NET process:

```powershell
dotnet-trace ps
```

For managed CPU/runtime evidence, run `dotnet-trace` alongside the private ETW or WPR
capture over the same short reproduction interval:

```powershell
dotnet-trace collect --process-id <PID> `
  --profile dotnet-common,dotnet-sampled-thread-time `
  --duration 00:00:00:30 `
  --output .\winui-managed.nettrace
```

Open `.nettrace` in PerfView or Visual Studio. Use it to attribute managed callbacks,
allocations, GC pauses, JIT, exceptions, contention, and managed CPU. Use the ETL for WinUI
layout/render/input events, and, only with the appropriate system-wide capture, native CPU
and waits, kernel scheduling, and compositor/device work.
Record one wall-clock reproduction interval and an app-visible marker so the two
files can be correlated; do not assume their relative timestamps share one viewer timeline.

Use counters before a heavier managed trace when the question is simply whether managed
CPU, allocation rate, GC, exceptions, or thread-pool behavior is abnormal:

```powershell
dotnet-counters monitor --process-id <PID> --counters System.Runtime

# Or retain samples for later comparison.
dotnet-counters collect --process-id <PID> `
  --counters System.Runtime `
  --refresh-interval 1 `
  --format csv `
  --output .\winui-managed-counters.csv
```

Use `dotnet-monitor` only when it is already part of the production/remote diagnostic
environment or automated trigger rules are needed. For a local desktop reproduction,
`dotnet-trace` is the simpler EventPipe companion. A C++ WinUI app, or a process that does
not appear in the `dotnet-* ps` output, needs the ETW workflow rather than these tools.

Official background:

- [Download and install the Windows ADK](https://learn.microsoft.com/windows-hardware/get-started/adk-install)
- [Windows Performance Recorder](https://learn.microsoft.com/windows-hardware/test/wpt/windows-performance-recorder)
- [EventPipe overview](https://learn.microsoft.com/dotnet/core/diagnostics/eventpipe)
- [`dotnet-trace`](https://learn.microsoft.com/dotnet/core/diagnostics/dotnet-trace)
- [`dotnet-monitor`](https://learn.microsoft.com/dotnet/core/diagnostics/dotnet-monitor)
- [`dotnet-counters`](https://learn.microsoft.com/dotnet/core/diagnostics/dotnet-counters)

## Decode correctly

Open the ETL in Windows Performance Analyzer (WPA), or use the no-install `tracerpt`
workflow in [private capture and decoding](references/private-capture.md).
Reading a trace does not itself require elevation when the file is accessible. Start with:

- **System Activity > Processes**, when present, to identify the exact process lifetime.
  For private traces, use the recorded PID and process start time in `capture.json`.
- **System Activity > Generic Events** for WinUI events.
- **Computation > CPU Usage (Sampled)** and **CPU Usage (Precise)** for a `WinUICPU`
  capture.
- **System Activity > UI Delays** when available.

TraceLogging events carry their schema in the ETL and should decode on any analysis machine.
Older `Microsoft-Windows-XAML` events are manifest-based. A decoder with an older or missing
manifest may show provider GUID `{531A...}` and numeric event IDs instead of names and
fields. Do not interpret those numeric IDs against a different WinUI version. Obtain the
`Microsoft-Windows-XAML-ETW.man` from the matching
[`microsoft-ui-xaml` release tag](https://github.com/microsoft/microsoft-ui-xaml/tags) at
`src\dxaml\xcp\plat\win\desktop\Microsoft-Windows-XAML-ETW.man`
(older tags use the same path without `src\`).

Identify the WinUI binary actually loaded by the target process rather than choosing among
all runtimes installed on the machine:

```powershell
$xamlModule = (Get-Process -Id <PID>).Modules |
  Where-Object ModuleName -eq "Microsoft.UI.Xaml.dll"
$xamlModule | Select-Object FileName,
  @{ Name = "ProductVersion"; Expression = { $_.FileVersionInfo.ProductVersion } },
  @{ Name = "FileVersion"; Expression = { $_.FileVersionInfo.FileVersion } }
```

`ProductVersion` may identify only a release family rather than its servicing version.
Use the runtime's release information to find the matching `winui3/release/<version>`
tag; when `FileVersion` includes an available source commit hash, prefer that exact commit.
Do not guess a servicing tag from the family alone.
For a framework-package runtime, the package containing the loaded DLL identifies the
installed runtime version; do not substitute another installed package or assume the DLL's
product-version family matches the package version.

Pass that manifest to `tracerpt -import` as described in the private capture reference.
This also works for WPR ETLs and does not register the manifest on the machine.
Do not install or uninstall the XAML publisher with `wevtutil`: its GUID can already
belong to a Windows publisher. If WPA cannot decode it correctly, use the imported XML
for those events rather than changing machine-wide registration.

## Analysis method

### Keep agent output bounded

Keep ETLs and decoded XML on disk; do not print the full trace into agent context.
Run filtering and aggregation locally. Start with capture coverage, loss/decode warnings,
provider counts, and at most 15 event groups, then retrieve at most 20 evidence records
per query for the relevant process, time interval, thread, or event family. Report the
query, total matches, and omitted count so a limited result is never mistaken for absence.
Report errors and unmatched boundaries separately from frequency-ranked groups; rare
events can matter more than common ones. Preserve correlation keys and retrieve both
boundaries (expanding the interval if necessary) before calculating durations.

Include source-file and record/timestamp references for drill-down, and redact sensitive
payloads before returning them. Counts are a navigation aid, not bottleneck attribution.
Do not disable verbose capture or sample away events solely to save tokens: reduce what
the agent reads, not the evidence retained. Load the event catalog and exhaustive manifest
reference only when the current scenario needs them.

### Interpret the evidence

1. Record the app PID, package/runtime version, architecture, trace interval, scenario, and
   providers captured.
2. Filter every table to the target process. Separate the UI thread, render thread, image
   worker threads, and compositor-related work.
3. Build a timeline from application/XAML initialization through the first visible frame,
   or from input intent through the next presented frame.
4. Pair `Start`/`Stop`, `Begin`/`End`, or `IsStart=true/false` events. Match by activity ID
   when present; otherwise use task/event name, thread, object pointer, image ID, or another
   payload correlation key. Do not pair overlapping operations by name alone.
5. Quantify duration, count, frequency, and concurrency before assigning a cause. For long
   operations, inspect CPU stacks and ready-thread delay when collected. A private
   event-only trace cannot establish either.
6. Treat missing boundary events as evidence. For example, a queued image decode with no
   off-thread start differs from a completed decode with no hardware-resource update.
7. Cite provider, event name, timestamp/duration, thread, and payload values in every
   conclusion. Separate confirmed evidence from hypotheses.

## Scenario playbooks

### Startup, windows, and XAML Islands

Use `ApplicationStartup`, `ApplicationStarted`, `InitializeCore`,
`CoreServicesCreate`, `CreateDesktopWindow`, `CreateWindow`, `PutRootVisual`,
`PutSource`, `ApplicationLoadComponent`, `ParseXaml`, `DWXS::Initialize`,
`WXM::InitializeForCurrentThread`, and `FirstUiThreadFrameEnd`.

- Pair initialization events on the UI thread and identify the longest nested operation.
- `CreateDesktopWindow(IsStart, ObjectPointer)` distinguishes a desktop WinUI window from
  an app that initializes XAML only for an island.
- `PerfXamlEvent` uses `EventName`, `ObjectPointer`, and `IsInteresting`; pair rows with the
  same event/object and opposite `IsStart`.
- A large gap with low CPU and ready-thread delay points to blocking or external work. A
  CPU-saturated interval should be attributed from stacks, not event duration alone.

### Frame, layout, and rendering

Use `Frame`, `Tick`, `RequestFrameReason`, `Layout`, `Measure`, `Arrange`,
`MeasureElement`, `ArrangeElement`, `MeasureOverride`, `ArrangeOverride`,
`ApplyTemplate`, `RaiseAllLoadedEvents`, `RenderWalk`, `SubmitFrame`,
`CommitMainDevice`, and `CompositorLock`.

- Count layout passes per frame. Repeated invalidation (`InvalidateMeasure`,
  `InvalidateArrange`, `RecursiveInvalidateMeasure`) after layout starts usually matters
  more than one expensive initial pass.
- Use element/object pointers only as trace-local identities. Correlate them with element
  type/name/source events when available.
- Separate UI-thread production (`Tick`, layout, render walk) from render/compositor waits.
  A long frame can be CPU work, lock contention, device recovery, or a scheduling delay.
- `Scheduling_*` and `Dispatch_*` TraceLogging events explain why a tick was requested,
  deferred, paused, resumed, or blocked by reentrancy.

### Images and device loss

Correlate self-describing image events by `Id`:

`SetUriSource`/`SetStreamSource` -> `QueueProcessDownload` ->
`ImageDownloadCompleteNotification` -> `ParseImageMetadataStart/Stop` ->
`QueueProcessDecodeRequests` -> `QueueOffThreadDecode` ->
`OffThreadDecodeStart/Stop` -> `DecodeResultAvailable`.

- URI fields may contain app or service data. Redact them before sharing a trace or report.
- Compare requested dimensions with source, metadata, and decode dimensions in
  `RequestDecodeToRenderSize` and `DecodeToRenderSizeStart`.
- `WaitForDownloadInProgress` indicates request sharing; `FoundCompletedDownload` and
  `FoundImageCache` indicate cache reuse.
- `SoftwareBitmapFallbackAfterUploadError`, `PresentBitmapDuringDeviceLoss`,
  `RecordDeviceAsLost`, `CheckForStaleDxgiDevice`, `ReleaseGraphicsDeviceResources`, and
  `RebuildGraphicsDeviceResources` localize GPU/device recovery.
- `ImageTaskDispatcher_QueueTask`, `_Execute`, and `_Execute_End` expose UI-thread batching
  and work that spills into a later tick.

### Input, focus, and reentrancy

Use `ProcessPointerInput`, `InputEvent`, pointer/key routed-event pairs, `HitTest`,
`TouchHitTesting`, `UpdateFocus`, `XYFocusWalk`, and manipulation events.

- Measure from the input event to the next frame submission, not just handler duration.
- `PointerInputReentrancyDetected(SupersededMessageId, NewMessageId)` proves nested pointer
  processing, commonly caused by a nested message pump in an app callback.
- A short framework input path followed by a long `EventCallback` or public API call points
  to app work. A long hit test, focus walk, or manipulation path points back into XAML.

### Collections, scrolling, and virtualization

Use `GenerateItems`, `GenerateContainer`, `PrepareContainer`, `PlaceElement`,
`VirtualizationMeasure`, `VirtualizationAdd`, `VirtualizationCleanup`,
`VirtualizedItem*`, `ChangeSelection`, and `ModernCollectionBasePanel_RealizationWindow`.
For newer controls, also use `FlowLayoutAlgorithm_Measure`,
`FlowLayoutAlgorithm_Generate`, `FlowLayoutAlgorithm_Generate_CurrentBounds`,
`BuildTreeScheduler_OutOfWork`, `ScrollPresenter_ValuesChanged`, and the
`ScrollPresenter_TryUpdate*`/`TryUpdateScale*` families on `Microsoft-Windows-XAML`.

Also enable the control providers and filter by component keyword:

| Mask | Component |
|---:|---|
| `0x0001` | ItemsRepeater |
| `0x0002` | ScrollPresenter |
| `0x0004` | PullToRefresh (`PTR`) |
| `0x0008` | ScrollView |
| `0x0010` | SwipeControl |
| `0x0020` | CommandBarFlyout |
| `0x0040` | WebView2 |
| `0x0080` | TabView |
| `0x0100` | ItemsView |
| `0x0200` | ItemContainer |
| `0x0400` | LinedFlowLayout |
| `0x0800` | AnnotatedScrollBar |
| `0x1000` | SelectorBar |
| `0x2000` | NavigationView |
| `0x4000` | InkToolBar |
| `0x8000` | TitleBar |

The Debug provider emits `<Component>Info` and `<Component>Verbose` with a formatted
`Message`; the Perf provider emits `<Component>Perf` with `Info`. These are implementation
messages, not stable public contracts. Compare them within the same WinUI version and quote
the message in findings rather than relying on its wording across releases.

### WebView2 and MapControl initialization

Use `WebView2_CreateCoreObjects`, `WebView2_TryCompleteInitialization`,
`WebView2_FireNavigationCompleted`, `MapControl_InitializeWebMap`,
`MapControl_WebViewNavigationCompleted`, and `MapControl_WebMessageReceived_Error`.

- Pair initialization rows by `ObjectPointer` and `IsStart`.
- A WebView2 navigation completion with no event handlers distinguishes framework
  completion from app-observed completion.
- Drag/drop error rows carry HRESULT, content type, and error context. Treat error-message
  text as potentially sensitive.
- For MapControl, distinguish native control initialization from WebView navigation and
  web-message processing. A web-message error after successful initialization is not a
  XAML parser/layout failure.

### Resources, bindings, and templates

Use `GetBuiltInStyle`, `LoadTemplateContent`, `ApplyTemplate`,
`RefreshTemplateBindings`, `UpdateTargetBinding`, `UpdateSourceBinding`,
`ResourceDictionary*`, and `ResourceLookup_*`.

- Pair resource lookup scopes by `ETWEventIndex` and dictionary pointer. Repeated traversal
  through merged/theme dictionaries for the same key can explain template or navigation
  stalls.
- Binding work is often interleaved. Match by target/source object and property payloads
  where available rather than pairing by thread alone.
- Enable `Microsoft-Windows-XAML-Diagnostics` only when source info, visual-tree mutation,
  binding, or accessibility context justifies its additional volume.

## Reporting rules

When analyzing a trace, report:

1. Runtime version, process/PID, architecture, capture interval, provider set, and whether
   manifest events decoded.
2. The user-visible interval and its total duration.
3. The dominant WinUI phases with count, inclusive duration, and thread.
4. CPU versus wait time for each dominant phase.
5. Correlation keys and payloads supporting the diagnosis.
6. The narrowest confirmed bottleneck and any remaining uncertainty.

Do not claim causality from one long event without checking its nesting and CPU/wait state.
Do not compare pointer values across processes or traces. Treat URIs, resource keys, element
names, source paths, control messages, and error text as potentially sensitive app data.

See `references/event-catalog.md` for the scenario-oriented provider/event inventory and
correlation guide. Use `references/manifest-event-families.md` when an unfamiliar legacy
event appears or an exhaustive manifest family lookup is needed.
