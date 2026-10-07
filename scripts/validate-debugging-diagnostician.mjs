import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const pluginRoot = path.join(
  repositoryRoot,
  "plugins",
  "debugging-diagnostician",
);
const require = createRequire(
  path.join(repositoryRoot, "scripts", "vally", "package.json"),
);
const { parseDocument } = require("yaml");

const inventory = JSON.parse(
  fs.readFileSync(path.join(pluginRoot, "skills.json"), "utf8"),
);
assert.deepEqual(inventory.auxiliarySkills, ["validate-diagnosis-output"]);

const allowedSkills = [
  ...inventory.diagnosticSkills,
  ...inventory.auxiliarySkills,
].sort();
const skillDirectories = fs
  .readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(skillDirectories, allowedSkills);

const allowedUrlHosts = new Set([
  "agent-plugins.org",
  "devblogs.microsoft.com",
  "github.com",
  "learn.microsoft.com",
]);

function assertPublicText(text, label) {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    const value = match[0].replace(/[),.;:]+$/, "");
    const host = new URL(value).hostname.toLowerCase();
    assert.ok(
      allowedUrlHosts.has(host),
      `${label} references unapproved URL host ${host}`,
    );
  }

  assert.doesNotMatch(
    text,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    `${label} contains an email address`,
  );
}

for (const skill of skillDirectories) {
  const relativePath = path.join("skills", skill, "SKILL.md");
  const text = fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(frontmatter, relativePath);

  const document = parseDocument(frontmatter[1], { uniqueKeys: true });
  assert.equal(document.errors.length, 0, relativePath);

  const header = document.toJS();
  assert.equal(header.name, skill);
  assert.ok(!("owner" in header));
  assert.ok(!("metadata" in header));
  assert.ok(!("version" in header));
  assertPublicText(text, relativePath);
}

assert.ok(!fs.existsSync(path.join(pluginRoot, ".mcp.json")));
assert.ok(!fs.existsSync(path.join(pluginRoot, "mcp")));

const workflowFiles = [
  "README.md",
  "FEEDBACK.md",
  "com.github.copilot/agents/diagnostician.agent.md",
  "com.github.copilot/agents/contrarian.agent.md",
  "com.github.copilot/instructions/diagnostic-reasoning.instructions.md",
  "com.github.copilot/instructions/root-cause-analysis.instructions.md",
];

for (const relativePath of workflowFiles) {
  const text = fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
  assertPublicText(text, relativePath);
}

const confidenceContractFiles = [
  "README.md",
  "com.github.copilot/agents/diagnostician.agent.md",
  "com.github.copilot/agents/contrarian.agent.md",
  "com.github.copilot/instructions/diagnostic-reasoning.instructions.md",
  "skills/validate-diagnosis-output/SKILL.md",
  "skills/validate-diagnosis-output/scripts/validate-diagnosis-output.ps1",
];

for (const relativePath of confidenceContractFiles) {
  const text = fs.readFileSync(path.join(pluginRoot, relativePath), "utf8");
  assert.match(text, /fix_confidence/, `${relativePath} omits fix_confidence`);
  assert.match(
    text,
    /fix_code_path_coverage/,
    `${relativePath} omits fix_code_path_coverage`,
  );
}

assert.ok(
  fs.existsSync(
    path.join(
      pluginRoot,
      "skills",
      "validate-diagnosis-output",
      "scripts",
      "validate-diagnosis-output.ps1",
    ),
  ),
);

console.log(
  `Validated ${inventory.diagnosticSkills.length} diagnostic skills, ` +
    `${inventory.auxiliarySkills.length} auxiliary skill, agent workflow, ` +
    "validator script, and public-only links.",
);
