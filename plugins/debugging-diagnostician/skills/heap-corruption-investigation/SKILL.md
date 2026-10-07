---
name: heap-corruption-investigation
description: 'Use when an app, service, or user-mode driver host heap fails or Application Verifier detects corruption; inspect history and bounds. Not for kernel pool corruption or ordinary OOM.'
version: 1.0.0
---

# Heap Corruption Investigation

## Detection and limits

Look for `STATUS_HEAP_CORRUPTION` (`0xC0000374`), Application Verifier stops,
or failures in heap allocate/free/reallocate paths in an application, service,
or user-mode driver host such as an UMDF host process. A crash inside the allocator
may be the first detection of an earlier bad write, not the faulty operation.
Distinguish corruption from allocation failure; for the latter use
`virtual-memory-exhaustion`.

Allocation/free history depends on how the process was instrumented and which
pages were captured. A missing history is a limitation, not proof of a leak or
use-after-free.

## Workflow

### 1. Decode the stop

```text
.exr -1
.ecxr
!analyze -v
k
```

Record the stop reason, corrupted block, corruption address, and the operation
that detected the damage. If a verifier stop frame has parameter/local symbols,
select it with `.frame /r <frame>` and inspect `dv`; otherwise use the captured
stop output and the documented stop definition. Do not assume one fixed
parameter layout or a stop code shared by all verifier versions.

### 2. Recover available block history

```text
!heap -p -a <address>
!avrf -hp -a <address>
```

The first command inspects a Page Heap allocation; the second searches available
Application Verifier heap-operation history. Use `!heap -?` and `!avrf -?` to
confirm support in the installed extension. On an uninstrumented dump these
commands may not recover the history needed to identify the writer.

Capture allocation and free stacks when present. Check the address is inside
the user allocation rather than a header or neighboring block.

### 3. Test competing explanations

| Hypothesis | Evidence to seek |
|---|---|
| Use-after-free | Confirmed free before a later access through a retained reference |
| Double-free | Two ownership/completion paths freeing the same allocation |
| Overrun/underrun | A write outside the allocated user bounds |
| Wild write | Corrupted header or payload and a writer with an invalid target |
| Allocation/free contract mismatch | Different allocator/deallocator or incorrect owning heap |

Inspect bytes with `db <address> L<size>` and disassembly around the access.
Fill patterns and plausible pointers are clues, not causal proof. Correlate with
source, history, or a repro and trace the ownership transition.

### 4. Obtain stronger evidence if necessary

With user approval, enable full Page Heap for a named test executable:

```text
gflags /p /enable target.exe /full
```

Restart that process and reproduce under the debugger. Application Verifier
heap checks can also be configured for that test executable. Explain memory
overhead, timing changes, and potential deliberate stops before doing this.
Record the previous settings and restore them when finished; if Page Heap was
newly enabled for this test, disable it with:

```text
gflags /p /disable target.exe
```

Do not change an existing application's verification policy without approval.
If a user-mode TTD trace is available, use `ttd-reverse-debugging-triage` to
find the relevant mutation or free.

## Fix patterns

- Enforce the actual lifetime contract with ownership types or explicit
  acquire/release rules. Shared ownership is appropriate only when the design
  genuinely has multiple owners.
- Synchronize shared state separately: `shared_ptr` ownership does not make a
  concurrently modified cache or pointed-to object thread-safe.
- Size buffers and check arithmetic, lengths, and terminators; use bounds-aware
  containers where appropriate.
- Keep allocation and deallocation compatible across DLL/API boundaries.

## Validation

Establish the affected block and supported corruption class, name the path that
violated bounds or ownership, and distinguish the detector from the writer.
Exercise the fix with the same instrumentation and relevant concurrency/load.
Report unresolved writer history rather than presenting a guessed fix as proven.

## References

- [Application Verifier stop definitions](https://learn.microsoft.com/windows-hardware/drivers/devtest/application-verifier-stop-codes-and-definitions)
- [Heap extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-heap)
- [Application Verifier extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-avrf)
- [GFlags and Page Heap](https://learn.microsoft.com/windows-hardware/drivers/debugger/gflags-and-pageheap)

## Feedback

Follow `FEEDBACK.md` and report reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `heap-corruption-investigation` and package version `1.0.0`; no automatic
dump, source, or transcript upload.
