#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Builds the winui-search.exe CLI and deploys it to the skill directory.
.DESCRIPTION
    Publishes src/tools/winui-search as a self-contained native AOT single-file
    executable targeting win-x64, then copies the result to
    src/skills/winui-search/winui-search.exe.
.PARAMETER Runtime
    Target runtime identifier. Default: win-x64.
.PARAMETER Configuration
    Build configuration. Default: Release.
.PARAMETER SkipPublish
    Only build, don't copy to the skill directory.
.EXAMPLE
    .\scripts\build-search.ps1
    .\scripts\build-search.ps1 -Runtime win-arm64
#>
param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path $PSCommandPath -Parent
$RepoRoot = Split-Path $ScriptDir -Parent
$ProjectDir = Join-Path $RepoRoot "src\tools\winui-search"
$ProjectFile = Join-Path $ProjectDir "winui-search.csproj"
$SkillDir = Join-Path $RepoRoot "src\skills\winui-search"
$TargetExe = Join-Path $SkillDir "winui-search.exe"

if (-not (Test-Path $ProjectFile)) {
    Write-Error "Project not found: $ProjectFile"
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  winui-search.exe - Native AOT Build" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Source:  $ProjectDir" -ForegroundColor Gray
Write-Host "  Target:  $TargetExe" -ForegroundColor Gray
Write-Host "  Runtime: $Runtime" -ForegroundColor Gray
Write-Host "  Config:  $Configuration" -ForegroundColor Gray
Write-Host ""

Write-Host "[1/2] Publishing native AOT..." -ForegroundColor Cyan
$publishDir = Join-Path $ProjectDir "bin\$Configuration\net10.0\$Runtime\publish"

dotnet publish $ProjectFile `
    --configuration $Configuration `
    --runtime $Runtime `
    --self-contained true `
    /p:PublishAot=true `
    /p:StripSymbols=true

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

$publishedExe = Join-Path $publishDir "winui-search.exe"
if (-not (Test-Path $publishedExe)) {
    $publishedExe = Get-ChildItem (Join-Path $ProjectDir "bin") -Recurse -Filter "winui-search.exe" |
        Where-Object { $_.DirectoryName -like "*publish*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $publishedExe) {
        Write-Error "Could not find published winui-search.exe"
        exit 1
    }
}

$exeSize = [math]::Round((Get-Item $publishedExe).Length / 1MB, 1)
Write-Host ("  Built: {0} ({1} MB)" -f $publishedExe, $exeSize) -ForegroundColor Green
Write-Host ""

if (-not $SkipPublish) {
    Write-Host "[2/2] Deploying to skill directory..." -ForegroundColor Cyan

    if (-not (Test-Path $SkillDir)) {
        New-Item -ItemType Directory -Path $SkillDir -Force | Out-Null
    }

    Copy-Item $publishedExe $TargetExe -Force
    $deployedSize = [math]::Round((Get-Item $TargetExe).Length / 1MB, 1)
    Write-Host ("  Deployed: {0} ({1} MB)" -f $TargetExe, $deployedSize) -ForegroundColor Green
} else {
    Write-Host "[2/2] Skipped deployment (--SkipPublish)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green

