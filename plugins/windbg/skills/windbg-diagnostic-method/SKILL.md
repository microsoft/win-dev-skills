---
name: windbg-diagnostic-method
description: Use with every WinDbg plugin investigation to apply evidence-first reasoning, confidence calibration, contrarian review, structured reporting, and deterministic validation. Not a bug-family-specific triage skill.
user-invocable: false
---
# WinDbg Diagnostic Method

Apply this method alongside the bug-family-specific skill selected for an
investigation. Pattern matches route the investigation; they do not prove the
root cause.

## Evidence ladder

Prefer direct evidence in this order:

1. Faulting instruction/context, bugcheck or exception parameters, and resource
   owners/waiters from the actual dump or trace.
2. Matching symbols and the user's authorized source for the involved build.
3. Allocation/free, Verifier, IRP, lock, ETW, WCT, or TTD history captured for
   the same failure.
4. Controlled reproduction and instrumentation.
5. Pattern guidance as a hypothesis only.

Never claim commands, source access, or artifacts that are unavailable in the
session.

## First-pass normalization

- Confirm process dump versus kernel dump and target architecture/build.
- Load public Windows symbols and matching symbols for user/vendor modules.
- Record missing pages, symbols, related-process dumps, trace scope, and tool
  availability.
- User-mode exception: `.exr -1`, `.ecxr`, stack, and registers.
- Kernel bugcheck: `.bugcheck`, `!analyze -v`, then documented context/trap
  recovery for that code.
- Hang: identify the affected operation, wait type, owner/server, and deepest
  supported blocker.
- Memory: distinguish corruption, address-space pressure, and commit/limit
  failures before choosing a fix.

## Five-phase investigation

1. **OBSERVE**: establish dump/trace type, architecture, symbols, code, stack,
   registers, thread/resource state, and missing evidence.
2. **HYPOTHESIZE**: form a specific primary mechanism and at least two plausible
   alternatives when the evidence permits.
3. **TEST**: identify direct debugger, source, trace, or reproduction evidence
   that distinguishes the hypotheses. Absence of evidence is not evidence of
   absence.
4. **EVALUATE**: record supporting, contradictory, and missing evidence.
5. **CONCLUDE or PIVOT**: name the violated invariant and verification plan, or
   remain `candidate-pending-verification`.

## Routing index

| Evidence | Skill |
|---|---|
| Native user-mode exception in an app, service, or UMDF/user-mode driver host | `windbg-user-exception-triage` |
| User-mode heap corruption or allocation/free history | `windbg-user-heap-corruption-investigation` |
| Cross-thread/process, COM/RPC, or service wait | `windbg-user-wait-chain-analysis` |
| User-mode TTD history question | `windbg-user-ttd-reverse-debugging-triage` |
| User-mode VA fragmentation, allocation failure, or commit pressure | `windbg-user-virtual-memory-exhaustion` |
| Thread-affine lock across coroutine suspension | `windbg-user-mutex-held-across-co-await` |
| Kernel bugcheck, trap frame, or saved context | `windbg-kernel-bugcheck-triage` |
| Driver Verifier violation | `windbg-kernel-verifier-triage` |
| Outstanding/power IRP, completion, or cancellation | `windbg-kernel-irp-lifecycle-triage` |
| Kernel lock owner/waiter chain | `windbg-kernel-lock-deadlock-triage` |

These are the complete bug-family routes. Continue evidence-led reasoning for
unsupported families; never dispatch to an absent skill.

## Routing depth

- **Fast (indicative diagnosis confidence >=0.80)**: validate the apparent
  pattern, its required evidence, and plausible alternatives.
- **Validate (0.40-0.79)**: test the leading pattern and at least one plausible
  alternative through the full cycle.
- **Full reasoning (<0.40 or no match)**: reason from observations and preserve
  explicit uncertainty.

Confidence is explanatory judgment, not measured probability.

## Trigger and fix gates

- Verify the trigger in the dump, disassembly, source, trace, or controlled
  reproduction before declaring a final fix.
- Name the violated invariant and the parties or path that violate it.
- Separate the detector or victim from the original writer, freeing actor, or
  resource holder.
- A fix must restore the violated invariant, not merely suppress the reproducer.
- If the trigger is unverified, use `candidate-pending-verification`, set the
  fix to null or a verification plan, and name the evidence/fix matrix needed.
- Do not blame a module solely from a bucket or `MODULE_NAME`.

## Fix-confidence calibration

Diagnosis confidence and fix confidence are separate. Every proposed fix must
declare `fix_confidence` and one `fix_code_path_coverage` value:

| Fix confidence | Required coverage |
|---|---|
| `>=0.90` | `read-this-session`: the actual fix path was read in this investigation. |
| `0.70-0.89` | `read-prior-session` or `symbol-or-disassembly`: direct coverage exists, but the complete source path was not read in this investigation. |
| `0.50-0.69` | `pattern-only`, or incomplete symbol/disassembly evidence. Treat the fix as a candidate. |
| `<0.50` | `not-read`: no direct fix-path coverage. Keep the diagnosis candidate-pending-verification and set the fix to null or a verification plan. |

Lower confidence is always allowed when evidence quality, path coverage, or
alternatives warrant it. Never raise confidence to fit the table.

## Independent review

Before finalizing a full diagnosis:

1. When the host supports the bundled Copilot agents, invoke the `contrarian`
   agent once with the complete proposed diagnosis.
2. When the host cannot run that agent, state that the independent review did
   not run; do not silently substitute inline self-review.
3. If the verdict is `CHALLENGED`, test the counter-hypothesis with direct
   evidence, then downgrade confidence or remain pending verification.
4. Stop after one loopback. A second challenge remains pending verification.

Record `contrarian_loopback` as the Boolean `true` or `false`.

## Report contract

A full report contains these H2 sections in order:

1. Analysis
2. Root Cause
3. Fix
4. Reasoning Chain
5. Alternatives Considered
6. Trigger Verification
7. Mermaid
8. Contrarian Verdict
9. JSON Output Contract Summary

The Trigger Verification section must distinguish observed, contradictory, and
missing evidence plus fix validation. Mermaid must reflect verified evidence.
The JSON summary must include:

- `diagnosis_status`
- `routing_path`
- `root_cause`
- `confidence`
- `fix_confidence`
- `fix_code_path_coverage`
- `contrarian_review`
- `contrarian_loopback`

## Deterministic report validation

After writing the report, run the bundled validator with PowerShell 7:

```powershell
pwsh -NoProfile -File <skill-directory>\scripts\validate-diagnosis-output.ps1 `
  -Path <diagnosis-markdown-path>
```

Use the installed `windbg-diagnostic-method` directory for
`<skill-directory>`. The script checks each section body independently,
requires at least two alternatives, accepts explicit or implicit Mermaid
participants, parses the JSON summary, and exits nonzero on failure.

Correct failed checks and rerun the script before presenting the report as
structurally complete. Structural validation does not replace technical review.

## Safety and privacy

Dumps, traces, ETLs, CABs, source, paths, tokens, and memory contents can be
sensitive. Obtain authorization before capture, configuration changes, or
sharing. Verifier and Page Heap can disrupt workloads and require a recoverable
test plan plus restoration steps. Public feedback follows `FEEDBACK.md` and
defaults to a minimal reviewed summary with no automatic attachments.

## Feedback

For feedback about this method or validator, follow the package `FEEDBACK.md`.
Do not attach private diagnosis files automatically.
