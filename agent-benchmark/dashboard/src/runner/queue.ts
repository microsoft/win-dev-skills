import type { RunEntry } from "../types.js";
import { runBenchmark, runSummaryAnalysis, ensureDebugTools, type BenchmarkCallbacks } from "./benchmark.js";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

export interface QueueOptions {
  maxBuildMinutes: number;
  maxContinues: number;
  concurrency: number;
}

export interface QueueCallbacks {
  onOutput: (entryId: string, data: string) => void;
  onStatusChange: (entry: RunEntry) => void;
}

export class BenchmarkQueue {
  private entries: RunEntry[];
  private runDir: string;
  private options: QueueOptions;
  private callbacks: QueueCallbacks;
  private _running = false;

  constructor(
    entries: RunEntry[],
    runDir: string,
    options: QueueOptions,
    callbacks: QueueCallbacks
  ) {
    this.entries = entries;
    this.runDir = runDir;
    this.options = options;
    this.callbacks = callbacks;
  }

  get progress(): { current: number; total: number } {
    const completed = this.entries.filter((e) =>
      ["done", "failed", "timeout"].includes(e.status)
    ).length;
    return { current: completed, total: this.entries.length };
  }

  get isRunning(): boolean {
    return this._running;
  }

  async start(): Promise<void> {
    this._running = true;

    // One-time setup: ensure crash diagnostic tools are available
    await ensureDebugTools((msg) => {
      // Broadcast to first entry's output for visibility
      if (this.entries.length > 0) {
        this.callbacks.onOutput(this.entries[0].id, msg + "\n");
      }
    });

    const concurrency = this.options.concurrency;
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      while (nextIndex < this.entries.length && this._running) {
        const i = nextIndex++;
        const entry = this.entries[i];
        entry.currentOutput = "";
        this.callbacks.onOutput(entry.id, `\n${"═".repeat(60)}\n`);
        try {
          await runBenchmark(entry, this.runDir, this.options, {
            onOutput: (data) => this.callbacks.onOutput(entry.id, data),
            onStatusChange: this.callbacks.onStatusChange,
          });
        } catch (err) {
          entry.status = "failed";
          entry.failReason = String(err);
          this.callbacks.onStatusChange(entry);
        }
      }
    };

    // Launch N workers
    const workers = Array.from({ length: Math.min(concurrency, this.entries.length) }, () => runNext());
    await Promise.all(workers);

    // Aggregate iterations if multiple
    if (this._running) {
      this.aggregateIterations();
    }

    // Run summary analysis
    if (this._running) {
      this.callbacks.onOutput("__summary__", "\n");
      try {
        await runSummaryAnalysis(this.entries, this.runDir, (data) =>
          this.callbacks.onOutput("__summary__", data)
        );
      } catch {
        // Summary is optional
      }
    }
    this._running = false;
  }

  private aggregateIterations(): void {
    // Group entries by scenario + base condition + model
    const groups = new Map<string, RunEntry[]>();
    for (const entry of this.entries) {
      if ((entry.totalIterations ?? 1) <= 1) continue;
      // Strip iteration label from condition for grouping
      const baseCondition = entry.condition.replace(/\s*\[\d+\/\d+\]$/, "");
      const key = `${entry.scenarioConfigName}|${baseCondition}|${entry.model}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    for (const [key, entries] of groups) {
      const completed = entries.filter(
        (e) => e.status === "done" && e.score != null
      );
      if (completed.length === 0) continue;

      const [scenarioName, baseCondition, model] = key.split("|");
      const avgScore = Math.round(
        completed.reduce((sum, e) => sum + (e.score ?? 0), 0) / completed.length
      );
      const scores = completed.map((e) => e.score ?? 0);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      const buildRate = completed.filter((e) => e.builds).length / completed.length;
      const runRate = completed.filter((e) => e.runs).length / completed.length;

      // Write aggregated results.json at the run dir level
      const aggregatedPath = join(this.runDir, `${baseCondition}-${model.replace(/[^a-zA-Z0-9.\-]/g, "")}-aggregated.json`);

      const aggregated = {
        scenario: scenarioName,
        condition: baseCondition,
        model,
        iterations: entries.length,
        completed: completed.length,
        aggregated: {
          avg_score: avgScore,
          min_score: minScore,
          max_score: maxScore,
          scores,
          build_rate: `${Math.round(buildRate * 100)}%`,
          run_rate: `${Math.round(runRate * 100)}%`,
        },
        iteration_results: completed.map((e) => ({
          iteration: e.iteration,
          score: e.score,
          builds: e.builds,
          runs: e.runs,
          session_time: e.sessionTime,
          build_session_id: e.buildSessionId,
          validation_session_id: e.validationSessionId,
        })),
      };

      try {
        writeFileSync(
          aggregatedPath,
          JSON.stringify(aggregated, null, 2)
        );
      } catch {
        // Parent dir might not exist if all iterations failed early
      }
    }
  }

  stop(): void {
    this._running = false;
  }
}
