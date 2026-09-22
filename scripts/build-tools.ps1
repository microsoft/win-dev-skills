#Requires -Version 7.0
<#
.SYNOPSIS
    Build and test the retained WinUI analyzer source.

.DESCRIPTION
    The plugin consumes Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer from
    NuGet and no longer distributes locally built analyzer payloads.
    This source and its tests remain for pending analyzer work; publication
    and the active analyzer implementation live in microsoft/winappCli.

.PARAMETER Configuration
    Build configuration. Defaults to Release.

.PARAMETER SkipTests
    Skip the analyzer xUnit test run. Default: tests run.

.EXAMPLE
    ./scripts/build-tools.ps1
    # Build and test the retained analyzer in Release.

.EXAMPLE
    ./scripts/build-tools.ps1 -SkipTests
    # Quick build only while iterating.
#>

[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Ok([string]$msg)   { Write-Host "    [OK] $msg"   -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    [!]  $msg"   -ForegroundColor Yellow }

# -------------------- Analyzer (build + tests) -----------------------------

$analyzerDir   = Join-Path $repoRoot 'src/tools/winui-analyzer'
$analyzerSlnx  = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers.slnx'
$analyzerTests = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers.Tests/Microsoft.WindowsAppSDK.Analyzers.Tests.csproj'

Step "Building analyzer ($Configuration)"
dotnet build $analyzerSlnx -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw "analyzer build failed" }
Ok "analyzer built"

if (-not $SkipTests) {
    Step "Running analyzer tests"
    dotnet test $analyzerTests -c $Configuration --no-build --nologo --logger 'console;verbosity=normal'
    if ($LASTEXITCODE -ne 0) { throw "analyzer tests failed" }
    Ok "analyzer tests passed"
} else {
    Warn "skipping analyzer tests (-SkipTests)"
}

# -------------------- Done --------------------------------------------------

Step "Analyzer build complete"
