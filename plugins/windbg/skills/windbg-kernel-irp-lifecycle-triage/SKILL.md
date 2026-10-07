---
name: windbg-kernel-irp-lifecycle-triage
description: 'Use when kernel evidence shows stalled I/O, a power IRP, or completion/cancellation misuse; inspect request state and driver ownership. Not for interpreting an empty IRP search in a limited dump as proof of healthy I/O.'
---

# IRP Lifecycle Triage

**Load `windbg-diagnostic-method` first** if it is not already loaded in this
conversation, and apply it throughout for evidence ranking, hypothesis testing,
confidence calibration, independent review, and report validation. This skill
adds the bug-family-specific commands and evidence requirements.

## Scope

Investigate I/O Request Packets in a kernel dump or authorized live kernel
session. Examples include `0x9F` power failures and hangs where progress
depends on a driver request. Apply the parameter table for the specific
bugcheck subtype rather than assuming every `0x9F` identifies the same object.

For `0x9F` with P1 equal to `3`, P4 is the blocked IRP. Inspect that directly
before running a system-wide search.

## Workflow

### 1. Decode the known request

```text
!analyze -v
!irp <irp-address>
```

When no request address is known and the dump has the required pool data:

```text
!irpfind
```

`!irpfind` can be expensive in a live session and incomplete in a limited dump.
Use supported filters where appropriate. No result does not prove there are
no outstanding requests.

### 2. Follow the stack and ownership

Record the major/minor operation, current stack location, device/driver stack,
completion routine, pending flags, cancellation state, and any relevant thread.
Use the available device stack and driver source to establish which component
is expected to advance or complete the request.

Do not identify an offending driver solely by the last name printed in the IRP
stack. A completion routine, downstream dependency, or framework-owned request
may change the responsible path.

### 3. Correlate dependencies

| Evidence | Next investigation |
|---|---|
| I/O verifier violation or available shadow history | `windbg-kernel-verifier-triage` |
| Owner/waiter kernel lock chain | `windbg-kernel-lock-deadlock-triage` |
| Exception or trap during request handling | `windbg-kernel-bugcheck-triage` |

Preserve evidence between skills; avoid repeatedly handing the same unchanged
IRP back and forth.

### 4. Test the request protocol

- **Power request:** inspect the subtype's objects and power/PnP state,
  current stack location, and completion dependency.
- **Cancellation race:** establish which routine owns completion, how
  cancellation synchronizes with normal completion, and whether the request
  can be completed twice or retained after cancellation.
- **Double completion:** trace competing terminal paths; a single live IRP
  snapshot may not contain enough history.
- **Pending request:** verify API/framework-specific pending and completion
  rules, remove/shutdown paths, and who promises eventual progress.

WDM and WDF have different ownership APIs. Do not transplant a raw WDM
completion/cancel pattern into a framework-owned request without checking its
contract. This skill establishes evidence; it is not a complete I/O protocol
reference or a decoder for every power subtype.

## Validation

Name the operation, current owner/dependency, and supported protocol violation
or stalled path. Test normal completion, concurrent cancellation, removal,
power transitions, and shutdown where relevant. If history is missing, propose
an approved instrumented test using the verifier skill rather than inventing
which driver lost the completion.

## References

- [IRP inspection](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-irp)
- [IRP search](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-irpfind)
- [0x9F power-state failure](https://learn.microsoft.com/windows-hardware/drivers/debugger/bug-check-0x9f--driver-power-state-failure)
- [Canceling IRPs](https://learn.microsoft.com/windows-hardware/drivers/kernel/canceling-irps)

## Feedback

Follow `FEEDBACK.md` and report only reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `windbg-kernel-irp-lifecycle-triage` and the package version from `plugin.json`; no
automatic kernel dump or request-content upload.
