#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Builds the WinUI3 Roslyn analyzer and copies the output to the skill folder.
    Run this after modifying any analyzer rules in src/tools/winui3-analyzer/.

.EXAMPLE
    .\scripts\build-analyzer.ps1
#>
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path $PSCommandPath -Parent
$RepoRoot = Split-Path $ScriptDir -Parent
$analyzerProj = Join-Path $RepoRoot "src\tools\winui3-analyzer\WinUI3.Analyzer\WinUI3Analyzer.csproj"
$outputDir = Join-Path $RepoRoot "src\skills\winui3-dev-workflow\analyzer"

if (-not (Test-Path $analyzerProj)) {
    Write-Error "Analyzer project not found at: $analyzerProj"
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  WinUI3 Roslyn Analyzer - Build" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Source:  $analyzerProj" -ForegroundColor Gray
Write-Host "  Target:  $outputDir" -ForegroundColor Gray
Write-Host ""

Write-Host "[1/2] Building analyzer..." -ForegroundColor Cyan
dotnet build $analyzerProj -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/2] Deploying to skill directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force $outputDir | Out-Null

$dll = Join-Path (Split-Path $analyzerProj) "bin\Release\netstandard2.0\WinUI3.Analyzer.dll"
$targets = Join-Path (Split-Path $analyzerProj) "WinUI3.Analyzer.targets"

Copy-Item $dll $outputDir -Force
Copy-Item $targets $outputDir -Force

Write-Host ""
Write-Host "Done. Analyzer files in: $outputDir" -ForegroundColor Green
Get-ChildItem $outputDir | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1KB))KB)" }
