---
name: um-exception-triage
description: 'Use when a native C/C++ app, service, or user-mode driver host (including UMDF) crashes with a structured exception in a dump or WinDbg session, including native faults inside managed processes; establish context and classify it. Not for managed .NET exceptions, WinUI/XAML app errors, or kernel bugchecks.'
---

# User-Mode Exception Triage

## When to use

Start here for access violations, heap corruption, stack overflow, fail-fast,
breakpoints, and other structured exceptions in a native application, service,
or user-mode driver host process dump. This includes UMDF driver failures that
occur in their user-mode host. Confirm
the dump type from WinDbg; the filename extension alone does not distinguish
user-mode from kernel-mode dumps.

## Workflow

### 1. Establish the exception context

```text
.exr -1
.ecxr
k
!analyze -v
```

Record the exception code, address, parameters, access type, registers, module,
and stack. `.ecxr` selects the saved exception context when available. If no
exception context was captured, report that limitation rather than treating the
currently selected thread as the faulting thread.

Use matching binaries and PDBs for your modules and public Windows symbols.
Investigate mismatches or truncated stacks before naming a failing source line.

### 2. Classify and choose an available investigation

| Evidence | Next step |
|---|---|
| `0xC0000005` with allocation/free or overrun evidence | `heap-corruption-investigation` |
| `0xC0000374` heap corruption | `heap-corruption-investigation` |
| `0xC0000017`, `0x8007000E`, or an allocation-failure path | `virtual-memory-exhaustion` |
| Lock/unlock failure following coroutine suspension | `mutex-held-across-co-await` |
| A TTD recording is available and earlier mutation is in question | `ttd-reverse-debugging-triage` |
| No crash exception and evidence of blocked work | `wait-chain-analysis` |
| A kernel dump reports a bugcheck | `kernel-bugcheck-triage` |

Do not classify every address in a heap range as a lifetime bug. Check access
type, faulting instruction, object layout, and valid allocation boundaries.

### 3. Investigate families without a dedicated skill

- **Access violation without a match:** identify the read/write/execute target,
  object/register used, and whether bounds, ownership, or synchronization was
  violated. Distinguish a null pointer from stale or corrupted state.
- **`0xC0000409` / fail-fast:** inspect exception parameters and the documented
  fast-fail subcode, then the failing condition and call path. The historical
  status name alone does not prove a buffer overrun or rule one out. Not every
  fast-fail carries an HRESULT.
- **`0xC00000FD` / stack overflow:** inspect stack bounds and frame sizes; test
  recursion, reentrancy, large frames, and inability to commit stack growth.
  Use the memory-exhaustion skill when commit evidence supports that branch.
- **`0xE06D7363` / MSVC C++ exception:** establish whether it was handled,
  identify the throw/catch path with available symbols, and inspect the
  exception information supported by the runtime/version. A first-chance throw
  is not automatically a defect. This package does not decode thrown-object
  layouts or fully diagnose `noexcept`/termination behavior.
- **Stowed/WinRT exceptions:** preserved error information can precede the
  final failure. Correlate its originating stack and nested errors with the
  application; this package does not include a XAML extension workflow.
- **Illegal instruction or breakpoint:** distinguish CPU/architecture or
  code-corruption hypotheses from intentional assertions/debug breaks.

## Validation

- Exception context and code are established, or their absence is stated.
- Faulting instruction and relevant object/register agree with the hypothesis.
- Alternatives are tested against evidence, not just stack names.
- Missing memory, symbols, and specialized exception coverage are explicit.
- The proposed fix addresses a demonstrated invariant and has a repro/test plan.

## References

- [Exception context](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-ecxr--display-exception-context-record-)
- [Exception record](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-exr--display-exception-record-)
- [Controlling exceptions and events](https://learn.microsoft.com/windows-hardware/drivers/debugger/controlling-exceptions-and-events)

## Feedback

For this skill, follow the plugin's `FEEDBACK.md` and report a reviewed, sanitized
issue to [WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `um-exception-triage` and the package version from `plugin.json`; do not
upload dumps or private source automatically.
