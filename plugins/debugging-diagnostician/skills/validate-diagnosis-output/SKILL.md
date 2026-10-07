---
name: validate-diagnosis-output
description: Use after a Diagnostician report is written to verify required sections, trigger evidence, Mermaid, contrarian verdict, and JSON summary. Not for judging whether the diagnosis is technically correct.
version: 1.0.0
user-invocable: false
---
# Validate Diagnosis Output

Deterministic, no-LLM structural validator that the **Debugging Diagnostician
agent** runs against the markdown report it just wrote, before calling
`final completion`. It enforces the agent's stated Output Contract in
`diagnostician.agent.md` so direct-invocation deliverables can't silently ship
without the required artifacts.

## When to Use

- Called by the Diagnostician agent **after** writing the diagnosis markdown
  to `<cwd>/.diagnoses/<bug-or-dump-id-slug>/<yyyyMMdd-HHmmss>.md`.
- Called **before** rendering the Pre-Completion Checklist and `final completion`.
- May be invoked by a user explicitly to re-validate an existing diagnosis md
  ("re-run validate-diagnosis-output against <path>").

## What It Checks

The validator is a structural / regex scan — no semantic judgment. Each check is
binary pass/fail. The full list:

| # | Check | Pass when |
|---|---|---|
| 1 | **Analysis** section | The markdown contains a heading matching `^##\s+Analysis\b` |
| 2 | **Root Cause** section | Heading matches `^##\s+Root Cause\b` |
| 3 | **Fix** section | Heading matches `^##\s+Fix\b` *(may be a routing recommendation when status is `candidate-pending-verification`)* |
| 4 | **Reasoning Chain** | Heading matches `^##\s+Reasoning Chain\b` AND contains at least one of `OBSERVE`, `HYPOTHESIZE`, `TEST`, `EVALUATE`, `CONCLUDE` |
| 5 | **Alternatives Considered** | Heading matches `^##\s+Alternatives\b` AND the section body contains ≥2 list items (bulleted or numbered) |
| 6 | **Trigger Verification** | Heading matches `^##\s+Trigger Verification\b` AND a markdown table follows with at least one row whose cells include either `VERIFIED`, `UNVERIFIED`, or `verified by` |
| 7 | **Mermaid sequence diagram** | Body contains a fenced block opened by ` ```mermaid` AND closed by ` ``` `, AND the block's content contains either `sequenceDiagram` or `flowchart` AND ≥2 `participant ` or node declarations |
| 8 | **Contrarian Verdict** | Heading matches `^##\s+Contrarian Verdict\b` AND the body contains `ACCEPTED` or `CHALLENGED` AND a `contrarian_loopback: (true|false)` or `**contrarian_loopback**` reference |
| 9 | **JSON Output Contract Summary** | A fenced ` ```json` block exists containing the keys `diagnosis_status`, `routing_path`, `root_cause`, `confidence`, `fix_confidence`, `fix_code_path_coverage`, `contrarian_review`, and `contrarian_loopback` |

A single check failing means the diagnosis is **incomplete**; the agent must
loop back and fix it before completing.

## Anti-Patterns the Validator Catches

These are the exact failure modes observed in real CLI sessions that motivated
this skill:

- ❌ Producing a long chat-only diagnosis with no markdown file written to
  `.diagnoses/` (Output Contract violation).
- ❌ Skipping the mermaid block ("the analysis is mostly textual, the diagram
  felt redundant"). The agent.md says it is mandatory; the validator refuses
  to pass without it.
- ❌ Putting devil's-advocate prose inline and calling it "contrarian review"
  without actually invoking the contrarian sub-agent via the task tool.
  Validator only checks structure (verdict line exists), but the agent
  constraint that the contrarian be a real sub-agent run still applies.
- ❌ Dropping the `contrarian_loopback` line when the contrarian returned
  `CHALLENGED`. This is a workflow violation per `diagnostician.agent.md`.
- ❌ "Diagnosis status: final" with `Trigger Verification: UNVERIFIED` —
  inconsistent state. Validator surfaces both rows; agent must reconcile.

## Reference Implementation (PowerShell, embedded)

The skill is implementation-light by design — the agent itself runs the check
inline. This snippet is the canonical reference; agents may reproduce its
logic in whatever way matches their runtime.

```powershell
param([Parameter(Mandatory=$true)][string]$Path)
if (-not (Test-Path $Path)) { throw "diagnosis file not found: $Path" }
$content = Get-Content -Raw -Path $Path
$lines   = Get-Content -Path $Path

function HasHeading($pattern) { ($lines | Select-String -Pattern $pattern).Count -gt 0 }
function MermaidBlock {
  $start = [regex]::Match($content, '(?m)^```mermaid\s*$')
  if (-not $start.Success) { return $null }
  $rest  = $content.Substring($start.Index + $start.Length)
  $end   = [regex]::Match($rest, '(?m)^```\s*$')
  if (-not $end.Success) { return $null }
  return $rest.Substring(0, $end.Index)
}

$results = [ordered]@{}
$results.AnalysisHeading       = HasHeading '^##\s+Analysis\b'
$results.RootCauseHeading      = HasHeading '^##\s+Root Cause\b'
$results.FixHeading            = HasHeading '^##\s+Fix\b'
$results.ReasoningChainHeading = HasHeading '^##\s+Reasoning Chain\b' -and ($content -match 'OBSERVE|HYPOTHESIZE|TEST|EVALUATE|CONCLUDE')
$results.AlternativesHeading   = HasHeading '^##\s+Alternatives\b'
$results.TriggerVerification   = HasHeading '^##\s+Trigger Verification\b' -and ($content -match 'VERIFIED|UNVERIFIED|verified by')

$mermaid = MermaidBlock
$results.MermaidDiagram = $null -ne $mermaid -and (
  ($mermaid -match 'sequenceDiagram' -or $mermaid -match 'flowchart') -and
  ([regex]::Matches($mermaid, '(?m)^\s*(participant\s|[A-Za-z0-9_]+\s*-->)').Count -ge 2)
)

$results.ContrarianVerdict = HasHeading '^##\s+Contrarian Verdict\b' -and
  ($content -match 'ACCEPTED|CHALLENGED') -and
  ($content -match 'contrarian_loopback')

$jsonBlocks = [regex]::Matches($content, '(?s)```json\s*(.*?)```')
$results.JsonSummary = $false
foreach ($m in $jsonBlocks) {
  $body = $m.Groups[1].Value
  if ($body -match '"diagnosis_status"' -and
      $body -match '"routing_path"' -and
      $body -match '"root_cause"' -and
      $body -match '"confidence"' -and
      $body -match '"fix_confidence"' -and
      $body -match '"fix_code_path_coverage"' -and
      $body -match '"contrarian_review"' -and
      $body -match '"contrarian_loopback"') {
    $results.JsonSummary = $true; break
  }
}

$pass = -not ($results.Values | Where-Object { $_ -eq $false })
[pscustomobject]@{ Pass = $pass; File = $Path; Checks = $results }
```

## Output Format

The validator returns a small object (or its markdown equivalent):

```json
{
  "pass": false,
  "file": "C:\\p\\repo\\.diagnoses\\sample-crash-12345\\20260512-145200.md",
  "checks": {
    "AnalysisHeading":       true,
    "RootCauseHeading":      true,
    "FixHeading":            true,
    "ReasoningChainHeading": true,
    "AlternativesHeading":   true,
    "TriggerVerification":   true,
    "MermaidDiagram":        false,
    "ContrarianVerdict":     true,
    "JsonSummary":           true
  }
}
```

The agent maps each check to a row of the Pre-Completion Checklist:

| Check (JSON key) | Checklist row |
|---|---|
| `AnalysisHeading` | Analysis section |
| `RootCauseHeading` | Root Cause section |
| `FixHeading` | Fix section |
| `ReasoningChainHeading` | Reasoning Chain |
| `AlternativesHeading` | Alternatives Considered (≥2) |
| `TriggerVerification` | Trigger Verification table |
| `MermaidDiagram` | Mermaid sequence diagram |
| `ContrarianVerdict` | Contrarian Verdict |
| `JsonSummary` | JSON Output Contract Summary |

## Completion Criteria

A diagnosis is "structurally complete" when all 9 checks pass. The agent MUST
NOT call `final completion` while any check is failing; instead it must produce
the missing content, re-run the validator, and re-render the checklist.

This skill does NOT replace the semantic constraints in `diagnostician.agent.md`
(e.g. "the contrarian sub-agent must be a real task-tool invocation, not
inline prose"). It enforces the **structural** floor; semantic correctness
remains the agent's responsibility.

## Feedback

For feedback about this validator, follow the package `FEEDBACK.md`. Do not attach private diagnosis files automatically.
