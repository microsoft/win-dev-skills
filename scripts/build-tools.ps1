#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Builds all tools and deploys them to the correct skill directories.

.DESCRIPTION
    Builds:
    1. winmd.exe (Native AOT) → src/skills/winmd-api-search/winmd.exe
    2. WinUI3 Roslyn Analyzer → src/skills/winui3-dev-workflow/analyzer/
    3. winui3-gallery.exe (Native AOT) → src/skills/winui3-gallery-search/winui3-gallery.exe

.PARAMETER SkipWinmd
    Skip building winmd.exe (useful if you only changed the analyzer).

.PARAMETER SkipAnalyzer
    Skip building the Roslyn analyzer (useful if you only changed winmd).

.PARAMETER SkipGallery
    Skip building the WinUI3 Gallery CLI (useful if you only changed other tools).

.EXAMPLE
    .\scripts\build-tools.ps1
    .\scripts\build-tools.ps1 -SkipWinmd
    .\scripts\build-tools.ps1 -SkipAnalyzer
    .\scripts\build-tools.ps1 -SkipGallery
#>
param(
    [switch]$SkipWinmd,
    [switch]$SkipAnalyzer,
    [switch]$SkipGallery
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path $PSCommandPath -Parent

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Win-Dev-Skills - Build All Tools" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$results = @()

# ── 1. winmd.exe ──
if (-not $SkipWinmd) {
    Write-Host "--- winmd.exe ---" -ForegroundColor Yellow
    & (Join-Path $ScriptDir "build-winmd.ps1")
    if ($LASTEXITCODE -ne 0) {
        $results += @{ Tool = "winmd.exe"; Status = "FAILED" }
        Write-Error "winmd.exe build failed"
    } else {
        $results += @{ Tool = "winmd.exe"; Status = "OK" }
    }
    Write-Host ""
} else {
    $results += @{ Tool = "winmd.exe"; Status = "SKIPPED" }
}

# ── 2. Roslyn Analyzer ──
if (-not $SkipAnalyzer) {
    Write-Host "--- WinUI3 Roslyn Analyzer ---" -ForegroundColor Yellow
    & (Join-Path $ScriptDir "build-analyzer.ps1")
    if ($LASTEXITCODE -ne 0) {
        $results += @{ Tool = "Analyzer"; Status = "FAILED" }
        Write-Error "Analyzer build failed"
    } else {
        $results += @{ Tool = "Analyzer"; Status = "OK" }
    }
    Write-Host ""
} else {
    $results += @{ Tool = "Analyzer"; Status = "SKIPPED" }
}

# ── 3. WinUI3 Gallery CLI ──
if (-not $SkipGallery) {
    Write-Host "--- winui3-gallery.exe ---" -ForegroundColor Yellow
    & (Join-Path $ScriptDir "build-gallery.ps1")
    if ($LASTEXITCODE -ne 0) {
        $results += @{ Tool = "winui3-gallery.exe"; Status = "FAILED" }
        Write-Error "winui3-gallery.exe build failed"
    } else {
        $results += @{ Tool = "winui3-gallery.exe"; Status = "OK" }
    }
    Write-Host ""
} else {
    $results += @{ Tool = "winui3-gallery.exe"; Status = "SKIPPED" }
}

# ── Summary ──
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
foreach ($r in $results) {
    $color = switch ($r.Status) {
        "OK"      { "Green" }
        "FAILED"  { "Red" }
        "SKIPPED" { "Yellow" }
    }
    Write-Host "  $($r.Tool): $($r.Status)" -ForegroundColor $color
}
Write-Host ""
