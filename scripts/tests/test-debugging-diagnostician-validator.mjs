import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const validator = path.join(
  repositoryRoot,
  "plugins",
  "debugging-diagnostician",
  "skills",
  "validate-diagnosis-output",
  "scripts",
  "validate-diagnosis-output.ps1",
);
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "diagnosis-validator-"),
);

const validReport = `## Analysis
Observed evidence.

## Root Cause
Candidate cause.

## Fix
Candidate fix.

## Reasoning Chain
OBSERVE: evidence.

## Alternatives Considered
- Alternative one
- Alternative two

## Trigger Verification
| Evidence | Status |
|---|---|
| Trigger | VERIFIED |

## Mermaid
\`\`\`mermaid
sequenceDiagram
A->>B: request
B-->>A: response
\`\`\`

## Contrarian Verdict
ACCEPTED

contrarian_loopback: false

## JSON Output Contract Summary
\`\`\`json
{"diagnosis_status":"final","routing_path":"validate","root_cause":"cause","confidence":0.8,"fix_confidence":0.7,"fix_code_path_coverage":"symbol-or-disassembly","contrarian_review":"ACCEPTED","contrarian_loopback":false}
\`\`\`
`;

const invalidReport = `## Analysis
The words OBSERVE and VERIFIED appear outside their required sections.

## Root Cause
Candidate cause.

## Fix
Candidate fix.

## Reasoning Chain
No phase marker appears here.

## Alternatives Considered
- Only one alternative

## Trigger Verification
No table appears here.

## Mermaid
\`\`\`mermaid
sequenceDiagram
participant A
\`\`\`

## Contrarian Verdict
ACCEPTED

contrarian_loopback: 1

## JSON Output Contract Summary
\`\`\`json
{"diagnosis_status":"final","routing_path":"validate","root_cause":"cause","confidence":0.8,"fix_confidence":0.7,"fix_code_path_coverage":"symbol-or-disassembly","contrarian_review":"ACCEPTED","contrarian_loopback":1}
\`\`\`
`;

function runValidator(file) {
  return spawnSync(
    "pwsh",
    ["-NoProfile", "-File", validator, "-Path", file],
    { encoding: "utf8" },
  );
}

try {
  const validPath = path.join(temporaryDirectory, "valid.md");
  const invalidPath = path.join(temporaryDirectory, "invalid.md");
  fs.writeFileSync(validPath, validReport);
  fs.writeFileSync(invalidPath, invalidReport);

  const validResult = runValidator(validPath);
  assert.equal(validResult.status, 0, validResult.stderr || validResult.stdout);
  const validOutput = JSON.parse(validResult.stdout);
  assert.equal(validOutput.Pass, true);
  assert.equal(validOutput.Checks.MermaidDiagram, true);

  const invalidResult = runValidator(invalidPath);
  assert.equal(invalidResult.status, 1, invalidResult.stderr);
  const invalidOutput = JSON.parse(invalidResult.stdout);
  assert.equal(invalidOutput.Pass, false);
  assert.equal(invalidOutput.Checks.ReasoningChain, false);
  assert.equal(invalidOutput.Checks.Alternatives, false);
  assert.equal(invalidOutput.Checks.TriggerVerification, false);
  assert.equal(invalidOutput.Checks.MermaidDiagram, false);
  assert.equal(invalidOutput.Checks.ContrarianVerdict, false);
  assert.equal(invalidOutput.Checks.JsonSummary, false);

  console.log("Diagnosis validator accepts valid reports and rejects malformed sections.");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
