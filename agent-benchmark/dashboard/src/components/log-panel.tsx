import React, { useMemo } from "react";
import { Box, Text } from "ink";

interface Props {
  output: string;
  maxLines?: number;
  scrollOffset?: number;
}

export function LogPanel({ output, maxLines = 30, scrollOffset = 0 }: Props) {
  const lines = useMemo(() => {
    const allLines = output.split("\n");
    if (scrollOffset > 0) {
      // Scrolled up — show a window ending at (total - scrollOffset)
      const end = Math.max(0, allLines.length - scrollOffset);
      const start = Math.max(0, end - maxLines);
      return allLines.slice(start, end);
    }
    // Default: show the last maxLines (auto-follow)
    return allLines.slice(-maxLines);
  }, [output, maxLines, scrollOffset]);

  const allLineCount = output.split("\n").length;
  const isAtBottom = scrollOffset === 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {!isAtBottom && (
        <Text color="gray" dimColor>  ↑ {scrollOffset} lines above — press End to jump to bottom</Text>
      )}
      {lines.map((line, i) => (
        <Text key={i} wrap="wrap">{line}</Text>
      ))}
      {!isAtBottom && (
        <Text color="gray" dimColor>  ── scrolled ({allLineCount - scrollOffset}/{allLineCount} lines) ──</Text>
      )}
    </Box>
  );
}
