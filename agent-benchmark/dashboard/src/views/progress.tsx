import React from "react";
import { Box, Text } from "ink";
import type { RunEntry } from "../types.js";
import { getGrade } from "../components/grades.js";

interface Props {
  entries: RunEntry[];
  runName: string;
  elapsed: string;
}

export function ProgressView({ entries, runName, elapsed }: Props) {
  const completed = entries.filter(e => ["done", "failed", "timeout"].includes(e.status)).length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magenta" bold>
          RUN: {runName}  |  Progress: {completed}/{entries.length}  |  Elapsed: {elapsed}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          {"  "}{pad("Scenario", 28)} {pad("Condition", 24)} {pad("Model", 14)} Status
        </Text>
        <Text color="gray">
          {"  "}{"─".repeat(90)}
        </Text>
        {entries.map((entry, i) => {
          const shortModel = entry.model.replace("claude-", "");
          const { text: statusText, color } = getStatusDisplay(entry);
          return (
            <Text key={i} color={color}>
              {"  "}{pad(entry.scenario, 28)} {pad(entry.condition, 24)} {pad(shortModel, 14)} {statusText}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function getStatusDisplay(entry: RunEntry): { text: string; color: string } {
  switch (entry.status) {
    case "queued": return { text: "⏳ Queued", color: "gray" };
    case "setup": return { text: `🔧 Setup... ${runElapsed(entry)}`, color: "cyan" };
    case "building": return { text: `🔄 Building... ${runElapsed(entry)}`, color: "cyan" };
    case "build_done": return { text: `📦 Built ${runElapsed(entry)}`, color: "cyan" };
    case "dotnet_build": return { text: `🔨 Compiling... ${runElapsed(entry)}`, color: "cyan" };
    case "launching": return { text: `🚀 Launching... ${runElapsed(entry)}`, color: "cyan" };
    case "validating": return { text: `🔍 Validating... ${runElapsed(entry)}`, color: "cyan" };
    case "retrospective": return { text: `📝 Retrospective... ${runElapsed(entry)}`, color: "cyan" };
    case "done": {
      const score = entry.score != null ? `${entry.score}/100` : "—";
      const grade = entry.score != null ? getGrade(entry.score) : { letter: "—", color: "gray" };
      const time = entry.finishedAt && entry.startedAt
        ? formatElapsed(entry.finishedAt.getTime() - entry.startedAt.getTime())
        : entry.sessionTime || "—";
      const tokens = entry.inputTokens || "";
      return { text: `${grade.letter} ${score} (${time}${tokens ? ", " + tokens : ""})`, color: grade.color };
    }
    case "failed": {
      const time = runElapsed(entry);
      return { text: `❌ ${entry.failReason || "Failed"} (${time})`, color: "red" };
    }
    case "timeout": return { text: `⏰ Timeout (${runElapsed(entry)})`, color: "red" };
    default: return { text: entry.status, color: "white" };
  }
}

function runElapsed(entry: RunEntry): string {
  if (!entry.startedAt) return "";
  const end = entry.finishedAt || new Date();
  return formatElapsed(end.getTime() - entry.startedAt.getTime());
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
