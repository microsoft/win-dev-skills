<#
.SYNOPSIS
    Interactive benchmark dashboard with matrix selection, live output streaming, and results comparison.

.DESCRIPTION
    Run-Dashboard.ps1 provides a terminal UI for running benchmarks:
    - Matrix selection: pick scenarios, conditions/agent setups, models
    - Live output: streams copilot output with a status bar showing progress
    - View switching: Tab to toggle between live output, progress matrix, and results
    - Results comparison: summary table of all completed runs

.PARAMETER ShowResults
    Skip running benchmarks, just show results for an existing run.

.PARAMETER RunName
    Resume or view a specific run. If omitted, creates a new run.

.PARAMETER MaxBuildMinutes
    Maximum time in minutes for each copilot build phase. Default: 60.

.EXAMPLE
    .\Run-Dashboard.ps1
    .\Run-Dashboard.ps1 -ShowResults
    .\Run-Dashboard.ps1 -ShowResults -RunName run7-032726-231545
#>
param(
    [switch] $ShowResults,
    [string] $RunName,
    [int] $MaxBuildMinutes = 60
)

$ErrorActionPreference = "Continue"
$benchRoot = (Resolve-Path "$PSScriptRoot\..").Path
$repoRoot = (Resolve-Path "$benchRoot\..").Path
$resultsRoot = "$benchRoot\results"
$globalConfig = Get-Content "$benchRoot\common\config.json" | ConvertFrom-Json

# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

function Get-NextRunName {
    param([string]$Root)
    $existing = Get-ChildItem $Root -Directory -Filter "run*" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^run(\d+)' } |
        ForEach-Object { [int]$Matches[1] }
    $nextNum = if ($existing) { ($existing | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    $ts = Get-Date -Format "MMddyy-HHmmss"
    return "run$nextNum-$ts"
}

function Show-Menu {
    param(
        [string]$Title,
        [string[]]$Items,
        [bool[]]$Selected
    )
    Write-Host "`n  $Title" -ForegroundColor Cyan
    Write-Host "  Use ↑↓ to move, Space to toggle, Enter to confirm, A to select all`n" -ForegroundColor DarkGray

    $cursor = 0
    $sel = [bool[]]$Selected.Clone()

    while ($true) {
        # Render menu
        for ($i = 0; $i -lt $Items.Count; $i++) {
            $check = if ($sel[$i]) { "[✓]" } else { "[ ]" }
            $color = if ($i -eq $cursor) { "Yellow" } else { "White" }
            $prefix = if ($i -eq $cursor) { " ► " } else { "   " }
            Write-Host "$prefix$check $($Items[$i])" -ForegroundColor $color
        }

        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        # Move cursor back up to overwrite
        [Console]::SetCursorPosition(0, [Console]::CursorTop - $Items.Count)

        switch ($key.VirtualKeyCode) {
            38 { $cursor = [Math]::Max(0, $cursor - 1) }           # Up
            40 { $cursor = [Math]::Min($Items.Count - 1, $cursor + 1) }  # Down
            32 { $sel[$cursor] = -not $sel[$cursor] }               # Space
            65 {                                                     # A = toggle all
                $allOn = ($sel | Where-Object { $_ }).Count -eq $Items.Count
                for ($i = 0; $i -lt $sel.Count; $i++) { $sel[$i] = -not $allOn }
            }
            13 { break }                                             # Enter
        }
        if ($key.VirtualKeyCode -eq 13) { break }
    }

    # Clear and show final selection
    for ($i = 0; $i -lt $Items.Count; $i++) {
        $check = if ($sel[$i]) { "[✓]" } else { "[ ]" }
        $color = if ($sel[$i]) { "Green" } else { "DarkGray" }
        Write-Host "   $check $($Items[$i])" -ForegroundColor $color
    }

    return $sel
}

function Show-ProgressMatrix {
    param($Matrix, $RunName)

    $completed = ($Matrix | Where-Object { $_.Status -match "^(done|failed|timeout)" }).Count
    $total = $Matrix.Count
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host ("║  RUN: {0}  |  Progress: {1}/{2}  |  Elapsed: {3}" -f $RunName, $completed, $total, ((Get-Date) - $script:runStartTime).ToString('hh\:mm\:ss')) -ForegroundColor Magenta
    Write-Host "╠══════════════════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Magenta
    Write-Host ("║  {0,-28} {1,-24} {2,-14} {3}" -f "Scenario", "Condition", "Model", "Status") -ForegroundColor DarkGray
    Write-Host "║  ─────────────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray

    foreach ($m in $Matrix) {
        $shortModel = $m.Model -replace 'claude-', ''
        $statusStr = switch -Wildcard ($m.Status) {
            "queued"    { "⏳ Queued" }
            "building"  { "🔄 Building..." }
            "validating" { "🔍 Validating..." }
            "retrospective" { "📝 Retrospective..." }
            "done*"     {
                $score = if ($m.Score -ne $null) { "$($m.Score)/100" } else { "—" }
                $time = if ($m.SessionTime) { $m.SessionTime } else { "—" }
                "✅ $score ($time)"
            }
            "failed*"   { "❌ $($m.FailReason)" }
            "timeout"   { "⏰ Timeout ($MaxBuildMinutes min)" }
            default     { $m.Status }
        }
        $color = switch -Wildcard ($m.Status) {
            "done*"     { if ($m.Score -ge 50) { "Green" } else { "Yellow" } }
            "failed*"   { "Red" }
            "timeout"   { "Red" }
            "building"  { "Cyan" }
            "validating" { "Cyan" }
            "retrospective" { "Cyan" }
            default     { "DarkGray" }
        }
        Write-Host ("║  {0,-28} {1,-24} {2,-14} {3}" -f $m.Scenario, $m.Condition, $shortModel, $statusStr) -ForegroundColor $color
    }
    Write-Host "╚══════════════════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
}

function Show-ResultsTable {
    param($Matrix)

    $done = $Matrix | Where-Object { $_.Status -match "^(done|failed|timeout)" }
    if (-not $done) {
        Write-Host "`n  No completed results yet." -ForegroundColor DarkGray
        return
    }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                         RESULTS COMPARISON                                         ║" -ForegroundColor Cyan
    Write-Host "╠══════════════════════════════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host ("║  {0,-26} {1,-22} {2,-12} {3,6} {4,6} {5,5} {6,12} {7,12}" -f "Scenario", "Condition", "Model", "Score", "Build", "Run", "Session", "Code") -ForegroundColor DarkGray
    Write-Host "║  ────────────────────────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray

    foreach ($m in $done | Sort-Object Scenario, Model, @{E={if($_.Score){-$_.Score}else{999}}}) {
        $shortModel = $m.Model -replace 'claude-', ''
        $score = if ($m.Score -ne $null) { "$($m.Score)" } else { "—" }
        $builds = if ($m.Builds) { "✅" } else { "❌" }
        $runs = if ($m.Runs) { "✅" } else { "❌" }
        $time = if ($m.SessionTime) { $m.SessionTime } else { "—" }
        $code = if ($m.CodeChanges) { $m.CodeChanges } else { "—" }

        $color = if ($m.Score -ge 70) { "Green" } elseif ($m.Score -ge 50) { "Yellow" } elseif ($m.Score -gt 0) { "DarkYellow" } else { "Red" }
        Write-Host ("║  {0,-26} {1,-22} {2,-12} {3,6} {4,6} {5,5} {6,12} {7,12}" -f $m.Scenario, $m.Condition, $shortModel, $score, $builds, $runs, $time, $code) -ForegroundColor $color
    }
    Write-Host "╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
}

function Run-SingleBenchmark {
    param($Entry, $RunDir, $RunName)

    $scenarioDir = $Entry.ScenarioPath
    $config = Get-Content "$scenarioDir\scenario.json" | ConvertFrom-Json

    $benchArgs = @{
        Scenario = $scenarioDir
        Condition = $Entry.ConditionType
        Model = $Entry.Model
        RunName = $RunName
        ResultsRoot = $resultsRoot
        MaxBuildMinutes = $MaxBuildMinutes
        MaxAutopilotContinues = 50
    }
    if ($Entry.PluginPath) { $benchArgs.PluginPath = $Entry.PluginPath }

    # Run benchmark and stream output
    & "$benchRoot\common\Run-Benchmark.ps1" @benchArgs

    # Read results if they exist
    $trialDir = "$RunDir\$($config.name)\$($Entry.TrialName)"
    $resultFile = "$trialDir\results.json"
    if (Test-Path $resultFile) {
        $r = Get-Content $resultFile | ConvertFrom-Json
        $Entry.Score = $r.metrics.score
        $Entry.Builds = $r.metrics.builds
        $Entry.Runs = $r.metrics.runs
        $u = $r.metrics.time_and_tokens
        if ($u -and -not $u.skipped) {
            $Entry.SessionTime = $u.session_time
            $Entry.CodeChanges = $u.code_changes
        }
        $Entry.Status = "done"
    } else {
        $Entry.Status = "failed"
        $Entry.FailReason = "No results"
    }
}

# ═══════════════════════════════════════════════════
# SHOW RESULTS MODE
# ═══════════════════════════════════════════════════

if ($ShowResults) {
    # Find the run to show
    if (-not $RunName) {
        $runs = Get-ChildItem $resultsRoot -Directory -Filter "run*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        if (-not $runs) {
            Write-Host "No benchmark runs found in $resultsRoot" -ForegroundColor Red
            return
        }
        Write-Host "`n  Available runs:" -ForegroundColor Cyan
        $runs | ForEach-Object { Write-Host "    $($_.Name)" }
        $RunName = $runs[0].Name
        Write-Host "`n  Showing latest: $RunName`n" -ForegroundColor Green
    }

    $runDir = "$resultsRoot\$RunName"
    $matrix = @()

    Get-ChildItem $runDir -Recurse -Filter "results.json" | ForEach-Object {
        try {
            $r = Get-Content $_.FullName | ConvertFrom-Json
            $u = $r.metrics.time_and_tokens
            $matrix += [PSCustomObject]@{
                Scenario = $r.scenario
                Condition = $r.condition
                Model = $r.model
                Score = $r.metrics.score
                Builds = $r.metrics.builds
                Runs = $r.metrics.runs
                SessionTime = if ($u -and -not $u.skipped) { $u.session_time } else { $null }
                CodeChanges = if ($u -and -not $u.skipped) { $u.code_changes } else { $null }
                Status = "done"
            }
        } catch {}
    }

    Show-ResultsTable $matrix
    return
}

# ═══════════════════════════════════════════════════
# MATRIX SELECTION
# ═══════════════════════════════════════════════════

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       BENCHMARK DASHBOARD                ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan

# Discover scenarios
$scenarioDirs = Get-ChildItem "$benchRoot\scenarios" -Directory | Where-Object { Test-Path "$($_.FullName)\scenario.json" }
$scenarioNames = $scenarioDirs | ForEach-Object { $_.Name }
$scenarioDefaults = $scenarioNames | ForEach-Object { $true }

$scenarioSel = Show-Menu -Title "Select Scenarios:" -Items $scenarioNames -Selected $scenarioDefaults
$selectedScenarios = @()
for ($i = 0; $i -lt $scenarioNames.Count; $i++) {
    if ($scenarioSel[$i]) { $selectedScenarios += $scenarioDirs[$i] }
}

# Discover conditions/agent setups
$conditionItems = @("bare", "starter")
$conditionPlugins = @($null, $null)

$agentSetupsRoot = "$repoRoot\plugin-candidates"
if (Test-Path $agentSetupsRoot) {
    $agentSetupDirs = Get-ChildItem $agentSetupsRoot -Directory | Where-Object {
        (Test-Path "$($_.FullName)\agents") -or (Test-Path "$($_.FullName)\skills")
    }
    foreach ($cd in $agentSetupDirs) {
        $conditionItems += "agentsetup-$($cd.Name)"
        $conditionPlugins += $cd.FullName
    }
}

$condDefaults = $conditionItems | ForEach-Object { $true }
$condSel = Show-Menu -Title "Select Conditions:" -Items $conditionItems -Selected $condDefaults
$selectedConditions = @()
for ($i = 0; $i -lt $conditionItems.Count; $i++) {
    if ($condSel[$i]) {
        $selectedConditions += @{
            name = $conditionItems[$i]
            type = if ($conditionItems[$i] -match "^agentsetup-") { "agentsetup" } else { $conditionItems[$i] }
            plugin = $conditionPlugins[$i]
        }
    }
}

# Models
$modelItems = @("claude-opus-4.6", "claude-sonnet-4.5")
$modelDefaults = @($true, $true)
$modelSel = Show-Menu -Title "Select Models:" -Items $modelItems -Selected $modelDefaults
$selectedModels = @()
for ($i = 0; $i -lt $modelItems.Count; $i++) {
    if ($modelSel[$i]) { $selectedModels += $modelItems[$i] }
}

# Build the matrix
$matrix = @()
foreach ($scenario in $selectedScenarios) {
    $scenConfig = Get-Content "$($scenario.FullName)\scenario.json" | ConvertFrom-Json
    foreach ($model in $selectedModels) {
        foreach ($cond in $selectedConditions) {
            $trialName = "$($cond.name)-$($model -replace '[^a-zA-Z0-9\.\-]','')"
            $matrix += [PSCustomObject]@{
                Scenario = $scenario.Name
                ScenarioPath = $scenario.FullName
                ScenarioConfigName = $scenConfig.name
                Condition = $cond.name
                ConditionType = $cond.type
                PluginPath = $cond.plugin
                Model = $model
                TrialName = $trialName
                Status = "queued"
                Score = $null
                Builds = $null
                Runs = $null
                SessionTime = $null
                CodeChanges = $null
                FailReason = $null
            }
        }
    }
}

$totalRuns = $matrix.Count
Write-Host "`n  Matrix: $($selectedScenarios.Count) scenarios × $($selectedConditions.Count) conditions × $($selectedModels.Count) models = $totalRuns runs" -ForegroundColor Cyan
Write-Host "  Max build time: $MaxBuildMinutes min per run" -ForegroundColor DarkGray
Write-Host "  Est. total: $([math]::Round($totalRuns * 30 / 60, 1))-$([math]::Round($totalRuns * 45 / 60, 1)) hours`n" -ForegroundColor DarkGray

# Confirm
Write-Host "  Press Enter to start, or Ctrl+C to cancel..." -ForegroundColor Yellow -NoNewline
Read-Host

# ═══════════════════════════════════════════════════
# RUN LOOP
# ═══════════════════════════════════════════════════

if (-not $RunName) { $RunName = Get-NextRunName -Root $resultsRoot }
$runDir = "$resultsRoot\$RunName"
New-Item -ItemType Directory -Force $runDir | Out-Null
$script:runStartTime = Get-Date

Write-Host "`n  Run: $RunName" -ForegroundColor Green
Write-Host "  Results: $runDir`n" -ForegroundColor DarkGray

for ($i = 0; $i -lt $matrix.Count; $i++) {
    $entry = $matrix[$i]
    $entry.Status = "building"

    # Show progress header
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
    $shortModel = $entry.Model -replace 'claude-', ''
    Write-Host "  [$($i+1)/$totalRuns] $($entry.Scenario) / $($entry.Condition) / $shortModel" -ForegroundColor Magenta
    Write-Host "  Elapsed: $((Get-Date) - $script:runStartTime)" -ForegroundColor DarkGray
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Magenta
    Write-Host ""

    # Run the benchmark (streams output directly to terminal)
    Run-SingleBenchmark -Entry $entry -RunDir $runDir -RunName $RunName

    # Quick progress summary after each run
    $completed = ($matrix | Where-Object { $_.Status -match "^(done|failed|timeout)" }).Count
    $scores = ($matrix | Where-Object { $_.Score -gt 0 } | ForEach-Object { $_.Score })
    $avgScore = if ($scores) { [math]::Round(($scores | Measure-Object -Average).Average, 0) } else { "—" }
    Write-Host "`n  Progress: $completed/$totalRuns done | Avg score: $avgScore" -ForegroundColor Magenta
}

# ═══════════════════════════════════════════════════
# FINAL RESULTS
# ═══════════════════════════════════════════════════

Write-Host "`n"
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ALL $totalRuns RUNS COMPLETE  |  Total time: $((Get-Date) - $script:runStartTime)" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green

Show-ResultsTable $matrix

# Save comparison summary
$summary = @{
    run = $RunName
    timestamp = (Get-Date -Format "o")
    total_time = ((Get-Date) - $script:runStartTime).ToString()
    results = @()
}
foreach ($m in $matrix) {
    $summary.results += @{
        scenario = $m.Scenario
        condition = $m.Condition
        model = $m.Model
        score = $m.Score
        builds = $m.Builds
        runs = $m.Runs
        session_time = $m.SessionTime
        code_changes = $m.CodeChanges
        status = $m.Status
    }
}
$compFile = "$runDir\$RunName-results.json"
$summary | ConvertTo-Json -Depth 4 | Set-Content $compFile
Write-Host "`n  Results saved: $compFile"
