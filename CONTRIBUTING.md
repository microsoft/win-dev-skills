# Contributing to `win-dev-skills`

Thanks for helping improve the WinUI plugin. This document describes the
contributor flow. For the maintainer-side release process see
[`RELEASING.md`](RELEASING.md).

## TL;DR

1. Fork the repo (or branch if you have write access).
2. Open a PR **against `staging`** — never against `main`.
3. Don't bump version fields in your PR. Releases are batched.
4. CI will tell you if you missed something.

## Branch model

```
your-feature  ──PR──▶  staging  ──promotion PR──▶  main  ──auto-tag──▶  vX.Y.Z
hotfix/*      ──PR──▶  main (must back-merge to staging)
```

- **`main`** is the released branch. Marketplace consumers install from `main`,
  so it must always be in a shippable state.
- **`staging`** is the integration branch and the **default PR target**. All
  feature work lands here first.
- **`hotfix/*`** branches are the only ones allowed to PR directly to `main`,
  for genuine emergencies (security, broken-on-install). They must include the
  version bump + changelog entry themselves and be back-merged to `staging`
  immediately after.

## Opening a PR

1. Branch from the latest `staging`:

   ```powershell
   git fetch origin
   git checkout -b my-feature origin/staging
   ```

2. Make your changes. Run `./scripts/build-tools.ps1` if you touched anything
   in `src/tools/` so the committed binary payloads stay in sync (the
   provenance CI jobs will fail otherwise).

3. Push and open a PR. **Base branch must be `staging`.** The PR template
   is pre-filled for you.

4. Address review feedback. We squash-merge into `staging` so PR title +
   description become the commit message — please write them with that in
   mind.

## Things you should NOT do in a feature PR

- ❌ Don't edit `plugins/winui/plugin.json` `version`.
- ❌ Don't edit `.github/plugin/marketplace.json` `version` fields.
- ❌ Don't edit `.claude-plugin/marketplace.json` `version` fields.
- ❌ Don't add a `## [X.Y.Z]` section to `CHANGELOG.md` — write your bullets
  under `## [Unreleased]` if your change is user-facing.

The `version-sync` CI check will fail your PR if any version field changed.
Versioning happens once per release in the promotion PR.

## What to put in CHANGELOG `[Unreleased]`

If your change is user-facing (a skill behaves differently, an analyzer rule
was added/removed, a CLI surface changed, a payload was rebuilt), add a bullet
under the matching subsection of `## [Unreleased]`:

- **Added** — new skills, agents, tools, CLI subcommands, analyzer rules.
- **Changed** — behavior changes, refactors users will notice, payload
  rebuilds that change behavior.
- **Fixed** — bug fixes.
- **Removed** — anything users could rely on that's now gone.
- **Deprecated** — still works but scheduled for removal.

Pure-CI, pure-internal-refactor, and doc-only PRs do not need a changelog
entry.

## Hotfix path

If something on `main` is broken in a way that can't wait for the next
release:

1. Branch from `main`: `git checkout -b hotfix/short-description origin/main`.
2. Fix the bug.
3. Bump the **patch** version in all three manifests + add a `[X.Y.Z]` section
   to `CHANGELOG.md` (yes, in the hotfix PR — this is the one exception).
4. PR against `main`. CI will run the same `version-bump` + `changelog-entry`
   checks the promotion PR runs.
5. Once merged, immediately open a back-merge PR `main → staging` to get the
   fix into the integration branch. The `back-merge-reminder` workflow opens a
   tracking issue if you forget.

## CI checks you'll see

| Check | When it runs | What it wants |
|---|---|---|
| `pr-target-policy` | PR targets `main` | Your branch is `staging`, `release/*`, or `hotfix/*`, AND comes from this repo (not a fork). |
| `version-sync` | PR targets `staging` | You did NOT change any version field. |
| `version-bump` | PR targets `main` | All 5 version fields bumped, valid semver, strictly greater, identical. |
| `changelog-entry` | PR targets `main` | Top-most `## [X.Y.Z]` section matches the bumped version, has at least one bullet. |
| `staging-up-to-date-with-main` | PR targets `staging` | `staging` contains every commit on `main` (so hotfixes aren't lost). |
| `build-tools` + provenance | Any PR | C# tools build, analyzer tests pass, committed payloads match source. |
| `validate-plugin-manifest` + `validate-skill-frontmatter` | Any PR | Manifests are well-formed, every `SKILL.md` has valid frontmatter. |

If a check fails, the failure message tells you exactly what to fix.

## Code of Conduct

This project follows the
[Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). Be excellent to
each other.

## CLA

Contributions of non-trivial size require signing the
[Microsoft CLA](https://opensource.microsoft.com/cla/). The CLA bot will
prompt you on your first PR.
