# Contributing to `win-dev-skills`

This repo is a catalog of Windows agent plugins. Plugin content lives in each
plugin's source repository:

| Plugin | Where to contribute |
|---|---|
| `winui` | [microsoft/winappCli](https://github.com/microsoft/winappCli) (`plugins/winui/`) |

**WinUI skills, the `winui-dev` agent, and WinUI plugin manifests are authored
in microsoft/winappCli; file WinUI issues and PRs there.**

## Changing the catalog

PRs target `main`. The catalog is three files that must list the same plugins
at the same pin:

| Host | File |
|---|---|
| GitHub Copilot | `.github/plugin/marketplace.json` |
| Claude Code | `.claude-plugin/marketplace.json` |
| OpenAI Codex | `.agents/plugins/marketplace.json` |

Typical changes:

- **Move a plugin to a new version.** Update the commit `sha` in all three
  files and the plugin `version` in the Copilot and Claude files. The version
  must match the plugin's own manifests at that commit. Add a `CHANGELOG.md`
  entry.
- **Add a plugin.** Add an entry to all three files. Prefer a pinned remote
  source (repo + path + 40-character `sha`). Plugins stored in this repo use a
  `./path` source and are linted here.

## CI checks

| Check | What it wants |
|---|---|
| `Catalog check` | Every entry resolves: the repo, commit, and path exist, the host's plugin manifest is there, and its name and version match the catalog. All three catalogs list the same plugins at the same pin, and the Copilot and Claude catalog versions agree. |
| `Local plugin lint (vally)` | Plugins stored in this repo pass the same [vally](https://github.com/microsoft/vally) lint awesome-copilot runs. Remote plugins are linted in their own repos. |

Run them locally (Node 22+; set `GITHUB_TOKEN` to avoid API rate limits):

```powershell
node scripts/check-catalogs.mjs
npm ci --prefix scripts/vally
node scripts/vally/lint-skills.mjs
```

Catalog checks read files only. Before moving a pin, install the plugin from
your branch on each host (for example
`copilot plugin marketplace add microsoft/win-dev-skills#<branch>`) and confirm
its skills load.

## Code of Conduct

This project follows the
[Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). Be excellent to
each other.

## CLA

Contributions of non-trivial size require signing the
[Microsoft CLA](https://opensource.microsoft.com/cla/). The CLA bot will
prompt you on your first PR.
