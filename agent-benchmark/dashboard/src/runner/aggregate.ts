import type { RunEntry } from "../types.js";
import { parseTokenString } from "../components/scatter-plot.js";
import { estimatePrice, type PriceEstimate } from "./pricing.js";

export interface AggregatedEntry {
  scenario: string;
  condition: string;
  model: string;
  avgScore: number;
  minScore: number;
  maxScore: number;
  iterations: number;
  completed: number;
  buildRate: number;
  runRate: number;
  avgSessionTime?: string;
  avgTokens?: number;
  avgInputTokens?: string;
  avgOutputTokens?: string;
  avgCachedTokens?: string;
  avgPrice?: PriceEstimate;
  entries: RunEntry[];
}

/**
 * Aggregate iterations into averaged entries.
 * If entries have no iterations (totalIterations <= 1), they pass through as-is.
 */
export function aggregateEntries(entries: RunEntry[]): AggregatedEntry[] {
  const completed = entries.filter((e) =>
    ["done", "failed", "timeout"].includes(e.status)
  );

  // Group by scenario + base condition (strip [1/2] suffix) + model
  const groups = new Map<string, RunEntry[]>();
  for (const entry of completed) {
    const baseCondition = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "");
    const key = `${entry.scenario}|${baseCondition}|${entry.model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  const result: AggregatedEntry[] = [];
  for (const [, group] of groups) {
    const withScores = group.filter((e) => e.score != null);
    const scores = withScores.map((e) => e.score!);
    const baseCondition = group[0].condition.replace(/\s*\[\d+\/\d+\]$/, "");

    const tokens = withScores
      .map((e) => parseTokenString(e.inputTokens || "0"))
      .filter((t) => t > 0);

    // Compute average price across iterations
    const prices = withScores
      .filter((e) => e.inputTokens)
      .map((e) => estimatePrice(e.model, e.inputTokens || "0", e.outputTokens || "0", e.cachedTokens || "0"));
    const avgPrice = prices.length > 0
      ? {
          inputCost: prices.reduce((s, p) => s + p.inputCost, 0) / prices.length,
          cachedCost: prices.reduce((s, p) => s + p.cachedCost, 0) / prices.length,
          outputCost: prices.reduce((s, p) => s + p.outputCost, 0) / prices.length,
          totalCost: prices.reduce((s, p) => s + p.totalCost, 0) / prices.length,
          formatted: (() => {
            const avg = prices.reduce((s, p) => s + p.totalCost, 0) / prices.length;
            return avg < 0.01 ? "<$0.01" : `$${avg.toFixed(2)}`;
          })(),
        }
      : undefined;

    // Average token strings for display
    const avgIn = tokens.length > 0 ? formatTokenCount(tokens.reduce((a, b) => a + b, 0) / tokens.length) : undefined;
    const outTokens = withScores.map((e) => parseTokenString(e.outputTokens || "0")).filter((t) => t > 0);
    const avgOut = outTokens.length > 0 ? formatTokenCount(outTokens.reduce((a, b) => a + b, 0) / outTokens.length) : undefined;
    const cacheTokens = withScores.map((e) => parseTokenString(e.cachedTokens || "0")).filter((t) => t > 0);
    const avgCache = cacheTokens.length > 0 ? formatTokenCount(cacheTokens.reduce((a, b) => a + b, 0) / cacheTokens.length) : undefined;

    // Average session time
    const sessionTimes = withScores
      .filter((e) => e.sessionTime)
      .map((e) => e.sessionTime!);
    const avgSession = sessionTimes.length > 0 ? sessionTimes[Math.floor(sessionTimes.length / 2)] : undefined;

    result.push({
      scenario: group[0].scenario,
      condition: baseCondition,
      model: group[0].model,
      avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      iterations: group.length,
      completed: withScores.length,
      buildRate: group.filter((e) => e.builds).length / group.length,
      runRate: group.filter((e) => e.runs).length / group.length,
      avgTokens: tokens.length > 0 ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : undefined,
      avgInputTokens: avgIn,
      avgOutputTokens: avgOut,
      avgCachedTokens: avgCache,
      avgPrice,
      avgSessionTime: avgSession,
      entries: group,
    });
  }

  return result.sort((a, b) => {
    if (a.scenario !== b.scenario) return a.scenario.localeCompare(b.scenario);
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    return b.avgScore - a.avgScore;
  });
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
