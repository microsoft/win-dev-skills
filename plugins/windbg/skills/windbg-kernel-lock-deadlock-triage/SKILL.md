---
name: windbg-kernel-lock-deadlock-triage
description: 'Use when kernel threads block on driver synchronization or Verifier reports a lock-order violation; build an owner/waiter graph. Not for treating every watchdog stop as a deadlock or listing every lock type with !locks.'
---

# Kernel Lock and Deadlock Triage

**Load `windbg-diagnostic-method` first** if it is not already loaded in this
conversation, and apply it throughout for evidence ranking, hypothesis testing,
confidence calibration, independent review, and report validation. This skill
adds the bug-family-specific commands and evidence requirements.

## Detection

Use kernel thread stacks, synchronization-object evidence, and Driver Verifier
deadlock records. A watchdog bugcheck can indicate CPU/DPC progress failures,
not necessarily a lock cycle. Establish the actual waits before choosing this
workflow.

## Workflow

### 1. Gather owners and waiters

```text
!locks
!thread <ethread-address>
!process 0 7
```

`!locks` enumerates ERESOURCE information. It is not an inventory of all
pushlocks, fast mutexes, and spinlocks. For other primitives use documented
primitive-specific inspection when available, matching symbols for your
driver, its source, and recorded acquisition evidence. State missing owners
explicitly.

### 2. Inspect recorded lock-order evidence

If Driver Verifier deadlock detection was enabled and the dump contains its
records:

```text
!deadlock 1
```

Inspect the reported resources, acquisition sequence, and threads. Verifier
can detect an unsafe ordering before a persistent deadlock actually forms.
An empty result without the required verification/history is not proof that
the lock order is safe. For Verifier setup/safety use `windbg-kernel-verifier-triage`.

### 3. Build and test the graph

```text
thread A holds resource X -> waits for Y owned by B
thread B holds resource Y -> waits for X owned by A
```

Show evidence for every edge. Check recursive acquisition, callbacks under
locks, I/O completion dependencies, and destruction/rundown paths.

Distinguish:

- A demonstrated cycle or Verifier-reported order inversion.
- Contention where a runnable owner can progress.
- Starvation or an owner blocked on a separate request.
- Spin/IRQL problems, which are not necessarily blocking-lock deadlocks.

If blocked on an IRP use `windbg-kernel-irp-lifecycle-triage`; if a chain crosses into a
user-mode COM/RPC operation use `windbg-user-wait-chain-analysis`. Carry the proven graph
edges into the next skill rather than starting the same investigation again.

### 4. Localize the driver path

Identify which call path held one resource while acquiring/waiting for another.
Check the required IRQL, permitted waits, lock hierarchy, and object lifetime.
Private Windows implementation layouts are not prerequisites; if public
symbols and captured state cannot recover an edge, request appropriate
authorized evidence and keep the conclusion provisional.

## Fix patterns

Use a consistent acquisition hierarchy, reduce lock scope, avoid unbounded
waits/cross-component callbacks while holding resources, and move potentially
blocking destruction outside locks where the ownership design permits.
Do not replace a lock or add a timeout without preserving invariants and
completion/cancellation semantics.

## Validation

Record the graph, supported cycle/inversion, and offending driver path.
Test concurrency, callbacks, teardown, and the same applicable Verifier checks.
Separate a demonstrated fix from an unproven contention hypothesis.

## References

- [ERESOURCE locks extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-locks)
- [Deadlock extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-deadlock)
- [Driver Verifier deadlock detection](https://learn.microsoft.com/windows-hardware/drivers/devtest/deadlock-detection)
- [Thread inspection](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-thread)

## Feedback

Follow `FEEDBACK.md` and report reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `windbg-kernel-lock-deadlock-triage` and the package version from `plugin.json`; no
automatic dump, lock-history transcript, or driver-source upload.
