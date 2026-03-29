import React from "react";
import { Box, Text } from "ink";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { RunEntry } from "../types.js";
import { aggregateEntries } from "../runner/aggregate.js";
import { getGrade } from "../components/grades.js";

interface SummaryData {
  rankings?: Array<{ condition: string; avg_score: number; avg_time_minutes: number; summary: string }>;
  recommendations?: string[];
  overall_summary?: string;
}

interface Props {
  entries: RunEntry[];
  runDir?: string;
}

export function ResultsView({ entries, runDir }: Props) {
  const aggregated = aggregateEntries(entries);

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
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>RESULTS COMPARISON{hasIterations ? " (averaged)" : ""}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          {"  "}{pad("Scenario", 26)} {pad("Condition", 22)} {pad("Model", 12)} {pad("Grade", 6)} {pad("Score", 10)} {pad("Tokens", 8)} {pad("Price", 8)} {pad("Build", 6)} {pad("Run", 5)}
        </Text>
        <Text color="gray">{"  "}{"─".repeat(108)}</Text>
        {aggregated.map((agg, i) => {
          const shortModel = agg.model.replace("claude-", "");
          const scoreStr = agg.iterations > 1
            ? `${agg.avgScore} (${agg.minScore}-${agg.maxScore})`
            : String(agg.avgScore);
          const grade = getGrade(agg.avgScore);
          const buildRate = `${Math.round(agg.buildRate * 100)}%`;
          const runRate = `${Math.round(agg.runRate * 100)}%`;
          const tokens = agg.avgInputTokens || "—";
          const price = agg.avgPrice?.formatted || "—";

          return (
            <Text key={i} color={grade.color}>
              {"  "}{pad(agg.scenario, 26)} {pad(agg.condition, 22)} {pad(shortModel, 12)} {pad(grade.letter, 6)} {pad(scoreStr, 10)} {pad(tokens, 8)} {pad(price, 8)} {pad(buildRate, 6)} {pad(runRate, 5)}
            </Text>
          );
        })}
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
