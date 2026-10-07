# Diagnostic Reasoning Instructions

## Five phases

1. **OBSERVE**: establish dump/trace type, architecture, symbols, code, stack,
   registers, thread/resource state, and missing evidence.
2. **HYPOTHESIZE**: form a primary mechanism and at least two plausible
   alternatives when the evidence permits.
3. **TEST**: identify direct debugger/source/repro evidence that distinguishes
   the hypotheses. Absence of evidence is not evidence of absence.
4. **EVALUATE**: record supporting, contradictory, and missing evidence.
5. **CONCLUDE or PIVOT**: name the violated invariant and verification plan, or
   remain candidate-pending-verification.

## Routing index

| Evidence | Skill |
|---|---|
| User-mode exception in an app, service, or UMDF/user-mode driver host | `um-exception-triage` |
| User-mode heap corruption or allocation/free history | `heap-corruption-investigation` |
| Cross-thread/process, COM/RPC, or service wait | `wait-chain-analysis` |
| User-mode TTD history question | `ttd-reverse-debugging-triage` |
| User-mode VA fragmentation, allocation failure, or commit pressure | `virtual-memory-exhaustion` |
| Thread-affine lock across coroutine suspension | `mutex-held-across-co-await` |
| Kernel bugcheck, trap frame, or saved context | `kernel-bugcheck-triage` |
| Driver Verifier violation | `km-verifier-triage` |
| Outstanding/power IRP, completion, or cancellation | `km-irp-lifecycle-triage` |
| Kernel lock owner/waiter chain | `km-lock-deadlock-triage` |
| Structural report validation | `validate-diagnosis-output` |

These are the complete skills. Continue general evidence-led reasoning for
unsupported families; never dispatch to an absent skill.

## Routing paths

- **Fast (indicative confidence ≥0.8)**: validate the pattern and alternatives.
- **Validate (0.4–0.79)**: test the leading pattern plus alternatives.
- **Full reasoning (<0.4/no match)**: reason from observations and preserve
  uncertainty.

Confidence is judgment, not measured probability.

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

## Trigger and fix gates

- Verify the trigger condition in dump, disassembly, source, or controlled repro
  before declaring a final fix.
- A fix must restore the violated invariant, not merely suppress the reproducer.
- Fix confidence of 0.90 or higher requires reading the actual code path in
  this session.
- If the trigger is unverified, use candidate-pending-verification, null fix,
  and name the evidence/fix matrix required.

## Output contract

A full report contains: Analysis, Root Cause, Fix, Reasoning Chain,
Alternatives Considered, Trigger Verification table, Mermaid, Contrarian
Verdict, and JSON Output Contract Summary. Mermaid must reflect verified
evidence and use valid VS Code syntax. Run the independent contrarian once, then
the structural validator. A second challenge ends as pending verification.
