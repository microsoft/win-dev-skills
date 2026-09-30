// Runs the same vally lint that marketplaces such as github/awesome-copilot
// apply to external plugins, so link/spec problems fail our CI first.
// Mirrors awesome-copilot's eng/external-plugin-quality-gates.mjs: lint each
// skills path declared in plugin.json, or the plugin root when none is declared.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLint, LintConsoleReporter } from "@microsoft/vally";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginRoot = path.join(repoRoot, "plugins", "winui", "agent-plugin");
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json"), "utf8"));

const skillPaths = [].concat(manifest.skills ?? [])
  .map((p) => path.resolve(pluginRoot, p))
  .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
const targets = skillPaths.length > 0 ? skillPaths : [pluginRoot];

let passed = true;
for (const target of targets) {
  const result = await runLint({ rootPath: target });
  await new LintConsoleReporter({ verbose: true, stream: process.stdout }).report(result);
  passed &&= result.passed;
}
process.exit(passed ? 0 : 1);
