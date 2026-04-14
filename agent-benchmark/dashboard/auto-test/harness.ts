/**
 * Test harness for the Benchmark Dashboard.
 *
 * Spawns the dashboard as a child process with a pseudo-TTY (via `conpty`
 * on Windows), sends keystrokes to stdin, and captures stdout frames.
 *
 * Usage:
 *   import { Dashboard } from "./harness.js";
 *   const dash = new Dashboard(["--results"]);  // CLI args
 *   await dash.start();
 *   await dash.waitForText("Benchmark Dashboard");
 *   dash.press("down");
 *   dash.press("enter");
 *   const frame = dash.lastFrame();
 *   dash.stop();
 */

import { spawn, ChildProcess } from "child_process";
import { join, resolve } from "path";
import { existsSync } from "fs";

const DASHBOARD_DIR = resolve(join(import.meta.dirname, ".."));
const TSX_BIN = join(DASHBOARD_DIR, "node_modules", ".bin", "tsx");
const TEST_ENTRY = join(import.meta.dirname, "test-entry.tsx");

// ANSI escape code stripper
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "") // OSC sequences
    .replace(/\x1b\[[\d;]*m/g, "");
}

// Key sequences (ANSI escape codes for arrow keys, etc.)
const KEY_MAP: Record<string, string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  enter: "\r",
  return: "\r",
  space: " ",
  tab: "\t",
  escape: "\x1b",
  backspace: "\x7f",
  pageup: "\x1b[5~",
  pagedown: "\x1b[6~",
  home: "\x1b[H",
  end: "\x1b[F",
};

export interface DashboardOptions {
  args?: string[];
  env?: Record<string, string>;
  /** Timeout for waitFor* methods (ms). Default 15000. */
  timeout?: number;
  /** Set terminal columns. Default 160. */
  cols?: number;
  /** Set terminal rows. Default 40. */
  rows?: number;
  /** Show dashboard output in real-time (piped to stderr). */
  verbose?: boolean;
}

export class Dashboard {
  private proc: ChildProcess | null = null;
  private output = "";
  private opts: Required<DashboardOptions>;
  private listeners: Array<() => void> = [];
  private exited = false;

  constructor(opts: DashboardOptions = {}) {
    this.opts = {
      args: opts.args ?? [],
      env: opts.env ?? {},
      timeout: opts.timeout ?? 15000,
      cols: opts.cols ?? 160,
      rows: opts.rows ?? 40,
      verbose: opts.verbose ?? false,
    };
  }

  /** Start the dashboard process. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cmd = existsSync(TSX_BIN + ".cmd") ? TSX_BIN + ".cmd" : TSX_BIN;
      this.proc = spawn(cmd, [TEST_ENTRY, ...this.opts.args], {
        cwd: DASHBOARD_DIR,
        shell: true,
        env: {
          ...process.env,
          ...this.opts.env,
          COLUMNS: String(this.opts.cols),
          LINES: String(this.opts.rows),
          FORCE_COLOR: "1",
          TERM: "xterm-256color",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.stdout?.on("data", (chunk: Buffer) => {
        this.output += chunk.toString();
        if (this.opts.verbose) process.stderr.write(chunk);
        // Notify waiters
        for (const fn of this.listeners) fn();
      });

      this.proc.stderr?.on("data", (chunk: Buffer) => {
        this.output += chunk.toString();
        if (this.opts.verbose) process.stderr.write(chunk);
        for (const fn of this.listeners) fn();
      });

      this.proc.on("exit", () => {
        this.exited = true;
        for (const fn of this.listeners) fn();
      });
      this.proc.on("error", (err) => reject(err));

      // Resolve once we get first output (dashboard has started)
      const onFirstOutput = () => {
        this.listeners = this.listeners.filter((f) => f !== onFirstOutput);
        resolve();
      };
      this.listeners.push(onFirstOutput);

      // Timeout for startup
      setTimeout(() => {
        if (this.output.length === 0) {
          reject(new Error("Dashboard did not produce output within 10s"));
        } else {
          resolve(); // Got some output, consider started
        }
      }, 10000);
    });
  }

  /** Send a named key press. */
  press(key: string): void {
    const seq = KEY_MAP[key.toLowerCase()];
    if (seq) {
      this.proc?.stdin?.write(seq);
    } else if (key.length === 1) {
      this.proc?.stdin?.write(key);
    } else {
      throw new Error(`Unknown key: ${key}. Use a single character or one of: ${Object.keys(KEY_MAP).join(", ")}`);
    }
  }

  /** Type a string character by character. */
  type(text: string): void {
    this.proc?.stdin?.write(text);
  }

  /** Get all captured output (raw, with ANSI codes). */
  rawOutput(): string {
    return this.output;
  }

  /** Get the last rendered frame (cleaned of ANSI codes). */
  lastFrame(): string {
    return stripAnsi(this.output);
  }

  /** Check if text appears anywhere in accumulated output. */
  hasText(text: string): boolean {
    return stripAnsi(this.output).includes(text);
  }

  /**
   * Check if text appears in the most recent portion of output.
   * Useful for verifying the current screen state vs. historical output.
   */
  hasRecentText(text: string, tailBytes = 8000): boolean {
    const tail = this.output.slice(-tailBytes);
    return stripAnsi(tail).includes(text);
  }

  /** Clear captured output buffer. */
  clearOutput(): void {
    this.output = "";
  }

  /** Wait until a text pattern appears in output, or timeout. */
  waitForText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? this.opts.timeout;
    return new Promise((resolve, reject) => {
      if (this.hasText(text)) {
        resolve();
        return;
      }

      let timer: NodeJS.Timeout;
      const check = () => {
        if (this.hasText(text)) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((f) => f !== check);
          resolve();
        }
      };
      this.listeners.push(check);
      timer = setTimeout(() => {
        this.listeners = this.listeners.filter((f) => f !== check);
        const clean = stripAnsi(this.output);
        const lastLines = clean.split("\n").slice(-20).join("\n");
        reject(new Error(`Timeout waiting for "${text}" (${timeout}ms). Last 20 lines:\n${lastLines}`));
      }, timeout);
    });
  }

  /** Wait a fixed amount of time. */
  wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Stop the dashboard process. */
  stop(): void {
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill();
      this.proc = null;
    }
  }

  /** Wait for the process to exit (with timeout). */
  waitForExit(timeoutMs?: number): Promise<boolean> {
    const timeout = timeoutMs ?? 5000;
    if (this.exited) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((f) => f !== check);
        resolve(false);
      }, timeout);
      const check = () => {
        if (this.exited) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((f) => f !== check);
          resolve(true);
        }
      };
      this.listeners.push(check);
    });
  }

  /** Check if the process is still running. */
  get isRunning(): boolean {
    return !this.exited;
  }
}
