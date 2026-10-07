---
name: wait-chain-analysis
description: 'Use when an app, service, or user-mode driver host is unresponsive on locks, COM/RPC, I/O, or another process; follow the blocker chain. Not for a crash solely from an exception stack.'
version: 1.0.0
---

# Cross-Process Wait Chain Analysis

## Detection

Look for blocked work in an application, service, or user-mode driver host
(including UMDF), and threads in wait, COM, RPC, or I/O paths.
The process displaying the symptom may not own the underlying defect.
Idle worker threads waiting normally are not evidence of a hang.

## Workflow

### 1. Identify the affected operation and its thread

```text
.lastevent
~*kb
!runaway
```

Confirm why the dump was collected. A dump is a snapshot; `.lastevent` does not
by itself certify "hang" or "no crash." Identify the UI/serving thread from
application evidence instead of assuming thread zero is always the UI thread.
If work is spinning rather than blocked, collect appropriate CPU evidence.

### 2. Identify each wait and its owner

Inspect frames around `WaitForSingleObject`, `WaitForMultipleObjects`, COM
send/receive, and RPC calls. Use matching symbols/source for your own proxy,
interface, and server registration to determine what was requested.

For each edge record:

```text
process / thread -> waited resource or request -> owner / serving thread
```

Do not guess a server PID from undocumented private COM layouts. Use available
Wait Chain Traversal, RPC/COM tracing, application correlation IDs, or
registration/process information, and explicitly mark unresolved edges.

### 3. Gather corresponding server evidence

Obtain authorized dumps or live state of the relevant server processes close
enough in time to represent the same operation. Inspect their serving threads.
For kernel context use documented commands such as:

```text
!process 0 7
!thread <ethread>
```

Available user pages and symbol/context support vary by dump type. If the chain
ends in a kernel lock use `km-lock-deadlock-triage`; if blocked I/O is supported
by IRP evidence use `km-irp-lifecycle-triage`. Do not promise process heaps or
user stacks absent from the dump.

### 4. Distinguish a cycle from a slow or missing responder

- **Cycle:** show every required wait/owner edge back to the starting actor.
- **Contention:** a runnable owner may eventually release the resource.
- **Starvation:** queued work cannot obtain execution capacity.
- **Lost completion:** the actor/event expected to unblock the waiter no
  longer exists or no path signals it.
- **Slow server:** the endpoint is doing work, blocked on another dependency,
  or looping; gather its evidence before blaming the client.

Multiple snapshots or tracing may be needed to distinguish transient waits
from persistent blocking.

## Fix patterns and COM boundaries

A synchronous COM call from an STA can pump messages and permit reentrancy.
It is not automatically a deadlock. Investigate locks held across calls,
callbacks, apartment access, and any non-pumping waits that form an actual
dependency cycle.

Possible remedies include asynchronous APIs, shorter lock scopes, moving
destruction/cross-process calls outside critical sections, and bounded
wait/cancellation protocols where the API supports them. A timeout on the
caller does not cancel server work by itself.

If work moves to another apartment, marshal apartment-bound interfaces, keep
captured state alive, and dispatch UI updates to the correct thread. Merely
capturing a COM pointer and `this` in a worker lambda is not a safe fix.

## Validation

Identify the affected thread, relevant resources and owners, and demonstrated
cycle or deepest supported blocker. Test the proposed remedy under concurrency,
reentrancy, shutdown, and timeout/cancellation. Do not stop at "waiting in RPC."
If the server dump or an owner edge is missing, state the unresolved hypothesis.

## References

- [Wait Chain Traversal](https://learn.microsoft.com/windows/win32/debug/wait-chain-traversal)
- [Processes, threads, and COM apartments](https://learn.microsoft.com/windows/win32/com/processes--threads--and-apartments)
- [Process inspection](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-process)
- [Thread inspection](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-thread)

## Feedback

Follow `FEEDBACK.md` and submit only reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `wait-chain-analysis` and package version `1.0.0`; no automatic capture
or public upload of process dumps or full diagnostic transcripts.
