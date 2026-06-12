# copilot-cost

Work out how many **tokens** and **AI credits (AIU)** a GitHub Copilot session
used — split between the **main agent** and its **sub-agents**. Tiny,
zero-dependency TypeScript. Reads the JSONL logs Copilot already writes.

It reports, for the main agent / each sub-agent / the total:

| Field | Meaning |
|-------|---------|
| `inputTokens` | Fresh, uncached prompt tokens |
| `cachedTokens` | Prompt tokens read from cache (cheap) |
| `cacheWriteTokens` | Prompt tokens written to cache (priciest prompt tier) |
| `outputTokens` | Generated tokens |
| `aiCreditCost` | **AI credits (AIU)** — the headline cost, taken straight from the logs |

> **Why no $?** The logs only contain AIU (the CLI's billing unit), never
> dollars. The module reports AIU exactly and does not invent an exchange rate.

---

## Quick start (2 minutes)

```powershell
cd C:\ado\win-dev-skills\src\tools\cost-module
npm install                      # one-time
node examples/analyze-run.ts     # analyzes your most recent Copilot session
```

You'll see a table like:

```
MAIN agent   in 38   cache(r) 74.5k  cache(w) 77.0k  out 811     20.97 AIU
TOTAL        in 38   cache(r) 74.5k  cache(w) 77.0k  out 811     20.97 AIU
premium requests: 3
sub-agents: 3 (total tokens only — per-sub AIU needs the SDK stream)
  • Worker 2   claude-haiku-4.5   20.4k tok  6471ms
  • Worker 1   claude-haiku-4.5   20.4k tok  7022ms
  • Worker 3   claude-haiku-4.5   24.6k tok  7406ms
```

Requires Node ≥ 22 (runs TypeScript natively). No build step needed.

---

## Where do the logs come from?

Every Copilot CLI session writes a log here automatically when it **finishes**:

```
~/.copilot/session-state/<sessionId>/events.jsonl
```

So the normal workflow is: **chat as usual → exit cleanly with `/exit` → analyze
the log.** (⚠️ If you just close the terminal, the log may not be written.)

### Make a test session with 3 sub-agents, then analyze it

This is the exact recipe we use to test the module end-to-end:

```powershell
# 1. a throwaway working dir + a known session id
$work = Join-Path $env:TEMP "cc-test-$(Get-Random)"; New-Item -ItemType Directory $work | Out-Null; Set-Location $work
$sid  = [guid]::NewGuid().ToString()

# 2. run non-interactively and force 3 parallel sub-agents
$prompt = "You MUST use the 'task' tool to launch exactly 3 sub-agents in parallel in a single turn. " +
          "Give each one this instruction: 'Reply with one line: WORKER OK'. " +
          "Do not do the work yourself. After all three return, print: ALL DONE."
copilot -p $prompt --allow-all-tools --output-format json --session-id $sid > stdout.jsonl

# 3. analyze that session's log
$events = Join-Path $env:USERPROFILE ".copilot/session-state/$sid/events.jsonl"
cd C:\ado\win-dev-skills\src\tools\cost-module
node examples/analyze-run.ts $events
```

Flags used: `-p` = non-interactive (exits when done), `--allow-all-tools` =
required for `-p` (otherwise it waits for permission prompts), `--session-id` =
so you know which folder to read.

---

## Use it in your own code

```ts
import { analyzeJsonlFile, formatReport } from "copilot-cost"; // or "../src/copilot-cost.ts" in-repo

const report = await analyzeJsonlFile("path/to/events.jsonl");

console.log(formatReport(report));      // pretty table
report.total.aiCreditCost;              // total AI credits (AIU)
report.main.inputTokens;                // main agent's fresh input tokens
report.subAgentCount;                   // how many sub-agents ran
report.models["claude-haiku-4.5"]?.aiCreditCost;  // exact AIU per model
```

No file handy? Pass events you already have in memory:

```ts
import { parseJsonl, analyzeEvents } from "copilot-cost";
const report = analyzeEvents(parseJsonl(jsonlText));
```

---

## Good to know

- **AIU is exact.** It comes from the CLI's own `totalNanoAiu` (`AIU = nanoAiu / 1e9`).
  No price table, nothing to keep up to date.
- **Per-agent AIU split needs the richer "SDK stream".** A plain CLI log can't
  attribute AIU to individual sub-agents, so the module gives you the next best
  things from it: exact **session totals**, **sub-agent count + per-sub tokens**
  (`subAgentRuns`), and **per-model** AIU (`models`) — which already separates
  main from subs when they run on different models (the common case). For a true
  per-sub-agent AIU split, capture the SDK event stream (per-call
  `assistant.usage` events, e.g. via `@github/copilot-sdk`).
- **`input` is only the *new* tokens.** The full prompt is
  `input + cache(r) + cache(w)` — also available as `report.main.grossInputTokens`.

---

## API

| Function | Use |
|----------|-----|
| `analyzeJsonlFile(path)` | Analyze one `.jsonl` log file (Node) |
| `analyzeCopilotSession(dir)` | Auto-discover logs under a folder and analyze (Node) |
| `parseJsonl(text)` → `analyzeEvents(events)` | Pure, runtime-agnostic (no filesystem) |
| `formatReport(report)` | Render the report as a text table |

`SessionCostReport` shape:

```ts
interface SessionCostReport {
  main: CostBreakdown;                     // main agent
  subAgents: SubAgentCost[];               // per-sub AIU split (SDK stream only)
  subAgentsTotal: CostBreakdown;           // all sub-agents combined
  total: CostBreakdown;                    // main + subs (== session total)
  models: Record<string, CostBreakdown>;   // exact AIU per model
  subAgentRuns: SubAgentRun[];             // sub-agent count + per-sub tokens (works on plain CLI logs)
  subAgentCount: number;
  premiumRequests?: number;
  sessionIds: string[];
  warnings: string[];                      // e.g. "no per-call data, using fallback"
}

interface CostBreakdown {
  inputTokens; cachedTokens; cacheWriteTokens; outputTokens;
  reasoningTokens; grossInputTokens;       // token counts
  nanoAiu; aiCreditCost; apiCalls;         // cost
}
```

---

## How it works (one paragraph)

The CLI records each call's cost in **nano-AIU** inside the event log. The
module sums the `totalNanoAiu` the CLI already reports (so it's exact), divides
by 1e9 to get AIU, and tallies tokens by type. It splits main vs. sub-agents
per call via `parentToolCallId` when the detailed SDK stream is present; with a
plain CLI log it falls back to the end-of-session summary (`session.shutdown`)
plus `subagent.completed` events. As a safety net it cross-checks the summed
cost against the session total and warns on any mismatch.
