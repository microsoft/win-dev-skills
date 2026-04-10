<#
.SYNOPSIS
  Analyze a build-events.jsonl file and report token usage for main agent and each sub-agent.

.PARAMETER Path
  Path to a *-events.jsonl file.

.PARAMETER Json
  Output as JSON instead of formatted table.

.EXAMPLE
  .\analyze-session-tokens.ps1 agent-benchmark\results\run4\st50_subagent-test_s46_i1\build-events.jsonl

.EXAMPLE
  .\analyze-session-tokens.ps1 build-events.jsonl -Json | ConvertFrom-Json
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [string] $Path,

    [switch] $Json
)

if (-not (Test-Path $Path)) {
    Write-Error "File not found: $Path"
    exit 1
}

# Track main agent and per-sub-agent stats
$main = @{ outputTokens = 0; messages = 0; toolCalls = 0 }
$subs = @{}  # keyed by toolCallId
$subMeta = @{}  # keyed by toolCallId → metadata from subagent.started/completed

$sessionResult = $null
$totalEvents = 0

Get-Content $Path | ForEach-Object {
    $totalEvents++
    $e = $_ | ConvertFrom-Json

    switch ($e.type) {
        'assistant.message' {
            $tokens = $e.data.outputTokens
            if (-not $tokens) { $tokens = 0 }

            if ($e.data.parentToolCallId) {
                $key = $e.data.parentToolCallId
                if (-not $subs[$key]) {
                    $subs[$key] = @{ outputTokens = 0; messages = 0; toolCalls = 0 }
                }
                $subs[$key].outputTokens += $tokens
                $subs[$key].messages++

                # Count tool requests from sub-agent
                if ($e.data.toolRequests) {
                    $subs[$key].toolCalls += $e.data.toolRequests.Count
                }
            } else {
                $main.outputTokens += $tokens
                $main.messages++
                if ($e.data.toolRequests) {
                    $main.toolCalls += $e.data.toolRequests.Count
                }
            }
        }

        'subagent.started' {
            $key = $e.data.toolCallId
            if (-not $subMeta[$key]) { $subMeta[$key] = @{} }
            $subMeta[$key].name = $e.data.agentDisplayName ?? $e.data.agentName ?? 'unknown'
            $subMeta[$key].startedAt = $e.timestamp
        }

        'subagent.completed' {
            $key = $e.data.toolCallId
            if (-not $subMeta[$key]) { $subMeta[$key] = @{} }
            $subMeta[$key].model = $e.data.model
            $subMeta[$key].totalTokens = $e.data.totalTokens
            $subMeta[$key].durationMs = $e.data.durationMs
            $subMeta[$key].totalToolCalls = $e.data.totalToolCalls
            $subMeta[$key].status = 'completed'
        }

        'subagent.failed' {
            $key = $e.data.toolCallId
            if (-not $subMeta[$key]) { $subMeta[$key] = @{} }
            $subMeta[$key].model = $e.data.model
            $subMeta[$key].totalTokens = $e.data.totalTokens
            $subMeta[$key].durationMs = $e.data.durationMs
            $subMeta[$key].status = 'failed'
        }

        'result' {
            $sessionResult = $e
        }
    }
}

# Build sub-agent summary list
$subList = @()
foreach ($key in $subs.Keys) {
    $meta = $subMeta[$key]
    $s = $subs[$key]
    $subList += [PSCustomObject]@{
        toolCallId    = $key.Substring(0, [Math]::Min(20, $key.Length))
        name          = if ($meta) { $meta.name } else { '?' }
        status        = if ($meta -and $meta.status) { $meta.status } else { 'running' }
        model         = if ($meta) { $meta.model } else { '?' }
        outputTokens  = $s.outputTokens
        totalTokens   = if ($meta) { $meta.totalTokens } else { $null }
        messages      = $s.messages
        toolCalls     = $s.toolCalls
        durationSec   = if ($meta -and $meta.durationMs) { [Math]::Round($meta.durationMs / 1000, 1) } else { $null }
    }
}

# Session-level stats
$sessionInfo = $null
if ($sessionResult) {
    $sessionInfo = [PSCustomObject]@{
        premiumRequests = $sessionResult.usage.premiumRequests
        apiTimeMs       = $sessionResult.usage.totalApiDurationMs
        sessionTimeMs   = $sessionResult.usage.sessionDurationMs
        linesAdded      = $sessionResult.usage.codeChanges.linesAdded
        linesRemoved    = $sessionResult.usage.codeChanges.linesRemoved
    }
}

$result = [PSCustomObject]@{
    file          = $Path
    totalEvents   = $totalEvents
    session       = $sessionInfo
    mainAgent     = [PSCustomObject]@{
        outputTokens = $main.outputTokens
        messages     = $main.messages
        toolCalls    = $main.toolCalls
    }
    subAgents     = $subList
    totals        = [PSCustomObject]@{
        mainOutputTokens = $main.outputTokens
        subOutputTokens  = ($subs.Values | Measure-Object -Property outputTokens -Sum).Sum
        totalOutputTokens = $main.outputTokens + ($subs.Values | Measure-Object -Property outputTokens -Sum).Sum
        subAgentCount    = $subs.Count
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 4
} else {
    Write-Host ""
    Write-Host "=== Session Token Analysis ===" -ForegroundColor Cyan
    Write-Host "File: $Path"
    Write-Host "Total events: $totalEvents"
    Write-Host ""

    if ($sessionInfo) {
        Write-Host "Session: $($sessionInfo.premiumRequests) premium requests, API $([Math]::Round($sessionInfo.apiTimeMs/1000, 1))s, Session $([Math]::Round($sessionInfo.sessionTimeMs/1000, 1))s" -ForegroundColor Gray
        Write-Host "Code changes: +$($sessionInfo.linesAdded) -$($sessionInfo.linesRemoved)" -ForegroundColor Gray
        Write-Host ""
    }

    Write-Host "Main Agent:" -ForegroundColor Yellow
    Write-Host "  Output tokens: $($main.outputTokens) | Messages: $($main.messages) | Tool calls: $($main.toolCalls)"
    Write-Host ""

    if ($subList.Count -gt 0) {
        Write-Host "Sub-Agents ($($subList.Count)):" -ForegroundColor Yellow
        $subList | Format-Table -AutoSize -Property name, status, model, outputTokens, totalTokens, messages, toolCalls, durationSec | Out-String | Write-Host
    } else {
        Write-Host "Sub-Agents: none" -ForegroundColor Gray
    }

    Write-Host "Totals:" -ForegroundColor Green
    Write-Host "  Main output tokens:  $($result.totals.mainOutputTokens)"
    Write-Host "  Sub output tokens:   $($result.totals.subOutputTokens)"
    Write-Host "  Total output tokens: $($result.totals.totalOutputTokens)"
    Write-Host ""
}
