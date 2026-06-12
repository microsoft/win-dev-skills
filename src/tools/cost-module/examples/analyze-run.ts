/**
 * Example: analyze the cost of a recorded Copilot session and print a report.
 *
 * Run (Node >= 22):  node --experimental-strip-types examples/analyze-run.ts
 * Or with tsx:       npx tsx examples/analyze-run.ts
 *
 * It points at a checked-in sample session (here, a benchmark trial):
 *   agent-benchmark/results/run1/calc_subagent-cost-test_o46_i1/session-logs-dir
 */
import { analyzeCopilotSession, formatReport } from "../src/copilot-cost.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const trialDir = resolve(
  here,
  "../../results/run1/calc_subagent-cost-test_o46_i1/session-logs-dir",
);

const report = await analyzeCopilotSession(trialDir);

console.log(formatReport(report));
console.log("\n--- machine-readable ---\n");
console.log(
  JSON.stringify(
    {
      main: {
        inputTokens: report.main.inputTokens,
        outputTokens: report.main.outputTokens,
        cachedTokens: report.main.cachedTokens,
        aiCreditCost: report.main.aiCreditCost,
      },
      subAgents: report.subAgents.map((s) => ({
        agentName: s.agentName,
        model: s.model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cachedTokens: s.cachedTokens,
        aiCreditCost: s.aiCreditCost,
      })),
      total: {
        inputTokens: report.total.inputTokens,
        outputTokens: report.total.outputTokens,
        cachedTokens: report.total.cachedTokens,
        aiCreditCost: report.total.aiCreditCost,
      },
      premiumRequests: report.premiumRequests,
    },
    null,
    2,
  ),
);
