# Debugging Diagnostician

A WinDbg-centric crash, hang, memory, and driver diagnosis playbook for
developers who build software **for Windows**: native applications, services,
third-party user-mode drivers (including UMDF), and kernel-mode drivers.

This public edition combines focused user-mode and kernel-mode debugging skills,
a shared `windbg-diagnostic-method` skill with deterministic report validation,
and a contrarian reviewer. It does not require private Windows source, symbols,
portals, or feedback services. The goal is to shorten the path from a dump,
trace, or stack to a supported root cause and candidate fix without forcing a
pattern match.

## Install

Install from the catalog:

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install windbg@win-dev-skills
```

Claude Code and Codex use their normal marketplace install commands described in
the repository README. Skills work independently on skill-capable hosts. The
optional `diagnostician` agent is provided for GitHub Copilot only; it is not
required to use the skills on other hosts.

### Claude Code with the WinDbg MCP server

For Claude Code to use the WinDbg MCP server without its debugger operations
being blocked, open **WinDbg > Settings > MCP** and clear both of these options:

- **Enable Cross Prompt Injection Mitigation**
- **Enable Secure Mode for MCP Server**

If secure mode was already activated, restart WinDbg after clearing it. WinDbg
keeps secure mode active until restart.

> [!WARNING]
> These settings are security protections. Disable them only for a trusted
> debugging session with dumps, command output, source, and prompts you are
> authorized to expose to Claude Code. Re-enable the protections when the
> unrestricted MCP operations are no longer required.

The plugin does not bundle an MCP server; this configuration applies to the
separately installed WinDbg MCP integration.

For a pre-merge local review, use your host's supported local plugin loading
mechanism on this directory. Do not assume the catalog commands can fetch an
unmerged contribution.

## Quick Start

Invoke the optional Copilot agent with a dump, stack, trace, or failure summary:

```text
Use the diagnostician agent to analyze this crash stack, bugcheck, hang
symptom, or debugger output: <paste the evidence here>
```

You can also invoke a skill directly on a skill-capable host:

```text
Use windbg-user-heap-corruption-investigation on the dump open in WinDbg.
Establish what evidence is available, distinguish competing explanations, and
state what remains unproven.
```

The plugin supplies diagnostic guidance, not a debugger connection. Use an
existing, approved WinDbg integration if available, or inspect the suggested
commands yourself and provide their output. The assistant must never claim to
have executed commands or accessed source/dumps that it cannot actually use.

## Short prompt — root cause a dump in the debugger

Use this when an authorized debugger integration is connected to a dump and you
want the diagnostician to drive the investigation:

```text
Root cause the dump in the debugger. Let the diagnostician orchestrate the
debugging session, use the available source tools for my own code, and follow
the standard five-phase protocol. Treat pattern matches as hypotheses, test
alternatives, and state missing evidence.
```

This prompt does three things:

1. Names the diagnostician as the investigation orchestrator while preserving
   user approval for state-changing operations.
2. Grounds source lookups in tools and repositories the user is authorized to
   access, rather than assuming private operating-system source.
3. Invokes the full observe-hypothesize-test-evaluate-conclude/pivot protocol.

## Full investigation prompt

Use this prompt when you want a durable diagnosis with explicit structure:

````text
Use the diagnostician agent to run the full investigation workflow on the dump,
trace, stack, or debugger session in this conversation.

1. Apply the five-phase diagnostic method. Treat matching skills as hypothesis
   generators, not proof.
2. If filesystem access is available, write the complete diagnosis to
   ./.diagnoses/<short-id>/<yyyyMMdd-HHmmss>.md. Otherwise return the same
   structure in the response and state that no file was written.
3. Include these H2 sections in order:
   Analysis, Root Cause, Fix, Reasoning Chain, Alternatives Considered,
   Trigger Verification, Mermaid, Contrarian Verdict, and JSON Output Contract Summary.
4. Trigger Verification must be a table separating observed evidence,
   contradictory evidence, missing evidence, and the validation needed for the
   proposed fix.
5. Mermaid must be a VS Code-renderable sequenceDiagram with at least two
   participants when a sequence/ownership flow is relevant. If a sequence
   diagram would misrepresent the failure, explain why and use the closest
   evidence-preserving Mermaid diagram.
6. Do not finalize a root cause while a plausible alternative remains untested.
   If evidence is insufficient, use diagnosis_status
   "candidate-pending-verification" and name the next evidence required.
````

The package includes a public contrarian sub-agent and the shared
`windbg-diagnostic-method` skill. The full prompt invokes both gates; when a
host cannot run a separate sub-agent, the agent must state that limitation
rather than substitute inline self-review.

## How It Works

Every diagnosis follows a five-phase **hypothesis-test-pivot** cycle:

1. **OBSERVE** — Parse dump/trace type, architecture, stack, code, registers,
   resource state, and evidence limitations.
2. **HYPOTHESIZE** — Form a specific, testable primary theory and plausible
   alternatives.
3. **TEST** — Identify and collect evidence that would confirm or deny each
   hypothesis.
4. **EVALUATE** — Separate what is supported, contradicted, inferred, or still
   missing.
5. **CONCLUDE or PIVOT** — State the supported cause and verification plan, or
   revise the hypothesis when evidence does not support it.

The agent may choose one of three reasoning paths:

| Path | Indicative confidence | Behavior |
|---|---:|---|
| **Fast** | ≥80% | A strong known pattern is treated as a hypothesis, required evidence is verified, and alternatives are checked before conclusion. |
| **Validate** | 40–79% | The leading pattern and at least one plausible alternative go through the full cycle. |
| **Full-reasoning** | <40% or no match | Start from observations, construct alternatives, and preserve explicit uncertainty. |

Confidence is an explanation aid, not measured probability. A high initial
match does not bypass evidence or permit blaming a module solely because it
appears on the stack.

## Invocation Modes

### Mode 1: Interactive Debugging

Use the diagnostician agent with a dump, trace, stack, or live debugger context.
The agent drives the five-phase investigation and produces a structured
diagnosis.
State-changing actions—enabling Verifier/Page Heap, changing configuration,
capturing traces, or forcing a crash—require explicit user authorization.

### Mode 2: Triage Enrichment

Provide failure metadata, stack text, or a partial investigation without a live
debugger. The diagnostician identifies likely skill routes, missing evidence,
and concrete next commands. It must not imply that proposed commands were
executed or that a routing match proves the root cause.

### Mode 3: Public Feedback

When the user asks to submit WinDbg or debugging-skill feedback, follow
`FEEDBACK.md`. Draft a minimal sanitized public issue for
[microsoft/WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues),
show the exact title/body and public destination, and obtain explicit approval
before posting with a supported GitHub issue tool. Without such a tool, provide
the approved text and new-issue page for manual submission.

This public mode does not collect an eval corpus and never automatically uploads
dumps, TTD recordings, ETLs, CABs, private source, or full transcripts.

## Input

The agent accepts natural language. A structured handoff can use this shape:

```json
{
  "case_id": "optional public or local identifier",
  "bug_type": "crash|hang|leak|bugcheck|unknown",
  "stack_frames": ["frame1", "frame2"],
  "error_code": "0xC0000005",
  "exception_type": "ACCESS_VIOLATION",
  "target": "application|service|user-mode-driver|kernel-mode-driver",
  "additional_context": "authorized, sanitized context and evidence limits"
}
```

Do not put secrets, customer data, private paths, or memory contents into a
public feedback issue. Diagnostic input can remain local to the approved session.

## Output

```json
{
  "diagnosis_status": "final|candidate-pending-verification",
  "routing_path": "fast|validate|full-reasoning",
  "analysis": {
    "summary": "what the evidence shows",
    "evidence": ["direct evidence with command/source"],
    "reasoning": ["why evidence supports or contradicts each hypothesis"],
    "uncertainty": ["what remains unproven"]
  },
  "reasoning_chain": [
    "OBSERVE: ...",
    "HYPOTHESIZE: ...",
    "TEST: ...",
    "EVALUATE: ...",
    "CONCLUDE or PIVOT: ..."
  ],
  "root_cause": "supported cause, or null while pending verification",
  "fix": "candidate change and verification plan, or null",
  "confidence": 0.82,
  "fix_confidence": 0.68,
  "fix_code_path_coverage": "read-this-session|read-prior-session|symbol-or-disassembly|pattern-only|not-read",
  "matched_skill": "a skill name, or null",
  "alternatives_considered": ["alternative and evidence"],
  "trigger_verification": "verified|partially-verified|not-verified",
  "contrarian_review": "ACCEPTED|CHALLENGED with notes",
  "contrarian_loopback": false
}
```

## Knowledge Base

### Debugging Skills (`skills/`)

The authoritative skill inventory is `skills.json`.

#### User-mode: applications, services, and user-mode drivers (including UMDF)

| Skill | Use it for |
|---|---|
| `windbg-user-exception-triage` | Establish exception context and classify native process crashes, including user-mode driver host failures. |
| `windbg-user-heap-corruption-investigation` | Investigate use-after-free, double-free, and overruns in applications, services, or user-mode driver hosts. |
| `windbg-user-wait-chain-analysis` | Follow application, service, user-mode driver, COM/RPC, and process waits to a supported blocker or cycle. |
| `windbg-user-ttd-reverse-debugging-triage` | Find earlier writes, frees, and calls in a recorded user-mode process, including a user-mode driver host. |
| `windbg-user-virtual-memory-exhaustion` | Separate address-space pressure, fragmentation, commit pressure, and applicable limits. |
| `windbg-user-mutex-held-across-co-await` | Investigate thread-affine locks held across coroutine suspension in user-mode components. |

#### Kernel-mode: external kernel-mode driver developers

| Skill | Use it for |
|---|---|
| `windbg-kernel-bugcheck-triage` | Decode bugchecks and recover original exception or trap context. |
| `windbg-kernel-verifier-triage` | Interpret Driver Verifier violations and available I/O verification evidence. |
| `windbg-kernel-irp-lifecycle-triage` | Investigate outstanding I/O, completion/cancel ownership, and power IRPs. |
| `windbg-kernel-lock-deadlock-triage` | Build supported kernel owner/waiter graphs and investigate lock-order inversions. |

Trap-frame and exception-context recovery are included in
`windbg-kernel-bugcheck-triage`, not additional skills. Feedback guidance and
the optional agent are support content rather than bug-family skills.

No specialized C++ thrown-object or XAML stowed-exception decoder is included. `windbg-user-exception-triage` documents the boundary and continues evidence-led reasoning instead of dispatching to absent skills. This is native debugging guidance, not a managed .NET diagnostics package.

### Eight Hypothesis Templates

These are starting hypotheses, never automatic diagnoses:

| Template | Signal | Required discipline |
|---|---|---|
| Race Condition | Race, TOCTOU, concurrent access | Identify shared state, competing paths, ordering, and a reproducible interleaving. |
| Lock Ordering | Deadlock, inversion, ABBA | Establish every owner/waiter edge and the conflicting acquisition order. |
| RPC Under Lock | Cross-process call while holding a lock | Prove the held resource and callback/server dependency; a synchronous COM call alone is not a deadlock. |
| Timer/Callback Race | Callback during teardown | Prove registration, cancellation/rundown, object lifetime, and which path can still execute. |
| Cross-Apartment Dependency | Wrong-thread/apartment failure or STA hang | Establish apartment contracts, marshaling, pumping/reentrancy, and object agility. |
| Reentrant Lock Acquisition | Re-entry while state/lock is held | Identify the reentrant edge and whether the primitive or invariant permits it. |
| Regression | Failure after a version/build change | Compare evidence and code/config changes; correlation with a build is not causation. |
| Platform/Instruction | Architecture, alignment, or illegal instruction | Verify target architecture, decoded bytes, CPU/ABI requirement, and binary identity. |

### Shared method skill

| Skill | Purpose |
|---|---|
| `windbg-diagnostic-method` | Applies the shared evidence, reasoning, confidence, review, reporting, and deterministic validation method. |

## File Inventory

| File | Purpose |
|---|---|
| `plugin.json` | Portable Agent Plugins manifest for Copilot and Codex. |
| `.claude-plugin/plugin.json` | Claude Code plugin manifest with matching name/version. |
| `com.github.copilot/agents/diagnostician.agent.md` | Main Copilot diagnostician agent. |
| `com.github.copilot/agents/contrarian.agent.md` | Independent adversarial review agent. |
| `skills/<skill-name>/SKILL.md` | Bug-family skills and the shared diagnostic method. |
| `skills.json` | Exact public skill inventory and user-mode/kernel-mode grouping. |
| `FEEDBACK.md` | Public, reviewed WinDbg-Feedback issue procedure and issue template. |
| `CHANGELOG.md` | Public package changes. |
| `README.md` | Package usage, methodology, scope, and support contract. |

There is no bundled MCP server, uploader, credential store, notification
service, or feedback automation. The shared method is explicitly inventoried
and is not a bug-family-specific skill.

### Authoring and calibration material not bundled

The runtime package contains only the files listed above. Case data, test
artifacts, evaluation datasets, source links, and authoring records are not
distributed with the plugin. The published skills retain actionable workflows
and public references.

## Requirements and Limits

- WinDbg and an appropriate process, user-mode driver host, or kernel dump (or
  an authorized live debugging session).
- Public Windows symbols and matching binaries/PDBs for your own modules.
  Missing dump pages or symbols limit conclusions and must be reported.
- TTD requires an actual authorized user-mode recording; it cannot replay
  kernel execution or reconstruct history from an ordinary dump.
- Application Verifier/Page Heap and Driver Verifier are optional repro tools.
  Use them on suitable test systems; their overhead or deliberate failures can
  disrupt workloads. Record settings and restore them after the investigation.
- Commands and data-model features vary across WinDbg/extension versions. Check
  installed help and public documentation rather than inventing unsupported
  syntax or private structure layouts.

## Constraints

- **Diagnosis is read-only by default:** Produce a diagnosis; do not modify code,
  bug state, machine settings, or uploaded artifacts unless the user explicitly
  authorizes that action.
- **Feedback submission is explicit and public:** Show the exact sanitized
  issue payload and destination before posting. No submission occurs on decline,
  cancellation, missing tooling, or authentication failure.
- **Reasoning-first:** Investigate and test; do not conclude from keyword or
  stack-pattern matching alone.
- **Conservative:** Unknown or candidate-pending-verification is valid. State
  missing pages, symbols, histories, or cross-process evidence.
- **Evidence provenance:** Cite debugger output, the user's authorized source,
  a controlled reproduction, or public documentation. Do not require private
  Windows source or portals.
- **Windows-scoped:** Native Windows application/service debugging, user-mode
  drivers including UMDF, and kernel-mode drivers.

## Contact, Support, and Feedback

| | |
|---|---|
| **Issue and feedback tracking** | [microsoft/WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues) |
| **Public feedback procedure** | [`FEEDBACK.md`](FEEDBACK.md) |
| **General debugging support guidance** | [WinDbg-Feedback SUPPORT.md](https://github.com/microsoft/WinDbg-Feedback/blob/master/SUPPORT.md) |
| **Sensitive security reports** | Follow the repository SECURITY policy; do not post vulnerabilities publicly. |

The package uses the public WinDbg-Feedback repository rather than personal
contacts or non-public destinations. WinDbg-Feedback is for feedback, not a
guarantee of individual application-debugging support. Publication reviewers
should confirm ongoing skill-feedback triage with that repository's maintainers.

Never automatically upload dumps, TTD traces, ETLs, CABs, private source, or
full diagnostic transcripts. Review and approve a minimal sanitized issue
before posting.

## Versioning and Contribution

The public inventory is `skills.json`. Change the package version in both plugin
manifests and all three catalog entries when publishing changed content. Update
the plugin CHANGELOG and keep exactly the intended skill inventory.

Do not mark an update as shipped until its public contribution or release is
confirmed. Future changes must be reviewed in this repository and preserve
independent improvements made to the published plugin.
