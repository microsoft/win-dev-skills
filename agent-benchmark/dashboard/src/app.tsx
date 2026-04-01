import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { exec } from "child_process";
import { StatusBar } from "./components/status-bar.js";
import { SetupView, type SetupResult } from "./views/setup.js";
import { LiveView } from "./views/live.js";
import { ProgressView } from "./views/progress.js";
import { ResultsView } from "./views/results.js";
import { ChartsView } from "./views/charts.js";
import { SummaryView } from "./views/summary.js";
import { BenchmarkQueue } from "./runner/queue.js";
import { revalidateBenchmark } from "./runner/benchmark.js";
import { generateHtmlReport } from "./runner/report.js";
import { getNextRunName, resultsRoot, loadRunFromDisk } from "./runner/config.js";
import type { RunEntry, ViewName } from "./types.js";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface Props {
  showResultsOnly?: boolean;
  runName?: string;
  maxBuildMinutes?: number;
  concurrency?: number;
}

export function App({ showResultsOnly, runName: initialRunName, maxBuildMinutes = 60, concurrency = 3 }: Props) {
  const { exit } = useApp();
  const [view, setView] = useState<ViewName>(showResultsOnly ? "results" : "setup");
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const [runName, setRunName] = useState(initialRunName || "");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("00:00:00");
  const queueRef = useRef<BenchmarkQueue | null>(null);

  // Per-run output storage
  const outputMapRef = useRef<Map<string, string>>(new Map());

  // Set initial terminal title
  useEffect(() => {
    process.stdout.write(`\x1b]0;Benchmark Dashboard\x07`);
  }, []);
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  // Counter to force re-renders when output changes
  const [outputVersion, setOutputVersion] = useState(0);

  // Update elapsed timer and terminal title
  useEffect(() => {
    if (!startTime) return;
    const timer = setInterval(() => {
      const diff = Date.now() - startTime.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      setElapsed(timeStr);

      // Update terminal title + Windows Terminal progress ring
      const completed = entries.filter(e => ["done", "failed", "timeout"].includes(e.status)).length;
      const active = entries.find(e => !["queued", "done", "failed", "timeout"].includes(e.status));
      const total = entries.length;

      let title: string;
      if (completed === total && total > 0) {
        title = `✅ Benchmark [${completed}/${total}] ${timeStr}`;
        // Clear progress ring
        process.stdout.write(`\x1b]9;4;0;0\x07`);
      } else if (active) {
        const runElapsed = active.startedAt
          ? `${Math.floor((Date.now() - active.startedAt.getTime()) / 60000)}m`
          : "";
        title = `Benchmark [${completed}/${total}] ${runElapsed ? runElapsed + " " : ""}— ${active.condition}`;
        // Set progress ring (indeterminate = state 3)
        process.stdout.write(`\x1b]9;4;3;0\x07`);
      } else {
        title = `Benchmark [${completed}/${total}] ${timeStr}`;
        process.stdout.write(`\x1b]9;4;3;0\x07`);
      }
      process.stdout.write(`\x1b]0;${title}\x07`);
    }, 1000);
    return () => {
      clearInterval(timer);
      // Clear progress ring on unmount
      process.stdout.write(`\x1b]9;4;0;0\x07`);
    };
  }, [startTime, entries]);

  // Track which run is currently active (for auto-follow)
  const activeRunIndex = entries.findIndex(e =>
    !["queued", "done", "failed", "timeout"].includes(e.status)
  );

  // Keyboard navigation
  useInput((input, key) => {
    // View switching (reset scroll when changing views)
    if (input === "1") { setView("live"); setScrollOffset(0); }
    else if (input === "2") { setView("progress"); setScrollOffset(0); }
    else if (input === "3") { setView("results"); setScrollOffset(0); }
    else if (input === "4") { setView("charts"); setScrollOffset(0); }
    else if (input === "5") { setView("summary"); setScrollOffset(0); }
    else if (input === "q") exit();
    else if (key.tab) {
      const views: ViewName[] = ["live", "progress", "results", "charts", "summary"];
      const idx = views.indexOf(view);
      setView(views[(idx + 1) % views.length]);
      setScrollOffset(0);
    }

    // Scroll with ↑↓ (works in all views EXCEPT progress when done — progress uses ↑↓ for rerun selection)
    const allDone = entries.length > 0 && entries.every(e => ["done", "failed", "timeout"].includes(e.status));
    const progressUsesArrows = view === "progress" && allDone;

    if (!progressUsesArrows) {
      if (key.upArrow) {
        setScrollOffset(prev => prev + 3);
      } else if (key.downArrow) {
        setScrollOffset(prev => Math.max(0, prev - 3));
      }
    }
    if (key.pageUp || input === "[") {
      const pageSize = (process.stdout.rows || 30) - 8;
      setScrollOffset(prev => prev + pageSize);
    } else if (key.pageDown || input === "]") {
      const pageSize = (process.stdout.rows || 30) - 8;
      setScrollOffset(prev => Math.max(0, prev - pageSize));
    } else if (input === "e") {
      setScrollOffset(0);
    }

    // Live view specific: run selection with ←→
    if (view === "live" && entries.length > 0) {
      if (key.leftArrow) {
        setSelectedRunIndex(prev => Math.max(0, prev - 1));
        setScrollOffset(0);
      } else if (key.rightArrow) {
        setSelectedRunIndex(prev => Math.min(entries.length - 1, prev + 1));
        setScrollOffset(0);
      }
      // 'f' = follow active run
      else if (input === "f") {
        if (activeRunIndex >= 0) {
          setSelectedRunIndex(activeRunIndex);
          setScrollOffset(0);
        }
      }
      // 'o' = open trial folder in explorer
      else if (input === "o") {
        const selected = entries[selectedRunIndex];
        if (selected && runName) {
          // Try flat structure first (new), then nested (old runs)
          const flatFolder = join(resultsRoot, runName, selected.trialName);
          const nestedFolder = join(resultsRoot, runName, selected.scenarioConfigName, selected.trialName);
          const runFolder = join(resultsRoot, runName);
          const folderToOpen = existsSync(flatFolder) ? flatFolder
            : existsSync(nestedFolder) ? nestedFolder
            : runFolder;
          exec(`explorer "${folderToOpen}"`);
        } else if (runName) {
          exec(`explorer "${join(resultsRoot, runName)}"`);
        }
      }
    }

    // H = generate HTML report and open it
    if (input === "h" && runName) {
      const rd = join(resultsRoot, runName);
      const reportPath = generateHtmlReport(entries, rd);
      exec(`start "" "${reportPath}"`);
    }
  }, { isActive: !showResultsOnly });

  // Auto-follow: when a new run starts, select it (unless user has manually selected a different one)
  const prevActiveRef = useRef(-1);
  useEffect(() => {
    if (activeRunIndex >= 0 && activeRunIndex !== prevActiveRef.current) {
      prevActiveRef.current = activeRunIndex;
      setSelectedRunIndex(activeRunIndex);
      setScrollOffset(0);
    }
  }, [activeRunIndex]);

  const handleSetupComplete = useCallback((config: SetupResult) => {
    // Handle loaded run
    if (config.loadRunPath) {
      const loaded = loadRunFromDisk(config.loadRunPath);
      setRunName(loaded.runName);
      setEntries(loaded.entries);
      setStartTime(null);

      // Load session logs into output map for live view
      for (const entry of loaded.entries) {
        const trialDir = join(config.loadRunPath, entry.scenarioConfigName, entry.trialName);
        const logFile = join(trialDir, "session-log.txt");
        if (existsSync(logFile)) {
          try {
            const logContent = readFileSync(logFile, "utf-8");
            outputMapRef.current.set(entry.id, logContent);
          } catch {}
        }
      }

      setView("results");
      return;
    }

    const name = getNextRunName();
    setRunName(name);
    const runDir = join(resultsRoot, name);
    mkdirSync(runDir, { recursive: true });

    // Save run metadata for reference
    writeFileSync(join(runDir, "run-meta.json"), JSON.stringify({
      timestamp: new Date().toISOString(),
      scenarios: config.scenarios.map(s => s.name),
      conditions: config.conditions.map(c => c.name),
      models: config.models,
      concurrency: config.concurrency,
      iterations: config.iterations,
    }, null, 2));

    // Build the run matrix — interleave iterations so all variants run iter1 first,
    // then iter2, etc. This gives early comparison data across variants.
    const iters = config.iterations || 1;
    const newEntries: RunEntry[] = [];
    for (let iter = 1; iter <= iters; iter++) {
      for (const scenario of config.scenarios) {
        for (const cond of config.conditions) {
          for (const model of config.models) {
            // Short flat trial name — first-letter acronym + 2-char hash for uniqueness
            const scenAcronym = scenario.name.split("-").map(w => w[0]).join("");
            const scenHash = Array.from(scenario.name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
            const scenShort = `${scenAcronym}${Math.abs(scenHash % 100).toString().padStart(2, "0")}`;
            const condShort = cond.name.replace(/^candidate-/, "");
            const modelShort = model.replace("claude-", "").replace("sonnet-", "s").replace("opus-", "o").replace(".", "");
            const trialName = `${scenShort}_${condShort}_${modelShort}_i${iter}`;
            const iterLabel = iters > 1 ? ` [${iter}/${iters}]` : "";
            newEntries.push({
              id: `${scenario.name}-${cond.name}-${model}-iter${iter}`,
              scenario: scenario.name,
              scenarioPath: scenario.path,
              scenarioConfigName: scenario.name,
              condition: cond.name + iterLabel,
              conditionType: cond.type as "bare" | "starter" | "candidate",
              pluginPath: cond.pluginPath,
              model,
              trialName,
              iteration: iter,
              totalIterations: iters,
              status: "queued",
              currentOutput: "",
            });
          }
        }
      }
    }

    setEntries(newEntries);
    setStartTime(new Date());
    setView("live");

    // Start the queue
    const queue = new BenchmarkQueue(
      newEntries,
      runDir,
      { maxBuildMinutes, maxContinues: 50, concurrency: config.concurrency },
      {
        onOutput: (entryId, data) => {
          const prev = outputMapRef.current.get(entryId) || "";
          outputMapRef.current.set(entryId, prev + data);
          setOutputVersion(v => v + 1);
        },
        onStatusChange: (entry) => {
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...entry } : e));
        }
      }
    );
    queueRef.current = queue;
    queue.start();
  }, [maxBuildMinutes]);

  const handleRerun = useCallback((entryIds: string[]) => {
    const runDir = join(resultsRoot, runName);
    if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });

    // Reset selected entries to queued
    setEntries(prev => prev.map(e =>
      entryIds.includes(e.id)
        ? { ...e, status: "queued" as const, score: undefined, builds: undefined, runs: undefined,
            sessionTime: undefined, apiTime: undefined, inputTokens: undefined, outputTokens: undefined,
            cachedTokens: undefined, failReason: undefined, startedAt: undefined, finishedAt: undefined,
            currentOutput: "" }
        : e
    ));

    // Clear output for rerun entries
    for (const id of entryIds) {
      outputMapRef.current.set(id, "");
    }

    setStartTime(new Date());
    setView("live");

    // Get the actual entry objects for the queue
    const rerunEntries = entries.filter(e => entryIds.includes(e.id)).map(e => ({
      ...e, status: "queued" as const, score: undefined, builds: undefined, runs: undefined,
      sessionTime: undefined, apiTime: undefined, inputTokens: undefined, outputTokens: undefined,
      cachedTokens: undefined, failReason: undefined, startedAt: undefined, finishedAt: undefined,
      currentOutput: "",
    }));

    const queue = new BenchmarkQueue(
      rerunEntries,
      runDir,
      { maxBuildMinutes, maxContinues: 50, concurrency: 3 },
      {
        onOutput: (entryId, data) => {
          const prev = outputMapRef.current.get(entryId) || "";
          outputMapRef.current.set(entryId, prev + data);
          setOutputVersion(v => v + 1);
        },
        onStatusChange: (entry) => {
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...entry } : e));
        }
      }
    );
    queueRef.current = queue;
    queue.start();
  }, [entries, runName, maxBuildMinutes]);

  const handleRevalidate = useCallback(async (entryIds: string[]) => {
    const runDir = join(resultsRoot, runName);

    // Reset selected entries
    setEntries(prev => prev.map(e =>
      entryIds.includes(e.id)
        ? { ...e, status: "queued" as const, score: undefined, builds: undefined, runs: undefined,
            failReason: undefined, startedAt: undefined, finishedAt: undefined, currentOutput: "" }
        : e
    ));
    for (const id of entryIds) {
      outputMapRef.current.set(id, "");
    }
    setStartTime(new Date());
    setView("live");

    // Run revalidation sequentially for selected entries
    const revalEntries = entries.filter(e => entryIds.includes(e.id)).map(e => ({
      ...e, status: "queued" as const, score: undefined, builds: undefined, runs: undefined,
      failReason: undefined, startedAt: undefined, finishedAt: undefined, currentOutput: "",
    }));

    for (const entry of revalEntries) {
      await revalidateBenchmark(entry, runDir, {
        onOutput: (data) => {
          const prev = outputMapRef.current.get(entry.id) || "";
          outputMapRef.current.set(entry.id, prev + data);
          setOutputVersion(v => v + 1);
        },
        onStatusChange: (e) => {
          setEntries(prev => prev.map(p => p.id === e.id ? { ...e } : p));
        }
      });
    }
  }, [entries, runName]);

  // Get selected run and its output
  const selectedRun = entries[selectedRunIndex];
  const selectedOutput = selectedRun ? (outputMapRef.current.get(selectedRun.id) || "") : "";

  const currentRun = entries.find(e => !["queued", "done", "failed", "timeout"].includes(e.status));
  const progress = {
    current: entries.filter(e => ["done", "failed", "timeout"].includes(e.status)).length + 1,
    total: entries.length
  };

  if (view === "setup") {
    return <SetupView onComplete={handleSetupComplete} />;
  }

  return (
    <Box flexDirection="column" height={process.stdout.rows || 40}>
      <StatusBar
        currentRun={currentRun}
        progress={progress}
        elapsed={elapsed}
        activeView={view}
        runName={runName}
      />
      {view === "live" && (
        <LiveView
          selectedRun={selectedRun}
          output={selectedOutput}
          scrollOffset={scrollOffset}
          runIndex={selectedRunIndex}
          totalRuns={entries.length}
        />
      )}
      <Box flexDirection="column" overflow="hidden" flexGrow={1} marginTop={view !== "live" ? -scrollOffset : 0}>
        {view === "progress" && <ProgressView entries={entries} runName={runName} elapsed={elapsed} onRerun={handleRerun} onRevalidate={handleRevalidate} />}
        {view === "results" && <ResultsView entries={entries} runDir={runName ? join(resultsRoot, runName) : undefined} />}
        {view === "charts" && <ChartsView entries={entries} />}
        {view === "summary" && <SummaryView entries={entries} runDir={runName ? join(resultsRoot, runName) : undefined} />}
      </Box>
      <Box paddingX={1}>
        <Text color="gray">1-5 or Tab: views | ↑↓ scroll | F: follow | O: open folder | H: HTML report | Q: quit</Text>
      </Box>
    </Box>
  );
}
