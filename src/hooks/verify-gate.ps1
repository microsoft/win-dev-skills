$ErrorActionPreference = 'SilentlyContinue'
$raw = @($Input) -join "`n"
$hookInput = $raw | ConvertFrom-Json

# Logging
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir) { $scriptDir = (Resolve-Path $scriptDir -ErrorAction SilentlyContinue).Path }
if (-not $scriptDir) { $scriptDir = $hookInput.cwd }
$logFile = Join-Path $scriptDir "stop-hook-log.txt"
$stateFile = Join-Path $scriptDir "stop-hook-state.json"

function Log($msg) {
    $ts = Get-Date -Format "HH:mm:ss.fff"
    "[$ts] $msg" | Out-File $logFile -Append -Encoding utf8
}

# Load state
$state = @{ blockCount = 0 }
if (Test-Path $stateFile) {
    try { $state = Get-Content $stateFile -Raw | ConvertFrom-Json
        $state = @{ blockCount = [int]$state.blockCount }
    } catch {}
}

$maxBlocks = 1
Log "Stop hook triggered (stop_hook_active=$($hookInput.stop_hook_active), blockCount=$($state.blockCount))"

# Safety: hit max blocks, let it go
if ($state.blockCount -ge $maxBlocks) {
    Log "  MAX BLOCKS ($maxBlocks) reached - allowing stop"
    if (Test-Path $stateFile) { Remove-Item $stateFile -Force }
    Write-Output '{"continue":true}'
    exit 0
}

# Check if agent spawned a verifier
$spawnedVerifier = $false
$verifierOutput = ""

# Check transcript
$transcriptPath = $hookInput.transcript_path
if ($transcriptPath -and (Test-Path $transcriptPath)) {
    $transcript = Get-Content $transcriptPath -Raw
    if ($transcript -match 'verifier|verification.*agent|task.*verify') {
        $spawnedVerifier = $true
        $verifierOutput = $transcript
    }
}

# Check events.jsonl for sub-agent
if (-not $spawnedVerifier -and $hookInput.sessionId) {
    $sessionDir = Join-Path $env:USERPROFILE ".copilot\session-state\$($hookInput.sessionId)"
    $eventsFile = Join-Path $sessionDir "events.jsonl"
    if (Test-Path $eventsFile) {
        $events = Get-Content $eventsFile -Raw
        if ($events -match 'subagent\.selected|"verifier"|verification') {
            $spawnedVerifier = $true
            $verifierOutput = $events
        }
    }
}

if (-not $spawnedVerifier) {
    # Never ran verifier - block
    $state.blockCount++
    $state | ConvertTo-Json -Compress | Set-Content $stateFile -Force

    $reason = "You must spawn a verification sub-agent before completing. Use task(agent_type: general-purpose, mode: sync, name: verifier) to test ALL requirements with winapp ui commands. Read the results and fix any failures. Attempt $($state.blockCount)/$maxBlocks."
    Log "  BLOCKING ($($state.blockCount)/$maxBlocks) - no verifier spawned"
    Log "  REASON: $reason"

    $json = @{ decision = "block"; reason = $reason } | ConvertTo-Json -Compress
    Write-Output $json
    exit 0
}

# Verifier was spawned - check if there are FAILs in the output
$hasFails = $verifierOutput -match '\bFAIL\b' -and $verifierOutput -notmatch '0 requirement.*FAIL|FAIL.*0\b|FAIL: 0'
$hasPartial = $verifierOutput -match 'PARTIAL'

if ($hasFails -and $state.blockCount -lt $maxBlocks) {
    $state.blockCount++
    $state | ConvertTo-Json -Compress | Set-Content $stateFile -Force

    $reason = "Verifier found FAILED requirements. Fix them, rebuild, relaunch, and spawn the verifier again. Attempt $($state.blockCount)/$maxBlocks."
    Log "  BLOCKING ($($state.blockCount)/$maxBlocks) - verifier reported FAILs"
    Log "  REASON: $reason"

    $json = @{ decision = "block"; reason = $reason } | ConvertTo-Json -Compress
    Write-Output $json
    exit 0
}

if ($hasPartial -and $state.blockCount -lt ($maxBlocks - 1)) {
    $state.blockCount++
    $state | ConvertTo-Json -Compress | Set-Content $stateFile -Force

    $reason = "Verifier found PARTIAL PASS requirements. Try to fix them for full PASS. Attempt $($state.blockCount)/$maxBlocks."
    Log "  BLOCKING ($($state.blockCount)/$maxBlocks) - verifier reported PARTIAL PASS"
    Log "  REASON: $reason"

    $json = @{ decision = "block"; reason = $reason } | ConvertTo-Json -Compress
    Write-Output $json
    exit 0
}

# All good or max attempts reached
Log "  ALLOWING stop - verifier passed (blockCount=$($state.blockCount))"
if (Test-Path $stateFile) { Remove-Item $stateFile -Force }
Write-Output '{"continue":true}'
exit 0
