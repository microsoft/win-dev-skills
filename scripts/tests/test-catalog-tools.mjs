// Proves the catalog tooling handles a plugin stored in this repo, using the
// fixture in scripts/tests/fixtures/local-plugin. Needs `npm ci --prefix scripts/vally`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "local-plugin");
const checkScript = path.join(here, "..", "check-catalogs.mjs");
const lintScript = path.join(here, "..", "vally", "lint-skills.mjs");

let failed = 0;
function expect(label, script, root, wantExit, wantText) {
  const r = spawnSync(process.execPath, [script], { env: { ...process.env, CATALOG_ROOT: root }, encoding: "utf8" });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === wantExit && (!wantText || out.includes(wantText));
  console.log(`${ok ? "pass" : "FAIL"}  ${label} (exit ${r.status})`);
  if (!ok) {
    failed++;
    console.log(out);
  }
}

function mutatedCopy(file, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-fixture-"));
  fs.cpSync(fixture, dir, { recursive: true });
  const target = path.join(dir, file);
  fs.writeFileSync(target, fs.readFileSync(target, "utf8").replace(from, to));
  return dir;
}

expect("catalog check accepts a local plugin", checkScript, fixture, 0, "ok  codex   sample@1.2.3 ← ./plugins/sample (plugins/sample/plugin.json)");
expect("vally lints the local plugin", lintScript, fixture, 0, "sample-skill");

const badVersion = mutatedCopy("plugins/sample/.claude-plugin/plugin.json", '"1.2.3"', '"1.2.4"');
expect("catalog check rejects a manifest version mismatch", checkScript, badVersion, 1, "has version '1.2.4'");

const missingCodex = mutatedCopy(".agents/plugins/marketplace.json", '"name": "sample"', '"name": "other"');
expect("catalog check rejects catalogs that disagree", checkScript, missingCodex, 1, "is missing from");

const badSkill = mutatedCopy("plugins/sample/skills/sample-skill/SKILL.md", "name: sample-skill", "name: Not A Valid Name");
expect("vally rejects an invalid skill", lintScript, badSkill, 1);

for (const dir of [badVersion, missingCodex, badSkill]) fs.rmSync(dir, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;
