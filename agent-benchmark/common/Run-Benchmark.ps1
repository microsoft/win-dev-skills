Write-Host ""
Write-Host "WARNING: This script is deprecated. Use the TypeScript dashboard instead:" -ForegroundColor Yellow
Write-Host "  cd agent-benchmark/dashboard" -ForegroundColor Yellow
Write-Host "  npm start" -ForegroundColor Yellow
Write-Host ""
Write-Host "This script does not support setup scripts (preset_scripts), section-based agent" -ForegroundColor DarkGray
Write-Host "assembly, or the full interactive dashboard. It is kept for backward compatibility only." -ForegroundColor DarkGray
Write-Host ""

<#
.SYNOPSIS
    Generic WinUI 3 benchmark. Output goes to results/run<i>-<date>-<time>/<scenario>/<condition>-<model>/app/.

.PARAMETER Scenario
    Path to scenario folder (e.g., .\scenarios\imageresizer-wpf-to-winui)

.PARAMETER Condition
    bare (default) = no skills/agents, raw model
    starter = scaffold WinUI project first with dotnet new, agent builds on top
    plugin = install win-dev-skills plugin with agents and skills
    agentsetup = scaffold + strip template instructions + install agent setup from -PluginPath

.PARAMETER Model
    AI model for both build and validation agents. Default: claude-opus-4.6

.PARAMETER RunName
    Optional run folder name override. Default: auto-generated run<i>-<MMDDYY>-<HHMMSS>.

.PARAMETER ResultsRoot
    Override results directory. Default: <benchmark-root>\results

.PARAMETER PluginPath
    Path to an agent setup folder. Required for 'agentsetup' condition.

.PARAMETER SkipBuild
    Skip the copilot build phase (use existing app/ in trial folder)

.PARAMETER SkipValidation
    Skip the copilot validation phase

.EXAMPLE
    .\Run-Benchmark.ps1 -Scenario ..\scenarios\imageresizer-wpf-to-winui
    .\Run-Benchmark.ps1 -Scenario ..\scenarios\imageresizer-wpf-to-winui -Condition bare
    .\Run-Benchmark.ps1 -Scenario ..\scenarios\imageresizer-wpf-to-winui -Condition agentsetup -PluginPath ..\..\plugin-agentsetups\minimal
#>
param(
    [Parameter(Mandatory)] [string] $Scenario,
    [ValidateSet("all","bare","starter","plugin","agentsetup")] [string] $Condition = "all",
    [string] $Model = "claude-opus-4.6",
    [string] $RunName,
    [string] $ResultsRoot,
    [string] $PluginPath,
    [int] $MaxBuildMinutes = 60,
    [int] $MaxAutopilotContinues = 50,
    [switch] $SkipBuild,
    [switch] $SkipValidation,
    [switch] $SkipRetrospective
)

# ─── Resolve benchmark root from script location ───
$benchRoot = (Resolve-Path "$PSScriptRoot\..").Path
$repoRoot = (Resolve-Path "$benchRoot\..").Path
if (-not $ResultsRoot) { $ResultsRoot = "$benchRoot\results" }

# Resolve scenario path early (supports relative paths in "all" condition)
$Scenario = (Resolve-Path $Scenario.TrimEnd('\')).Path

# Load global config early (needed by "all" condition for agent setup discovery)
$globalConfig = Get-Content "$benchRoot\common\config.json" | ConvertFrom-Json

# ─── Generate run folder name ───
function Get-NextRunName {
    param([string]$Root)
    $existing = Get-ChildItem $Root -Directory -Filter "run*" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^run(\d+)' } |
        ForEach-Object { [int]$Matches[1] }
    $nextNum = if ($existing) { ($existing | Measure-Object -Maximum).Maximum + 1 } else { 1 }
    $ts = Get-Date -Format "MMddyy-HHmmss"
    return "run$nextNum-$ts"
}

if (-not $RunName) {
    $RunName = Get-NextRunName -Root $ResultsRoot
}
$runDir = "$ResultsRoot\$RunName"

# ═══════════════════════════════════════════════════
# If "all", run bare / starter / + all agent setups in PARALLEL, then compare
# ═══════════════════════════════════════════════════
if ($Condition -eq "all") {
    $scenarioConfig = Get-Content "$Scenario\scenario.json" | ConvertFrom-Json
    $jobs = @()

    # Base conditions: bare and starter
    $conditionsToRun = @(
        @{ condition = "bare"; pluginPath = $null }
        @{ condition = "starter"; pluginPath = $null }
    )

    # Auto-discover agent setups — same logic as TypeScript dashboard (config.ts):
    # 1. Scan src/agents/ and src/.local/agents/ for directories with config.json
    # 2. If none found, fall back to agentsetups.root from config.json (legacy path)
    # 3. If still none, only bare/starter conditions run — this is not an error.
    $agentSetupDirs = @()
    $srcAgentPaths = @("$repoRoot\src\agents", "$repoRoot\src\.local\agents")
    foreach ($srcAgentsDir in $srcAgentPaths) {
        if (Test-Path $srcAgentsDir) {
            Get-ChildItem $srcAgentsDir -Directory | Where-Object {
                Test-Path "$($_.FullName)\config.json"
            } | ForEach-Object {
                $agentSetupDirs += $_
            }
        }
    }

    if ($agentSetupDirs.Count -eq 0) {
        # Legacy: try agentsetups.root from config.json
        $legacyRoot = $globalConfig.agentsetups.root
        if ($legacyRoot) {
            $legacyRoot = $legacyRoot -replace '\{repo_root\}', $repoRoot
            if (-not [System.IO.Path]::IsPathRooted($legacyRoot)) {
                $legacyRoot = (Resolve-Path (Join-Path $benchRoot $legacyRoot) -ErrorAction SilentlyContinue).Path
            }
            if ($legacyRoot -and (Test-Path $legacyRoot)) {
                $agentSetupDirs = Get-ChildItem $legacyRoot -Directory | Where-Object {
                    (Test-Path "$($_.FullName)\agents") -or (Test-Path "$($_.FullName)\skills")
                }
            }
        }
    }

    foreach ($cd in $agentSetupDirs) {
        $conditionsToRun += @{ condition = "agentsetup"; pluginPath = $cd.FullName; agentSetupName = $cd.Name }
    }

    foreach ($cr in $conditionsToRun) {
        $cond = $cr.condition
        $displayName = if ($cr.agentSetupName) { "agentsetup-$($cr.agentSetupName)" } else { $cond }
        # Condition folder: <condition>-<model> (no timestamp — run folder has it)
        $condFolder = "$displayName-$($Model -replace '[^a-zA-Z0-9\.\-]','')"
        Write-Host "  Starting $($displayName.ToUpper()) as background job ($condFolder)" -ForegroundColor Magenta

        $jobArgs = @{
            Scenario   = $Scenario
            Condition  = $cond
            Model      = $Model
            RunName    = $RunName
            ResultsRoot = $ResultsRoot
            MaxBuildMinutes = $MaxBuildMinutes
            MaxAutopilotContinues = $MaxAutopilotContinues
        }
        if ($cr.pluginPath) { $jobArgs.PluginPath = $cr.pluginPath }
        if ($SkipBuild) { $jobArgs.SkipBuild = $true }
        if ($SkipValidation) { $jobArgs.SkipValidation = $true }
        if ($SkipRetrospective) { $jobArgs.SkipRetrospective = $true }

        $logFile = "$runDir\$($scenarioConfig.name)\$condFolder-job.log"
        New-Item -ItemType Directory -Force (Split-Path $logFile) | Out-Null

        $job = Start-Job -ScriptBlock {
            param($scriptPath, $splat)
            & $scriptPath @splat 2>&1
        } -ArgumentList $PSCommandPath, $jobArgs

        $jobs += @{ condition = $displayName; condFolder = $condFolder; job = $job; logFile = $logFile }
    }

    Write-Host "`n  Waiting for all conditions to finish..." -ForegroundColor Magenta
    $jobs | ForEach-Object { $_.job } | Wait-Job | Out-Null

    # Collect output and results
    $allResults = @()
    foreach ($j in $jobs) {
        $output = Receive-Job $j.job 2>&1 | Out-String
        $output | Set-Content $j.logFile
        Remove-Job $j.job -Force

        $resultFile = "$runDir\$($scenarioConfig.name)\$($j.condFolder)\results.json"
        if (Test-Path $resultFile) {
            $allResults += Get-Content $resultFile | ConvertFrom-Json
            Write-Host "  ✅ $($j.condition.ToUpper()) completed" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $($j.condition.ToUpper()) — no results (see $($j.logFile))" -ForegroundColor Red
        }
    }

    # ═══════════════════════════════════════════════════
    # COMPARISON TABLE
    # ═══════════════════════════════════════════════════
    Write-Host "`n"
    Write-Host "╔══════════════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║                              COMPARISON: ALL CONDITIONS                              ║" -ForegroundColor Magenta
    Write-Host "╠══════════════════════════════════════════════════════════════════════════════════════╣" -ForegroundColor Magenta

    # Scores
    Write-Host "║  SCORES" -ForegroundColor Magenta
    Write-Host ("║  {0,-10} {1,8} {2,7} {3,7} {4,7} {5,7} {6,7} {7,7} {8,10}" -f "Condition", "SCORE", "Build", "Run", "Proj", "UI", "Visual", "Func", "Reqs") -ForegroundColor DarkGray
    Write-Host "║  ─────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    foreach ($r in $allResults) {
        $b = $r.metrics.score_breakdown
        $score = if ($null -ne $r.metrics.score) { $r.metrics.score } else { 0 }
        $builds = if ($r.metrics.builds) { "✅" } else { "❌" }
        $runs = if ($r.metrics.runs) { "✅" } else { "❌" }
        $proj = if ($b) { "$($b.project_score)/10" } else { "-" }
        $ui = if ($b) { "$($b.ui_score)/10" } else { "-" }
        $vis = if ($b) { "$($b.visual_score)/10" } else { "-" }
        $func = if ($b) { "$($b.functionality_score)/10" } else { "-" }
        $reqs = if ($b) { "$($b.requirements_passed)/$($b.requirements_total)" } else { "-" }
        $color = if ($score -ge 90) {'Green'} elseif ($score -ge 50) {'Yellow'} else {'Red'}
        Write-Host ("║  {0,-10} {1,8} {2,7} {3,7} {4,7} {5,7} {6,7} {7,7} {8,10}" -f $r.condition, "$score/100", $builds, $runs, $proj, $ui, $vis, $func, $reqs) -ForegroundColor $color
    }

    # Timing & cost
    Write-Host "║" -ForegroundColor Magenta
    Write-Host "║  TIMING & COST" -ForegroundColor Magenta
    Write-Host ("║  {0,-10} {1,14} {2,14} {3,10} {4,12}" -f "Condition", "Session", "API time", "Premium", "Code chg") -ForegroundColor DarkGray
    Write-Host "║  ─────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    foreach ($r in $allResults) {
        $u = $r.metrics.time_and_tokens
        if ($u -and -not $u.skipped) {
            Write-Host ("║  {0,-10} {1,14} {2,14} {3,10} {4,12}" -f $r.condition, $u.session_time, $u.api_time, $u.premium_requests, $u.code_changes) -ForegroundColor Cyan
        } else {
            Write-Host ("║  {0,-10} {1,14}" -f $r.condition, "(skipped)") -ForegroundColor DarkGray
        }
    }

    # Token breakdown per model
    Write-Host "║" -ForegroundColor Magenta
    Write-Host "║  TOKENS BY MODEL" -ForegroundColor Magenta
    Write-Host ("║  {0,-10} {1,-25} {2,10} {3,10} {4,10}" -f "Condition", "Model", "Input", "Output", "Cached") -ForegroundColor DarkGray
    Write-Host "║  ─────────────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
    foreach ($r in $allResults) {
        $u = $r.metrics.time_and_tokens
        if ($u -and $u.models -and -not $u.skipped) {
            $modelNames = if ($u.models -is [hashtable]) { $u.models.Keys } else { $u.models.PSObject.Properties.Name }
            foreach ($mn in $modelNames) {
                $m = if ($u.models -is [hashtable]) { $u.models[$mn] } else { $u.models.$mn }
                Write-Host ("║  {0,-10} {1,-25} {2,10} {3,10} {4,10}" -f $r.condition, $mn, $m.input, $m.output, $m.cached) -ForegroundColor DarkCyan
            }
        }
    }

    Write-Host "╚══════════════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta

    # Save comparison summary (including retrospective data)
    $summary = @{
        scenario = $scenarioConfig.name
        model = $Model
        run = $RunName
        timestamp = (Get-Date -Format "o")
        conditions = @()
    }
    foreach ($r in $allResults) {
        $condEntry = @{
            condition = $r.condition
            trial = $r.trial
            score = $r.metrics.score
            builds = $r.metrics.builds
            runs = $r.metrics.runs
            score_breakdown = $r.metrics.score_breakdown
            time_and_tokens = $r.metrics.time_and_tokens
            requirements_passed = $r.metrics.requirements_passed
            requirements_failed = $r.metrics.requirements_failed
            issues = $r.metrics.issues
            validation_notes = $r.metrics.validation_notes
        }
        if ($r.metrics.retrospective) {
            $condEntry.retrospective = $r.metrics.retrospective
        }
        $summary.conditions += $condEntry
    }

    $compFile = "$runDir\$RunName-results.json"
    New-Item -ItemType Directory -Force (Split-Path $compFile) | Out-Null
    $summary | ConvertTo-Json -Depth 6 | Set-Content $compFile
    Write-Host "`nRun results saved: $compFile"
    return
}

$ErrorActionPreference = "Continue"

# ─── Resolve MSBuild ───
$msbuildExe = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\amd64\MSBuild.exe 2>$null | Select-Object -First 1
if (-not $msbuildExe) {
    $msbuildExe = & "${env:ProgramFiles}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\amd64\MSBuild.exe 2>$null | Select-Object -First 1
}

# ─── Load scenario ───
$scenarioDir = $Scenario
$config = Get-Content "$scenarioDir\scenario.json" | ConvertFrom-Json

# Expand placeholders in scenario paths
if ($config.original_app) {
    if ($config.original_app.source_dir) {
        $config.original_app.source_dir = $config.original_app.source_dir `
            -replace '\{repo_root\}', $repoRoot `
            -replace '\{scenario_dir\}', $scenarioDir
    }
    if ($config.original_app.run_args) {
        $config.original_app.run_args = $config.original_app.run_args `
            -replace '\{repo_root\}', $repoRoot `
            -replace '\{scenario_dir\}', $scenarioDir
    }
}

$promptRaw = Get-Content "$scenarioDir\prompt.md" -Raw

if (-not $TrialName) {
    # Condition folder: <condition>-<model> (no timestamp — run folder has it)
    $condLabel = $Condition
    if ($Condition -eq "agentsetup" -and $PluginPath) {
        $agentSetupName = Split-Path $PluginPath -Leaf
        $condLabel = "agentsetup-$agentSetupName"
    }
    $TrialName = "$condLabel-$($Model -replace '[^a-zA-Z0-9\.\-]','')"
}

# Trial output: results/<run>/<scenario>/<condition-model>/
$trialDir = "$runDir\$($config.name)\$TrialName"
$appDir = "$trialDir\app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

$results = @{
    trial      = $TrialName
    scenario   = $config.name
    condition  = if ($Condition -eq "agentsetup" -and $PluginPath) { "agentsetup-$(Split-Path $PluginPath -Leaf)" } else { $Condition }
    type       = $config.type
    model      = $Model
    timestamp  = (Get-Date -Format "o")
    metrics    = @{}
}

Write-Host "`n╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  BENCHMARK: $($config.name)" -ForegroundColor Cyan
Write-Host "║  Condition: $Condition | Model: $Model" -ForegroundColor Cyan
Write-Host "║  Trial: $TrialName" -ForegroundColor Cyan
Write-Host "║  Output: $appDir" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ─── Step 1: Prepare app directory ───
Write-Host "[1] Preparing app directory..." -ForegroundColor Yellow

# Determine source path (from original_app for convert/improve, otherwise none)
$sourcePath = $null
if ($config.original_app -and $config.original_app.source_dir) {
    $sourcePath = $config.original_app.source_dir
}

Write-Host "  App dir: $appDir"

# Record git SHA from source if available
if ($sourcePath -and (Test-Path "$sourcePath\.git")) {
    Push-Location $sourcePath
    $results.git_sha = (git rev-parse --short HEAD)
    Pop-Location
}

# Copilot always runs from the app dir — agents can access source via absolute paths
$copilotCwd = $appDir

# Initialize git repo in app dir (required for .github/agents/ and .github/skills/ discovery)
Push-Location $appDir
if (-not (Test-Path ".git")) {
    git init --quiet 2>&1 | Out-Null
}
Pop-Location

# ═══════════════════════════════════════════════════
# CONDITION SETUP
# ═══════════════════════════════════════════════════
Write-Host "`n[2] Condition setup: $Condition" -ForegroundColor Yellow

# Step A: Clean slate — uninstall ALL plugins
Write-Host "  Uninstalling all plugins..."
$pluginList = copilot plugin list 2>&1 | Out-String
$pluginNames = [regex]::Matches($pluginList, '•\s+(\S+)') | ForEach-Object { $_.Groups[1].Value }
foreach ($pn in $pluginNames) {
    Write-Host "    Removing: $pn"
    copilot plugin uninstall $pn 2>&1 | Out-Null
}
Write-Host "  Plugins cleared"

# Step B: Condition-specific setup
$promptAddendum = ""
$agentFlag = ""  # --agent flag for copilot, set by plugin condition
$appName = if ($config.app_name) { $config.app_name } else { $config.name }

switch ($Condition) {
    "bare" {
        Write-Host "  Bare: no extra setup"
    }
    "starter" {
        if ($globalConfig.conditions -and $globalConfig.conditions.starter) {
            $starterCfg = $globalConfig.conditions.starter
            $promptAddendum = $starterCfg.prompt_addendum
            Write-Host "  Starter: prompt instructs agent to scaffold WinUI project"
        } else {
            Write-Host "  WARNING: No starter config in config.json" -ForegroundColor Red
        }
    }
    "plugin" {
        if ($globalConfig.conditions -and $globalConfig.conditions.plugin) {
            $pluginCfg = $globalConfig.conditions.plugin

            # Use -PluginPath if provided, otherwise fall back to repo root
            $pluginSrc = if ($PluginPath -and (Test-Path $PluginPath)) {
                (Resolve-Path $PluginPath).Path
            } elseif ($pluginCfg.install_path) {
                (Resolve-Path $pluginCfg.install_path -ErrorAction SilentlyContinue).Path
            } else { $repoRoot }
            if (-not $pluginSrc -or -not (Test-Path $pluginSrc)) { $pluginSrc = $repoRoot }

            # Copy plugin's skills (flattened) and agents into .github/
            $pluginSkillsSrc = "$pluginSrc\.github\plugin\skills"
            $pluginAgentsSrc = "$pluginSrc\.github\plugin\agents"
            $targetGithub = "$appDir\.github"

            New-Item -ItemType Directory -Force "$targetGithub\skills" | Out-Null
            New-Item -ItemType Directory -Force "$targetGithub\agents" | Out-Null

            if (Test-Path $pluginSkillsSrc) {
                # Flatten nested skill folders — copilot expects .github/skills/<name>/SKILL.md
                $skillDirs = Get-ChildItem $pluginSkillsSrc -Recurse -Directory |
                    Where-Object { Test-Path "$($_.FullName)\SKILL.md" }
                foreach ($sd in $skillDirs) {
                    Copy-Item $sd.FullName "$targetGithub\skills\$($sd.Name)" -Recurse -Force
                }
                Write-Host "  Copied $($skillDirs.Count) skills (flattened)"
            }
            if (Test-Path $pluginAgentsSrc) {
                Copy-Item "$pluginAgentsSrc\*" "$targetGithub\agents\" -Force
                $agentCount = (Get-ChildItem "$targetGithub\agents" -Filter "*.agent.md" | Measure-Object).Count
                Write-Host "  Copied $agentCount agents"
            }

            $promptAddendum = $pluginCfg.prompt_addendum
            $agentFlag = "--agent winui3"

            # Commit skills/agents so git repo is clean for copilot
            Push-Location $appDir
            git add -A 2>&1 | Out-Null
            git commit -m "added skills and agents" --quiet 2>&1 | Out-Null
            Pop-Location
        } else {
            Write-Host "  WARNING: No plugin config in config.json" -ForegroundColor Red
        }
    }
    "agentsetup" {
        # Agent setup condition: scaffold with dotnet new, strip template instructions, install agent setup
        if (-not $PluginPath -or -not (Test-Path $PluginPath)) {
            Write-Host "  ERROR: -PluginPath is required for 'agentsetup' condition" -ForegroundColor Red
            return
        }

        $agentSetupSrc = (Resolve-Path $PluginPath).Path
        $agentSetupCfg = if ($globalConfig.conditions -and $globalConfig.conditions.agentsetup) { $globalConfig.conditions.agentsetup } else { $null }

        # Step 1: Scaffold WinUI project for project structure
        $templateCmd = if ($agentSetupCfg -and $agentSetupCfg.template_command) {
            $agentSetupCfg.template_command -replace '\{app_name\}', $appName -replace '\{app_dir\}', $appDir
        } else {
            "dotnet new winui -n $appName --output `"$appDir`""
        }
        Write-Host "  Scaffolding: $templateCmd"
        Invoke-Expression $templateCmd 2>&1 | Out-Null

        # Step 2: Strip template-generated agent instructions (level playing field)
        if (Test-Path "$appDir\AGENTS.md") { Remove-Item "$appDir\AGENTS.md" -Force }
        if (Test-Path "$appDir\.github") { Remove-Item "$appDir\.github" -Recurse -Force }
        Write-Host "  Stripped template agent instructions (AGENTS.md, .github/)"

        # Step 3: Install agent setup's agents and skills
        $targetGithub = "$appDir\.github"
        New-Item -ItemType Directory -Force "$targetGithub\skills" | Out-Null
        New-Item -ItemType Directory -Force "$targetGithub\agents" | Out-Null

        # Copy agents
        $agentSetupAgentsSrc = "$agentSetupSrc\agents"
        if (Test-Path $agentSetupAgentsSrc) {
            Copy-Item "$agentSetupAgentsSrc\*" "$targetGithub\agents\" -Force
            $agentCount = (Get-ChildItem "$targetGithub\agents" -Filter "*.agent.md" | Measure-Object).Count
            Write-Host "  Copied $agentCount agents from agent setup"
        }

        # Copy skills (flatten nested skill folders)
        $agentSetupSkillsSrc = "$agentSetupSrc\skills"
        if (Test-Path $agentSetupSkillsSrc) {
            $skillDirs = Get-ChildItem $agentSetupSkillsSrc -Recurse -Directory |
                Where-Object { Test-Path "$($_.FullName)\SKILL.md" }
            foreach ($sd in $skillDirs) {
                Copy-Item $sd.FullName "$targetGithub\skills\$($sd.Name)" -Recurse -Force
            }
            Write-Host "  Copied $($skillDirs.Count) skills from agent setup (flattened)"
        }

        # Install MCP config — copilot expects .copilot/mcp-config.json at project root
        if (Test-Path "$agentSetupSrc\.mcp.json") {
            $mcpContent = Get-Content "$agentSetupSrc\.mcp.json" -Raw | ConvertFrom-Json
            # Wrap in mcpServers if not already wrapped
            if (-not $mcpContent.mcpServers) {
                $mcpConfig = @{ mcpServers = $mcpContent }
            } else {
                $mcpConfig = $mcpContent
            }
            $copilotDir = "$appDir\.copilot"
            New-Item -ItemType Directory -Force $copilotDir | Out-Null
            $mcpConfig | ConvertTo-Json -Depth 4 | Set-Content "$copilotDir\mcp-config.json"
            Write-Host "  Installed MCP config at .copilot/mcp-config.json"
        }

        $promptAddendum = if ($agentSetupCfg -and $agentSetupCfg.prompt_addendum) {
            $agentSetupCfg.prompt_addendum
        } else {
            "IMPORTANT: A WinUI 3 project has already been scaffolded in $appDir. Do NOT run 'dotnet new winui' -- the project structure (csproj, App.xaml, MainWindow, appxmanifest) is already in place. Build your app on top of the existing project."
        }
        $agentFlag = "--agent winui3"

        # Step 4: Commit so copilot sees a clean repo
        Push-Location $appDir
        git add -A 2>&1 | Out-Null
        git commit -m "scaffolded project and installed agent setup" --quiet 2>&1 | Out-Null
        Pop-Location

        Write-Host "  Agent setup installed from: $agentSetupSrc"
    }
}

# ═══════════════════════════════════════════════════
# BUILD PHASE
# ═══════════════════════════════════════════════════

if (-not $SkipBuild) {
    Write-Host "`n[3] BUILD PHASE: copilot -p --yolo --model $Model $agentFlag" -ForegroundColor Yellow

    # Capture session-state dirs before build to find the new session ID after
    $sessionStateDir = "$env:USERPROFILE\.copilot\session-state"
    $preSessionDirs = @()
    if (Test-Path $sessionStateDir) {
        $preSessionDirs = Get-ChildItem $sessionStateDir -Directory | ForEach-Object { $_.Name }
    }

    # Construct prompt: base + source location + output path + test assets + condition addendum
    $prompt = $promptRaw.Trim()
    if ($sourcePath) {
        $prompt += "`n`nThe original app source code is at: $sourcePath"
    }
    $prompt += "`n`nIMPORTANT: Create the project in the current directory: $appDir"
    if ($config.test_assets -and $config.test_assets.Count -gt 0) {
        $prompt += "`n`n## Test Assets`nThe following test assets are available on this machine for testing:`n"
        foreach ($asset in $config.test_assets) {
            $prompt += "`n- **$($asset.name)**: ``$($asset.path)``"
            if ($asset.description) { $prompt += "`n  $($asset.description)" }
        }
    }
    if ($promptAddendum) {
        $expandedAddendum = $promptAddendum `
            -replace '\{app_name\}', $appName `
            -replace '\{app_dir\}', $appDir
        $prompt += "`n`n$expandedAddendum"
    }

    Push-Location $copilotCwd

    # Run copilot with timeout and iteration limit
    $copilotArgs = @("-p", $prompt, "--yolo", "--model", $Model, "--max-autopilot-continues", $MaxAutopilotContinues)
    if ($agentFlag) { $copilotArgs += @("--agent", "winui3") }

    $copilotJob = Start-Job -ScriptBlock {
        param($cwd, $args_)
        Set-Location $cwd
        & copilot @args_ 2>&1 | Out-String
    } -ArgumentList (Get-Location).Path, $copilotArgs

    $timeoutSec = $MaxBuildMinutes * 60
    $completed = $copilotJob | Wait-Job -Timeout $timeoutSec
    if ($completed) {
        $copilotOutput = Receive-Job $copilotJob | Out-String
        Remove-Job $copilotJob -Force
    } else {
        Write-Host "  TIMEOUT: Build exceeded $MaxBuildMinutes minutes — killing" -ForegroundColor Red
        Stop-Job $copilotJob
        $copilotOutput = Receive-Job $copilotJob | Out-String
        Remove-Job $copilotJob -Force
        $copilotOutput += "`n`n[TIMEOUT: Build killed after $MaxBuildMinutes minutes]"
    }

    Pop-Location
    $copilotOutput | Set-Content "$trialDir\session-log.txt"

    # Find the build session ID (new session-state dir created during build)
    $buildSessionId = $null
    if (Test-Path $sessionStateDir) {
        $newSessions = Get-ChildItem $sessionStateDir -Directory |
            Where-Object { $_.Name -notin $preSessionDirs } |
            Sort-Object LastWriteTime -Descending
        if ($newSessions) {
            $buildSessionId = $newSessions[0].Name
            Write-Host "  Build session ID: $buildSessionId"
        }
    }

    # Parse /usage
    $usage = @{}
    if ($copilotOutput -match "Total usage est:\s+(\d+)\s+Premium") { $usage.premium_requests = [int]$Matches[1] }
    if ($copilotOutput -match "API time spent:\s+(.+?)[\r\n]") { $usage.api_time = $Matches[1].Trim() }
    if ($copilotOutput -match "Total session time:\s+(.+?)[\r\n]") { $usage.session_time = $Matches[1].Trim() }
    if ($copilotOutput -match "Total code changes:\s+(.+?)[\r\n]") { $usage.code_changes = $Matches[1].Trim() }

    $modelMatches = [regex]::Matches($copilotOutput, "(\S+)\s+(\d+\.?\d*[mk]?) in, (\d+\.?\d*[mk]?) out, (\d+\.?\d*[mk]?) cached")
    $usage.models = @{}
    foreach ($m in $modelMatches) {
        $usage.models[$m.Groups[1].Value] = @{ input=$m.Groups[2].Value; output=$m.Groups[3].Value; cached=$m.Groups[4].Value }
    }
    $results.metrics.time_and_tokens = $usage
    Write-Host "  Session: $($usage.session_time) | API: $($usage.api_time) | Premium: $($usage.premium_requests)"
} else {
    Write-Host "`n[3] BUILD PHASE: SKIPPED" -ForegroundColor DarkGray
    $results.metrics.time_and_tokens = @{ skipped = $true }
}

# ─── Step 4: Find csproj ───
Write-Host "`n[4] Finding csproj..." -ForegroundColor Yellow

if (-not (Test-Path $appDir) -or (Get-ChildItem $appDir -Recurse -File | Measure-Object).Count -eq 0) {
    Write-Host "  FAIL: App directory is empty: $appDir" -ForegroundColor Red
    $results.metrics.builds = $false; $results.metrics.runs = $false
    $results.metrics.score = 0
    $results | ConvertTo-Json -Depth 5 | Set-Content "$trialDir\results.json"
    return
}

$csproj = Get-ChildItem $appDir -Filter $globalConfig.build.csproj_pattern -Recurse |
    Where-Object { (Get-Content $_.FullName -Raw) -match "UseWinUI|WinUI" } |
    Select-Object -First 1

if (-not $csproj) {
    $csproj = Get-ChildItem $appDir -Filter $globalConfig.build.csproj_pattern -Recurse | Select-Object -First 1
}

if (-not $csproj) {
    Write-Host "  FAIL: No csproj found in $appDir" -ForegroundColor Red
    $results.metrics.builds = $false; $results.metrics.runs = $false
    $results.metrics.score = 0
    $results | ConvertTo-Json -Depth 5 | Set-Content "$trialDir\results.json"
    return
}

Write-Host "  Found: $($csproj.FullName)"

# ─── Step 4: Build ───
Write-Host "`n[4] Building..." -ForegroundColor Yellow
$buildCmd = $globalConfig.build.command -replace '\{csproj\}', "`"$($csproj.FullName)`""
$buildCmd = $buildCmd -replace 'MSBuild\.exe', "`"$msbuildExe`""
Write-Host "  $buildCmd"
$buildOutput = cmd /c "$buildCmd 2>&1" | Out-String
$builds = $LASTEXITCODE -eq 0
$buildOutput | Set-Content "$trialDir\build-output.txt"
$results.metrics.builds = $builds
Write-Host "  $(if($builds){'PASS ✅'}else{'FAIL ❌'})" -ForegroundColor $(if($builds){'Green'}else{'Red'})

if (-not $builds) {
    $results.metrics.runs = $false
    $results.metrics.score = 0
    $results | ConvertTo-Json -Depth 5 | Set-Content "$trialDir\results.json"
    return
}

# ─── Step 5: Launch new app ───
Write-Host "`n[5] Launching converted app..." -ForegroundColor Yellow

# Find build output
$outputFolder = $null
$binDirs = @("$($csproj.DirectoryName)\bin\x64\Debug", "$($csproj.DirectoryName)\bin\Debug")
foreach ($bd in $binDirs) {
    if (Test-Path $bd) {
        # Check for TFM subfolder (e.g., net9.0-windows10.0.26100.0)
        $tfmDir = Get-ChildItem $bd -Directory | Where-Object { $_.Name -match "net\d" } | Select-Object -First 1
        if ($tfmDir) {
            $winDir = Get-ChildItem $tfmDir.FullName -Directory -Filter "win-x64" -ErrorAction SilentlyContinue
            $outputFolder = if ($winDir) { $winDir.FullName } else { $tfmDir.FullName }
            break
        }
        # No TFM subfolder — check if exe exists directly in bin\x64\Debug
        $exeHere = Get-ChildItem $bd -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "createdump|hostfxr|RestartAgent" }
        if ($exeHere) {
            $outputFolder = $bd
            break
        }
    }
}

# Fallback: check csproj for OutputPath
if (-not $outputFolder) {
    $csprojContent = Get-Content $csproj.FullName -Raw
    $opMatch = [regex]::Match($csprojContent, '<OutputPath>(.+?)</OutputPath>')
    if ($opMatch.Success) {
        $customOut = $opMatch.Groups[1].Value -replace '\$\(RepoRoot\)', "$(if($sourcePath){$sourcePath}else{$appDir})\" -replace '\$\(Platform\)', 'x64' -replace '\$\(Configuration\)', 'Debug'
        if (Test-Path $customOut) { $outputFolder = $customOut }
    }
}

$runs = $false
$newAppHwnd = $null

# Run args (e.g., test image path) — used for both converted and original app
$runArgs = if ($config.original_app -and $config.original_app.run_args) { $config.original_app.run_args } else { "" }

if ($outputFolder) {
    Write-Host "  Output: $outputFolder"

    # Check if this is a packaged app (has appxmanifest)
    $isPackaged = (Get-ChildItem $outputFolder -Filter "*appxmanifest*" -ErrorAction SilentlyContinue).Count -gt 0
    if (-not $isPackaged) {
        $isPackaged = (Get-ChildItem $appDir -Filter "Package.appxmanifest" -ErrorAction SilentlyContinue).Count -gt 0
    }

    $launchedProc = $null

    if ($isPackaged) {
        # Packaged app: use winapp run (handles MSIX deployment — takes longer to register)
        $winappArgs = "run `"$outputFolder`""
        if ($runArgs) { $winappArgs += " --args $runArgs" }
        Write-Host "  Packaged app detected. Running: winapp $winappArgs"
        Start-Process "winapp" -ArgumentList $winappArgs -WindowStyle Hidden
        Start-Sleep 30
    } else {
        # Unpackaged: launch exe directly
        $exeFiles = Get-ChildItem $outputFolder -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notmatch "createdump|hostfxr|RestartAgent" }
        $exePath = if ($exeFiles) { $exeFiles[0].FullName } else { $null }

        if ($exePath) {
            if ($runArgs) {
                Write-Host "  Launching: $exePath $runArgs"
                $launchedProc = Start-Process $exePath -ArgumentList $runArgs -PassThru
            } else {
                Write-Host "  Launching: $exePath"
                $launchedProc = Start-Process $exePath -PassThru
            }
            Start-Sleep 8
        }
    }

    # Find the exe name for PID fallback
    $exeFiles = Get-ChildItem $outputFolder -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "createdump|hostfxr|RestartAgent" }
    $exePath = if ($exeFiles) { $exeFiles[0].FullName } else { $null }

    # Try multiple ways to find the window (with retry for slow launches)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $listOut = winapp ui list-windows -a $appName --json 2>&1 | Out-String
        if ($listOut -match '"hwnd"') { $runs = $true; break }

        # Fallback: search by exe name (without extension)
        if ($exePath) {
            $exeBaseName = [System.IO.Path]::GetFileNameWithoutExtension($exePath)
            $listOut = winapp ui list-windows -a $exeBaseName --json 2>&1 | Out-String
            if ($listOut -match '"hwnd"') { $runs = $true; break }
        }

        # Fallback: search by PID
        if ($launchedProc -and !$launchedProc.HasExited) {
            $listOut = winapp ui list-windows -a $launchedProc.Id --json 2>&1 | Out-String
            if ($listOut -match '"hwnd"') { $runs = $true; break }
        }

        if ($attempt -lt 3) {
            Write-Host "  Window not found yet, retrying in 5s... (attempt $attempt/3)"
            Start-Sleep 5
        }
    }

    if (-not $runs) {
        Write-Host "  Trying search by exe name: $([System.IO.Path]::GetFileNameWithoutExtension($exePath))"
    }

    # Get HWND
    if ($runs) {
        $allWins = winapp ui list-windows -a $appName --json 2>&1 | Out-String | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($allWins.windows) {
            # Close file-open dialogs (use Cancel button $2, more reliable than #Close)
            foreach ($w in $allWins.windows) {
                if ($w.title -eq "Open") {
                    winapp ui invoke '$2' -w $w.hwnd 2>&1 | Out-Null
                    Start-Sleep 2
                }
            }
            $allWins = winapp ui list-windows -a $appName --json 2>&1 | Out-String | ConvertFrom-Json -ErrorAction SilentlyContinue
            $mainWin = $allWins.windows | Where-Object { $_.title -ne "Open" } | Select-Object -First 1
            if ($mainWin) { $newAppHwnd = $mainWin.hwnd }
        }
    }
} else {
    Write-Host "  FAIL: Could not find build output folder" -ForegroundColor Red
}

$results.metrics.runs = $runs
Write-Host "  $(if($runs){'PASS ✅ App running'}else{'FAIL ❌ No window'})" -ForegroundColor $(if($runs){'Green'}else{'Red'})

if (-not $runs) {
    $results.metrics.score = 10
    $results | ConvertTo-Json -Depth 5 | Set-Content "$trialDir\results.json"
    return
}

# ─── Step 6: Launch original app (for convert/improve types) ───
$originalAppName = $null
if ($config.type -in @("convert", "improve") -and $config.original_app) {
    Write-Host "`n[6] Launching original app for comparison..." -ForegroundColor Yellow
    Push-Location $sourcePath

    # Build original if needed
    if ($config.original_app.build_command) {
        Write-Host "  Building original..."
        $origBuildCmd = $config.original_app.build_command -replace 'MSBuild\.exe', "`"$msbuildExe`""
        cmd /c "$origBuildCmd 2>&1" | Out-Null
    }

    # Launch original
    $origExe = Join-Path $sourcePath $config.original_app.run_command
    if (Test-Path $origExe) {
        $originalAppName = $config.original_app.app_name
        $origRunArgs = if ($config.original_app.run_args) { $config.original_app.run_args } else { "" }
        if ($origRunArgs) {
            Start-Process $origExe -ArgumentList $origRunArgs
        } else {
            Start-Process $origExe
        }
        Start-Sleep 6

        # Close any file-open dialogs on original too
        $origWins = winapp ui list-windows -a $originalAppName --json 2>&1 | Out-String | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($origWins.windows) {
            foreach ($w in $origWins.windows) {
                if ($w.title -eq "Open") {
                    winapp ui invoke '$2' -w $w.hwnd 2>&1 | Out-Null
                    Start-Sleep 2
                }
            }
        }
        Write-Host "  Original app launched as '$originalAppName'"
    } else {
        Write-Host "  WARN: Original exe not found at $origExe" -ForegroundColor DarkYellow
    }
    Pop-Location
} else {
    Write-Host "`n[6] No original app to compare (type: $($config.type))" -ForegroundColor DarkGray
}

# ═══════════════════════════════════════════════════
# VALIDATION PHASE
# ═══════════════════════════════════════════════════

if (-not $SkipValidation) {
    Write-Host "`n[7] VALIDATION PHASE: copilot --model $Model" -ForegroundColor Yellow

    $validateTemplate = Get-Content "$benchRoot\common\validate-winui.prompt.md" -Raw
    $validatePrompt = $validateTemplate `
        -replace '\{original_prompt\}', $promptRaw.Trim() `
        -replace '\{app_name\}', $appName `
        -replace '\{task_type\}', $config.type `
        -replace '\{results_dir\}', $trialDir

    # Build reference section
    $refSection = ""

    # For convert/improve: tell the agent about the original running app
    if ($originalAppName) {
        $refSection += @"

## Original app (running for comparison)
The original app is running as "$originalAppName". You can inspect it with:
- ``winapp ui inspect -a $originalAppName --depth 5``
- ``winapp ui screenshot -a $originalAppName --output $trialDir/original-screenshot.png``
- ``winapp ui search <ControlType> -a $originalAppName``

Inspect BOTH apps. The converted app ("$($appName)") should have the same controls
and functionality as the original ("$originalAppName").

"@
    }

    # Add static reference tree if available
    $refTree = "$scenarioDir\reference\wpf-ui-tree.txt"
    if (Test-Path $refTree) {
        $refContent = Get-Content $refTree -Raw
        $refSection += @"

## Reference: Original app UI tree (captured earlier)
``````
$refContent
``````

"@
    }

    $validatePrompt = $validatePrompt -replace '\{reference_section\}', $refSection

    # Add original app name for comparison commands
    $validatePrompt = $validatePrompt -replace '\{original_app_name\}', $(if($originalAppName){$originalAppName}else{'N/A'})

    # Add test image section
    $testImageSection = ""
    if ($runArgs) {
        # Extract test image path from run_args (remove quotes)
        $testImgSrc = $runArgs.Trim('"', "'", ' ')
        if (Test-Path $testImgSrc) {
            Copy-Item $testImgSrc "$trialDir\testimage.png" -Force
            $testImageSection = @"
  The app was launched with a test image: $testImgSrc
  This image should be loaded and ready for resizing. Click the Resize button
  and wait up to 15 seconds for it to complete. After resize, check if a new
  file was created (resized copy) in the same directory as the test image or
  in the app's output location.
"@
        }
    }
    $validatePrompt = $validatePrompt -replace '\{test_image_section\}', $testImageSection

    # Add test assets for validation (generic — scenario defines what they are)
    if ($config.test_assets -and $config.test_assets.Count -gt 0) {
        $assetSection = "`n## Test Assets`nThe following test assets are available for validation:`n"
        foreach ($asset in $config.test_assets) {
            $assetSection += "`n- **$($asset.name)**: ``$($asset.path)``"
            if ($asset.description) { $assetSection += "`n  $($asset.description)" }
        }
        $assetSection += "`n`nUse these assets to test the app's functionality end-to-end where applicable."
        $validatePrompt += $assetSection
    }

    # Inject scenario-specific requirements
    $reqSection = ""
    if ($config.requirements -and $config.requirements.Count -gt 0) {
        $reqSection = "## Scenario-specific requirements`n`nIn addition to the general checks above, you MUST verify each of these:`n`n"
        $i = 1
        foreach ($req in $config.requirements) {
            $reqSection += "$i. $req`n"
            $i++
        }
        $reqSection += "`nReport which requirements passed and which failed in your issues list.`n"
    }
    $validatePrompt = $validatePrompt -replace '\{scenario_requirements\}', $reqSection

    # Tell validation agent where the project source code is (for code quality checks)
    $validatePrompt += "`n`n## Project source code location`nThe converted app's source code is at: $appDir`nCheck the .csproj and .cs files there for old framework references.`n"
    $validatePrompt | Set-Content "$trialDir\validation-prompt.txt"

    # Run validation agent (cwd doesn't matter much — it uses winapp ui, not file access)
    Push-Location $trialDir
    $valOutput = & copilot -p $validatePrompt.Trim() --yolo --model $Model 2>&1 | Out-String
    Pop-Location
    $valOutput | Set-Content "$trialDir\validation-log.txt"

    # Parse JSON evaluation from output — find the JSON block between ```json and ```
    $jsonBlockMatch = [regex]::Match($valOutput, '```json\s*(\{.+?\})\s*```', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $jsonBlockMatch.Success) {
        # Fallback: find JSON with project_score or ui_score
        $jsonBlockMatch = [regex]::Match($valOutput, '(\{[^{}]*"project_score"[^}]*\})', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    }
    if (-not $jsonBlockMatch.Success) {
        $jsonBlockMatch = [regex]::Match($valOutput, '(\{[^{}]*"ui_score"[^}]*\})', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    }

    if ($jsonBlockMatch.Success) {
        $jsonText = if ($jsonBlockMatch.Groups.Count -gt 1) { $jsonBlockMatch.Groups[1].Value } else { $jsonBlockMatch.Value }
        try {
            $validation = $jsonText | ConvertFrom-Json

            # Extract numeric scores (agent provides 0-10 for each)
            $projectScore = [math]::Min(10, [math]::Max(0, [int]($validation.project_score)))
            $uiScore = [math]::Min(10, [math]::Max(0, [int]($validation.ui_score)))
            $visualScore = [math]::Min(10, [math]::Max(0, [int]($validation.visual_score)))
            $funcScore = [math]::Min(10, [math]::Max(0, [int]($validation.functionality_score)))
            $generalPoints = $projectScore + $uiScore + $visualScore + $funcScore  # out of 40

            # Calculate requirements points (50 points total)
            $reqPassed = if ($validation.requirements_passed) { @($validation.requirements_passed).Count } else { 0 }
            $reqFailed = if ($validation.requirements_failed) { @($validation.requirements_failed).Count } else { 0 }
            $reqTotal = $reqPassed + $reqFailed
            $reqPoints = if ($reqTotal -gt 0) { [math]::Round(50 * $reqPassed / $reqTotal, 1) } else { 0 }

            # Final score: 10 (runs) + general (0-40) + requirements (0-50)
            $finalScore = [math]::Round(10 + $generalPoints + $reqPoints)

            $results.metrics.score = $finalScore
            $results.metrics.score_breakdown = @{
                runs = 10
                project_score = $projectScore
                ui_score = $uiScore
                visual_score = $visualScore
                functionality_score = $funcScore
                general_points = $generalPoints
                requirements_passed = $reqPassed
                requirements_failed = $reqFailed
                requirements_total = $reqTotal
                requirements_points = $reqPoints
            }
            $results.metrics.validation_notes = $validation.notes
            if ($validation.issues) { $results.metrics.issues = $validation.issues }
            if ($validation.requirements_passed) { $results.metrics.requirements_passed = $validation.requirements_passed }
            if ($validation.requirements_failed) { $results.metrics.requirements_failed = $validation.requirements_failed }

            Write-Host "  Project: $projectScore/10" -ForegroundColor Cyan
            Write-Host "  UI:      $uiScore/10" -ForegroundColor Cyan
            Write-Host "  Visual:  $visualScore/10" -ForegroundColor Cyan
            Write-Host "  Func:    $funcScore/10" -ForegroundColor Cyan
            Write-Host "  Reqs:    $reqPassed/$reqTotal passed ($reqPoints/50 pts)" -ForegroundColor $(if($reqPassed -eq $reqTotal){'Green'}else{'Yellow'})
            Write-Host "  SCORE:   $finalScore/100" -ForegroundColor $(if($finalScore -ge 90){'Green'}elseif($finalScore -ge 50){'Yellow'}else{'Red'})
        } catch {
            Write-Host "  WARN: Could not parse validation JSON: $_" -ForegroundColor DarkYellow
            $results.metrics.score = 10
            $results.metrics.validation_parse_error = $_.Exception.Message
        }
    } else {
        Write-Host "  WARN: No JSON evaluation found in validation output" -ForegroundColor DarkYellow
        $results.metrics.score = 10
    }
} else {
    Write-Host "`n[7] VALIDATION PHASE: SKIPPED" -ForegroundColor DarkGray
}

# ═══════════════════════════════════════════════════
# RETROSPECTIVE PHASE
# ═══════════════════════════════════════════════════

if (-not $SkipRetrospective -and $buildSessionId) {
    Write-Host "`n[8] RETROSPECTIVE PHASE: copilot --resume=$buildSessionId --model claude-opus-4.6" -ForegroundColor Yellow

    $retroTemplate = Get-Content "$benchRoot\common\retrospective.prompt.md" -Raw
    Push-Location $copilotCwd
    $retroOutput = & copilot --resume=$buildSessionId -p $retroTemplate --yolo --model claude-opus-4.6 2>&1 | Out-String
    Pop-Location
    $retroOutput | Set-Content "$trialDir\retrospective-log.txt"

    # Parse JSON from retrospective output
    $retroJsonMatch = [regex]::Match($retroOutput, '```json\s*(\{.+?\})\s*```', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $retroJsonMatch.Success) {
        $retroJsonMatch = [regex]::Match($retroOutput, '(\{[^{}]*"what_went_well"[^}]*\})', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    }

    if ($retroJsonMatch.Success) {
        $retroJson = if ($retroJsonMatch.Groups.Count -gt 1) { $retroJsonMatch.Groups[1].Value } else { $retroJsonMatch.Value }
        try {
            $retro = $retroJson | ConvertFrom-Json
            $retro | ConvertTo-Json -Depth 4 | Set-Content "$trialDir\retrospective.json"
            $results.metrics.retrospective = $retro
            Write-Host "  Confidence: $($retro.confidence_score)/10 | Build cycles: $($retro.build_fix_cycles)" -ForegroundColor Cyan
            Write-Host "  Summary: $($retro.summary)" -ForegroundColor DarkCyan
        } catch {
            Write-Host "  WARN: Could not parse retrospective JSON: $_" -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "  WARN: No JSON found in retrospective output" -ForegroundColor DarkYellow
    }
} elseif (-not $SkipRetrospective -and -not $buildSessionId) {
    Write-Host "`n[8] RETROSPECTIVE PHASE: SKIPPED (no build session ID)" -ForegroundColor DarkGray
} else {
    Write-Host "`n[8] RETROSPECTIVE PHASE: SKIPPED" -ForegroundColor DarkGray
}

# ─── Step 9: Cleanup processes ───
Write-Host "`n[9] Cleanup..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -match [regex]::Escape($appName) } | ForEach-Object { $_.Kill() } 2>$null
if ($originalAppName) {
    Get-Process | Where-Object { $_.ProcessName -match [regex]::Escape($originalAppName) } | ForEach-Object { $_.Kill() } 2>$null
}
Write-Host "  Processes killed"

# ─── Step 10: Save results ───
$results | ConvertTo-Json -Depth 5 | Set-Content "$trialDir\results.json"

# ═══════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════
Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  RESULTS: $TrialName" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
$u = $results.metrics.time_and_tokens
if (-not $u.skipped) {
    Write-Host "║  Session time:  $($u.session_time)" -ForegroundColor Cyan
    Write-Host "║  API time:      $($u.api_time)" -ForegroundColor Cyan
    Write-Host "║  Premium reqs:  $($u.premium_requests)" -ForegroundColor Cyan
    Write-Host "║  Code changes:  $($u.code_changes)" -ForegroundColor Cyan
    if ($u.models) {
        foreach ($modelName in $u.models.Keys) {
            $m = $u.models[$modelName]
            Write-Host "║  $modelName  $($m.input) in, $($m.output) out, $($m.cached) cached" -ForegroundColor DarkCyan
        }
    }
    Write-Host "║" -ForegroundColor Cyan
}
Write-Host "║  Builds:  $(if($results.metrics.builds){'YES ✅'}else{'NO ❌'})" -ForegroundColor $(if($results.metrics.builds){'Green'}else{'Red'})
Write-Host "║  Runs:    $(if($results.metrics.runs){'YES ✅'}else{'NO ❌'})" -ForegroundColor $(if($results.metrics.runs){'Green'}else{'Red'})
$s = $results.metrics.score
$scoreColor = if ($s -ge 90) {'Green'} elseif ($s -ge 50) {'Yellow'} else {'Red'}
Write-Host "║" -ForegroundColor Cyan
Write-Host "║  SCORE:   $s / 100" -ForegroundColor $scoreColor
if ($results.metrics.score_breakdown) {
    $b = $results.metrics.score_breakdown
    Write-Host "║    Runs: $($b.runs)/10 | Proj: $($b.project_score)/10 | UI: $($b.ui_score)/10 | Vis: $($b.visual_score)/10 | Func: $($b.functionality_score)/10" -ForegroundColor DarkCyan
    Write-Host "║    Reqs:  $($b.requirements_passed)/$($b.requirements_total) passed ($($b.requirements_points)/50 pts)" -ForegroundColor DarkCyan
}
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`nTrial dir:  $trialDir"
Write-Host "App output: $appDir"
Write-Host "Results:    $trialDir\results.json"
