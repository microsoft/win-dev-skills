# Semantic migration protocol

Use this protocol for migration work that is not completely determined by `winapp migrate`. It is deliberately open-ended: documented mappings and platform patterns can accelerate analysis, but absence of a known pattern never proves that a feature is unsupported or that migration is complete.

## 1. Define observable contracts

Build one contract graph from the exact entry project and its project-reference closure. For each feature path, record:

- its entry action and required preconditions;
- source-visible state, side effects, events, errors, and navigation outcomes;
- the source files and dependency members that produce those outcomes;
- platform-sensitive assumptions such as thread affinity, lifetime, activation, window ownership, selection, resource lookup, or collection change notification;
- the state-plan IDs that can verify the outcome.

Describe what the source guarantees, not merely which source types it uses. A namespace match, similar control, successful package restore, or compiling call site is evidence about shape only; none establishes behavioral compatibility.

## 2. Keep a durable finding ledger

Persist semantic work in `<target>/.migration-evidence/semantic-findings.json`. Do not commit it unless the user requests migration evidence. Use schema version `1.0`:

```json
{
  "schemaVersion": "1.0",
  "findings": [
    {
      "id": "SEM001",
      "category": "dependency-contract",
      "featurePaths": ["feature-or-flow"],
      "stateIds": ["stable-state-id"],
      "todoIds": ["UWMIG000"],
      "sourceInvariant": "observable behavior that must survive",
      "evidence": ["source-or-target location, diagnostic, or evidence path"],
      "status": "open",
      "resolutionStrategy": null,
      "appOwnedLocations": ["relative/path.cs:line"],
      "nextActions": ["specific investigation or implementation action"],
      "completionCondition": "observable condition that closes this finding",
      "validationEvidence": []
    }
  ]
}
```

Use stable IDs. Update an existing finding when new evidence has the same root cause; do not create one finding per compiler diagnostic or call site.

Allowed statuses are:

- `open`: actionable investigation or implementation remains;
- `resolved`: the completion condition is met and validation evidence is recorded;
- `blocked`: a named external prerequisite prevents progress;
- `unverified`: bounded investigation completed but source semantics or comparison evidence remains unavailable;
- `failed`: the latest target probe exposed an unresolved regression.

An app-owned exception, missing implementation, incompatible contract, or substantial port is not `blocked`. While any finding contains an actionable app-owned location or next action, it cannot be left `blocked` or treated as complete.

## 3. Classify by responsibility

Classify each finding before editing:

| Category | Owner and response |
|---|---|
| Mechanical transform or project-item residual | Run or fix the CLI-owned verification path; do not duplicate it semantically. |
| Dependency contract | Compare the consumed source contract and use the dependency-contract protocol. |
| Compile-time semantic gap | Trace the diagnostic to the source invariant and correct the shared cause. |
| Runtime, lifecycle, or UI-state gap | Capture one stable signature and the first app-owned path, then correct and replay it. |
| External prerequisite | Record the exact unavailable prerequisite and affected states as `blocked`. |

Categories organize evidence; they are not an exhaustive taxonomy. If a finding fits none of them, retain it as `semantic-other`, define its source invariant and completion condition, and proceed through the same resolution loop.

## 4. Choose a resolution from evidence

For each finding, choose the least invasive strategy that preserves the source invariant:

1. direct API or project transformation;
2. target-compatible dependency with a compatible consumed contract;
3. target-owned adapter around a different target contract;
4. maintainable source port;
5. target-owned equivalent implementation;
6. documented visible fallback only when authoritative evidence establishes that no desktop equivalent exists.

Record why the strategy satisfies the contract. Do not remove a feature, swallow an error, fabricate success, or replace behavior with a placeholder to obtain a clean build.

Compatibility code belongs at the narrowest target-owned solution boundary shared by its consumers. Keep app-specific adapters and ports in the migrated solution, not in the CLI or this skill. Generalize a migration fact into tooling or documentation only when its detection or resolution is deterministic across projects.

## 5. Execute the closure loop

For every open or failed finding:

1. **Observe:** retain the complete diagnostic, runtime signature, or state delta and its affected feature.
2. **Localize:** trace from the observable failure to app-owned callers, shared state, dependency members, and lifecycle boundaries. Do not stop at the first framework frame.
3. **Hypothesize:** state one root cause that the next static check, build, or replay can disprove.
4. **Correct:** fix the shared cause and every location governed by it; avoid call-site patches that leave the contract broken elsewhere.
5. **Verify:** use the cheapest evidence that reaches the completion condition, then replay every affected state when the condition is behavioral.
6. **Update:** resolve the finding only with validation evidence. If the signature changes, create or reclassify the finding for the new root cause rather than continuing the old hypothesis.

Respect the bounded build and runtime probe limits in the main workflow and behavioral-validation protocol. Bounded probing limits speculation; it does not convert an actionable defect into `blocked`, `unverified`, or resolved. Persist the truthful failure and next action when the workflow must stop.

## 6. Prove semantic adapters and replacements

For every adapter, port, or equivalent implementation, inspect all consumed members and verify:

- values and mutations cross the boundary in both required directions;
- events, callbacks, and collection notifications occur with compatible timing;
- dependency properties, bindings, selection, focus, and commands remain observable where consumed;
- asynchronous methods represent completed work and propagate failures;
- lifetime, thread, window, and disposal behavior match the source assumptions;
- unsupported members fail explicitly and leave the related finding open.

A type-shaped shim is not a semantic adapter. Returning `null`, default values, empty collections, or completed tasks; accepting registrations without retaining or invoking them; or exposing properties without connecting them to target behavior is invalid unless the source contract proves that member is intentionally inert. Build success from such a shim does not close the finding.

## 7. Apply the completion gate

Semantic migration is complete only when:

- every source feature contract is represented by target implementation;
- every finding is `resolved`, `blocked` by a genuine external prerequisite, or truthfully `unverified` after its bounded evidence path;
- no finding has an actionable app-owned location or next action;
- the analyzer-enabled build succeeds;
- all runnable target states pass and their comparisons have truthful classifications;
- fallbacks and unsupported behavior remain visible as unresolved limitations rather than completed parity.

Unknown patterns use this same gate. No pattern match is required for progress, and no finite reference list defines coverage.
