# Private WinUI ETW capture

## What this workflow does

`Collect-WinUITrace.ps1` controls a user-mode private ETW file session scoped to one
already-running PID. The target does not need to include a tracing helper, use .NET,
or be rebuilt. The bundled C# file is compiled in memory by PowerShell `Add-Type`;
there is no NuGet restore or prebuilt executable.

This is not "delegated permissions": it does not change group membership, provider ACLs,
or account privileges. A normal user can collect from an accessible desktop process.
Being the same user is necessary for this workflow but does not remove Windows process
security boundaries. An AppContainer application is not equivalent to a full-trust
packaged WinUI 3 desktop application.

The mechanism was exercised from a medium-integrity, non-administrator token without
Performance Log Users membership against a packaged desktop app using the shipped
Windows App SDK 2.4.0 runtime on ARM64. Native `Microsoft-Windows-XAML` manifest and
TraceLogging events, including `Scheduling_*`, `Dispatch_*`, and rendering events, were
captured; the optional XAML diagnostics provider also emitted records. This is not a
claim that every provider emits in every app or that all Windows/runtime combinations
have identical behavior. Enabling a provider successfully is not proof of event coverage.

## Collect and decode

Launch the app normally, identify its actual WinUI process PID, and wait until it has
loaded `Microsoft.UI.Xaml.dll`. Use a fresh output directory:

```powershell
$skillPath = "<winui-etw-diagnostics skill directory>"
& "$skillPath\Collect-WinUITrace.ps1" -ProcessId <PID> `
  -OutputDirectory .\winui-private -DurationSeconds 20
```

Reproduce after the script prints `Recording`. Leave the collector running until it stops.
Closing the target also ends collection, but stop before closing when final loss
statistics matter. Private buffers live in the target process; a crash or forced
termination can lose the tail of the trace.

To include control implementation or visual-tree/source diagnostics:

```powershell
& "$skillPath\Collect-WinUITrace.ps1" -ProcessId <PID> `
  -OutputDirectory .\winui-private-debug -DurationSeconds 10 `
  -ControlsDebug -Diagnostics
```

The switches are independent. Omit either one when not needed. These optional providers
can generate large volumes and expose app data.

`tracerpt.exe` is available in Windows and decodes ETL files without registering a
manifest or requiring Windows Performance Toolkit. Private ETW can add a PID suffix to
filenames, so use the paths reported in `capture.json` rather than assuming a fixed name:

```powershell
$captureDirectory = (Resolve-Path .\winui-private).Path
$capture = Get-Content (Join-Path $captureDirectory 'capture.json') -Raw | ConvertFrom-Json
$etlPaths = @($capture.TraceFiles | ForEach-Object { Join-Path $captureDirectory $_ })
if ($etlPaths.Count -eq 0) { throw 'The capture contains no ETL files.' }
tracerpt @etlPaths -of XML -o .\winui-events.xml
if ($LASTEXITCODE -ne 0) { throw "tracerpt failed: $LASTEXITCODE" }
```

TraceLogging records carry their own schema, so names such as
`Scheduling_RenderThreadWaitForWork` and their payload fields can be decoded without
machine-wide manifest installation. Some manifest events may be missing fields or be
decoded using an incompatible installed schema. A schema warning is not a clean decode;
inspect `ProcessingErrorData` by provider and event ID. A trace-header error does not
invalidate otherwise decoded WinUI records, but never draw conclusions from an errored
record.

If a **matching** `Microsoft-Windows-XAML-ETW.man` is available, import it for that decoding
operation only:

```powershell
tracerpt @etlPaths -import .\Microsoft-Windows-XAML-ETW.man `
  -of XML -o .\winui-events-matched.xml
if ($LASTEXITCODE -ne 0) { throw "tracerpt failed: $LASTEXITCODE" }
```

Use the binary version recorded in `capture.json` and the manifest acquisition guidance
in `SKILL.md`. Do not run `wevtutil im` for this workflow. `-lr` is a best-effort decoder
option, not a fix for an incompatible manifest.

Confirm native target-provider records rather than treating a nonempty ETL as success.
Set `$decodedPath` to the output from the decode operation you intend to analyze (including
the matched-manifest output when used). The following small-trace example processes XML
locally and prints only provider counts, not the event objects:

```powershell
$decodedPath = '.\winui-events.xml' # Use .\winui-events-matched.xml after manifest import.
[xml]$decoded = Get-Content -LiteralPath $decodedPath -Raw
$targetEvents = @($decoded.Events.Event | Where-Object {
    $_.System.Execution.ProcessID -eq [string]$capture.ProcessId -and
    $_.System.Provider.Guid -in @(
        '{531a35ab-63ce-4bcf-aa98-f88c7a89e455}',
        '{2dc72f6e-e4d1-5f58-3245-09a4243799dd}',
        '{f55f7011-988d-4674-a724-e01b39dc7af6}',
        '{afe0ae07-66a7-55bb-12ff-01116bc08c1a}',
        '{59e7a714-73a4-4147-b47e-0957048c75c4}'
    )
})
if ($targetEvents.Count -eq 0) { throw 'No native WinUI events from the target PID were decoded.' }
$decodeErrors = @($targetEvents | Where-Object { $_.SelectSingleNode("*[local-name()='ProcessingErrorData']") })
if ($decodeErrors.Count -gt 0) {
    throw "$($decodeErrors.Count) target WinUI records failed decoding. Obtain the matching manifest before analyzing those records."
}
$targetEvents | Group-Object { $_.System.Provider.Guid } | Select-Object Count, Name
```

Use `RenderingInfo.Task` for decoded names where present, and retain provider GUID,
event ID/version, opcode, timestamp, thread, activity ID, and payload fields. Event ID
zero alone does not identify a TraceLogging event. For large traces use WPA or a local
streaming XML reader instead of loading the entire XML document into memory. Follow
the bounded-output guidance in `SKILL.md`: retain the full files, return small summaries,
and retrieve only the evidence needed for the next question.

## Limitations and failures

| Symptom or requirement | Interpretation / action |
|---|---|
| `StartTrace` returns access denied (5) | The target/session is not accessible in this context. Confirm the PID is the same-user, same-integrity desktop app. AppContainer/protected/elevated targets may be denied. Do not grant permissions or elevate as a workaround. |
| Session already exists (183) | Another capture for this PID is active. Let its owning collector stop it. The script never stops an existing session it did not create. |
| `Get-Process` or module enumeration fails | Wrong/exited PID or inaccessible target. Use the real desktop app process, not its activation launcher. |
| PowerShell blocks the script or `Add-Type` | Respect application-control and execution policy. This source-based helper cannot run in that environment without an approved deployment path. |
| No native events, or an enabled provider is absent | Reproduce after attachment and confirm the selected component actually emits events in this runtime. An idle window or a gated event may produce nothing. |
| ETW loss counters are nonzero or the file reaches its cap | Coverage is incomplete. Shorten the scenario, remove verbose providers, or increase the bounded `-MaximumFileSizeMB`. Do not interpret missing stop events as a hang. |
| `SessionAlreadyStopped` is true | ETW removed the session before cleanup, for example when a sequential file filled. `StopSucceeded` is false and loss counters are null (unknown), not zero. Inspect `FileCapReached` and the event interval; metadata end time is when the collector finalized, not necessarily when recording stopped. |
| App exits/crashes, or collection is forcibly killed | Tail data and final statistics may be missing. A zero loss counter after target exit is not proof of completeness. |
| Need initial startup | This helper attaches only after WinUI is loaded. It cannot recover prior initialization events. A pre-launch/private instrumentation design is separate work. |
| Need live streaming, native sampled CPU, context-switch/ready-thread stacks, GPU/compositor processes | Not provided. Private loggers do not support real-time ETW delivery or kernel events. Use managed EventPipe evidence where applicable and explicitly report the remaining gap if elevated WPR is unavailable. |

Event pairs still measure elapsed time in private traces; they do not distinguish CPU
execution from blocking or scheduling delay. Likewise, WinUI's own scheduling-named
events are not kernel context-switch events.

## API contract

The helper uses `StartTraceW` with `EVENT_TRACE_PRIVATE_LOGGER_MODE` and sequential file
mode, not `EVENT_TRACE_SYSTEM_LOGGER_MODE`. Its `EVENT_TRACE_PROPERTIES_V2` includes
`WNODE_FLAG_VERSIONED_PROPERTIES`, version 2, and one `EVENT_FILTER_TYPE_PID` descriptor.
The same PID filter is passed to every `EnableTraceEx2` call and retained for
`ControlTraceW(STOP)`. Session names are attributable to the target PID; a failed start
does not confer ownership of an existing session. Allocations remain live through stop.

This is an externally controlled private session, not `EVENT_TRACE_PRIVATE_IN_PROC`;
the latter would require the controller to execute inside the app. The collector asks
for no kernel data, does not register manifests, and does not adjust security settings.

- [Private logger sessions](https://learn.microsoft.com/windows/win32/etw/configuring-and-starting-a-private-logger-session)
- [Versioned session properties and PID filters](https://learn.microsoft.com/windows/win32/api/evntrace/ns-evntrace-event_trace_properties_v2)
- [Private logger modes and limitations](https://learn.microsoft.com/windows/win32/etw/logging-mode-constants)
- [tracerpt](https://learn.microsoft.com/windows-server/administration/windows-commands/tracerpt)
