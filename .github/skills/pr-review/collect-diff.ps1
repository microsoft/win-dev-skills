#Requires -Version 7.0
<#
.SYNOPSIS
    Diff capture helper for the .github/skills/pr-review skill.

.DESCRIPTION
    Resolves a base ref, picks a review scope (branch/working/staged/all)
    based on user intent + working-tree state, and emits a structured
    capture (commit list, --stat, full unified diff, untracked-file
    contents where relevant) for the orchestrator to feed to its
    sub-agents.

    Determinism lives here so the SKILL.md prose only has to encode
    *policy* (which scope to ask the user about, how to react to a
    too-large diff), not *plumbing* (which git commands to run, in what
    order, with which flags). See the H1 finding from this skill's own
    self-review.

.PARAMETER Scope
    One of branch, working, staged, all, or auto. Default: auto.
    'auto' uses git status + commit count to pick branch vs working,
    and asks the orchestrator to clarify (via the AmbiguousScope exit)
    when both have content.

.PARAMETER Base
    Override the base ref used for branch/all. When omitted, the script
    tries origin/main, then main, then origin/master, then master.

.PARAMETER MaxFiles
    Diff-size guardrail. Default: 50. The script does NOT abort when
    exceeded — it sets DiffStatus=too-large in the output so the
    orchestrator can decide whether to ask the user, scope down, or
    proceed.

.OUTPUTS
    A JSON object on stdout with these fields:

        scope          : branch | working | staged | all
        baseRef        : resolved base ref (null for working/staged)
        headRef        : HEAD or WORKTREE
        commitCount    : int
        fileCount      : int
        addedLines     : int
        removedLines   : int
        diffStatus     : ok | empty | too-large | ambiguous-scope | no-base-ref
        statText       : output of git diff --stat <range>
        commitsText    : output of git log --oneline <range>
        diffText       : output of git diff <range>
        untrackedFiles : array of { path, contents } (working/all only)
        notes          : string[] — human-readable diagnostics

    The orchestrator parses this and inlines diffText into each
    sub-agent prompt; statText/commitsText power the header line.

.EXAMPLE
    pwsh .github/skills/pr-review/collect-diff.ps1 -Scope working
#>

[CmdletBinding()]
param(
    [ValidateSet('branch', 'working', 'staged', 'all', 'auto')]
    [string]$Scope = 'auto',
    [string]$Base,
    [int]$MaxFiles = 50
)

$ErrorActionPreference = 'Stop'

function New-Result {
    [pscustomobject]@{
        scope          = $null
        baseRef        = $null
        headRef        = 'HEAD'
        commitCount    = 0
        fileCount      = 0
        addedLines     = 0
        removedLines   = 0
        diffStatus     = 'ok'
        statText       = ''
        commitsText    = ''
        diffText       = ''
        untrackedFiles = @()
        notes          = @()
    }
}

function Resolve-BaseRef {
    param([string]$Override)
    $candidates = if ($Override) { @($Override) } else { @('origin/main', 'main', 'origin/master', 'master') }
    foreach ($c in $candidates) {
        & git rev-parse --verify --quiet "$c^{commit}" *> $null
        if ($LASTEXITCODE -eq 0) { return $c }
    }
    return $null
}

function Get-CommitCount {
    param([string]$BaseRef)
    $n = & git rev-list --count "$BaseRef..HEAD" 2>$null
    if ($LASTEXITCODE -ne 0) { return 0 }
    return [int]$n
}

function Get-WorkingTreeDirty {
    $status = & git status --porcelain 2>$null
    return -not [string]::IsNullOrWhiteSpace($status)
}

function Get-StagedOnlyDirty {
    $cached = & git diff --cached --name-only 2>$null
    return -not [string]::IsNullOrWhiteSpace($cached)
}

function Parse-Numstat {
    param([string]$Range)
    $added = 0; $removed = 0; $files = 0
    $lines = & git --no-pager diff --numstat $Range 2>$null
    if ($LASTEXITCODE -ne 0) { return @{ files = 0; added = 0; removed = 0 } }
    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split "`t"
        if ($parts.Count -ge 2) {
            # Binary files show '-' instead of counts.
            if ($parts[0] -ne '-') { $added += [int]$parts[0] }
            if ($parts[1] -ne '-') { $removed += [int]$parts[1] }
            $files++
        }
    }
    return @{ files = $files; added = $added; removed = $removed }
}

function Get-UntrackedFiles {
    $list = & git ls-files --others --exclude-standard 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $list) { return @() }
    $out = @()
    foreach ($p in $list) {
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        try {
            $content = Get-Content -LiteralPath $p -Raw -ErrorAction Stop
        } catch {
            $content = "<<unreadable: $($_.Exception.Message)>>"
        }
        $out += [pscustomobject]@{ path = $p; contents = $content }
    }
    return $out
}

# --- 1. Decide scope ---------------------------------------------------------

$result = New-Result

$dirty       = Get-WorkingTreeDirty
$stagedDirty = Get-StagedOnlyDirty

if ($Scope -eq 'auto') {
    $resolvedBaseForCount = Resolve-BaseRef -Override $Base
    $commitsAhead = if ($resolvedBaseForCount) { Get-CommitCount -BaseRef $resolvedBaseForCount } else { 0 }

    if ($dirty -and $commitsAhead -eq 0) {
        $Scope = 'working'
    } elseif (-not $dirty -and $commitsAhead -gt 0) {
        $Scope = 'branch'
    } elseif ($dirty -and $commitsAhead -gt 0) {
        $result.scope      = 'auto'
        $result.diffStatus = 'ambiguous-scope'
        $result.notes     += "Both committed work ($commitsAhead commits ahead of $resolvedBaseForCount) and uncommitted files exist; orchestrator should ask user to pick branch / working / all."
        $result | ConvertTo-Json -Depth 6
        exit 0
    } else {
        # Nothing committed beyond base, working tree clean.
        $result.scope      = 'branch'
        $result.baseRef    = $resolvedBaseForCount
        $result.diffStatus = 'empty'
        $result.notes     += 'Working tree clean and no commits ahead of base — nothing to review.'
        $result | ConvertTo-Json -Depth 6
        exit 0
    }
}

$result.scope = $Scope

# --- 2. Resolve base ref where needed ---------------------------------------

$range = $null
switch ($Scope) {
    'branch' {
        $resolved = Resolve-BaseRef -Override $Base
        if (-not $resolved) {
            $result.diffStatus = 'no-base-ref'
            $result.notes += 'Could not resolve a base ref (tried origin/main, main, origin/master, master).'
            $result | ConvertTo-Json -Depth 6
            exit 0
        }
        $result.baseRef = $resolved
        $range = "$resolved...HEAD"
    }
    'working' {
        $result.headRef = 'WORKTREE'
        $range = 'HEAD'
    }
    'staged' {
        $result.headRef = 'WORKTREE'
        $range = '--cached'
    }
    'all' {
        $resolved = Resolve-BaseRef -Override $Base
        if (-not $resolved) {
            $result.diffStatus = 'no-base-ref'
            $result.notes += 'Could not resolve a base ref for all-scope.'
            $result | ConvertTo-Json -Depth 6
            exit 0
        }
        $result.baseRef = $resolved
        $result.headRef = 'HEAD+WORKTREE'
        # Capture is split into two passes below.
        $range = $null
    }
}

# --- 3. Capture stats + diff -------------------------------------------------

if ($Scope -eq 'all') {
    $branchRange  = "$($result.baseRef)...HEAD"
    $stat1   = (& git --no-pager diff --stat $branchRange 2>$null)        -join "`n"
    $stat2   = (& git --no-pager diff --stat HEAD 2>$null)                -join "`n"
    $diff1   = (& git --no-pager diff $branchRange 2>$null)               -join "`n"
    $diff2   = (& git --no-pager diff HEAD 2>$null)                       -join "`n"
    $commits = (& git --no-pager log --oneline $branchRange 2>$null)      -join "`n"
    $sep     = "`n`n===== uncommitted (worktree + staged) =====`n`n"
    $result.statText    = "$stat1`n$sep$stat2"
    $result.diffText    = "$diff1$sep$diff2"
    $result.commitsText = $commits
    $n1 = Parse-Numstat -Range $branchRange
    $n2 = Parse-Numstat -Range 'HEAD'
    $result.fileCount    = $n1.files + $n2.files
    $result.addedLines   = $n1.added + $n2.added
    $result.removedLines = $n1.removed + $n2.removed
} else {
    $result.statText    = (& git --no-pager diff --stat $range 2>$null) -join "`n"
    $result.diffText    = (& git --no-pager diff $range 2>$null)        -join "`n"
    if ($Scope -eq 'branch') {
        $result.commitsText = (& git --no-pager log --oneline $range 2>$null) -join "`n"
        $result.commitCount = Get-CommitCount -BaseRef $result.baseRef
    }
    $n = Parse-Numstat -Range $range
    $result.fileCount    = $n.files
    $result.addedLines   = $n.added
    $result.removedLines = $n.removed
}

# Untracked files (working + all only) — git diff doesn't include them.
if ($Scope -in @('working', 'all')) {
    $result.untrackedFiles = Get-UntrackedFiles
    if ($result.untrackedFiles.Count -gt 0) {
        $result.fileCount += $result.untrackedFiles.Count
    }
}

# --- 4. Status calls --------------------------------------------------------

if ($result.fileCount -eq 0 -and $result.untrackedFiles.Count -eq 0) {
    $result.diffStatus = 'empty'
    $result.notes += "No files in scope '$Scope'."
} elseif ($result.fileCount -gt $MaxFiles) {
    $result.diffStatus = 'too-large'
    $result.notes += "$($result.fileCount) files exceeds MaxFiles=$MaxFiles; orchestrator should ask user to scope down or confirm."
}

$result | ConvertTo-Json -Depth 6
