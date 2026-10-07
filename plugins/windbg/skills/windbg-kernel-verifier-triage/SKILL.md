---
name: windbg-kernel-verifier-triage
description: 'Use when a kernel dump contains Driver Verifier violations; inspect flags, bugcheck subcodes, and available I/O shadow state. Not for Application Verifier user-mode stops or inferring a violation from enabled flags alone.'
---

# Driver Verifier Triage

Apply `windbg-diagnostic-method` throughout this investigation for evidence
ranking, hypothesis testing, confidence calibration, independent review, and
report validation.

## Scope

Driver Verifier checks kernel driver contracts. Application Verifier is a
different user-mode facility; use `windbg-user-heap-corruption-investigation` for its heap
stops. Enabled Driver Verifier flags alone do not prove a contract violation.

Use this skill when a verifier-class bugcheck or analysis identifies an actual
violation. Examples include `0xC4`, `0xC9`, and `0xE6`; inspect the exact code
and parameters rather than treating every stop as the same family.

## Workflow

### 1. Preserve code, subcode, and active configuration

```text
!analyze -v
.bugcheck
!verifier
k
```

Record the bugcheck, subtype/subcode, offending operation and driver when
reported, enabled checks, target build, and evidence availability. Decode each
subcode against its documented contract. Existing output may be incomplete in
a small dump; do not discard captured evidence merely because live
configuration is now different.

### 2. Decode available I/O history

When the violation supplies an appropriate IRP address and I/O verification
state is available:

```text
!iovirp <irp-address>
!irp <irp-address>
```

Shadow state may preserve information lost from the live request. Correlate it
with the decoded contract and use `windbg-kernel-irp-lifecycle-triage` for completion,
cancellation, pending state, and ownership.

### 3. Recover context or follow dependencies

- Saved exception/trap context: `windbg-kernel-bugcheck-triage`.
- Lock-order evidence: `windbg-kernel-lock-deadlock-triage`.
- Outstanding or power request: `windbg-kernel-irp-lifecycle-triage`.

Avoid cyclic dispatch. Carry the evidence already collected to the next skill;
re-enter only when a distinct evidence requirement exists.

### 4. Investigate uncovered violations

For a generic DDI violation, identify the exact precondition (IRQL, lifetime,
parameters, or ownership) and the driver call that broke it. For a DMA violation,
inspect supported adapter/map/unmap and buffer-lifetime evidence for that
subcode. This package does not provide a specialized decoder for every DDI or
DMA case; state the gap and continue from documentation and driver source.

## Controlled repro

Do not enable Driver Verifier without approval. It can deliberately crash the
system and expose boot-critical defects. Use a recoverable test machine, save
the current configuration, select relevant vendor drivers/checks, and agree on
rollback before restarting. Do not verify every installed driver by default.

Read-only configuration inspection on a test machine:

```text
verifier /querysettings
```

`verifier /reset` clears settings and normally requires a restart to stop
verification; it is a configuration change, not a harmless query. Restore
previous intentional settings rather than unconditionally clearing them.

## Validation

Name the exact violated contract, link the recorded operation to driver source,
and test that the remedy satisfies it under the same checks and workload.
Record dump/verification limitations and unverified assumptions. Passing a
single repro is not proof that every driver path is safe.

## References

- [Driver Verifier](https://learn.microsoft.com/windows-hardware/drivers/devtest/driver-verifier)
- [Verifier extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-verifier)
- [I/O verifier IRP extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-iovirp)
- [0xC4 verifier violation](https://learn.microsoft.com/windows-hardware/drivers/debugger/bug-check-0xc4--driver-verifier-detected-violation)

## Feedback

Follow `FEEDBACK.md` and submit reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `windbg-kernel-verifier-triage` and the package version from `plugin.json`; do not
automatically upload dumps or proprietary driver source.
