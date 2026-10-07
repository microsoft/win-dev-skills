---
name: ttd-reverse-debugging-triage
description: 'Use when an app, service, or user-mode driver host TTD recording is available and earlier calls, writes, or lifetimes matter. Not for kernel replay or history from a normal dump.'
version: 1.0.0
---

# TTD Reverse Debugging Triage

## Requirements and scope

Time Travel Debugging records a user-mode process for replay, including an
authorized application, service, or user-mode driver host process. A dump alone
contains no execution timeline. Confirm a valid recording and matching module
symbols before attempting timeline queries. It does not record kernel execution
or automatically include another process's server-side activity.

Recording can change timing, require substantial storage, and capture sensitive
memory. Obtain authorization before capture. Check the installed recorder's help
for supported target, architecture, and options. WinDbg's **Launch executable
(advanced)** / **Record with Time Travel Debugging** flow can record a named
test application without guessing a recorder command.

## Workflow

### 1. Open and index the recording

Open the recorded `.run` file in WinDbg and load public Windows symbols and
matching PDBs for your own binaries.

```text
!tt.index
dx @$cursession.TTD
```

Confirm the timeline range. Indexing and data-model availability depend on
WinDbg/TTD versions; consult the installed help if the command is unavailable.

### 2. Ask a bounded history question

```text
dx @$cursession.TTD.Calls("MyModule!MyFunction")
dx @$cursession.TTD.Memory(<start-address>, <end-address>, "w")
```

Query the known function or exact memory range, then inspect relevant results
and their timeline positions. An empty result can mean unmatched symbols,
uninstrumented execution, or an out-of-range query, not proof of absence.

Use the call query to find allocation/free or module lifetime transitions and
the memory query to locate candidate writes. Account for allocator reuse: the
same virtual address may represent different objects over the recording.

### 3. Seek and inspect state

```text
!tt <position>
k
r
g-
```

Seek to an actual position returned by the query. `g-` continues backward;
use the installed reverse-step controls to refine the search. Capture the
last-good and first-bad states, writer/caller stack, and ownership transition.

Do not equate the last write with the bug until you establish the object's
identity, valid lifetime, intended invariant, and relevant cross-thread order.

### 4. Continue with a shipped investigation

| Evidence | Skill |
|---|---|
| Bad free/write or allocation-boundary violation | `heap-corruption-investigation` |
| Growing allocation/reservation usage | `virtual-memory-exhaustion` |
| Lock survives coroutine suspension | `mutex-held-across-co-await` |
| Blocker or cross-process dependency at the selected moment | `wait-chain-analysis` |

For other user-mode families continue reasoning from the timeline rather than
dispatching to absent skills. For a kernel crash use `kernel-bugcheck-triage`;
TTD is not a kernel-history substitute.

## Validation

Record the question, trace identity, timeline positions, relevant object
lifetime, and source/stack evidence. Test alternatives and state recording
boundaries. A reproducible timeline proves what occurred in that recording;
it does not establish that instrumentation preserved all production timing.

## References

- [Time Travel Debugging overview](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/time-travel-debugging-overview)
- [TTD data-model queries](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/time-travel-debugging-object-model)
- [TTD extension commands](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/time-travel-debugging-extension-commands)

## Feedback

Follow `FEEDBACK.md` and report a reviewed summary to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `ttd-reverse-debugging-triage` and package version `1.0.0`; never
automatically upload a recording or its memory/query contents.
