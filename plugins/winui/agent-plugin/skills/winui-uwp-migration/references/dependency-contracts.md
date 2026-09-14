# Dependency contracts

Use `migration-report.json` schema 1.3 `dependencyAnalysis` as the source dependency inventory, not as a package recommendation. Apply this protocol to every `review-required` dependency and whenever a source package or project cannot be carried forward unchanged.

## 1. Inventory the consumed contract

Start with the contract consumed by the active sentinel flow and record:

- constructed types, inherited types, interfaces, and generic constraints;
- called members, overload behavior, return values, exceptions, and asynchronous completion;
- events, delegates, callbacks, commands, and registration lifetime;
- XAML controls, dependency properties, bindings, templates, and resource keys;
- mutable models, collections, notifications, serialization, and persisted data;
- thread, dispatcher, window, activation, disposal, and deployment assumptions.

Include reflection, XAML-only references, generated code, and configuration-driven activation when the sentinel or shared boundary can reach them. Expand into a sibling project's internals only when an unresolved member, type, or behavior on the active flow is owned there, or when later feature coverage crosses that boundary. A matching package name or capability description does not establish this contract.

If dependency analysis is `incomplete`, resolve or explicitly account for every `inspectionIssue` before deciding that the inventory is complete.

## 2. Select one strategy

Choose and record exactly one primary strategy per consumed contract:

1. **Compatible package:** use only when the target package satisfies every consumed member and observable behavior.
2. **Target-owned adapter:** use when the capability exists but its API contract differs.
3. **Source port:** use when maintainable source is available and no compatible binary contract exists.
4. **Equivalent implementation:** use when neither a compatible package nor maintainable source is available.

A package search that finds no matching namespace, or missing types after a package swap, establishes contract mismatch rather than impossibility. Substantial adapter or port work is migration work, not an external blocker.

Place compatibility code at an app- or solution-owned boundary. Do not add a project-specific adapter to `winapp migrate`, the analyzer, or this skill.

## 3. Validate the strategy

Create one semantic finding for the dependency contract and link every affected state. Before resolving it:

- map every consumed source member to a target member or implementation;
- verify data flow, mutation, callbacks, errors, and asynchronous completion;
- verify XAML and binding behavior at runtime where consumed;
- replay at least one state for each distinct observable capability;
- retain explicit open findings for unsupported members or fallbacks.

Compilation proves only that the target exposes a compatible type surface. Empty registrations, disconnected properties, default-returning methods, and completed tasks that do not perform the source operation are diagnostic scaffolding, not valid implementations. Keep the dependency seam open or failed, and do not use that scaffolding as a reason to expand into peripheral feature migration.

For a project-reference graph, independently migrated projects may be delegated, but one owner must integrate the graph, resolve shared contracts consistently, and run the common build and state replay.
