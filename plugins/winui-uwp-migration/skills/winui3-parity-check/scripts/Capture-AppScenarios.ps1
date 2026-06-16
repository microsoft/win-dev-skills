<#
.SYNOPSIS
Drive a *running* packaged app scenario-by-scenario and capture a screenshot +
UIA tree dump for each feature point. Works on BOTH the original UWP app and the
migrated WinUI 3 app — navigation is title-driven, so it does not depend on the
shell control type (UWP ListBox vs WinUI 3 NavigationView/ListView).

.DESCRIPTION
Given a checklist.json (from Extract-UwpFeatureChecklist.ps1) and a running app's
PID or name, for each scenario it:
  1. `winapp ui invoke "<title>"`  — navigate (plain-text invoke auto-walks to the
     nearest invokable ancestor, so it matches the nav list item).
  2. settle (Start-Sleep) so the compositor lays out the page.
  3. `winapp ui screenshot --output screenshots/NN_<slug>.png` — initial state,
     before any control is exercised.
  4. `winapp ui inspect --json --depth 8` — full UIA tree dumped to ui/NN.json.

The captured screenshots/ + ui/ folders become either the golden UWP baseline
(when run against the original app) or the candidate capture (when run against the
migrated WinUI 3 app). Compare-Parity.ps1 consumes both.

This script does the mechanical driving only — it makes no pass/fail judgement.

.PARAMETER App
Target app: PID (preferred — from `winapp run` output) or process/window name.

.PARAMETER OutDir
Output folder. screenshots/ and ui/ are created under it.

.PARAMETER Checklist
Path to checklist.json produced by Extract-UwpFeatureChecklist.ps1. Drives the
scenario list + slug naming.

.PARAMETER SettleSeconds
Seconds to wait after navigation before screenshotting. Default 2.

.EXAMPLE
.\Capture-AppScenarios.ps1 -App 12345 -OutDir ".\parity-winui3" -Checklist ".\parity-baseline\checklist.json"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$App,
    [Parameter(Mandatory)][string]$OutDir,
    [Parameter(Mandatory)][string]$Checklist,
    [int]$SettleSeconds = 2
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Checklist)) { throw "Checklist not found: $Checklist" }
if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) { throw "winapp CLI not found on PATH." }

$cl = Get-Content -LiteralPath $Checklist -Raw | ConvertFrom-Json
if (-not $cl.scenarios -or @($cl.scenarios).Count -eq 0) { throw "Checklist has no scenarios: $Checklist" }

$shotDir = Join-Path $OutDir 'screenshots'
$uiDir   = Join-Path $OutDir 'ui'
foreach ($d in @($OutDir, $shotDir, $uiDir)) {
    if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

function Invoke-Winapp([string[]]$ui_args) {
    # Run a `winapp ui ...` command, capturing combined output. Never throws —
    # returns @{ ok; out } so a single bad scenario doesn't abort the sweep.
    try {
        $out = & winapp ui @ui_args 2>&1 | Out-String
        return @{ ok = ($LASTEXITCODE -eq 0); out = $out }
    } catch {
        return @{ ok = $false; out = $_.Exception.Message }
    }
}

# Confirm the app is reachable before driving it.
$status = Invoke-Winapp @('status', '-a', $App, '--json')
if (-not $status.ok) {
    Write-Warning "winapp ui status failed for app '$App'. Is the app running? Output:`n$($status.out)"
}

Write-Host "==> Capture-AppScenarios"
Write-Host "    App      : $App"
Write-Host "    OutDir   : $OutDir"
Write-Host "    Scenarios: $(@($cl.scenarios).Count)"

# Best-effort initial launch-state screenshot.
$launchShot = Join-Path $shotDir '00_launch.png'
Invoke-Winapp @('screenshot', '-a', $App, '--output', $launchShot) | Out-Null

$results = @()
foreach ($s in $cl.scenarios) {
    $num   = [int]$s.number
    $slug  = [string]$s.slug
    $title = [string]$s.title
    $shot  = Join-Path $shotDir ('{0:00}_{1}.png' -f $num, $slug)
    $uiOut = Join-Path $uiDir   ('{0:00}.json' -f $num)

    $navOk = $true
    $navMsg = ''
    if (@($cl.scenarios).Count -gt 1) {
        # Title-driven navigation. Single-page apps skip this.
        $inv = Invoke-Winapp @('invoke', $title, '-a', $App)
        $navOk = $inv.ok
        if (-not $navOk) { $navMsg = ($inv.out -split "`n" | Select-Object -First 3) -join ' ' }
    }

    Start-Sleep -Seconds $SettleSeconds

    $shotRes = Invoke-Winapp @('screenshot', '-a', $App, '--output', $shot)
    $shotOk = $shotRes.ok -and (Test-Path -LiteralPath $shot)
    $shotBytes = if ($shotOk) { (Get-Item -LiteralPath $shot).Length } else { 0 }

    $uiRes = Invoke-Winapp @('inspect', '-a', $App, '--depth', '8', '--json')
    if ($uiRes.ok -and $uiRes.out.Trim()) {
        Set-Content -LiteralPath $uiOut -Value $uiRes.out -Encoding UTF8
    }

    $results += [PSCustomObject]@{
        number = $num; title = $title; slug = $slug
        navOk = $navOk; navMsg = $navMsg
        screenshot = (Split-Path -Leaf $shot); screenshotBytes = $shotBytes; screenshotOk = $shotOk
        ui = (Split-Path -Leaf $uiOut); uiOk = ($uiRes.ok)
    }

    $flag = if ($navOk -and $shotOk) { 'OK ' } else { 'WARN' }
    Write-Host ("    [{0}] {1,2}. {2}  ({3} bytes)" -f $flag, $num, $title, $shotBytes)
    if (-not $navOk -and $navMsg) { Write-Host "         nav: $navMsg" }
}

$manifest = [ordered]@{
    app        = $App
    capturedAt = (Get-Date).ToString('o')
    checklist  = (Resolve-Path -LiteralPath $Checklist).ProviderPath
    scenarios  = @($results)
}
$manifestPath = Join-Path $OutDir 'capture-manifest.json'
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host ""
Write-Host "=== CAPTURE COMPLETE ==="
Write-Host "    Screenshots: $shotDir"
Write-Host "    UIA dumps  : $uiDir"
Write-Host "    Manifest   : $manifestPath"
