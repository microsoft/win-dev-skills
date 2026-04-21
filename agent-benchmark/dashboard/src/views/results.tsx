import React from "react";
import { Box, Text } from "ink";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { RunEntry } from "../types.js";
import { aggregateEntries } from "../runner/aggregate.js";
import { getGrade } from "../components/grades.js";
import { parseTokenString } from "../components/scatter-plot.js";

interface SummaryData {
  rankings?: Array<{ condition: string; avg_score: number; avg_time_minutes: number; summary: string }>;
  recommendations?: string[];
  overall_summary?: string;
}

interface Props {
  entries: RunEntry[];
  runDir?: string;
  cursorIndex?: number;
  onCursorClamp?: (maxIndex: number) => void;
}

export function ResultsView({ entries, runDir, cursorIndex = 0, onCursorClamp }: Props) {
  const aggregated = aggregateEntries(entries);

  // Clamp cursor if it exceeds available rows
  const maxIdx = Math.max(0, aggregated.length - 1);
  if (cursorIndex > maxIdx && onCursorClamp) {
    onCursorClamp(maxIdx);
  }
  const cursor = Math.min(cursorIndex, maxIdx);

  if (aggregated.length === 0) {
    return (
      <Box padding={1}>
        <Text color="gray">No completed results yet.</Text>
      </Box>
    );
  }

  const hasIterations = aggregated.some((a) => a.iterations > 1);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text color="cyan" bold>RESULTS COMPARISON{hasIterations ? " (averaged)" : ""}</Text>
        <Text color="gray">↑↓ navigate  |  O: open folder</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          {"  "}{pad("Scenario", 26)} {pad("AgentSetup", 22)} {pad("Model", 12)} {pad("Grade", 6)} {pad("Score", 10)} {pad("Time", 10)} {pad("Tokens (main+subs)", 20)} {pad("Cached Tokens", 18)} {pad("Price", 8)} {pad("PremiumReq", 11)} {pad("Build", 6)} {pad("Run", 5)}
        </Text>
        <Text color="gray">{"  "}{"─".repeat(153)}</Text>
        {aggregated.map((agg, i) => {
          const shortModel = agg.model.replace("claude-", "");
          const scoreStr = agg.iterations > 1
            ? `${agg.avgScore} (${agg.minScore}-${agg.maxScore})`
            : String(agg.avgScore);
          const grade = getGrade(agg.avgScore);
          const buildRate = `${Math.round(agg.buildRate * 100)}%`;
          const runRate = `${Math.round(agg.runRate * 100)}%`;

          // Tokens: main + subs
          const mainTok = agg.avgInputTokens || "—";
          const subTok = agg.avgSubAgentInputTokens;
          const tokensStr = subTok ? `${mainTok} + ${subTok}` : mainTok;

          // Cached: main cached (%) + sub cached (%)
          const mainCachedNum = parseTokenString(agg.avgCachedTokens || "0");
          const mainInputNum = parseTokenString(agg.avgInputTokens || "0");
          const mainCacheStr = mainInputNum > 0 && mainCachedNum > 0
            ? `${agg.avgCachedTokens} (${(mainCachedNum / mainInputNum * 100).toFixed(2)}%)`
            : "—";

          // Sub-agent numbers for detail row
          const subInputNum = parseTokenString(agg.avgSubAgentInputTokens || "0");
          const subCachedNum = parseTokenString(agg.avgSubAgentCachedTokens || "0");

          const price = agg.avgPrice?.formatted || "—";
          const time = agg.avgSessionTime || "—";
          const pr = agg.avgPremiumRequests != null ? String(agg.avgPremiumRequests) : "—";

          const isCursor = i === cursor;
          const prefix = isCursor ? "▶ " : "  ";

          return (
            <Box key={i} flexDirection="column">
              <Text color={grade.color} bold={isCursor}>
                {prefix}{pad(agg.scenario, 26)} {pad(agg.condition, 22)} {pad(shortModel, 12)} {pad(grade.letter, 6)} {pad(scoreStr, 10)} {pad(time, 10)} {pad(tokensStr, 20)} {pad(mainCacheStr, 18)} {pad(price, 8)} {pad(pr, 11)} {pad(buildRate, 6)} {pad(runRate, 5)}
              </Text>
              {isCursor && (
                <Box flexDirection="column">
                  <Text color="gray">
                    {"     "}↳ Main: {mainTok} in, {agg.avgCachedTokens || "0"} cached ({mainInputNum > 0 ? (mainCachedNum / mainInputNum * 100).toFixed(1) : "0"}%)
                    {subInputNum > 0
                      ? `  |  Sub agents (${agg.avgSubAgentCount || 0}): ${agg.avgSubAgentInputTokens} total${subCachedNum > 0 ? `, ${agg.avgSubAgentCachedTokens} cached (${(subCachedNum / subInputNum * 100).toFixed(1)}%)` : ""}`
                      : "  |  Sub agents: none"
                    }
                    {`  |  Premium requests count: ${pr}`}
                  </Text>
                  {(() => {
                    // Show per-sub-agent details from first entry in the group
                    const details = agg.entries[0]?.subAgentDetails;
                    if (!details || details.length === 0) return null;
                    return details.map((sub, j) => (
                      <Text key={j} color="gray">
                        {"       "}- {sub.name}: {sub.totalTokens >= 1000 ? `${(sub.totalTokens / 1000).toFixed(1)}k` : sub.totalTokens} tokens, {sub.durationMs >= 60000 ? `${(sub.durationMs / 60000).toFixed(1)}m` : `${(sub.durationMs / 1000).toFixed(0)}s`}
                      </Text>
                    ));
                  })()}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box paddingX={2} marginTop={1}>
        <Text color="gray" dimColor>* Price is an estimate based on Anthropic direct API rates (not actual Copilot billing). Assumes 1-hour cache writes at 2× base rate.</Text>
      </Box>
      <SummarySection runDir={runDir} />
    </Box>
  );
}

function SummarySection({ runDir }: { runDir?: string }) {
  if (!runDir) return null;
  const summaryPath = join(runDir, "summary.json");
  if (!existsSync(summaryPath)) return null;

  let summary: SummaryData;
  try {
    summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
  } catch {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="single" borderColor="green" paddingX={1}>
        <Text color="green" bold>SUMMARY ANALYSIS</Text>
      </Box>
      {summary.overall_summary && (
        <Box marginTop={1} paddingX={2}>
          <Text color="white" bold>{summary.overall_summary}</Text>
        </Box>
      )}
      {summary.rankings && summary.rankings.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={2}>
          <Text color="cyan" bold>Rankings:</Text>
          {summary.rankings.map((r, i) => (
            <Text key={i} color="gray">
              {"  "}{i + 1}. {pad(r.condition, 28)} avg {String(r.avg_score ?? "—")}/100  ({r.avg_time_minutes ?? "—"}min)  {r.summary || ""}
            </Text>
          ))}
        </Box>
      )}
      {summary.recommendations && summary.recommendations.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={2}>
          <Text color="yellow" bold>Recommendations:</Text>
          {summary.recommendations.map((rec, i) => (
            <Text key={i} color="gray">{"  "}• {rec}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}
