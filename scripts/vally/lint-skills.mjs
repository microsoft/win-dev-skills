// Runs the same vally lint that marketplaces such as github/awesome-copilot
// apply to external plugins, on every LOCAL plugin in the Copilot catalog
// (entries whose source is a ./path in this repo). Plugins hosted in other
// repositories are linted there.
// Mirrors awesome-copilot's eng/external-plugin-quality-gates.mjs: lint each
// skills path declared in plugin.json, or the plugin root when none is declared.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLint, LintConsoleReporter } from "@microsoft/vally";

const repoRoot = process.env.CATALOG_ROOT
  ? path.resolve(process.env.CATALOG_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(repoRoot, ".github", "plugin", "marketplace.json"), "utf8"));

const localRoots = (catalog.plugins ?? [])
  .map((p) => (typeof p.source === "string" ? p.source : p.source?.source === "local" ? p.source.path : undefined))
  .filter((s) => typeof s === "string" && s.startsWith("./"))
  .map((s) => path.resolve(repoRoot, s));

if (localRoots.length === 0) {
  console.log("No local plugins in the catalog; nothing to lint.");
  process.exit(0);
}

let passed = true;
for (const pluginRoot of localRoots) {
  const manifestPath = path.join(pluginRoot, "plugin.json");
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
  const skillPaths = [].concat(manifest.skills ?? [])
    .map((p) => path.resolve(pluginRoot, p))
    .filter((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  for (const target of skillPaths.length > 0 ? skillPaths : [pluginRoot]) {
    const result = await runLint({ rootPath: target });
    await new LintConsoleReporter({ verbose: true, stream: process.stdout }).report(result);
    passed &&= result.passed;
  }
}
process.exit(passed ? 0 : 1);