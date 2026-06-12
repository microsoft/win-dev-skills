# copilot-cost

A tiny, **zero-dependency TypeScript module** that computes the token usage and
**AI-credit (AIU) cost** of a GitHub Copilot CLI / Copilot SDK session, split
between the **main agent** and any **sub-agents**.

For each scope (main, each sub-agent, and total) it reports:

| Field | Meaning |
|-------|---------|
| `inputTokens` | Fresh, **uncached** prompt tokens (billed at the base input rate) |
| `cachedTokens` | Prompt tokens served from cache (`cache_read`, billed cheaply) |
| `cacheWriteTokens` | Prompt tokens written to cache (`cache_write`, billed at a premium) |
| `outputTokens` | Generated tokens (includes reasoning tokens) |
| `grossInputTokens` | `inputTokens + cachedTokens + cacheWriteTokens` (total prompt) |
| `aiCreditCost` | **AI credit cost in AIU** (the headline number — exact, billed by the CLI) |
| `nanoAiu` | Raw billed cost in nano-AIU (1e-9 AIU), straight from the logs |

> The CLI denominates cost only in **AIU** (nano-AIU). There are **no dollar
> amounts in the logs**, so this module does not invent a currency conversion —
> it reports AIU, which is exact. Apply your own AIU→USD rate downstream if you
> need one.

It works in **any TypeScript/JavaScript runtime** (the pure functions have no
imports). Optional `analyze*File` / `analyze*Dir` helpers use Node's `fs`.

---

## Quick start

```ts
import { analyzeCopilotSession, formatReport } from "copilot-cost";

// Point at a recorded session/trial directory (auto-discovers the logs):
const report = await analyzeCopilotSession("path/to/session-logs-dir");

console.log(formatReport(report));

report.main.aiCreditCost;     // main agent AI credits (AIU)
report.subAgents[0].cachedTokens;
report.total.nanoAiu;         // whole-session raw cost (nano-AIU)
```

Pure (no filesystem — pass events you already have):

```ts
import { parseJsonl, analyzeEvents } from "copilot-cost";

const events = parseJsonl(jsonlText);   // string with one JSON object per line
const report = analyzeEvents(events);
```

Run the bundled example against the checked-in sample trial:

```bash
node examples/analyze-run.ts        # Node >= 22 (native TS), or: npx tsx examples/analyze-run.ts
```

---

## Where the data comes from (read this)

A Copilot CLI session writes **two complementary JSONL logs**. This module reads
both for full accuracy; it is safe to feed both to `analyzeEvents` (credits are
taken from the per-call events; the session summary only adds `premiumRequests`
and a cross-check, so nothing is double-counted).

### 1. The SDK event stream (e.g. an exported `*-events.jsonl`)

The Copilot SDK emits this stream; a harness may export it to a file. It is the
**only** source with **per-API-call** usage events, and the **only** way to
reliably separate the main agent from inline sub-agents.

Look for events with `type: "assistant.usage"`:

```jsonc
{
  "type": "assistant.usage",
  "data": {
    "model": "claude-opus-4.6",
    "inputTokens": 18631,          // GROSS prompt tokens (already includes cache)
    "outputTokens": 554,
    "cacheReadTokens": 0,
    "cacheWriteTokens": 18628,
    "reasoningTokens": 213,
    "parentToolCallId": "toolu_…",  // PRESENT => this call belongs to a SUB-AGENT
                                    // ABSENT  => this call is the MAIN agent
    "copilotUsage": {
      "tokenDetails": [
        { "tokenType": "input",       "tokenCount": 3,     "batchSize": 1000000, "costPerBatch": 500000000000 },
        { "tokenType": "cache_read",  "tokenCount": 0,     "batchSize": 1000000, "costPerBatch": 50000000000 },
        { "tokenType": "cache_write", "tokenCount": 18628, "batchSize": 1000000, "costPerBatch": 625000000000 },
        { "tokenType": "output",      "tokenCount": 554,   "batchSize": 1000000, "costPerBatch": 2500000000000 }
      ],
      "totalNanoAiu": 13029000000   // EXACT billed cost of THIS call (nano-AIU)
    }
  }
}
```

Sub-agent **names / models** come from the same file:

- `tool.execution_start` where `data.toolName === "task"` →
  `data.toolCallId` maps to `data.arguments.{name, description, agent_type}`
- `subagent.completed` / `subagent.failed` →
  `data.{toolCallId, agentName, agentDisplayName, model, totalTokens, durationMs}`

### 2. The canonical session log — `~/.copilot/session-state/<sessionId>/events.jsonl`

The **only** file with the session-end summary. Look for
`type: "session.shutdown"` with `data.shutdownType === "routine"`:

```jsonc
{
  "type": "session.shutdown",
  "data": {
    "shutdownType": "routine",
    "totalPremiumRequests": 3,
    "totalNanoAiu": 156131000000,   // whole-session billed cost
    "tokenDetails": {               // session totals (fresh input / cache / output)
      "input": { "tokenCount": 125607 },
      "cache_read": { "tokenCount": 814464 },
      "cache_write": { "tokenCount": 67884 },
      "output": { "tokenCount": 31435 }
    },
    "modelMetrics": {
      "claude-opus-4.6": {
        "usage": { "inputTokens": 470721, "outputTokens": 4712,
                   "cacheReadTokens": 402816, "cacheWriteTokens": 67884 },
        "totalNanoAiu": 74358800000   // <-- note: usage.inputTokens here is GROSS
      }
    }
  }
}
```

> A sub-agent that runs as its **own session** appears here as a
> `session.shutdown` **without** a `shutdownType` field.

The module uses this file for `premiumRequests` and as a cross-check against the
summed per-call cost.

---

## How the cost is computed (read straight from the logs — no price table)

The CLI denominates every cost in **nano-AIU** (1e-9 AI Units), so that is the
only cost unit the data contains. This module applies **no price table and no
currency conversion**.

**Per call** the cost in nano-AIU is

```
nanoAiu = Σ_type ( tokenCount / batchSize × costPerBatch )
```

which is exactly the value the CLI already reports as
`copilotUsage.totalNanoAiu`. The module sums `totalNanoAiu` directly (and falls
back to the formula above only if that field is missing).

**AI credits (AIU) — exact.** AIU is just nano-AIU unscaled (the field is
literally named `totalNanoAiu`, and "nano" = 1e-9), so this is not derived or
estimated:

```
1 AIU = 1e9 nano-AIU      →  aiCreditCost = nanoAiu / 1e9
```

**No USD.** The logs contain **no dollar amounts** — every cost field is in
nano-AIU. Converting to USD would require an AIU→USD rate that is **not in the
data**, so this module deliberately does not do it. If you need a currency,
multiply `aiCreditCost` by your own contract rate downstream.

### Main vs. sub-agent split

The robust split is per-call, from the SDK event stream:

- `assistant.usage` **without** `parentToolCallId` → **main agent**
- `assistant.usage` **with** `parentToolCallId` → **sub-agent**; grouped by
  `parentToolCallId` so each sub-agent invocation gets its own line

This works for **inline** sub-agents (spawned via the `task` tool, which share
the parent session) — the common case. If only the canonical log is available,
the module falls back to `session.shutdown.modelMetrics` and emits a warning,
because inline sub-agents there roll up by **model**, not by scope.

### Token categories

The five categories are **non-overlapping** and map directly to the provider's
billing tiers, so `inputTokens + cachedTokens + cacheWriteTokens = grossInputTokens`.

> Note: the raw `assistant.usage.data.inputTokens` field is **gross** (it already
> includes cached + cache-write). This module exposes both the non-overlapping
> `inputTokens` (fresh only) **and** `grossInputTokens`, so you can use whichever
> your report needs.

---

## Validation

Running against the checked-in sample trial
(`agent-benchmark/results/run1/calc_subagent-cost-test_o46_i1/session-logs-dir`):

```
MAIN agent  in 21      cache(r) 402.8k  cache(w) 67.9k  out 4.7k    74.36 AIU
SUB (gpt-5.4) in 125.6k cache(r) 411.6k  cache(w) 0      out 26.7k   81.77 AIU
TOTAL       in 125.6k  cache(r) 814.5k  cache(w) 67.9k  out 31.4k  156.13 AIU
premium requests: 3
```

Every number ties out to the canonical `session.shutdown`:

- `total.aiCreditCost` 156.13 AIU == `totalNanoAiu` `156131000000`
- `main` 74.36 AIU == `modelMetrics["claude-opus-4.6"].totalNanoAiu` `74358800000`
- token totals (125607 / 814464 / 67884 / 31435) == the shutdown `tokenDetails`
- `premiumRequests` 3 == `totalPremiumRequests`

---

## API

### Pure (any runtime)

| Function | Description |
|----------|-------------|
| `parseJsonl(text): CopilotEvent[]` | Parse JSONL, skipping blank/malformed lines |
| `analyzeEvents(events, options?): SessionCostReport` | Core analysis; accepts events from either or both logs |
| `nanoAiuFromTokenDetails(tokenDetails): number` | Cost of a `tokenDetails` array (fallback) |
| `formatReport(report): string` | Human-readable table |

### Node (require `node:fs`)

| Function | Description |
|----------|-------------|
| `analyzeJsonlFile(path, options?)` | Analyze a single `.jsonl` file |
| `analyzeCopilotSession(pathOrDir, options?)` | Auto-discover `*-events.jsonl` + `.copilot/session-state/**/events.jsonl` under a dir (or analyze a single file), de-duplicate by event id, and report |

### Options

```ts
interface CostOptions {
  reconcileTolerance?: number; // sanity-check tolerance vs session.shutdown total (default 0.01 = 1%)
}
```

### Result shape

```ts
interface SessionCostReport {
  main: CostBreakdown;            // main agent
  subAgents: SubAgentCost[];      // per-call AIU split (SDK stream only; sorted by cost desc)
  subAgentsTotal: CostBreakdown;  // aggregate of all sub-agents
  total: CostBreakdown;           // main + all sub-agents (== session billed total)
  models: Record<string, CostBreakdown>;  // per-model rollup (exact per-model AIU)
  subAgentRuns: SubAgentRun[];    // from subagent.completed; available for plain CLI logs too
  subAgentCount: number;          // best available sub-agent count
  premiumRequests?: number;       // from session.shutdown
  sessionIds: string[];
  warnings: string[];             // e.g. cross-check mismatch, missing per-call data
}

interface CostBreakdown {
  inputTokens: number; cachedTokens: number; cacheWriteTokens: number;
  outputTokens: number; reasoningTokens: number; grossInputTokens: number;
  nanoAiu: number; aiCreditCost: number; apiCalls: number;
}

interface SubAgentCost extends CostBreakdown {
  toolCallId: string; agentName?: string; model?: string; durationMs?: number;
}

// From subagent.completed / subagent.failed events. Combined token count only
// (no input/output/cache breakdown, no per-sub AIU). Present in BOTH the SDK
// stream and a plain CLI session's on-disk events.jsonl.
interface SubAgentRun {
  toolCallId?: string; name?: string; model?: string;
  totalTokens: number; durationMs?: number; status: "completed" | "failed";
}
```

---

## Using it with a plain Copilot CLI session (no harness)

You can capture a log the module reads from a bare `copilot` command. **Run the
session to completion**, then point the module at the session-state folder.

Where the cost data lands for a plain CLI session:

| Source | Has what | Good for |
|--------|----------|----------|
| `~/.copilot/session-state/<sessionId>/events.jsonl` (written automatically) | `session.shutdown` (exact **token totals + AIU + premium** + per-model `modelMetrics`) **and** `subagent.completed` (sub-agent **count + per-sub total tokens + model + duration**) | Exact session totals, sub-agent count/tokens, and per-**model** AIU |
| `copilot --output-format json` (stdout you redirect) | leaner stream: `result` (premium, durations) + `assistant.message` (output tokens) + `subagent.completed` | sub-agent count + output tokens only |

> **Important fidelity note.** A plain CLI session's logs do **not** contain the
> per-call `assistant.usage` events, so the module cannot produce a per-**scope**
> (main-vs-sub) **AIU** split from them. You still get: exact **session totals**,
> the **sub-agent count + per-sub total tokens** (`subAgentRuns`), and the exact
> **per-model** AIU (`models`) — which separates main from sub whenever they run
> on different models. A precise per-scope AIU split requires the SDK event
> stream (per-call `assistant.usage`), e.g. captured via `@github/copilot-sdk`.

### Make a multi-sub-agent session, then analyze it

```powershell
# 1. fresh working dir + a known session id
$work = Join-Path $env:TEMP "cc-test-$(Get-Random)"; New-Item -ItemType Directory $work | Out-Null; Set-Location $work
$sid  = [guid]::NewGuid().ToString()

# 2. run non-interactively; force 3 parallel sub-agents via the task tool
$prompt = "You MUST use the 'task' tool to launch exactly 3 sub-agents in parallel in a single turn. " +
          "Give each one this exact instruction: 'Reply with one line: WORKER OK'. " +
          "Do not do the work yourself. After all three return, print: ALL DONE."
copilot -p $prompt --allow-all-tools --output-format json --session-id $sid > stdout.jsonl

# 3. analyze the on-disk session log (richest plain-CLI source)
$events = Join-Path $env:USERPROFILE ".copilot/session-state/$sid/events.jsonl"
node -e "import('copilot-cost').then(async m => console.log(m.formatReport(await m.analyzeJsonlFile(process.argv[1]))))" $events
```

Key flags: `-p` (non-interactive), `--allow-all-tools` (required for `-p`, else
it blocks on permission prompts), `--output-format json` (JSONL stream),
`--session-id` (so you know which folder to read).

---

---

## Design notes

- **No price table.** Cost is read from the CLI's own `totalNanoAiu`, so it
  stays correct even as model prices change — there is nothing to maintain, and
  no fabricated rates.
- **Per-call main-vs-sub split.** Sub-agents are separated by `parentToolCallId`
  on each `assistant.usage` event, so **inline** `task`-tool sub-agents (which
  share the parent session) are attributed correctly — not folded into the main
  agent.
- **Premium requests from the summary.** `data.cost` on a usage event is a
  per-request multiplier, not an additive counter, so premium requests are read
  from `session.shutdown.totalPremiumRequests`.
- **Built-in sanity-check.** The summed per-call cost is reconciled against the
  session's `totalNanoAiu`; drift beyond `reconcileTolerance` adds a warning
  (it never changes the reported numbers).

---

## License

MIT
