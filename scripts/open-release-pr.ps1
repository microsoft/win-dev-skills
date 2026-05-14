<#
.SYNOPSIS
  Open a release promotion PR from staging → main.

.DESCRIPTION
  Drafts the version bump + CHANGELOG entry for a new release and opens the
  promotion PR via gh. See RELEASING.md for the full flow.

  What it does:
    1. Verifies clean working tree, fetches origin, checks staging is ahead of main.
    2. Lists the commits going into the release.
    3. Suggests a semver bump (patch by default; minor on heuristic triggers).
    4. Lets you accept or override the version.
    5. Writes the version into all 5 manifest fields.
    6. Promotes [Unreleased] CHANGELOG bullets into a new dated section.
    7. Pushes a release/X.Y.Z branch and opens the PR via gh.

.PARAMETER Version
  Override the suggested version. Must be valid semver (X.Y.Z[-prerelease]).

.PARAMETER DryRun
  Print what would happen without modifying files or pushing anything.
#>
[CmdletBinding()]
param(
  [string]$Version,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail($msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

function Info($msg) {
  Write-Host $msg -ForegroundColor Cyan
}

function Read-Version([string]$file, [string]$jqPath) {
  $raw = Get-Content $file -Raw | ConvertFrom-Json
  $cur = $raw
  foreach ($seg in $jqPath -split '\.') {
    if ($seg -match '^\[(\d+)\]$') {
      $cur = $cur[[int]$matches[1]]
    } else {
      $cur = $cur.$seg
    }
  }
  return $cur
}

# ---- 1. Preflight --------------------------------------------------------

$repoRoot = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0) { Fail "Not in a git repo." }
Set-Location $repoRoot

$dirty = @(git status --porcelain)
if ($dirty.Count -gt 0) {
  Fail "Working tree is not clean. Commit or stash first."
}

Info "Fetching origin..."
git fetch origin --quiet

$mainSha    = (git rev-parse origin/main).Trim()
$stagingSha = (git rev-parse origin/staging 2>$null)
if ($LASTEXITCODE -ne 0) { Fail "origin/staging does not exist. Create it first (see RELEASING.md § First-time setup)." }
$stagingSha = $stagingSha.Trim()

if ($mainSha -eq $stagingSha) {
  Fail "origin/staging and origin/main are at the same commit -- nothing to release."
}

# Make sure staging is strictly ahead of main (no diverged history).
$behind = (git rev-list --count "origin/staging..origin/main").Trim()
if ([int]$behind -gt 0) {
  Fail "origin/main has $behind commit(s) not on staging. Back-merge main → staging first."
}

# ---- 2. Enumerate commits going into the release -------------------------

$commits = git log --pretty=format:'%H%x09%s' "origin/main..origin/staging"
$commitLines = $commits -split "`n" | Where-Object { $_ }
Info "`nCommits in this release ($($commitLines.Count)):"
$commitLines | ForEach-Object {
  $parts = $_ -split "`t", 2
  Write-Host "  $($parts[0].Substring(0,8))  $($parts[1])"
}

# ---- 3. Suggest semver bump ----------------------------------------------

$currentVersion = Read-Version 'plugins/winui/plugin.json' 'version'
Info "`nCurrent version on main: $currentVersion"

$bump = 'patch'
$bumpReasons = @()

foreach ($line in $commitLines) {
  $msg = ($line -split "`t", 2)[1]
  if ($msg -match '(?i)BREAKING(\s+CHANGE)?:') {
    $bump = 'minor'
    $bumpReasons += "commit message contains BREAKING: '$msg'"
  }
}

# Path heuristics (run git diff once and grep paths).
$changedPaths = git diff --name-only "origin/main" "origin/staging"
foreach ($p in $changedPaths) {
  if ($p -match '^plugins/winui/agents/') {
    $bump = 'minor'; $bumpReasons += "agent change: $p"
  }
  elseif ($p -match '^plugins/winui/skills/[^/]+/SKILL\.md$') {
    # Skill SKILL.md edits are usually patch; only bump minor if a NEW skill dir appeared.
  }
}
# New skill directory?
$mainSkills    = git ls-tree --name-only -d "origin/main:plugins/winui/skills" 2>$null
$stagingSkills = git ls-tree --name-only -d "origin/staging:plugins/winui/skills" 2>$null
$newSkills = Compare-Object -ReferenceObject @($mainSkills) -DifferenceObject @($stagingSkills) `
              -PassThru | Where-Object { $_.SideIndicator -eq '=>' }
if ($newSkills) {
  $bump = 'minor'
  foreach ($s in $newSkills) { $bumpReasons += "new skill: $s" }
}

function Bump-Semver([string]$v, [string]$kind) {
  if (-not ($v -match '^(\d+)\.(\d+)\.(\d+)(?:-.*)?$')) { Fail "Cannot parse semver '$v'" }
  $maj = [int]$matches[1]; $min = [int]$matches[2]; $pat = [int]$matches[3]
  switch ($kind) {
    'patch' { return "$maj.$min.$($pat + 1)" }
    'minor' { return "$maj.$($min + 1).0" }
    'major' { return "$($maj + 1).0.0" }
  }
}

$suggested = Bump-Semver $currentVersion $bump
Info "`nSuggested bump: $bump → $suggested"
if ($bumpReasons) {
  Write-Host "  reasons:" -ForegroundColor DarkGray
  $bumpReasons | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
}

if (-not $Version) {
  $resp = Read-Host "Accept '$suggested'? [Y / type a different version]"
  if (-not $resp -or $resp -match '^[Yy]') {
    $Version = $suggested
  } else {
    $Version = $resp.Trim()
  }
}

if (-not ($Version -match '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$')) {
  Fail "Version '$Version' is not valid semver."
}

# Strict-greater check.
$bigger = @($currentVersion, $Version) | Sort-Object { [version]($_ -replace '-.*$','') } | Select-Object -Last 1
if ($Version -eq $currentVersion -or $bigger -ne $Version) {
  Fail "Version '$Version' is not strictly greater than current '$currentVersion'."
}

Info "`nUsing version: $Version"

if ($DryRun) {
  Info "`n--DryRun set; stopping before file edits."
  exit 0
}

# ---- 4. Create release branch from staging -------------------------------

$branch = "release/$Version"
Info "`nCreating local branch $branch from origin/staging..."
git checkout -B $branch origin/staging | Out-Null

# ---- 5. Bump 5 version fields --------------------------------------------

function Set-JsonField([string]$file, [string[]]$path, [string]$value) {
  $json = Get-Content $file -Raw | ConvertFrom-Json
  $obj = $json
  for ($i = 0; $i -lt $path.Length - 1; $i++) {
    $seg = $path[$i]
    if ($seg -match '^\[(\d+)\]$') { $obj = $obj[[int]$matches[1]] } else { $obj = $obj.$seg }
  }
  $last = $path[-1]
  if ($last -match '^\[(\d+)\]$') { $obj[[int]$matches[1]] = $value } else { $obj.$last = $value }
  ($json | ConvertTo-Json -Depth 32) | Set-Content $file -Encoding UTF8
}

Info "Writing version into 5 fields..."
Set-JsonField 'plugins/winui/plugin.json'           @('version')                $Version
Set-JsonField '.github/plugin/marketplace.json'     @('metadata','version')     $Version
Set-JsonField '.github/plugin/marketplace.json'     @('plugins','[0]','version') $Version
Set-JsonField '.claude-plugin/marketplace.json'     @('version')                $Version
Set-JsonField '.claude-plugin/marketplace.json'     @('plugins','[0]','version') $Version

# ---- 6. Promote [Unreleased] in CHANGELOG --------------------------------

$today = (Get-Date).ToString('yyyy-MM-dd')
$emDash = [char]0x2014
$cl = Get-Content CHANGELOG.md -Raw

# Find the [Unreleased] section and split.
$pattern = '(?ms)^## \[Unreleased\].*?(?=^## \[)'
$m = [regex]::Match($cl, $pattern)
if (-not $m.Success) {
  Fail "Could not find ## [Unreleased] section in CHANGELOG.md"
}

$unreleasedBlock = $m.Value
# Strip the heading + the maintainer comment.
$body = $unreleasedBlock -replace '(?ms)^## \[Unreleased\].*?(?=^### |\Z)', ''
$body = $body.TrimEnd() + "`n"

# If body is empty (no bullets under any subheading), seed with a placeholder.
if ($body -notmatch '(?m)^- \S') {
  Write-Host "::warning:: No bullets found under [Unreleased]. Adding a placeholder you should fill in." -ForegroundColor Yellow
  $body = "### Changed`n`n- (fill in user-facing changes -- see commit list below)`n"
}

$newSection = "## [$Version] $emDash $today`n`n$body`n"
$emptyUnreleased = @"
## [Unreleased]

<!--
Maintainers: do NOT edit this section in feature PRs.
The promotion PR (staging → main) moves entries from here into a new
`## [X.Y.Z] -- YYYY-MM-DD` section above and bumps the version in:
  - plugins/winui/plugin.json (version)
  - .github/plugin/marketplace.json (metadata.version, plugins[].version)
  - .claude-plugin/marketplace.json (version, plugins[].version)
The `version-bump` and `changelog-entry` CI jobs enforce this.
-->

### Added

### Changed

### Fixed

### Removed

### Deprecated

"@

$newCl = $cl.Substring(0, $m.Index) + $emptyUnreleased + $newSection + $cl.Substring($m.Index + $m.Length)
Set-Content CHANGELOG.md -Value $newCl -Encoding UTF8

# ---- 7. Commit, push, open PR --------------------------------------------

git add plugins/winui/plugin.json `
        .github/plugin/marketplace.json `
        .claude-plugin/marketplace.json `
        CHANGELOG.md
git commit -m "Release $Version" | Out-Null
git push -u origin $branch

$bodyMd = @"
## Release $Version

Promotion PR: \`staging\` → \`main\`.

### Commits in this release

$( ($commitLines | ForEach-Object {
  $parts = $_ -split "`t", 2
  "- $($parts[0].Substring(0,8))  $($parts[1])"
}) -join "`n" )

### CHANGELOG

See \`CHANGELOG.md\` (top section). **Please review the bullets -- the helper
draft promotes whatever was under \`## [Unreleased]\`. Add or rewrite as
needed before merging.**

### Post-merge

- \`auto-tag\` workflow will create \`v$Version\` pointing at the merge commit.
- Marketplace consumers see the new version on next refresh.
"@

gh pr create `
  --base main `
  --head $branch `
  --title "Release $Version" `
  --body $bodyMd

Info "`nPromotion PR opened. Review CHANGELOG bullets, then merge with a merge commit (NOT squash)."

