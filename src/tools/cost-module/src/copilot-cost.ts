/**
 * copilot-cost — Compute the token usage and AI-credit cost of a GitHub Copilot
 * CLI / Copilot SDK session, split between the MAIN agent and any SUB-agents.
 *
 * Zero runtime dependencies. The pure functions (`parseJsonl`, `analyzeEvents`,
 * `formatReport`) run in any JS/TS runtime (Node, Deno, Bun, browser). The
 * `analyze*File` / `analyze*Dir` helpers additionally require Node's `fs`.
 *
 * ===========================================================================
 *  WHERE THE DATA LIVES  (read this first)
 * ===========================================================================
 * A Copilot CLI session writes two complementary event logs. Both are JSONL
 * (one JSON object per line). For full accuracy this module reads BOTH:
 *
 *  1. The SDK event stream (the Copilot SDK emits this; a harness may export it
 *     to a `*-events.jsonl` file). This is the ONLY source that contains
 *     per-API-call usage events:
 *
 *         { "type": "assistant.usage",
 *           "data": {
 *             "model": "claude-opus-4.6",
 *             "inputTokens": 18631,        // GROSS prompt tokens (incl. cache)
 *             "outputTokens": 554,
 *             "cacheReadTokens": 0,
 *             "cacheWriteTokens": 18628,
 *             "reasoningTokens": 213,
 *             "parentToolCallId": "toolu_…",   // PRESENT => this call belongs
 *                                              //   to a sub-agent. ABSENT =>
 *                                              //   it is the main agent.
 *             "copilotUsage": {
 *               "tokenDetails": [
 *                 { "tokenType": "input",       "tokenCount": 3,     "batchSize": 1e6, "costPerBatch": 5.0e11 },
 *                 { "tokenType": "cache_read",  "tokenCount": 0,     "batchSize": 1e6, "costPerBatch": 5.0e10 },
 *                 { "tokenType": "cache_write", "tokenCount": 18628, "batchSize": 1e6, "costPerBatch": 6.25e11 },
 *                 { "tokenType": "output",      "tokenCount": 554,   "batchSize": 1e6, "costPerBatch": 2.5e12 }
 *               ],
 *               "totalNanoAiu": 13029000000   // EXACT billed cost of this call
 *             }
 *           } }
 *
 *     This file is what makes a reliable main-vs-sub split possible, because
 *     inline sub-agents (spawned via the `task` tool) share the parent session
 *     and are only distinguishable by `parentToolCallId`.
 *
 *     It also carries sub-agent metadata:
 *       - `tool.execution_start` with `data.toolName === "task"`:
 *             data.toolCallId -> data.arguments.{name, description, agent_type}
 *       - `subagent.completed` / `subagent.failed`:
 *             data.{toolCallId, agentName, agentDisplayName, model, totalTokens, durationMs}
 *
 *  2. The canonical session log —
 *     `~/.copilot/session-state/<sessionId>/events.jsonl`. This is the ONLY
 *     source with the session-end summary:
 *
 *         { "type": "session.shutdown",
 *           "data": {
 *             "shutdownType": "routine",      // the main session's shutdown
 *             "totalPremiumRequests": 3,
 *             "totalNanoAiu": 156131000000,   // whole-session billed cost
 *             "tokenDetails": { "input": { "tokenCount": … }, "cache_read": {…}, "cache_write": {…}, "output": {…} },
 *             "modelMetrics": {
 *               "claude-opus-4.6": {
 *                 "usage": { "inputTokens": 470721, "outputTokens": 4712,   // inputTokens is GROSS
 *                            "cacheReadTokens": 402816, "cacheWriteTokens": 67884, "reasoningTokens": 415 },
 *                 "totalNanoAiu": 74358800000,
 *                 "tokenDetails": { "input": {…}, "cache_read": {…}, "cache_write": {…}, "output": {…} }
 *               }
 *             } } }
 *
 *     This module uses it for `premiumRequests` and as a cross-check against
 *     the per-call total. (A sub-agent that runs as its OWN session shows up
 *     here as a `session.shutdown` WITHOUT a `shutdownType` field.)
 *
 * It is safe to concatenate the events of both files and pass them to
 * `analyzeEvents` — credits/tokens are taken from the per-call `assistant.usage`
 * events when present, and the `session.shutdown` summary only contributes
 * `premiumRequests` + a validation cross-check, so nothing is double-counted.
 *
 * ===========================================================================
 *  HOW THE COST IS COMPUTED  (read straight from the logs — no price table)
 * ===========================================================================
 *  The CLI denominates every cost in *nano-AIU* (1e-9 AI Units), so that is the
 *  only cost unit the data actually contains. This module does NOT apply any
 *  price table or currency conversion.
 *
 *  - Per call, cost in nano-AIU:
 *        nanoAiu = Σ_type ( tokenCount / batchSize * costPerBatch )
 *    which is exactly the value the CLI reports as `copilotUsage.totalNanoAiu`.
 *    The module sums `totalNanoAiu` directly and only falls back to the formula
 *    above if that field is missing.
 *  - AIU is just nano-AIU unscaled (the field is literally named `totalNanoAiu`
 *    and "nano" = 1e-9), so it is exact, not an estimate:
 *        aiCreditCost (AIU) = nanoAiu / 1e9
 *    There is no dollar amount anywhere in the logs; converting AIU→USD would
 *    require an external rate that is not part of the data, so this module does
 *    not do it. Apply your own rate downstream if you need a currency.
 *
 *  Token categories (non-overlapping; the relative `costPerBatch` values in the
 *  logs confirm the cost ordering noted below):
 *        inputTokens       = "input"       — fresh, uncached prompt tokens
 *        cachedTokens      = "cache_read"  — prompt tokens served from cache (cheapest)
 *        cacheWriteTokens  = "cache_write" — prompt tokens written to cache (priciest prompt tier)
 *        outputTokens      = "output"      — generated tokens (includes reasoning)
 *        grossInputTokens  = input + cachedTokens + cacheWriteTokens  (total prompt)
 *
 *  NOTE on "input tokens": the raw `assistant.usage.data.inputTokens` field is
 *  GROSS (it already includes cached + cache-write). This module exposes both
 *  the non-overlapping `inputTokens` (fresh only) AND `grossInputTokens` so you
 *  can use whichever your report needs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw Copilot event (loosely typed — only the fields we read are described). */
export interface CopilotEvent {
  type?: string;
  data?: any;
  id?: string;
  timestamp?: string;
  agentId?: string;
  ephemeral?: boolean;
  [k: string]: unknown;
}

export type TokenType = "input" | "cache_read" | "cache_write" | "output";

/** Non-overlapping token counts plus a convenience gross-input total. */
export interface TokenBreakdown {
  /** Fresh, uncached prompt tokens (billed at the base input rate). */
  inputTokens: number;
  /** Prompt tokens served from cache (cache hits, billed cheaply). */
  cachedTokens: number;
  /** Prompt tokens written to the cache (cache creation, billed at a premium). */
  cacheWriteTokens: number;
  /** Generated output tokens (includes reasoning tokens). */
  outputTokens: number;
  /** Reasoning tokens — informational subset already counted in outputTokens. */
  reasoningTokens: number;
  /** input + cachedTokens + cacheWriteTokens — the total prompt size. */
  grossInputTokens: number;
}

/** A token breakdown plus the billed cost and call/request counts. */
export interface CostBreakdown extends TokenBreakdown {
  /** Raw billed cost in nano-AIU (1e-9 AIU) — taken straight from the logs. */
  nanoAiu: number;
  /** AI credit cost in AIU (= nanoAiu / 1e9). Exact — this is what the CLI bills. */
  aiCreditCost: number;
  /** Number of API calls (`assistant.usage` events) attributed to this scope. */
  apiCalls: number;
}

/** Per sub-agent invocation cost (one entry per distinct parentToolCallId). */
export interface SubAgentCost extends CostBreakdown {
  /** The `parentToolCallId` that identifies this sub-agent invocation. */
  toolCallId: string;
  /** Friendly name from the `task` tool call or `subagent.completed`, if known. */
  agentName?: string;
  /** Model the sub-agent ran on, if known. */
  model?: string;
  /** Wall-clock duration in ms, from `subagent.completed`, if known. */
  durationMs?: number;
}

/**
 * A sub-agent run as reported by a `subagent.completed` / `subagent.failed`
 * event. These events appear in BOTH the SDK stream and a plain CLI session's
 * on-disk `events.jsonl`, so this is the universally-available view of
 * sub-agents. It carries a single combined `totalTokens` (no input/output/cache
 * breakdown, and no per-sub AIU) — for a precise per-sub token/AIU split you
 * need the per-call `assistant.usage` events (the `subAgents` field).
 */
export interface SubAgentRun {
  /** The sub-agent's tool-call id (`task` tool call), if known. */
  toolCallId?: string;
  /** Friendly name from the `task` tool call args, or the agent display name. */
  name?: string;
  /** Model the sub-agent ran on. */
  model?: string;
  /** Combined token count the CLI reported for this sub-agent run. */
  totalTokens: number;
  /** Wall-clock duration in ms. */
  durationMs?: number;
  /** Whether the sub-agent completed or failed. */
  status: "completed" | "failed";
}

export interface SessionCostReport {
  /** Main agent: all `assistant.usage` events WITHOUT a parentToolCallId. */
  main: CostBreakdown;
  /** One entry per sub-agent invocation (grouped by parentToolCallId). */
  subAgents: SubAgentCost[];
  /** Aggregate of every sub-agent invocation. */
  subAgentsTotal: CostBreakdown;
  /** main + subAgentsTotal — equals the session's billed total. */
  total: CostBreakdown;
  /** Per-model rollup across both scopes (model name -> cost). */
  models: Record<string, CostBreakdown>;
  /**
   * Sub-agent runs from `subagent.completed` / `subagent.failed` events.
   * Available for plain CLI logs too (where `subAgents` is empty because there
   * are no per-call usage events). Total tokens only — no per-sub AIU.
   */
  subAgentRuns: SubAgentRun[];
  /** Best available sub-agent count (max of per-call groups and completed events). */
  subAgentCount: number;
  /** Session-level premium requests (from `session.shutdown`, if available). */
  premiumRequests?: number;
  /** Session ids seen (from `session.start` / `session.shutdown`). */
  sessionIds: string[];
  /** Non-fatal diagnostics (e.g. cross-check mismatches, missing data). */
  warnings: string[];
}

export interface CostOptions {
  /**
   * Tolerance (fraction) for the internal sanity-check that compares the summed
   * per-call cost against `session.shutdown.totalNanoAiu`. A mismatch beyond
   * this only adds a warning; it never changes the numbers. Default 0.01 (1%).
   */
  reconcileTolerance?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** 1 AIU = 1e9 nano-AIU. The CLI denominates cost in nano-AIU (`totalNanoAiu`);
 *  "nano" = 1e-9, so AIU is that same value unscaled — exact, not an estimate. */
export const NANO_AIU_PER_AIU = 1e9;

// ─────────────────────────────────────────────────────────────────────────────
// Pure core — works in any runtime
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a JSONL string into events, skipping blank/malformed lines. */
export function parseJsonl(text: string): CopilotEvent[] {
  const out: CopilotEvent[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function emptyTokens(): TokenBreakdown {
  return {
    inputTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    grossInputTokens: 0,
  };
}

interface MutableCost extends CostBreakdown {}

function emptyCost(): MutableCost {
  return { ...emptyTokens(), nanoAiu: 0, aiCreditCost: 0, apiCalls: 0 };
}

/** Compute nano-AIU from a `copilotUsage.tokenDetails` array (fallback when
 *  `totalNanoAiu` is absent). cost = Σ tokenCount / batchSize * costPerBatch. */
export function nanoAiuFromTokenDetails(
  tokenDetails: Array<{ tokenCount?: number; batchSize?: number; costPerBatch?: number }> | undefined,
): number {
  if (!Array.isArray(tokenDetails)) return 0;
  let n = 0;
  for (const d of tokenDetails) {
    const count = Number(d?.tokenCount) || 0;
    const batch = Number(d?.batchSize) || 0;
    const per = Number(d?.costPerBatch) || 0;
    if (count > 0 && batch > 0 && per > 0) n += (count / batch) * per;
  }
  return n;
}

/** Read the per-type token counts from one `assistant.usage` event's data. */
function tokensFromUsageEvent(data: any): { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning: number } {
  const details: any[] = Array.isArray(data?.copilotUsage?.tokenDetails)
    ? data.copilotUsage.tokenDetails
    : [];
  const byType: Record<string, number> = {};
  for (const d of details) {
    if (d && typeof d.tokenType === "string") byType[d.tokenType] = (byType[d.tokenType] || 0) + (Number(d.tokenCount) || 0);
  }

  // Prefer the authoritative tokenDetails array; fall back to the flat fields.
  const cacheRead = "cache_read" in byType ? byType["cache_read"] : Number(data?.cacheReadTokens) || 0;
  const cacheWrite = "cache_write" in byType ? byType["cache_write"] : Number(data?.cacheWriteTokens) || 0;
  // tokenDetails "input" is the fresh/uncached input. The flat `data.inputTokens`
  // is GROSS (incl. cache) so derive fresh input from it when details are absent.
  const input = "input" in byType
    ? byType["input"]
    : Math.max(0, (Number(data?.inputTokens) || 0) - cacheRead - cacheWrite);
  const output = "output" in byType ? byType["output"] : Number(data?.outputTokens) || 0;
  const reasoning = Number(data?.reasoningTokens) || 0;
  return { input, cacheRead, cacheWrite, output, reasoning };
}

function addUsageEventToCost(cost: MutableCost, data: any): void {
  const t = tokensFromUsageEvent(data);
  cost.inputTokens += t.input;
  cost.cachedTokens += t.cacheRead;
  cost.cacheWriteTokens += t.cacheWrite;
  cost.outputTokens += t.output;
  cost.reasoningTokens += t.reasoning;
  cost.grossInputTokens += t.input + t.cacheRead + t.cacheWrite;

  const total = Number(data?.copilotUsage?.totalNanoAiu);
  cost.nanoAiu += Number.isFinite(total) && total > 0
    ? total
    : nanoAiuFromTokenDetails(data?.copilotUsage?.tokenDetails);
  cost.apiCalls += 1;
}

function finalizeCost(cost: MutableCost): void {
  // AIU is nano-AIU unscaled (1 AIU = 1e9 nano-AIU). Exact — straight from logs.
  cost.aiCreditCost = round(cost.nanoAiu / NANO_AIU_PER_AIU, 4);
  // Round token fields to integers (they are integer counts already).
  cost.inputTokens = Math.round(cost.inputTokens);
  cost.cachedTokens = Math.round(cost.cachedTokens);
  cost.cacheWriteTokens = Math.round(cost.cacheWriteTokens);
  cost.outputTokens = Math.round(cost.outputTokens);
  cost.reasoningTokens = Math.round(cost.reasoningTokens);
  cost.grossInputTokens = Math.round(cost.grossInputTokens);
  cost.nanoAiu = Math.round(cost.nanoAiu);
}

function round(n: number, dp: number): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/**
 * Analyze a flat list of Copilot events into a main-vs-sub cost report.
 *
 * Accepts events from the SDK event stream (per-call `assistant.usage`), from
 * the canonical `session-state/<id>/events.jsonl` (the `session.shutdown`
 * summary), or both concatenated together.
 */
export function analyzeEvents(events: CopilotEvent[], options: CostOptions = {}): SessionCostReport {
  const tolerance = options.reconcileTolerance ?? 0.01;
  const warnings: string[] = [];

  const main = emptyCost();
  const subByTool = new Map<string, MutableCost>();
  const modelTotals = new Map<string, MutableCost>();
  const sessionIds = new Set<string>();

  // Sub-agent metadata maps.
  const taskName = new Map<string, string>(); // toolCallId -> friendly name
  const subMeta = new Map<string, { agentName?: string; model?: string; durationMs?: number }>();
  const subRuns: SubAgentRun[] = []; // from subagent.completed/.failed (universal)

  let usageEventCount = 0;
  let shutdownPremium: number | undefined;
  let shutdownNanoAiu = 0;
  let sawRoutineShutdown = false;

  // Pass 1: collect sub-agent metadata + session ids.
  for (const ev of events) {
    const type = ev?.type || "";
    const d: any = ev?.data;
    if (!d) {
      if (type === "session.start" && (ev as any)?.data?.sessionId) sessionIds.add((ev as any).data.sessionId);
      continue;
    }
    if (type === "session.start" && d.sessionId) sessionIds.add(d.sessionId);
    if (type === "tool.execution_start" && d.toolName === "task" && d.toolCallId) {
      taskName.set(d.toolCallId, d.arguments?.description || d.arguments?.name || d.arguments?.agent_type || "");
    }
    if ((type === "subagent.completed" || type === "subagent.failed") && d.toolCallId) {
      subMeta.set(d.toolCallId, {
        agentName: d.agentDisplayName || d.agentName,
        model: d.model,
        durationMs: d.durationMs,
      });
      subRuns.push({
        toolCallId: d.toolCallId,
        model: d.model,
        totalTokens: Number(d.totalTokens) || 0,
        durationMs: d.durationMs,
        status: type === "subagent.completed" ? "completed" : "failed",
      });
    }
  }

  // Pass 2: accumulate cost from per-call usage events + read shutdown summary.
  for (const ev of events) {
    const type = ev?.type || "";
    const d: any = ev?.data;
    if (!d) continue;

    if (type === "assistant.usage") {
      usageEventCount++;
      const model: string = d.model || "unknown";
      if (!modelTotals.has(model)) modelTotals.set(model, emptyCost());
      addUsageEventToCost(modelTotals.get(model)!, d);

      const parentToolCallId: string | undefined = d.parentToolCallId;
      if (parentToolCallId) {
        if (!subByTool.has(parentToolCallId)) subByTool.set(parentToolCallId, emptyCost());
        addUsageEventToCost(subByTool.get(parentToolCallId)!, d);
      } else {
        addUsageEventToCost(main, d);
      }
    } else if (type === "session.shutdown") {
      const isRoutine = d.shutdownType === "routine";
      if (isRoutine && !sawRoutineShutdown) {
        sawRoutineShutdown = true;
        shutdownPremium = Number(d.totalPremiumRequests) || 0;
        shutdownNanoAiu = Number(d.totalNanoAiu) || 0;
      }
    }
  }

  // Fallback: no per-call usage events (e.g. only the canonical events.jsonl was
  // provided). Reconstruct from session.shutdown.modelMetrics. This cannot split
  // inline sub-agents (they roll up by model), so attribute by model into MAIN
  // and warn.
  if (usageEventCount === 0) {
    warnings.push(
      "No per-call `assistant.usage` events found — falling back to `session.shutdown.modelMetrics`. " +
        "Per-scope main-vs-sub AIU split is unavailable from this source (inline sub-agents roll up by " +
        "model). See `subAgentRuns` for sub-agent count + per-sub total tokens, and `models` for the " +
        "exact per-model AIU (which separates main from sub when they run on different models). " +
        "Capture the SDK event stream (per-call `assistant.usage`) for a per-scope split.",
    );
    reconstructFromShutdowns(events, main, subByTool, subMeta, modelTotals);
  }

  // Finalize per-model.
  const models: Record<string, CostBreakdown> = {};
  for (const [model, c] of modelTotals) {
    finalizeCost(c);
    models[model] = c;
  }

  // Finalize main + subs.
  finalizeCost(main);
  const subAgents: SubAgentCost[] = [];
  const subAgentsTotal = emptyCost();
  for (const [toolCallId, c] of subByTool) {
    // Aggregate into total BEFORE finalizing c (still raw).
    subAgentsTotal.inputTokens += c.inputTokens;
    subAgentsTotal.cachedTokens += c.cachedTokens;
    subAgentsTotal.cacheWriteTokens += c.cacheWriteTokens;
    subAgentsTotal.outputTokens += c.outputTokens;
    subAgentsTotal.reasoningTokens += c.reasoningTokens;
    subAgentsTotal.grossInputTokens += c.grossInputTokens;
    subAgentsTotal.nanoAiu += c.nanoAiu;
    subAgentsTotal.apiCalls += c.apiCalls;

    finalizeCost(c);
    const meta = subMeta.get(toolCallId);
    subAgents.push({
      ...c,
      toolCallId,
      agentName: meta?.agentName || taskName.get(toolCallId) || undefined,
      model: meta?.model || dominantModel(toolCallId, events),
      durationMs: meta?.durationMs,
    });
  }
  finalizeCost(subAgentsTotal);

  // total = main + subAgentsTotal.
  const total = emptyCost();
  for (const c of [main, subAgentsTotal]) {
    total.inputTokens += c.inputTokens;
    total.cachedTokens += c.cachedTokens;
    total.cacheWriteTokens += c.cacheWriteTokens;
    total.outputTokens += c.outputTokens;
    total.reasoningTokens += c.reasoningTokens;
    total.grossInputTokens += c.grossInputTokens;
    total.nanoAiu += c.nanoAiu;
    total.apiCalls += c.apiCalls;
  }
  finalizeCost(total);

  // Cross-check against the canonical session total.
  if (shutdownNanoAiu > 0 && total.nanoAiu > 0) {
    const diff = Math.abs(total.nanoAiu - shutdownNanoAiu) / shutdownNanoAiu;
    if (diff > tolerance) {
      warnings.push(
        `Per-call cost (${total.nanoAiu} nAIU) differs from session.shutdown.totalNanoAiu ` +
          `(${shutdownNanoAiu} nAIU) by ${(diff * 100).toFixed(1)}%.`,
      );
    }
  }

  // Sort sub-agents by cost descending for stable, useful output.
  subAgents.sort((a, b) => b.nanoAiu - a.nanoAiu);

  // Resolve friendly names for the subagent.completed runs (prefer the user's
  // own `task` label over the generic agent display name).
  for (const run of subRuns) {
    if (run.toolCallId) {
      run.name = taskName.get(run.toolCallId) || subMeta.get(run.toolCallId)?.agentName || undefined;
    }
  }

  return {
    main,
    subAgents,
    subAgentsTotal,
    total,
    models,
    subAgentRuns: subRuns,
    subAgentCount: Math.max(subAgents.length, subRuns.length),
    premiumRequests: shutdownPremium,
    sessionIds: [...sessionIds],
    warnings,
  };
}

/** Best-effort model for a sub-agent: the model of its usage events. */
function dominantModel(parentToolCallId: string, events: CopilotEvent[]): string | undefined {
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev?.type === "assistant.usage" && ev.data?.parentToolCallId === parentToolCallId && ev.data?.model) {
      counts.set(ev.data.model, (counts.get(ev.data.model) || 0) + 1);
    }
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [m, n] of counts) if (n > bestN) ((best = m), (bestN = n));
  return best;
}

/** Fallback reconstruction from `session.shutdown` events (no per-call data). */
function reconstructFromShutdowns(
  events: CopilotEvent[],
  main: MutableCost,
  subByTool: Map<string, MutableCost>,
  subMeta: Map<string, { agentName?: string; model?: string; durationMs?: number }>,
  modelTotals: Map<string, MutableCost>,
): void {
  let routineSeen = false;
  let subIndex = 0;
  for (const ev of events) {
    if (ev?.type !== "session.shutdown" || !ev.data) continue;
    const d: any = ev.data;
    const isRoutine = d.shutdownType === "routine";
    const target = isRoutine
      ? main
      : (() => {
          const key = `separate-session-${subIndex++}`;
          const c = emptyCost();
          subByTool.set(key, c);
          subMeta.set(key, { agentName: "separate-session sub-agent" });
          return c;
        })();

    if (isRoutine) {
      // Count the main session once; skip any extra routine shutdowns (e.g. a
      // --resume continuation) so they don't double-count.
      if (routineSeen) continue;
      routineSeen = true;
    }

    const mm = d.modelMetrics || {};
    for (const [model, metricsRaw] of Object.entries(mm)) {
      const m: any = metricsRaw;
      const usage = m?.usage || {};
      const gross = Number(usage.inputTokens) || 0; // GROSS in modelMetrics
      const cacheRead = Number(usage.cacheReadTokens) || 0;
      const cacheWrite = Number(usage.cacheWriteTokens) || 0;
      const freshInput = Math.max(0, gross - cacheRead - cacheWrite);
      const output = Number(usage.outputTokens) || 0;
      const reasoning = Number(usage.reasoningTokens) || 0;
      const nano = Number(m?.totalNanoAiu) || 0;

      target.inputTokens += freshInput;
      target.cachedTokens += cacheRead;
      target.cacheWriteTokens += cacheWrite;
      target.outputTokens += output;
      target.reasoningTokens += reasoning;
      target.grossInputTokens += gross;
      target.nanoAiu += nano;
      target.apiCalls += Number(m?.requests?.count) || 0;

      if (!modelTotals.has(model)) modelTotals.set(model, emptyCost());
      const mt = modelTotals.get(model)!;
      mt.inputTokens += freshInput;
      mt.cachedTokens += cacheRead;
      mt.cacheWriteTokens += cacheWrite;
      mt.outputTokens += output;
      mt.reasoningTokens += reasoning;
      mt.grossInputTokens += gross;
      mt.nanoAiu += nano;
      mt.apiCalls += Number(m?.requests?.count) || 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function costLine(label: string, c: CostBreakdown): string {
  return (
    `${label.padEnd(16)} ` +
    `in ${fmtTokens(c.inputTokens).padStart(8)}  ` +
    `cache(r) ${fmtTokens(c.cachedTokens).padStart(8)}  ` +
    `cache(w) ${fmtTokens(c.cacheWriteTokens).padStart(8)}  ` +
    `out ${fmtTokens(c.outputTokens).padStart(8)}  ` +
    `${c.aiCreditCost.toFixed(2).padStart(10)} AIU`
  );
}

/** Render a human-readable report (handy for CLIs / logs). */
export function formatReport(report: SessionCostReport): string {
  const lines: string[] = [];
  lines.push("Copilot session cost — tokens + AI credits (AIU), straight from the logs");
  lines.push("".padEnd(96, "─"));
  lines.push(costLine("MAIN agent", report.main));
  for (const s of report.subAgents) {
    const name = s.agentName ? ` ${s.agentName}` : "";
    const model = s.model ? ` (${s.model})` : "";
    lines.push(costLine(`SUB${name}${model}`.slice(0, 16), s));
  }
  if (report.subAgents.length > 1) lines.push(costLine("SUB total", report.subAgentsTotal));
  lines.push("".padEnd(96, "─"));
  lines.push(costLine("TOTAL", report.total));
  if (report.premiumRequests != null) lines.push(`premium requests: ${report.premiumRequests}`);
  // Sub-agent runs (always available from subagent.completed; the only sub view
  // for plain CLI logs). Shown when the per-call split didn't already cover them.
  if (report.subAgentRuns.length > 0 && report.subAgents.length === 0) {
    lines.push(`sub-agents: ${report.subAgentCount} (total tokens only — per-sub AIU needs the SDK stream)`);
    for (const r of report.subAgentRuns) {
      const flag = r.status === "failed" ? "  [FAILED]" : "";
      lines.push(
        `  • ${(r.name || "sub").slice(0, 24).padEnd(24)} ${(r.model || "?").padEnd(18)} ` +
          `${fmtTokens(r.totalTokens).padStart(8)} tok  ${r.durationMs ?? "?"}ms${flag}`,
      );
    }
  }
  if (report.sessionIds.length) lines.push(`sessions: ${report.sessionIds.join(", ")}`);
  for (const w of report.warnings) lines.push(`⚠ ${w}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Node helpers (require node:fs / node:path)
// ─────────────────────────────────────────────────────────────────────────────

/** Analyze a single `.jsonl` file path. (Node only.) */
export async function analyzeJsonlFile(filePath: string, options?: CostOptions): Promise<SessionCostReport> {
  const { readFileSync } = await import("node:fs");
  return analyzeEvents(parseJsonl(readFileSync(filePath, "utf-8")), options);
}

/**
 * Analyze a session directory, auto-discovering the relevant logs. (Node only.)
 * Reads, when present and de-duplicated:
 *   - any `*-events.jsonl` / `events.jsonl` at the top level (an exported SDK stream)
 *   - `<dir>/**\/.copilot/session-state/<id>/events.jsonl` (the canonical logs)
 *   - a directly-passed `.jsonl` file
 * It concatenates their events and calls `analyzeEvents` once (safe — see the
 * module header: shutdown summaries don't double-count per-call credits).
 */
export async function analyzeCopilotSession(pathOrDir: string, options?: CostOptions): Promise<SessionCostReport> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const stat = fs.statSync(pathOrDir);
  const files: string[] = [];

  if (stat.isFile()) {
    files.push(pathOrDir);
  } else {
    // Collect any exported SDK stream(s) + a top-level canonical events.jsonl.
    for (const entry of fs.readdirSync(pathOrDir)) {
      if (entry.endsWith("-events.jsonl") || entry === "events.jsonl") files.push(path.join(pathOrDir, entry));
    }
    // Walk for canonical session-state events.jsonl.
    walkForSessionState(fs, path, pathOrDir, files);
  }

  // De-duplicate file paths.
  const unique = [...new Set(files.map((f) => path.resolve(f)))];
  const allEvents: CopilotEvent[] = [];
  const seenEventIds = new Set<string>();
  for (const f of unique) {
    let text: string;
    try {
      text = fs.readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    for (const ev of parseJsonl(text)) {
      // Guard against the same event appearing in two copied files.
      const id = typeof ev.id === "string" ? ev.id : "";
      if (id && seenEventIds.has(id)) continue;
      if (id) seenEventIds.add(id);
      allEvents.push(ev);
    }
  }
  const report = analyzeEvents(allEvents, options);
  if (unique.length === 0) report.warnings.push(`No event logs found under ${pathOrDir}.`);
  return report;
}

function walkForSessionState(
  fs: typeof import("node:fs"),
  path: typeof import("node:path"),
  dir: string,
  out: string[],
  depth = 0,
): void {
  if (depth > 8) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.name === "session-state") {
      // session-state/<sessionId>/events.jsonl
      for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
        if (sub.isDirectory()) {
          const ev = path.join(full, sub.name, "events.jsonl");
          if (fs.existsSync(ev)) out.push(ev);
        }
      }
    } else if (e.name !== "node_modules" && e.name !== ".git") {
      walkForSessionState(fs, path, full, out, depth + 1);
    }
  }
}
