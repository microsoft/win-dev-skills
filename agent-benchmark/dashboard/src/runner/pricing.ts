import { parseTokenString } from "../components/scatter-plot.js";

// Pricing per million tokens (USD)
const PRICING: Record<string, { input: number; cached: number; output: number }> = {
  "claude-opus-4.6":   { input: 5,  cached: 0.50, output: 25 },
  "claude-opus-4.5":   { input: 5,  cached: 0.50, output: 25 },
  "claude-sonnet-4.5": { input: 3,  cached: 0.30, output: 15 },
  "claude-sonnet-4.6": { input: 3,  cached: 0.30, output: 15 },
  "claude-sonnet-4":   { input: 3,  cached: 0.30, output: 15 },
  "claude-haiku-4.5":  { input: 1,  cached: 0.10, output: 5  },
};

export interface PriceEstimate {
  inputCost: number;
  cachedCost: number;
  outputCost: number;
  totalCost: number;
  formatted: string;
}

export function estimatePrice(
  model: string,
  inputTokens: string,
  outputTokens: string,
  cachedTokens: string
): PriceEstimate {
  const pricing = PRICING[model] || PRICING["claude-sonnet-4.5"];
  const inTok = parseTokenString(inputTokens) / 1_000_000;
  const outTok = parseTokenString(outputTokens) / 1_000_000;
  const cacheTok = parseTokenString(cachedTokens) / 1_000_000;

  // Input cost: uncached tokens are cache writes (2× base price, assuming 1-hour cache)
  const uncachedIn = Math.max(0, inTok - cacheTok);
  const inputCost = uncachedIn * pricing.input * 2;
  const cachedCost = cacheTok * pricing.cached;
  const outputCost = outTok * pricing.output;
  const totalCost = inputCost + cachedCost + outputCost;

  return {
    inputCost,
    cachedCost,
    outputCost,
    totalCost,
    formatted: totalCost < 0.01 ? "<$0.01" : `$${totalCost.toFixed(2)}`,
  };
}

export function formatTokens(s: string): string {
  if (!s) return "—";
  return s;
}
