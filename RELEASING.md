# Releasing `win-dev-skills`

Plugins are released in their source repositories. A catalog release points
the catalog at a released plugin commit.

## Move a plugin to a new version

1. Release the plugin in its source repo (for `winui` and `winappcli`: a
   microsoft/winappCli release). Note the release tag, its commit sha
   (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`), and the plugin
   version.
2. On a branch from `main`, update the plugin entry in all three catalogs:
   - `.github/plugin/marketplace.json`: `source.ref`, `source.sha`, `version`
   - `.claude-plugin/marketplace.json`: `source.ref`, `source.sha`, `version`
   - `.agents/plugins/marketplace.json`: `source.ref`, `source.sha`
3. Bump the catalog version (`metadata.version` in the Copilot catalog and
   `version` in the Claude catalog) and add a `## [X.Y.Z] — YYYY-MM-DD`
   section to `CHANGELOG.md`.
4. Open a PR to `main`. `Catalog check` verifies the new pin resolves and the
   versions match.
5. Merge. If the catalog version changed, `auto-tag` tags the merge commit
   `vX.Y.Z`.

Hosts pick up a plugin change when its **version** changes. Copilot and Codex
also re-fetch when only the source changes; Claude Code keeps the installed
copy until the version changes. So always ship new plugin content with a new
plugin version.

## Tags

`release-post-merge.yml` reads `metadata.version` from
`.github/plugin/marketplace.json` on every push to `main`. If it changed, it
tags the commit `vX.Y.Z`. It never moves an existing tag.

Tags up to `v0.7.1` contain the `winui` plugin itself.

## Rolling back

Release a fixed plugin version (with a higher version number) in the source
repo and move the pin to it. Don't point the catalog back at an older version.
