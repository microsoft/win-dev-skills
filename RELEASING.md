# Releasing `win-dev-skills`

This is the maintainer-facing release playbook. For contributor flow see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Mental model

- `staging` accumulates merged PRs.
- A **promotion PR** (`staging → main`) is how a release happens.
- The promotion PR is the **only** place version fields are bumped.
- Merging the promotion PR into `main` triggers the `auto-tag` workflow which
  pushes a `vX.Y.Z` git tag pointing at the merge commit.
- Marketplace consumers installing `winui@win-dev-skills` get whatever is on
  `main` HEAD. Tag-pinning consumers can install
  `https://github.com/microsoft/win-dev-skills.git#vX.Y.Z` (see README §Pinning
  to a release).

## When to release

Roughly:

- **Patch (`0.X.Y → 0.X.Y+1`)**: any time `staging` has bug-only changes you
  want users to pick up.
- **Minor (`0.X.0 → 0.X+1.0`)**: when `staging` contains any of:
  - A new skill, agent, or tool.
  - A new public CLI subcommand or analyzer rule.
  - A change to skill names, on-disk layout, agent config schema, analyzer
    rule IDs, or CLI surfaces (these are explicitly allowed to break in v0.x;
    minor bump is the public signal).
  - A new payload rebuild that changes behavior in a user-visible way.
- **Major (`→ 1.0.0`)**: out of preview. Separate planning required.

There is no fixed cadence. A reasonable rule of thumb: don't let `staging` get
more than ~10 PRs ahead of `main` without cutting a release; users want
incremental improvements, not surprise drops.

## How to cut a release

### One-shot helper

```powershell
./scripts/open-release-pr.ps1
```

The script:

1. Checks you're on a clean local checkout with `staging` and `main` both
   up-to-date with origin.
2. Diffs `origin/staging` against `origin/main` to enumerate the commits going
   into the release.
3. Suggests a semver bump (patch by default; minor if any commit message
   contains `BREAKING:` or `breaking change`, or if any commit touches
   `plugins/winui/agents/`, removes a skill directory, or changes the plugin
   manifest schema).
4. Lets you accept or override the suggested version.
5. Writes the bumped version into all five version fields:
   - `plugins/winui/plugin.json` → `version`
   - `.github/plugin/marketplace.json` → `metadata.version` and `plugins[0].version`
   - `.claude-plugin/marketplace.json` → `version` and `plugins[0].version`
6. Drafts a `## [X.Y.Z] — YYYY-MM-DD` CHANGELOG section by promoting bullets
   currently under `## [Unreleased]` and grouping any unbucketed commits by
   path heuristic.
7. Pushes a `release/X.Y.Z` branch and opens a PR `release/X.Y.Z → main` via
   `gh pr create`, with the changelog rendered into the PR body.

### Manual fallback

If the helper doesn't work for some reason:

1. `git checkout -b release/X.Y.Z origin/staging`
2. Edit all five version fields (use `git grep -n '"version"'` to find them).
3. Edit `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] — YYYY-MM-DD`
   and add a fresh empty `## [Unreleased]` section above it.
4. Commit, push, `gh pr create --base main --head release/X.Y.Z`.

## Reviewing a promotion PR

Before merging:

- ✅ All status checks green (`build-tools`, provenance jobs, `version-bump`,
  `changelog-entry`).
- ✅ CHANGELOG entry reads well — every user-facing change in the diff is
  reflected, every bullet is something a user could actually notice.
- ✅ Version bump matches the change content (don't ship a new skill as a
  patch).
- ✅ No surprise diffs — the promotion PR should ONLY contain the version-field
  edits and the CHANGELOG edit. Anything else means someone landed an
  out-of-band commit on `staging` that didn't go through review; investigate.

## Merging the promotion PR

- **Merge strategy: merge commit, NOT squash.** This preserves the
  staging-side commit history on `main`, which makes blame and rollback work.
- Click "Merge pull request" → "Create a merge commit".

## What happens after merge

Automatically:

1. The `auto-tag` workflow runs on `push` to `main`.
2. It reads the new version from `plugins/winui/plugin.json`.
3. If a tag `vX.Y.Z` already exists at the current `main` HEAD, it logs a
   notice and exits (idempotent re-run case). If the tag exists at a
   **different** SHA, it fails loudly — investigate before doing anything
   else (someone created the tag manually, or a previous release of this
   same version landed at a different commit).
4. Otherwise it creates and pushes `vX.Y.Z` pointing at the merge commit.
5. The marketplace cache update is whatever cadence GitHub Copilot CLI uses
   (consumers may need to run `copilot plugin marketplace update
   win-dev-skills` to see the new version listed).

> [!IMPORTANT]
> **Don't announce the new tag externally until `auto-tag` succeeds.**
> Marketplace consumers (`winui@win-dev-skills`) get the new code as soon as
> the promotion PR merges — that's fine. But tag-pinning consumers
> (`...git#vX.Y.Z`) will see an install failure until the tag exists. Watch
> the workflow run on the Actions tab before sending an "X.Y.Z is out"
> message anywhere.

## Rolling back a bad release

If a release on `main` is broken:

1. `git revert -m 1 <merge-commit-sha>` on a new branch from `main`.
2. Bump the patch version (`0.X.Y → 0.X.Y+1`) in all five fields.
3. Add a CHANGELOG entry under the new version explaining what was reverted
   and why.
4. PR against `main` directly — this is treated like a hotfix.
5. Back-merge the revert into `staging` after merging.

The original tag stays in place (we don't delete tags); the rollback creates a
new tag. Consumers updating past the broken version skip cleanly.

## First-time setup (one-time, by a repo admin)

These are the manual GitHub-side steps required to bring this strategy live;
the CI workflows alone are not enough.

1. **Create the `staging` branch** from current `main` HEAD:

   ```powershell
   git fetch origin
   git push origin origin/main:refs/heads/staging
   ```

2. **Branch protection on `staging`** (CRITICAL — strict mode is REQUIRED, not optional):
   - Require PR before merging.
   - Require status checks: `build-tools`, `analyzer-provenance`,
     `winui-search-provenance`, `validate-plugin-manifest`,
     `validate-skill-frontmatter`, `analyzer-targets-sync`, `version-sync`,
     `staging-up-to-date-with-main`.
   - **"Require branches to be up to date before merging" — MUST be on.**
     Without this, `staging-up-to-date-with-main` only runs at PR open/sync,
     and a hotfix landing on `main` between check-pass and merge can be lost.
   - Allow squash-merge only.
   - Do not allow admins to bypass.

3. **Branch protection on `main`** (CRITICAL — strict mode is REQUIRED, not optional):
   - Require PR before merging.
   - Require status checks: all of the above plus `pr-target-policy`,
     `version-bump`, `changelog-entry`.
   - **"Require branches to be up to date before merging" — MUST be on.**
   - Allow merge commits (for the promotion PR) AND squash (for hotfixes).
   - Restrict who can push to maintainers.
   - Do not allow admins to bypass.

4. **Repository settings → Pull Requests**:
   - Set "Default branch for new pull requests" to `staging` (Settings →
     General → Pull Requests, if available; otherwise rely on the PR
     template's `base:` hint and the `pr-target-policy` check).

5. **Re-target any open PRs** that currently target `main` and are not hotfixes
   to instead target `staging`.

6. **Verify the `auto-tag` workflow has a token with `contents: write`** so it
   can push tags. The default `GITHUB_TOKEN` does, as long as the workflow
   declares the permission (it does in `release.yml`).

## Open follow-ups

- Track upstream support for first-class version pinning in
  `copilot plugin install` / Claude Code plugin install. Today the only way
  consumers can pin to a release is the git-URL form
  (`https://github.com/microsoft/win-dev-skills.git#vX.Y.Z`), which bypasses
  the marketplace catalog. File issues against
  [github/copilot](https://github.com/github/copilot) and the Claude Code
  plugin spec when the syntax stabilizes.
