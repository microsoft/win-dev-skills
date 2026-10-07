---
name: windbg-kernel-bugcheck-triage
description: 'Use when a kernel dump reports a Windows bugcheck; decode parameters and recover exception or trap context before investigating your driver. Not for user-mode process crashes or blaming a module from its name alone.'
---

# Kernel Bugcheck Triage

**Load `windbg-diagnostic-method` first** if it is not already loaded in this
conversation, and apply it throughout for evidence ranking, hypothesis testing,
confidence calibration, independent review, and report validation. This skill
adds the bug-family-specific commands and evidence requirements.

## Scope

Use a kernel crash dump or authorized live kernel session. A process dump
captured after a reboot does not contain the earlier kernel fault. Confirm
the dump type with the debugger, not a filename or the user's visible symptom.
This skill includes exception-context and trap-frame recovery.

## Workflow

### 1. Establish symbols and bugcheck evidence

```text
.symfix
.sympath+ <your-vendor-symbol-directory>
.reload
!analyze -v
.bugcheck
k
```

Replace the placeholder with the approved symbol location for your own binaries.
Record dump type, target architecture/build, bugcheck code and parameters,
faulting instruction, and available memory. Public Windows symbols suffice
for many investigations; do not require private Windows source or PDBs.

### 2. Decode parameters for the specific code

| Code | Parameter meaning / next step |
|---|---|
| `0x1E` | P1 exception code; P2 exception address; P3/P4 exception-specific information. These are not generically a CONTEXT pair. |
| `0x7E` | P1 exception code; P2 exception address; P3 EXCEPTION_RECORD; P4 CONTEXT. |
| `0x3B` | P1 exception code; P2 instruction address; P3 CONTEXT; P4 unused. |
| `0x0A` / `0xD1` | Referenced address, IRQL, access information, instruction address. Decode the access field for that code; these parameters are not generally a trap-frame pointer. |
| `0x50` | Invalid memory reference; parameter interpretation varies with target version. Consult the code reference. |
| `0x9F` | P1 selects the power-failure subtype; use its specific parameter table and `windbg-kernel-irp-lifecycle-triage` where applicable. |
| Verifier-class stop | Use `windbg-kernel-verifier-triage` and the exact code/subcode definition. |

Do not reuse a parameter layout across different bugchecks.

### 3. Recover the original faulting context

For `0x7E`:

```text
.exr <P3>
.cxr <P4>
kb
r
```

For `0x3B`:

```text
.cxr <P3>
kb
r
```

For other exception-style bugchecks, locate a valid saved exception/context
using the documented code procedure and available analysis output. Do not
guess `.cxr` arguments from arbitrary P1..P4 values.

When `!analyze -v` or verified stack evidence identifies a `TRAP_FRAME`:

```text
.trap <trap-frame-address>
kb
r
```

Trap frames can be partial: some registers may be missing or reconstructed
incorrectly. Note the debugger's warnings and do not treat unsaved registers as
reliable evidence. If a frame is missing, malformed, or absent from the dump,
report the limitation rather than scanning arbitrary pointers and claiming a
recovered context.

### 4. Investigate the driver, not just the detector

```text
!thread
lmvm <driver-module>
.frame /r <frame-number>
```

Inspect the recovered instruction, register/object used, IRQL, ownership,
and nearby driver frames. A crash in an operating-system routine may result
from prior driver corruption. Conversely, a third-party name in
`MODULE_NAME` does not establish that the named driver caused the failure.
Verify vendor build identity against the matching binary/PDB.

For concurrency or blocked requests use `windbg-kernel-lock-deadlock-triage` or
`windbg-kernel-irp-lifecycle-triage`. Kernel `~` commands select processors, not the
application thread list; use documented thread/process inspection such as
`!thread` and `!process 0 7`.

## Validation

Record the decoded parameters, recovered context and its limitations, and the
evidence connecting the driver's operation to the violated invariant. Test
competing lifetime, bounds, IRQL, and synchronization explanations. Recommend
an instrumented test/repro only with approval; route Verifier evidence to
`windbg-kernel-verifier-triage`. Do not call a guessed module assignment a proven cause.

## References

- [Bugcheck reference](https://learn.microsoft.com/windows-hardware/drivers/debugger/bug-check-code-reference2)
- [0x3B SYSTEM_SERVICE_EXCEPTION](https://learn.microsoft.com/windows-hardware/drivers/debugger/bug-check-0x3b--system-service-exception)
- [0x7E SYSTEM_THREAD_EXCEPTION_NOT_HANDLED](https://learn.microsoft.com/windows-hardware/drivers/debugger/bug-check-0x7e--system-thread-exception-not-handled)
- [Context record](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-cxr--display-context-record-)
- [Trap frame](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-trap--display-trap-frame-)

## Feedback

Follow `FEEDBACK.md` and submit only reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `windbg-kernel-bugcheck-triage` and the package version from `plugin.json`; no
automatic kernel dump, private-symbol, or source upload.
