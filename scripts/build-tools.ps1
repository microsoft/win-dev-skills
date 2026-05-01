#Requires -Version 7.0
<#
.SYNOPSIS
    One-shot build for every C# tool in this repo, including the analyzer DLL
    payload refresh that the winui-dev-workflow skill ships with.

.DESCRIPTION
    Builds and tests the WinUI 3 / Windows App SDK Roslyn analyzer, then
    builds (or AOT-publishes) winmd-cli and winui-search. Optionally copies
    the freshly built artifacts into the consuming skill payload folders.

    This script exists to give contributors one verb to run before opening
    a PR. The pr-validation.yml workflow will rebuild everything in CI
    anyway, but two checks (analyzer-provenance and analyzer-targets-sync)
    will fail fast on the PR if the committed analyzer DLL drifts from
    source — running this script keeps them in sync.

.PARAMETER Configuration
    Build configuration. Defaults to Release.

.PARAMETER PublishAot
    If set, runs `dotnet publish` for winmd-cli and winui-search to produce
    native-AOT single-file exes for the host architecture. Otherwise uses
    plain `dotnet build` (faster iteration, no AOT).

.PARAMETER SkipTests
    Skip the analyzer xUnit test run. Default: tests run.

.PARAMETER SkipPayloadRefresh
    Don't copy the built analyzer DLL + .targets into the
    .github/plugin/skills/winui-dev-workflow/analyzer/ payload folder.
    Default: payload is refreshed (this is what keeps CI provenance happy).

.EXAMPLE
    ./scripts/build-tools.ps1
    # Build everything in Release, run analyzer tests, refresh skill payload.

.EXAMPLE
    ./scripts/build-tools.ps1 -PublishAot
    # Same, but also AOT-publishes winmd.exe and winui-search.exe for host arch.

.EXAMPLE
    ./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh
    # Quick build only — skip tests and payload copy. Useful while iterating.
#>

[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [switch]$PublishAot,
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

$analyzerDir   = Join-Path $repoRoot 'src/tools/winui3-analyzer'
$analyzerSlnx  = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers.slnx'
$analyzerProj  = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers/Microsoft.WindowsAppSDK.Analyzers.csproj'
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
    $payload = Join-Path $repoRoot '.github/plugin/skills/winui-dev-workflow/analyzer'
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
if ($PublishAot) {
    dotnet publish $winmdProj -c $Configuration --nologo
} else {
    dotnet build $winmdProj -c $Configuration --nologo
}
if ($LASTEXITCODE -ne 0) { throw "winmd-cli build failed" }
Ok "winmd-cli built"

# -------------------- 3. winui-search ---------------------------------------

$searchProj = Join-Path $repoRoot 'src/tools/winui-search/winui-search.csproj'
Step "Building winui-search ($Configuration)"
if ($PublishAot) {
    dotnet publish $searchProj -c $Configuration --nologo
} else {
    dotnet build $searchProj -c $Configuration --nologo
}
if ($LASTEXITCODE -ne 0) { throw "winui-search build failed" }
Ok "winui-search built"

# -------------------- Done --------------------------------------------------

Step "All tools built successfully"
Write-Host "    Analyzer payload: .github/plugin/skills/winui-dev-workflow/analyzer/" -ForegroundColor DarkGray
if ($PublishAot) {
    Write-Host "    AOT exes:" -ForegroundColor DarkGray
    Write-Host "      src/tools/winmd-cli/bin/$Configuration/net10.0/<rid>/publish/winmd.exe"               -ForegroundColor DarkGray
    Write-Host "      src/tools/winui-search/bin/$Configuration/net10.0/<rid>/publish/winui-search.exe"     -ForegroundColor DarkGray
}
