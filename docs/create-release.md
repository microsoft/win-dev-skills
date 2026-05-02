# Release runbook (maintainers)

End-to-end recipe for cutting a `win-dev-skills` release. The release
bundle is a single zip that ships:

- `tools/win-x64/winapp.exe` (+ required DLLs)
- `tools/win-arm64/winapp.exe` (+ required DLLs) — when present in the
  `winappcli` build artifacts
- `plugin/` — the full Copilot CLI plugin (agents + skills + tools)
- `scripts/install.ps1` — installer
- `install.cmd` — double-click entry point that invokes `install.ps1`
- `LICENSE`, `README.md`, `THIRD_PARTY_NOTICES.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `SUPPORT.md` — repo-root compliance docs

End users download the zip from
[GitHub Releases](https://github.com/microsoft/win-dev-skills/releases),
extract it, and double-click `install.cmd`.

## Prerequisites

- Windows + PowerShell 7+
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) — for
  the local pre-publish build/test pass on this repo
- [GitHub CLI](https://cli.github.com/) (`gh`), authenticated as a user
  with **write access to `microsoft/win-dev-skills`** (only required for
  `-Publish`)
- A local [`winappcli`](https://github.com/microsoft/winappcli) build
  with `cli/win-x64/` and (ideally) `cli/win-arm64/` artifacts

## Pre-publish checklist

1. Branch is `main` and the working tree is clean
   (`build-release.ps1 -Publish` will refuse otherwise).
2. CI is green on the commit you want to ship from
   (`pr-validation.yml` on the merge commit).
3. The committed analyzer DLL (`Microsoft.WindowsAppSDK.Analyzers.dll`)
   and `winui-search.exe` payloads are up to date —
   `./scripts/build-tools.ps1 -PublishAot` rebuilds both. The
   `analyzer-provenance` and `winui-search-provenance` jobs verify
   this on every PR; this is just the local belt-and-braces check.
4. `THIRD_PARTY_NOTICES.md` reflects the current dependency set if
   anything changed under `src/tools/`.

## Build the bundle (no publish)

Iterate locally without touching git or the GitHub Releases page:

```powershell
# Use the version currently in plugin.json
.\scripts\build-release.ps1 -ArtifactsPath E:\winappcli\artifacts

# Pin a specific version
.\scripts\build-release.ps1 -ArtifactsPath .\artifacts -Version 0.3.0
```

The script writes `staging/win-dev-skills-v<version>.zip`. Smoke-test
it by extracting somewhere fresh and running `install.cmd` — confirm
`winapp` is on `PATH`, `copilot plugin list` shows `win-dev-skills`,
and the bundle root contains the compliance docs.

## Publish to GitHub Releases

```powershell
.\scripts\build-release.ps1 -ArtifactsPath E:\winappcli\artifacts -Publish
```

When `-Publish` is set the script will:

1. Verify `gh auth status`, that you're on `main`, and that the working
   tree is clean. (Refuses to proceed otherwise.)
2. Auto-bump the patch version in `plugin.json` if `-Version` wasn't
   passed.
3. Build the bundle (same as the no-publish path).
4. Commit the version bump, push, then create and push the `vX.Y.Z`
   tag explicitly so the release is anchored to a specific commit.
5. Run `gh release create vX.Y.Z <zip> --generate-notes` against the
   tag.

To pin a specific version on publish:

```powershell
.\scripts\build-release.ps1 -ArtifactsPath .\artifacts -Version 0.3.0 -Publish
```

## Post-release verification

1. Open the new release on
   [Releases](https://github.com/microsoft/win-dev-skills/releases) and
   confirm:
   - The zip attached is the one you built (matching size).
   - The release notes summary looks reasonable.
   - The release is tagged off the expected commit.
2. Download the zip on a fresh machine (or VM), double-click
   `install.cmd`, verify `winapp` runs and `copilot` lists the plugin.
3. Tweet / post / however the announcement happens.

## Rollback

If a published release is broken:

```powershell
gh release delete v0.3.0 --yes
git push origin :refs/tags/v0.3.0
git revert <bump-commit>     # optional, only if plugin.json bump was wrong
git push
```

Then re-cut the release with the next patch version once the fix
lands on `main`.
