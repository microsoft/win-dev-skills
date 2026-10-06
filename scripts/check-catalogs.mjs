// Validates the three host catalogs:
//   .github/plugin/marketplace.json   (GitHub Copilot)
//   .claude-plugin/marketplace.json   (Claude Code)
//   .agents/plugins/marketplace.json  (OpenAI Codex)
//
// - All three list the same plugins, from the same repo at the same pinned commit.
// - Every entry resolves: the repo, commit, path, and the host's plugin manifest
//   exist, and the manifest's name and version match the catalog.
// Local entries (./path in this repo) are checked against the working tree.
// Set GITHUB_TOKEN to avoid API rate limits.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const errors = [];
const fail = (msg) => errors.push(msg);
const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA = /^[0-9a-f]{40}$/;

const hosts = {
  copilot: {
    file: ".github/plugin/marketplace.json",
    // Copilot accepts a manifest at the plugin root or in a host folder.
    manifests: ["plugin.json", ".github/plugin/plugin.json", ".claude-plugin/plugin.json"],
    catalogVersion: (c) => c.metadata?.version,
  },
  claude: {
    file: ".claude-plugin/marketplace.json",
    manifests: [".claude-plugin/plugin.json"],
    catalogVersion: (c) => c.version,
  },
  codex: {
    file: ".agents/plugins/marketplace.json",
    manifests: [".codex-plugin/plugin.json"],
    catalogVersion: () => undefined,
  },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, file), "utf8"));
  } catch (e) {
    fail(`${file}: cannot read JSON (${e.message})`);
    return {};
  }
}

const trimSlashes = (p) => (p ?? "").replace(/^\.?\/+/, "").replace(/\/+$/, "");

function repoFromUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(url ?? "");
  return m ? m[1] : undefined;
}

// Normalize a host-specific source into { kind: "local", path } or
// { kind: "remote", repo, path, sha }.
function normalizeSource(src) {
  if (typeof src === "string") {
    return src.startsWith("./") ? { kind: "local", path: trimSlashes(src) } : { kind: "unknown", raw: src };
  }
  if (!src || typeof src !== "object") return { kind: "unknown", raw: src };
  switch (src.source) {
    case "local":
      return { kind: "local", path: trimSlashes(src.path) };
    case "github":
      return { kind: "remote", repo: src.repo, path: trimSlashes(src.path), sha: src.sha };
    case "url":
    case "git-subdir":
      return { kind: "remote", repo: repoFromUrl(src.url), path: trimSlashes(src.path), sha: src.sha ?? src.rev };
    default:
      return { kind: "unknown", raw: src };
  }
}

async function gh(url) {
  const headers = { "User-Agent": "win-dev-skills-catalog-check", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status < 500 || attempt === 3) return res;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const commitCache = new Map();
async function commitExists(repo, sha) {
  const key = `${repo}@${sha}`;
  if (!commitCache.has(key)) {
    commitCache.set(key, gh(`https://api.github.com/repos/${repo}/commits/${sha}`).then((r) => r.status));
  }
  return commitCache.get(key);
}

async function readRemoteFile(repo, sha, file) {
  const res = await gh(`https://api.github.com/repos/${repo}/contents/${file}?ref=${sha}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GET ${repo}/${file}@${sha}: HTTP ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return { dir: true };
  return { text: Buffer.from(body.content, "base64").toString("utf8") };
}

function readLocalFile(file) {
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) return undefined;
  if (fs.statSync(full).isDirectory()) return { dir: true };
  return { text: fs.readFileSync(full, "utf8") };
}

async function checkEntry(host, entry, src, expectedVersion) {
  const where = `${hosts[host].file} → ${entry.name}`;
  const read = src.kind === "local"
    ? async (f) => readLocalFile(f)
    : async (f) => readRemoteFile(src.repo, src.sha, f);
  const label = src.kind === "local" ? `./${src.path}` : `${src.repo}/${src.path}@${src.sha.slice(0, 12)}`;

  const root = src.path ? await read(src.path) : { dir: true };
  if (!root?.dir) return fail(`${where}: path '${src.path}' not found in ${label}`);

  let manifest;
  let manifestFile;
  for (const candidate of hosts[host].manifests) {
    manifestFile = src.path ? `${src.path}/${candidate}` : candidate;
    const file = await read(manifestFile);
    if (file?.text) {
      try {
        manifest = JSON.parse(file.text);
      } catch (e) {
        return fail(`${where}: ${manifestFile} is not valid JSON (${e.message})`);
      }
      break;
    }
  }
  if (!manifest) {
    return fail(`${where}: no plugin manifest (${hosts[host].manifests.join(", ")}) under ${label}`);
  }
  let ok = true;
  if (manifest.name !== entry.name) {
    ok = false;
    fail(`${where}: manifest ${manifestFile} has name '${manifest.name}', catalog says '${entry.name}'`);
  }
  if (manifest.version !== expectedVersion) {
    ok = false;
    fail(`${where}: manifest ${manifestFile} has version '${manifest.version}', catalog says '${expectedVersion}'`);
  }
  if (ok) console.log(`ok  ${host.padEnd(7)} ${entry.name}@${manifest.version} ← ${label} (${manifestFile})`);
}

const catalogs = Object.fromEntries(Object.entries(hosts).map(([h, cfg]) => [h, readJson(cfg.file)]));

// Catalog-level version: Copilot and Claude carry one; keep them in sync.
const catalogVersions = ["copilot", "claude"].map((h) => hosts[h].catalogVersion(catalogs[h]));
if (!catalogVersions.every((v) => typeof v === "string" && SEMVER.test(v))) {
  fail(`Catalog version must be X.Y.Z in ${hosts.copilot.file} (metadata.version) and ${hosts.claude.file} (version); got ${catalogVersions.join(", ")}`);
} else if (catalogVersions[0] !== catalogVersions[1]) {
  fail(`Catalog versions differ: Copilot ${catalogVersions[0]}, Claude ${catalogVersions[1]}`);
}

// Index entries by name per host.
const byHost = {};
for (const host of Object.keys(hosts)) {
  const plugins = catalogs[host].plugins;
  if (!Array.isArray(plugins)) {
    fail(`${hosts[host].file}: plugins must be an array`);
    byHost[host] = new Map();
    continue;
  }
  byHost[host] = new Map();
  for (const entry of plugins) {
    if (byHost[host].has(entry.name)) fail(`${hosts[host].file}: duplicate plugin '${entry.name}'`);
    byHost[host].set(entry.name, entry);
  }
}

const allNames = new Set(Object.values(byHost).flatMap((m) => [...m.keys()]));
const checks = [];
for (const name of [...allNames].sort()) {
  const missing = Object.keys(hosts).filter((h) => !byHost[h].has(name));
  if (missing.length) {
    fail(`Plugin '${name}' is missing from: ${missing.map((h) => hosts[h].file).join(", ")}`);
    continue;
  }

  const errorsBefore = errors.length;
  const version = byHost.copilot.get(name).version;
  if (typeof version !== "string" || !SEMVER.test(version)) {
    fail(`${hosts.copilot.file} → ${name}: version must be X.Y.Z, got '${version}'`);
  }
  if (byHost.claude.get(name).version !== version) {
    fail(`Plugin '${name}': Claude catalog version '${byHost.claude.get(name).version}' != Copilot catalog version '${version}'`);
  }

  const sources = Object.fromEntries(Object.keys(hosts).map((h) => [h, normalizeSource(byHost[h].get(name).source)]));
  for (const [h, s] of Object.entries(sources)) {
    if (s.kind === "unknown") fail(`${hosts[h].file} → ${name}: unsupported source ${JSON.stringify(s.raw)}`);
    if (s.kind === "remote") {
      if (!s.repo) fail(`${hosts[h].file} → ${name}: remote source must be a github.com repository`);
      if (!SHA.test(s.sha ?? "")) fail(`${hosts[h].file} → ${name}: remote source must pin a full 40-character commit sha`);
    }
  }
  const kinds = new Set(Object.values(sources).map((s) => s.kind));
  if (kinds.size > 1) {
    fail(`Plugin '${name}': hosts disagree on local vs remote source`);
    continue;
  }
  if (kinds.has("remote")) {
    const pins = new Set(Object.values(sources).map((s) => `${(s.repo ?? "").toLowerCase()}@${s.sha}`));
    if (pins.size > 1) {
      fail(`Plugin '${name}': hosts pin different repos/commits: ${[...pins].join(", ")}`);
      continue;
    }
  }
  if (errors.length > errorsBefore) continue;

  for (const [h, s] of Object.entries(sources)) {
    checks.push((async () => {
      if (s.kind === "remote") {
        const status = await commitExists(s.repo, s.sha);
        if (status !== 200) return fail(`${hosts[h].file} → ${name}: commit ${s.repo}@${s.sha} not found (HTTP ${status})`);
      }
      await checkEntry(h, byHost[h].get(name), s, version);
    })().catch((e) => fail(`${hosts[h].file} → ${name}: ${e.message}`)));
  }
}
await Promise.all(checks);

if (errors.length) {
  for (const e of errors) console.log(`::error::${e}`);
  process.exitCode = 1;
} else {
  console.log(`All ${allNames.size} plugin(s) resolve and match across the three catalogs.`);
}
