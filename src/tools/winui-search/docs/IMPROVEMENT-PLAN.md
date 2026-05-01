# winui-search — Improvement Plan

Tracks the gap between today's preview build and a "stable, externally
distributable" v1.0. See [`README.md`](../README.md) for what the tool
already does. Cross-referenced from the launch tracker §12.3 and the
`tool-winui-search-improvement-plan` todo.

## v0.x → 1.0 (preview hardening)

- [ ] **`TruncateXaml` correctness fix.** The current truncation logic in
  `SearchEngine.cs` cuts XAML payloads at a fixed character count and
  can leave dangling open tags or split attributes mid-string. Rewrite
  to:
  - Walk the XAML as XML and stop at element boundaries.
  - Preserve namespace declarations on the root element of the snippet
    so the agent doesn't get a syntactically-broken sample.
  - Add a regression test fixture covering each truncation edge case
    (mid-attribute, mid-element, inside a comment).
- [ ] **Embedded-vs-live decision.** Today the tool ships embedded JSON
  snapshots and exposes `winui-search update` to refetch from GitHub.
  This is fine for offline correctness but means the embedded data
  drifts between releases. Pick one of:
  - **Stay embedded + add a CI cron** that runs `update`, regenerates
    `Data/*.json`, opens a PR. Keeps the offline guarantee. Recommended
    for v1.0 — same-team sources rarely have breaking schema drift, so
    cost is low.
  - **Move to live-only** with an LRU disk cache under
    `%LOCALAPPDATA%\winui-search-cache`. Eliminates the drift question
    but breaks the "fully offline" promise.
- [ ] **Cron refresh workflow.** If we keep embedded snapshots, add
  `.github/workflows/winui-search-refresh.yml`:
  - Runs weekly on a schedule + on `workflow_dispatch`.
  - Builds the tool, runs `winui-search update`, diffs the regenerated
    `Data/*.json`, opens a PR (or no-op exit if no diff).
  - PR runs the existing `winui-search-provenance` check for free.
- [ ] **Tests.** Currently zero automated tests. Minimum bar:
  - Unit tests for `BM25.cs` scoring against a small synthetic corpus.
  - Unit tests for `Synonyms.cs` and `StopWords.cs` (deterministic
    table-driven tests).
  - Integration test that loads the embedded snapshots, runs
    `search "tabview"`, and asserts `gallery-tabview-*` is in the top 3.
  - Contract test for the new `TruncateXaml` rewrite.
- [ ] **Schema versioning.** Embed a `"schema": 1` field at the top of
  each `Data/*.json` and at the top of every `--format json` result.
  When the loader sees an unknown schema version it should fail loudly
  rather than silently returning malformed scenarios.
- [ ] **`--offline` flag.** Today `update` is the only network path —
  but if/when we add live fallbacks (e.g. on cache miss) we'll want an
  explicit `--offline` switch that hard-fails any code path that would
  reach for the network. Useful for sandboxed CI and air-gapped users.

## v1.0 distribution decision

Same three options as winmd-cli (tracker §12.4 /
`skill-distribution-decision` todo):

1. **Publish as a `dotnet tool` on NuGet** — `dotnet tool install -g
   microsoft.winui-search`.
2. **Fold into [`microsoft/winappcli`](https://github.com/microsoft/winappcli)
   as `winapp search <query>`.** Reasonable home — `winappcli` already
   owns the WinUI inner-loop story and an embedded gallery search slots
   in cleanly next to `winapp run` / `winapp launch`.
3. **Keep shipping the prebuilt exe inside the `winui-design` skill
   payload.** Status quo; verified by the `winui-search-provenance` CI
   job.

The decision is wedged behind the broader skill-distribution call;
until it lands, ship the exe in-tree.

## Out of scope (for now)

- **Vector / embedding search.** BM25 with synonym expansion is good
  enough for the agent's "find the canonical sample for X" use case.
  Adding embeddings would mean shipping a model, which contradicts the
  "fully offline" goal.
- **Indexing other repos.** WinUI Gallery + Community Toolkit are
  same-team; pulling in third-party samples raises licence /
  attribution questions we don't need to answer for v1.0.
- **A long-running daemon mode.** AOT cold start is already fast
  enough that the agent can invoke per-query without measurable cost.
