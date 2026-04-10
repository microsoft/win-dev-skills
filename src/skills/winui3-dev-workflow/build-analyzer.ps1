<#
.SYNOPSIS
    Builds the WinUI3 Roslyn analyzer and copies the output to the skill folder.
    Run this after modifying any analyzer rules in src/tools/winui3-analyzer/.

.EXAMPLE
    .\build-analyzer.ps1
#>
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..") 
$analyzerProj = Join-Path $repoRoot "src\tools\winui3-analyzer\WinUI3.Analyzer\WinUI3Analyzer.csproj"
$outputDir = Join-Path $PSScriptRoot "analyzer"

if (-not (Test-Path $analyzerProj)) {
    Write-Error "Analyzer project not found at: $analyzerProj"
    exit 1
}

Write-Host "Building WinUI3 Analyzer..." -ForegroundColor Cyan
dotnet build $analyzerProj -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

New-Item -ItemType Directory -Force $outputDir | Out-Null

$dll = Join-Path (Split-Path $analyzerProj) "bin\Release\netstandard2.0\WinUI3.Analyzer.dll"
$targets = Join-Path (Split-Path $analyzerProj) "WinUI3.Analyzer.targets"

Copy-Item $dll $outputDir -Force
Copy-Item $targets $outputDir -Force

Write-Host "Done. Analyzer files in: $outputDir" -ForegroundColor Green
Get-ChildItem $outputDir | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length/1KB))KB)" }
