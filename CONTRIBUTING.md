# Contributing to `win-dev-skills`

This repo hosts agent plugins for Windows app development under
`plugins/<name>/`, and also lists plugins maintained in other repos, pinned to a
release. You can contribute:

- **A new plugin.** Add it here (Option A), or pin a plugin from its own repo
  (Option B).
- **Skills for an existing plugin.** Send them to wherever that plugin is
  maintained (see the [README](README.md) table). `winui` and `winappcli` are
  maintained in [microsoft/winappCli](https://github.com/microsoft/winappCli);
  file their issues and PRs there.

## Bar for inclusion

- **Windows app development.** Building, designing, testing, packaging, or
  shipping Windows apps.
- **Small and curated.** A focused plugin with a few skills that each do one
  job well, not a dump of prompts.
- **Clear descriptions.** Each skill `description` is 300 characters or fewer
  and says when to use it and when not to: "Use when… Not for…".
- **No overlap.** Check existing plugins first: `winappcli` and `winui` in
  this catalog, and [dotnet/skills](https://github.com/dotnet/skills)' `dotnet-diag`,
  `dotnet-winforms`, and `dotnet-maui`. Extend one of those instead of
  duplicating it.
- **Owned.** Two or more maintainers who review its PRs.

Open an issue first if you're unsure whether a plugin fits.

## Option A: add a plugin here

Use the [Agent Plugins](https://agent-plugins.org/specification) layout, plus
the manifests each host needs:

```text
plugins/<name>/
  plugin.json                  Agent Plugins manifest with "$schema" (Copilot, Codex)
  .claude-plugin/plugin.json   Claude Code manifest (same name and version)
  skills/<skill>/SKILL.md      one folder per skill
  com.github.copilot/agents/   optional Copilot agents
```

Then:

1. Add the plugin to all three catalogs. Use `"source": "./plugins/<name>"` in
   `.github/plugin/marketplace.json` and `.claude-plugin/marketplace.json`, and
   `"source": { "source": "local", "path": "./plugins/<name>" }` in
   `.agents/plugins/marketplace.json`. Use the same `name`, and the same
   `version` as the manifests.
2. Add a `/plugins/<name>/` entry to [`.github/CODEOWNERS`](.github/CODEOWNERS).
3. Add a row to the README plugin table and a `CHANGELOG.md` entry.

## Option B: pin a plugin from another repo

Use this when the plugin ships with a product in its own repo. Pin a
**release tag and its commit sha** in all three catalogs:

```jsonc
// .github/plugin/marketplace.json
"source": { "source": "github", "repo": "owner/repo", "path": "plugins/<name>", "ref": "v1.2.3", "sha": "<40-char sha>" }
// .claude-plugin/marketplace.json and .agents/plugins/marketplace.json
"source": { "source": "git-subdir", "url": "https://github.com/owner/repo.git", "path": "plugins/<name>", "ref": "v1.2.3", "sha": "<40-char sha>" }
```

Resolve the sha with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.
Add the README row and a `CHANGELOG.md` entry. The source repo owns the
plugin's content, issues, and PRs.

## Bumping a pin

Open a PR that updates `ref`, `sha`, and the plugin `version` in all three
catalogs. Hosts only pick up new content when the version changes. CI checks
that the tag still points at the sha, and that the version matches the
plugin's manifests at that commit.

## Review

[`.github/CODEOWNERS`](.github/CODEOWNERS) routes catalog, CI, and tooling
changes to the catalog maintainers, and `plugins/<name>/` changes to that
plugin's owners. PRs target `main`.

## CI checks

| Check | What it wants |
|---|---|
| `Catalog check` | Every entry resolves: repo, commit, path, and the host's plugin manifest exist, and its name and version match. A `ref` must resolve to the pinned `sha`. All three catalogs list the same plugins at the same pin. |
| `Local plugin lint (vally)` | Plugins in this repo pass the [vally](https://github.com/microsoft/vally) lint that awesome-copilot runs. A fixture test proves the check and lint handle a local plugin. |

Run them locally (Node 22+; set `GITHUB_TOKEN` to avoid API rate limits):

```powershell
node scripts/check-catalogs.mjs
npm ci --prefix scripts/vally
node scripts/vally/lint-skills.mjs
node scripts/tests/test-catalog-tools.mjs
```

The checks read files only. Before merging, install from your branch on each
host (for example
`copilot plugin marketplace add microsoft/win-dev-skills#<branch>`) and confirm
the skills load.

## Code of Conduct

This project follows the
[Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md).

## CLA

Contributions of non-trivial size require signing the
[Microsoft CLA](https://opensource.microsoft.com/cla/). The CLA bot will
prompt you on your first PR.
