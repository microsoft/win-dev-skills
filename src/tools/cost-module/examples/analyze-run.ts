/**
 * Example: analyze your most recent Copilot CLI session and print a report.
 *
 * Run (Node >= 22):  node examples/analyze-run.ts
 * Or with tsx:       npx tsx examples/analyze-run.ts
 *
 * It auto-discovers the newest ~/.copilot/session-state/<id>/events.jsonl on
 * this machine. Run any `copilot` session first (and exit it cleanly), then
 * run this. To analyze a specific log instead, pass its path as an argument.
 */
import { analyzeJsonlFile, formatReport } from "../src/copilot-cost.ts";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function findLatestSessionLog(): string | undefined {
  const root = join(homedir(), ".copilot", "session-state");
  if (!existsSync(root)) return undefined;
  let newest: { path: string; mtime: number } | undefined;
  for (const id of readdirSync(root)) {
    const events = join(root, id, "events.jsonl");
    if (!existsSync(events)) continue;
    const mtime = statSync(events).mtimeMs;
    if (!newest || mtime > newest.mtime) newest = { path: events, mtime };
  }
  return newest?.path;
}

const target = process.argv[2] || findLatestSessionLog();

if (!target) {
  console.error(
    "No Copilot session log found.\n" +
      "Run a `copilot` session first (exit it cleanly with /exit), then re-run this.\n" +
      "Or pass a path:  node examples/analyze-run.ts <path-to-events.jsonl>",
  );
  process.exit(1);
}

console.log(`Analyzing: ${target}\n`);
const report = await analyzeJsonlFile(target);
console.log(formatReport(report));
