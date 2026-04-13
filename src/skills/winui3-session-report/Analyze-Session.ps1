#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Analyzes a Copilot CLI session from its events.jsonl and outputs a structured markdown report.

.PARAMETER SessionId
    Session ID (UUID) to analyze. Looks in ~/.copilot/session-state/<id>/events.jsonl.
    If omitted, analyzes the most recent session.

.PARAMETER EventsFile
    Direct path to an events.jsonl file. Overrides SessionId.

.PARAMETER OutputFile
    Path to write the markdown report. If omitted, writes to stdout.

.EXAMPLE
    .\Analyze-Session.ps1
    .\Analyze-Session.ps1 -SessionId "f116c51e-a9d1-4636-b250-1e00c746705e"
    .\Analyze-Session.ps1 -EventsFile .\build-events.jsonl -OutputFile session-report.md
#>
param(
    [string]$SessionId,
    [string]$EventsFile,
    [string]$OutputFile
)

$ErrorActionPreference = 'Stop'

# ── Resolve events file ──
if ($EventsFile -and (Test-Path $EventsFile)) {
    # Direct path provided
} elseif ($SessionId) {
    $EventsFile = Join-Path $env:USERPROFILE ".copilot\session-state\$SessionId\events.jsonl"
    if (-not (Test-Path $EventsFile)) {
        Write-Error "Session not found: $EventsFile"
        exit 1
    }
} else {
    # Find most recent session
    $sessionStateDir = Join-Path $env:USERPROFILE ".copilot\session-state"
    if (-not (Test-Path $sessionStateDir)) {
        Write-Error "No session state directory found at $sessionStateDir"
        exit 1
    }
    $latest = Get-ChildItem $sessionStateDir -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName "events.jsonl") } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        Write-Error "No sessions with events.jsonl found"
        exit 1
    }
    $EventsFile = Join-Path $latest.FullName "events.jsonl"
    $SessionId = $latest.Name
}

# ── Parse events ──
$lines = Get-Content $EventsFile -Encoding UTF8
$events = @()
foreach ($line in $lines) {
    if (-not $line.Trim()) { continue }
    try { $events += ($line | ConvertFrom-Json) } catch { }
}

if ($events.Count -eq 0) {
    Write-Error "No events found in $EventsFile"
    exit 1
}

# ── Extract session info ──
$userMsg = $events | Where-Object { $_.type -eq 'user.message' } | Select-Object -First 1
$resultEvent = $events | Where-Object { $_.type -eq 'result' } | Select-Object -First 1
$skillsLoaded = $events | Where-Object { $_.type -eq 'session.skills_loaded' } | Select-Object -First 1
$modelEvent = $events | Where-Object { $_.type -eq 'session.tools_updated' } | Select-Object -First 1

$prompt = if ($userMsg.data.content) { $userMsg.data.content } else { "(no prompt found)" }
$sid = if ($resultEvent.sessionId) { $resultEvent.sessionId } elseif ($SessionId) { $SessionId } else { "(unknown)" }
$model = if ($modelEvent.data.model) { $modelEvent.data.model } else { "(unknown)" }
$exitCode = $resultEvent.exitCode
$usage = if ($resultEvent.usage) { $resultEvent.usage } else { @{} }

# Duration
$firstTs = if ($events[0].timestamp) { [DateTime]::Parse($events[0].timestamp) } else { $null }
$lastTs = if ($events[-1].timestamp) { [DateTime]::Parse($events[-1].timestamp) } else { $null }
$durationMin = if ($firstTs -and $lastTs) { [math]::Round(($lastTs - $firstTs).TotalMinutes, 1) } else { 0 }

# Available skills
$availableSkills = @()
if ($skillsLoaded.data.skills) {
    $availableSkills = $skillsLoaded.data.skills | ForEach-Object { $_.name }
}

# ── Turn-by-turn analysis ──
$turns = @()
$currentTurn = $null
$toolStarts = @{}

foreach ($ev in $events) {
    switch ($ev.type) {
        'assistant.turn_start' {
            $currentTurn = @{
                TurnNum = $turns.Count + 1
                Timestamp = $ev.timestamp
                Tools = @()
                OutputTokens = 0
                TextSnippets = @()
                SkillInvocations = @()
            }
        }
        'assistant.message' {
            if ($currentTurn) {
                $currentTurn.OutputTokens = if ($ev.data.outputTokens) { $ev.data.outputTokens } else { 0 }
                if ($ev.data.toolRequests) {
                    foreach ($tr in $ev.data.toolRequests) {
                        $currentTurn.Tools += @{
                            Name = $tr.name
                            Args = $tr.arguments
                            CallId = if ($tr.id) { $tr.id } else { $tr.toolCallId }
                            HasError = $false
                            ErrorSummary = @()
                        }
                    }
                }
            }
        }
        'assistant.message_delta' {
            if ($currentTurn -and $ev.data.deltaContent) {
                $currentTurn.TextSnippets += $ev.data.deltaContent
            }
        }
        'tool.execution_start' {
            $toolStarts[$ev.data.toolCallId] = @{
                Name = $ev.data.toolName
                Args = $ev.data.arguments
            }
        }
        'tool.execution_complete' {
            $start = $toolStarts[$ev.data.toolCallId]
            if ($start -and $currentTurn) {
                $resultText = ""
                $r = $ev.data.result
                if ($r -is [string]) { $resultText = $r }
                elseif ($r.textResultForLlm) { $resultText = $r.textResultForLlm }
                elseif ($r.content) { $resultText = $r.content }
                else { $resultText = ($r | ConvertTo-Json -Depth 3 -Compress) }

                # Track skill invocations
                if ($start.Name -eq 'skill' -and $start.Args.skill) {
                    $currentTurn.SkillInvocations += $start.Args.skill
                }

                # Check for errors and attach to tool
                $hasErr = $resultText -match 'error|FAILED|SyntaxError'
                if ($hasErr) {
                    $errLines = ($resultText -split "`n") | Where-Object { $_ -match 'error|FAILED|SyntaxError' } | Select-Object -First 5
                    $errSummary = @()
                    foreach ($errLine in $errLines) {
                        $cleaned = $errLine.Trim()
                        # Extract structured error: "error CS0103: The name 'X' does not exist..."
                        if ($cleaned -match 'error (CS\d+|XLS\d+|XDG\d+|MSB\d+):\s*(.+?)(\s*\[|$)') {
                            $errSummary += "$($Matches[1]): $($Matches[2].Trim())"
                        } elseif ($cleaned -match 'SyntaxError:\s*(.+)') {
                            $errSummary += "SyntaxError: $($Matches[1].Trim())"
                        } elseif ($cleaned -match 'error (MSB\d+)') {
                            # MSB3073 etc. with long paths - extract the key part
                            if ($cleaned -match 'error (MSB\d+):.*exited with code (\d+)') {
                                $errSummary += "$($Matches[1]): XamlCompiler.exe exited with code $($Matches[2])"
                            } else {
                                $errSummary += $Matches[1]
                            }
                        } elseif ($cleaned -match 'BUILD FAILED') {
                            $errSummary += "BUILD FAILED"
                        } else {
                            $errSummary += $cleaned.Substring(0, [Math]::Min($cleaned.Length, 120))
                        }
                    }
                    $errSummary = $errSummary | Select-Object -Unique
                }
                foreach ($t in $currentTurn.Tools) {
                    if ($t.CallId -eq $ev.data.toolCallId -or $t.Name -eq $start.Name) {
                        $t.HasError = $hasErr
                        if ($hasErr) { $t.ErrorSummary = $errSummary }
                        break
                    }
                }
            }
        }
        'assistant.turn_end' {
            if ($currentTurn) {
                $turns += $currentTurn
                $currentTurn = $null
            }
        }
    }
}

# ── Categorize turns ──
function Get-TurnCategory($turn) {
    $toolNames = $turn.Tools | ForEach-Object { $_.Name }
    $hasSkill = $turn.SkillInvocations.Count -gt 0
    $hasBuild = $turn.Tools | Where-Object {
        $_.Name -eq 'powershell' -and ($_.Args.command -match 'dotnet build|MSBuild|BuildAndRun|msbuild')
    }
    $hasRun = $turn.Tools | Where-Object {
        $_.Name -eq 'powershell' -and ($_.Args.command -match 'winapp run|BuildAndRun(?!.*-SkipRun)')
    }
    $hasCreate = 'create' -in $toolNames
    $hasEdit = 'edit' -in $toolNames
    $hasView = 'view' -in $toolNames
    $hasGit = $turn.Tools | Where-Object { $_.Name -eq 'powershell' -and $_.Args.command -match '\bgit\b' }
    $hasBuildError = $turn.Tools | Where-Object { $_.HasError -and $_.Name -eq 'powershell' }
    $hasScaffold = $turn.Tools | Where-Object { $_.Args.command -match 'dotnet new|New-Item.*Directory' }
    # Diagnosing: shell commands that inspect build output, check errors, read logs, verbose builds
    $isDiagnosing = $turn.Tools | Where-Object {
        $_.Name -eq 'powershell' -and ($_.Args.command -match 'XamlCompiler|output\.json|input\.json|-v d\b|-v:d|-verbosity|Select-String.*error|obj\\|temp_output|Remove-Item.*obj|Get-Content.*log|Get-Process')
    }

    if ($hasSkill -and $toolNames.Count -le 2) { return 'skill-load' }
    if ($hasGit -and -not $hasBuild) { return 'git' }
    if ($hasBuild -and $hasBuildError) { return 'build-fix' }
    if ($hasBuild -and -not $hasBuildError) { return 'build-ok' }
    if ($hasRun) { return 'run' }
    if ($isDiagnosing -and -not $hasEdit) { return 'diagnosing' }
    if ($hasScaffold) { return 'scaffold' }
    if ($hasCreate -and -not $hasEdit) { return 'code-create' }
    if ($hasEdit) { return 'code-edit' }
    if ($hasView -and -not $hasEdit -and -not $hasCreate) { return 'explore' }
    if ($toolNames.Count -eq 0) { return 'thinking' }
    return 'other'
}

foreach ($turn in $turns) {
    $turn.Category = Get-TurnCategory $turn
}

# ── Build analysis ──
$buildAttempts = ($turns | Where-Object { $_.Category -in 'build-ok', 'build-fix' }).Count
$buildFailures = ($turns | Where-Object { $_.Category -eq 'build-fix' }).Count
$buildSuccesses = ($turns | Where-Object { $_.Category -eq 'build-ok' }).Count

$buildErrors = @()
foreach ($turn in $turns) {
    foreach ($tool in $turn.Tools) {
        if ($tool.HasError -and $tool.Name -eq 'powershell' -and $tool.Args.command -match 'build|Build|MSBuild') {
            $buildErrors += @{ Turn = $turn.TurnNum; Errors = $tool.ErrorSummary }
        }
    }
}

# ── BuildAndRun.ps1 usage ──
$buildAndRunUsed = $turns | Where-Object {
    $_.Tools | Where-Object { $_.Name -eq 'powershell' -and $_.Args.command -match 'BuildAndRun' }
}
$rawDotnetBuilds = $turns | Where-Object {
    $_.Tools | Where-Object { $_.Name -eq 'powershell' -and $_.Args.command -match 'dotnet build' -and $_.Args.command -notmatch 'BuildAndRun' }
}

if ($buildAndRunUsed -and -not $rawDotnetBuilds) {
    $buildScriptStatus = "Used BuildAndRun.ps1 for all builds"
} elseif ($buildAndRunUsed -and $rawDotnetBuilds) {
    $buildScriptStatus = "Mixed: raw 'dotnet build' $($rawDotnetBuilds.Count)x, BuildAndRun.ps1 $($buildAndRunUsed.Count)x"
} elseif ($rawDotnetBuilds) {
    $buildScriptStatus = "NOT USED: raw 'dotnet build' $($rawDotnetBuilds.Count)x, never used BuildAndRun.ps1"
} else {
    $buildScriptStatus = "No build commands detected"
}

# ── Skill timeline ──
$skillTimeline = @()
foreach ($turn in $turns) {
    foreach ($skill in $turn.SkillInvocations) {
        $skillTimeline += @{ Turn = $turn.TurnNum; Skill = $skill }
    }
}
$invokedSkills = $skillTimeline | ForEach-Object { $_.Skill } | Select-Object -Unique
$notInvoked = $availableSkills | Where-Object { $_ -notin $invokedSkills -and $_ -ne 'customize-cloud-agent' }

# ── Token breakdown by category ──
$totalOutputTokens = ($turns | Measure-Object -Property OutputTokens -Sum).Sum
$categoryGroups = $turns | Group-Object -Property Category
$categoryTable = $categoryGroups | ForEach-Object {
    $tokens = ($_.Group | Measure-Object -Property OutputTokens -Sum).Sum
    @{ Category = $_.Name; Turns = $_.Count; Tokens = $tokens }
} | Sort-Object { $_.Turns } -Descending

# ── Stuck pattern detection ──
$stuckPatterns = @()

# Repeated file reads
$fileReads = @{}
foreach ($turn in $turns) {
    foreach ($tool in $turn.Tools) {
        if ($tool.Name -eq 'view' -and $tool.Args.path) {
            $file = Split-Path $tool.Args.path -Leaf
            $fileReads[$file] = ($fileReads[$file] ?? 0) + 1
        }
    }
}
$excessiveReads = $fileReads.GetEnumerator() | Where-Object { $_.Value -ge 3 }
if ($excessiveReads) {
    $detail = ($excessiveReads | ForEach-Object { "$($_.Key) ($($_.Value)x)" }) -join ', '
    $stuckPatterns += "Repeated file reads: $detail"
}

# Build loops
$consecutive = 0; $maxConsec = 0
foreach ($turn in $turns) {
    if ($turn.Category -eq 'build-fix') { $consecutive++; $maxConsec = [Math]::Max($maxConsec, $consecutive) }
    elseif ($turn.Category -eq 'build-ok') { $consecutive = 0 }
}
if ($maxConsec -ge 3) {
    $stuckPatterns += "Build loop: $maxConsec consecutive build failures before success"
}

# Obj clean attempts
$objCleans = ($turns | Where-Object {
    $_.Tools | Where-Object { $_.Args.command -match 'Remove-Item.*obj' }
}).Count
if ($objCleans -ge 2) {
    $stuckPatterns += "Cleaned obj/ directory ${objCleans}x (suggests stale XAML compiler state)"
}

# ── Tooling improvement opportunities ──
$toolingIssues = @()

if ($rawDotnetBuilds -and $rawDotnetBuilds.Count -gt 0) {
    $toolingIssues += @{
        Area = "BuildAndRun.ps1"
        Issue = $buildScriptStatus
        Suggestion = "Agent should use BuildAndRun.ps1 for builds — it includes the Roslyn analyzer, auto-detects platform, and handles common errors."
    }
}

if ($buildErrors | Where-Object { $_.Errors -match 'MSB3073' }) {
    $toolingIssues += @{
        Area = "XAML Compiler"
        Issue = "XamlCompiler.exe crashed (MSB3073) — agent could not diagnose from error output"
        Suggestion = "Clean obj/ first when MSB3073 occurs. CS0103 errors for x:Name elements are a side-effect of XAML compiler failure — fix XAML before C#."
    }
}

$devWorkflowEntry = $skillTimeline | Where-Object { $_.Skill -eq 'winui3-dev-workflow' } | Select-Object -First 1
$firstBuildTurn = ($turns | Where-Object { $_.Category -in 'build-ok', 'build-fix' } | Select-Object -First 1).TurnNum
if ($devWorkflowEntry -and $rawDotnetBuilds -and $devWorkflowEntry.Turn -gt $firstBuildTurn) {
    $toolingIssues += @{
        Area = "Skill timing"
        Issue = "dev-workflow skill loaded at turn $($devWorkflowEntry.Turn) but first build was turn $firstBuildTurn"
        Suggestion = "Agent should load dev-workflow before its first build attempt."
    }
}

# ── Generate markdown report ──
$categoryLabels = @{
    'skill-load' = 'Skill loading'; 'explore' = 'Reading/exploring'; 'scaffold' = 'Scaffolding'
    'code-create' = 'Creating files'; 'code-edit' = 'Editing code'; 'build-ok' = 'Build (success)'
    'build-fix' = 'Build (failed)'; 'run' = 'Running app'; 'git' = 'Git operations'
    'thinking' = 'Thinking (no tools)'; 'diagnosing' = 'Diagnosing errors'; 'other' = 'Other'
}

$md = @()
$md += "# Session Analysis Report"
$md += ""
$md += "## Overview"
$md += ""
$md += "| Field | Value |"
$md += "|-------|-------|"
$md += "| Session ID | " + '`' + $sid + '`' + " |"
$md += "| Model | $model |"
$md += "| Duration | $durationMin min |"
$md += "| Turns | $($turns.Count) |"
$md += "| Output tokens | $($totalOutputTokens.ToString('N0')) |"
$md += "| Premium requests | $(if ($usage.premiumRequests) { $usage.premiumRequests } else { 'N/A' }) |"
$md += "| Exit code | $exitCode |"
$md += "| Lines added | $(if ($usage.codeChanges.linesAdded) { $usage.codeChanges.linesAdded } else { 'N/A' }) |"
$md += "| Files modified | $(if ($usage.codeChanges.filesModified) { $usage.codeChanges.filesModified.Count } else { 'N/A' }) |"
$md += ""

$md += "## Prompt"
$md += ""
$promptDisplay = if ($prompt.Length -gt 500) { $prompt.Substring(0, 500) + "..." } else { $prompt }
$md += '```'
$md += $promptDisplay
$md += '```'
$md += ""

$md += "## Turn Breakdown"
$md += ""
$md += "| Category | Turns | Output Tokens |"
$md += "|----------|------:|--------------:|"
foreach ($cat in $categoryTable) {
    $label = if ($categoryLabels[$cat.Category]) { $categoryLabels[$cat.Category] } else { $cat.Category }
    $md += "| $label | $($cat.Turns) | $($cat.Tokens.ToString('N0')) |"
}
$md += ""

$md += "## Skills"
$md += ""
if ($skillTimeline.Count -gt 0) {
    $md += "**Invoked:**"
    foreach ($s in $skillTimeline) {
        $md += "- Turn $($s.Turn): " + '`' + $s.Skill + '`'
    }
} else {
    $md += "_No skills were invoked during this session._"
}
$md += ""
if ($notInvoked.Count -gt 0) {
    $notInvokedStr = ($notInvoked | ForEach-Object { '`' + $_ + '`' }) -join ', '
    $md += "**Available but not invoked:** $notInvokedStr"
    $md += ""
}

$md += "## Build Analysis"
$md += ""
$md += "- **Attempts:** $buildAttempts ($buildSuccesses success, $buildFailures failed)"
$md += "- **BuildAndRun.ps1:** $buildScriptStatus"
$md += ""
if ($buildErrors.Count -gt 0) {
    $md += "**Build errors encountered:**"
    $md += ""
    foreach ($be in $buildErrors) {
        $md += "Turn $($be.Turn):"
        foreach ($err in $be.Errors) {
            $md += "- " + '`' + $err + '`'
        }
    }
    $md += ""
}

if ($stuckPatterns.Count -gt 0) {
    $md += "## Stuck Patterns"
    $md += ""
    foreach ($sp in $stuckPatterns) {
        $md += "- $sp"
    }
    $md += ""
}

if ($toolingIssues.Count -gt 0) {
    $md += "## Tooling Improvement Opportunities"
    $md += ""
    foreach ($ti in $toolingIssues) {
        $md += "### $($ti.Area)"
        $md += "- **Issue:** $($ti.Issue)"
        $md += "- **Suggestion:** $($ti.Suggestion)"
        $md += ""
    }
}

$md += "## Turn Detail"
$md += ""
$md += "| # | Category | Tokens | Tools |"
$md += "|--:|----------|-------:|-------|"
foreach ($turn in $turns) {
    $toolStr = ($turn.Tools | ForEach-Object {
        $err = if ($_.HasError) { " :x:" } else { "" }
        $summary = ""
        if ($_.Name -eq 'powershell') { $summary = ($_.Args.command -split "`n")[0]; if ($summary.Length -gt 60) { $summary = $summary.Substring(0, 60) } }
        elseif ($_.Args.path) { $summary = Split-Path $_.Args.path -Leaf }
        elseif ($_.Name -eq 'skill') { $summary = $_.Args.skill }
        elseif ($_.Args.pattern) { $summary = $_.Args.pattern }
        if ($summary) { "$($_.Name)($summary)$err" } else { "$($_.Name)$err" }
    }) -join ', '
    $skills = if ($turn.SkillInvocations.Count -gt 0) { " [skill: $($turn.SkillInvocations -join ',')]" } else { "" }
    $md += "| $($turn.TurnNum) | $($turn.Category) | $($turn.OutputTokens.ToString('N0')) | $toolStr$skills |"
}

# ── Output ──
$report = $md -join "`n"
if ($OutputFile) {
    Set-Content -Path $OutputFile -Value $report -Encoding UTF8
    Write-Host "Report saved to: $OutputFile" -ForegroundColor Green
} else {
    Write-Output $report
}
