import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { RunEntry } from "../types.js";
import { getGrade } from "../components/grades.js";

interface Props {
  entries: RunEntry[];
  runName: string;
  elapsed: string;
  onRerun?: (entryIds: string[]) => void;
  onRevalidate?: (entryIds: string[]) => void;
}

export function ProgressView({ entries, runName, elapsed, onRerun, onRevalidate }: Props) {
  const completed = entries.filter(e => ["done", "failed", "timeout"].includes(e.status)).length;
  const allDone = completed === entries.length && entries.length > 0;
  const [selectedForRerun, setSelectedForRerun] = useState<Set<string>>(new Set());
  const [cursorIndex, setCursorIndex] = useState(0);

  useInput((input, key) => {
    if (!allDone) return; // Only allow selection when all runs are done

    if (key.upArrow) {
      setCursorIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setCursorIndex(i => Math.min(entries.length - 1, i + 1));
    } else if (input === " ") {
      // Toggle selection
      setSelectedForRerun(prev => {
        const next = new Set(prev);
        const id = entries[cursorIndex]?.id;
        if (id) next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (input === "r" || input === "R") {
      if (selectedForRerun.size > 0 && onRerun) {
        onRerun([...selectedForRerun]);
        setSelectedForRerun(new Set());
      }
    } else if (input === "v" || input === "V") {
      if (selectedForRerun.size > 0 && onRevalidate) {
        onRevalidate([...selectedForRerun]);
        setSelectedForRerun(new Set());
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" borderColor="magenta" paddingX={1} flexDirection="column">
        <Text color="magenta" bold>
          RUN: {runName}  |  Progress: {completed}/{entries.length}  |  Elapsed: {elapsed}
        </Text>
        {allDone && onRerun && (
          <Text color="gray">
            ↑↓ navigate  |  Space: toggle  |  R: rerun  |  V: revalidate only ({selectedForRerun.size})
          </Text>
        )}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray">
          {"  "}{pad("Scenario", 22)} {pad("Condition", 32)} {pad("Model", 12)} Status
        </Text>
        <Text color="gray">
          {"  "}{"─".repeat(100)}
        </Text>
        {entries.map((entry, i) => {
          const shortModel = entry.model.replace("claude-", "");
          const { text: statusText, color } = getStatusDisplay(entry);
          const isSelected = selectedForRerun.has(entry.id);
          const isCursor = allDone && i === cursorIndex;
          const prefix = isCursor ? (isSelected ? "✓▶" : " ▶") : (isSelected ? "✓ " : "  ");
          const lineNum = String(i + 1).padStart(2);
          return (
            <Text key={entry.id} color={isSelected ? "yellow" : color} bold={isCursor}>
              {prefix}{lineNum}. {pad(entry.scenario, 20)} {pad(entry.condition, 32)} {pad(shortModel, 12)} {statusText}
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
      const breakdown = entry.qualityBreakdown ? ` (${entry.qualityBreakdown})` : "";
      const score = entry.score != null ? `${entry.score}/100${breakdown}` : "—";
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
