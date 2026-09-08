#Requires -Version 7.0
<#
.SYNOPSIS
    One-shot build for every C# tool in this repo, including the analyzer DLL
    payload refresh that the winui-dev-workflow skill ships with.

.DESCRIPTION
    Builds and tests the WinUI 3 / Windows App SDK Roslyn analyzer, then
    AOT-publishes winmd-cli and refreshes the analyzer skill payload.

    This script exists to give contributors one verb to run before opening
    a PR. The pr-validation.yml workflow will rebuild everything in CI
    anyway, but provenance checks (analyzer-provenance and
    analyzer-targets-sync) will fail fast on the PR if the committed payload
    drifts from source — running this script keeps it in sync.

.PARAMETER Configuration
    Build configuration. Defaults to Release.

.PARAMETER SkipTests
    Skip the analyzer xUnit test run. Default: tests run.

.PARAMETER SkipPayloadRefresh
    Don't copy the freshly built artifacts into the
    plugins/winui/agent-plugin/skills/.../ payload folder. Default: the payload
    is refreshed (this is what keeps CI provenance happy).

.EXAMPLE
    ./scripts/build-tools.ps1
    # Build + test everything in Release, AOT-publish winmd, refresh the analyzer payload.

.EXAMPLE
    ./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh
    # Quick build only — skip tests and payload copy. Useful while iterating.
#>

[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [switch]$SkipTests,
    [switch]$SkipPayloadRefresh
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Ok([string]$msg)   { Write-Host "    [OK] $msg"   -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    [!]  $msg"   -ForegroundColor Yellow }

# -------------------- 1. Analyzer (build + tests + payload refresh) ---------

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

if (-not $SkipPayloadRefresh) {
    Step "Refreshing analyzer skill payload"
    $payload = Join-Path $repoRoot 'plugins/winui/agent-plugin/skills/winui-dev-workflow/analyzer'
    $builtDll = Join-Path $analyzerDir "Microsoft.WindowsAppSDK.Analyzers/bin/$Configuration/netstandard2.0/Microsoft.WindowsAppSDK.Analyzers.dll"
    $srcTargets = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers/Microsoft.WindowsAppSDK.Analyzers.targets'
    Copy-Item $builtDll    (Join-Path $payload 'Microsoft.WindowsAppSDK.Analyzers.dll')     -Force
    Copy-Item $srcTargets  (Join-Path $payload 'Microsoft.WindowsAppSDK.Analyzers.targets') -Force
    Ok "payload refreshed: $payload"
} else {
    Warn "skipping payload refresh (-SkipPayloadRefresh)"
}

# -------------------- 2. winmd-cli ------------------------------------------

$winmdProj = Join-Path $repoRoot 'src/tools/winmd-cli/winmd.csproj'
Step "Building winmd-cli ($Configuration)"
dotnet publish $winmdProj -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw "winmd-cli build failed" }
Ok "winmd-cli built"

# -------------------- Done --------------------------------------------------

Step "All tools built successfully"
Write-Host "    Analyzer payload: plugins/winui/agent-plugin/skills/winui-dev-workflow/analyzer/" -ForegroundColor DarkGray
Write-Host "    AOT exe:" -ForegroundColor DarkGray
Write-Host "      src/tools/winmd-cli/bin/$Configuration/net10.0/<rid>/publish/winmd.exe" -ForegroundColor DarkGray
