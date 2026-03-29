import React from "react";
import { Box, Text } from "ink";
import { ScatterPlot, getConditionColor } from "../components/scatter-plot.js";
import type { RunEntry } from "../types.js";
import { aggregateEntries } from "../runner/aggregate.js";

interface Props {
  entries: RunEntry[];
}

export function ChartsView({ entries }: Props) {
  const aggregated = aggregateEntries(entries);

  if (aggregated.length === 0) {
    return (
      <Box padding={1}>
        <Text color="gray">No completed results to chart yet.</Text>
      </Box>
    );
  }

  // Group by scenario
  const scenarios = [...new Set(aggregated.map((a) => a.scenario))];

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        TOKEN USAGE vs SCORE{aggregated.some(a => a.iterations > 1) ? " (averaged)" : ""}
      </Text>
      <Text color="gray" dimColor>
        Each ● is a condition — higher and further left is better
      </Text>

      {scenarios.map((scenario) => {
        const scenarioAggs = aggregated.filter((a) => a.scenario === scenario);
        const data = scenarioAggs.map((a) => ({
          x: a.avgTokens || 0,
          y: a.avgScore,
          label: `${a.condition} (${a.model.replace("claude-", "")})${a.iterations > 1 ? ` avg ${a.iterations}x` : ""}`,
          color: getConditionColor(a.condition),
        }));

        return (
          <Box key={scenario} flexDirection="column" marginTop={1}>
            <ScatterPlot
              data={data}
              title={scenario}
              xLabel="Input Tokens"
              yLabel="Score"
              width={Math.min(80, process.stdout.columns || 80)}
              height={Math.min(18, Math.max(10, data.length + 5))}
            />
          </Box>
        );
      })}
    </Box>
  );
}
