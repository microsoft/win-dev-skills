/**
 * Test-mode launcher for the dashboard.
 *
 * Patches process.stdin to appear as a TTY (so Ink doesn't crash),
 * then imports and renders the normal App component.
 *
 * Accepts keystrokes from stdin as-is (raw bytes / escape sequences).
 * Sends all Ink output to stdout.
 */

import { Readable } from "stream";

// Create a fake stdin that looks like a TTY
const fakeStdin = new Readable({ read() {} }) as any;
fakeStdin.isTTY = true;
fakeStdin.setRawMode = () => fakeStdin;
fakeStdin.ref = () => fakeStdin;
fakeStdin.unref = () => fakeStdin;

// Forward real stdin data to fake stdin
process.stdin.resume();
process.stdin.on("data", (chunk: Buffer) => {
  fakeStdin.push(chunk);
});
process.stdin.on("end", () => {
  fakeStdin.push(null);
});

// Patch process.stdin before Ink reads it
Object.defineProperty(process, "stdin", {
  value: fakeStdin,
  writable: false,
  configurable: true,
});

// Now import Ink and render the app
import React from "react";
import { render } from "ink";
import { App } from "../src/app.js";

const args = process.argv.slice(2);
const showResults = args.includes("--results");
const runNameIdx = args.indexOf("--run");
const runName = runNameIdx >= 0 ? args[runNameIdx + 1] : undefined;
const maxBuildIdx = args.indexOf("--max-build-minutes");
const maxBuildMinutes = maxBuildIdx >= 0 ? parseInt(args[maxBuildIdx + 1]) : 60;
const concurrencyIdx = args.indexOf("--concurrency");
const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1]) : 3;
const scenarioIdx = args.indexOf("--scenario");
const agentIdx = args.indexOf("--agent");
const modelIdx = args.indexOf("--model");
const quickScenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : undefined;
const quickAgent = agentIdx >= 0 ? args[agentIdx + 1] : undefined;
const quickModel = modelIdx >= 0 ? args[modelIdx + 1] : "claude-sonnet-4.6";

const instance = render(
  React.createElement(App, {
    showResultsOnly: showResults,
    runName,
    maxBuildMinutes,
    concurrency,
    quickRun: quickScenario && quickAgent ? { scenario: quickScenario, agent: quickAgent, model: quickModel } : undefined,
  }),
  { stdin: fakeStdin as any }
);

// When Ink unmounts (e.g., user presses Q), destroy the fake stdin to release the event loop
instance.waitUntilExit().then(() => {
  fakeStdin.destroy();
  process.exit(0);
});
