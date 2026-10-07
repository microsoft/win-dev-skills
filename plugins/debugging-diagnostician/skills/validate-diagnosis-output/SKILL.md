---
name: validate-diagnosis-output
description: Use after a Diagnostician report is written to verify required sections, trigger evidence, Mermaid, contrarian verdict, and JSON summary. Not for judging whether the diagnosis is technically correct.
user-invocable: false
---
# Validate Diagnosis Output

Use this skill after the Diagnostician writes a report to
`<cwd>/.diagnoses/<bug-or-dump-id-slug>/<yyyyMMdd-HHmmss>.md`.

The bundled
[`validate-diagnosis-output.ps1`](scripts/validate-diagnosis-output.ps1)
performs deterministic structural validation. It does not judge whether the
technical diagnosis is correct.

## Run the validator

Run the script with PowerShell 7:

```powershell
pwsh -NoProfile -File <skill-directory>\scripts\validate-diagnosis-output.ps1 `
  -Path <diagnosis-markdown-path>
```

Use the installed skill directory for `<skill-directory>`. The script emits a
JSON result and exits nonzero when any check fails.

## Checks

| Check | Requirement |
|---|---|
| Analysis | An `## Analysis` section exists. |
| Root Cause | An `## Root Cause` section exists. |
| Fix | An `## Fix` section exists. |
| Reasoning Chain | Its section contains at least one phase marker: `OBSERVE`, `HYPOTHESIZE`, `TEST`, `EVALUATE`, or `CONCLUDE`. |
| Alternatives | Its section contains at least two bulleted or numbered alternatives. |
| Trigger Verification | Its section contains a Markdown table and a `VERIFIED`, `UNVERIFIED`, or `verified by` status. |
| Mermaid | A sequence diagram names or implicitly uses at least two actors, or a flowchart has at least two connected nodes. |
| Contrarian Verdict | Its section contains `ACCEPTED` or `CHALLENGED` and a Boolean `contrarian_loopback: true\|false`. |
| JSON summary | A parseable JSON block contains the required output-contract properties and a Boolean `contrarian_loopback`. |

The required JSON properties are:

- `diagnosis_status`
- `routing_path`
- `root_cause`
- `confidence`
- `fix_confidence`
- `fix_code_path_coverage`
- `contrarian_review`
- `contrarian_loopback`

## Completion criteria

When validation fails:

1. Read the `Checks` object in the script output.
2. Correct only the missing or malformed report sections.
3. Re-run the script.
4. Do not present the report as structurally complete until every check passes.

Structural validation does not replace semantic review. The diagnostician must
still invoke the independent `contrarian` agent through the host's agent
mechanism and respond to a challenged verdict.

## Feedback

For feedback about this validator, follow the package `FEEDBACK.md`. Do not
attach private diagnosis files automatically.
