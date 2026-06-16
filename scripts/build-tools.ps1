#Requires -Version 7.0
<#
.SYNOPSIS
    One-shot build for every C# tool in this repo, including the analyzer DLL
    payload refresh.

.DESCRIPTION
    Builds and tests the WinUI 3 / Windows App SDK Roslyn analyzer, then
    AOT-publishes winmd-cli, winui-search, and the winui-cli sidecar, emits
    JSON schemas for the winui-cli JSON payloads, and refreshes the skill /
    plugin payload folders that ship the resulting binaries (analyzer DLL,
    winui-search.exe, src/tools/winui-cli/schemas/).

    This script exists to give contributors one verb to run before opening
    a PR. The pr-validation.yml workflow will rebuild everything in CI
    anyway, but provenance checks (analyzer-provenance, analyzer-targets-sync,
    winui-search-provenance) will fail fast on the PR if a committed payload
    drifts from source — running this script keeps them in sync.

.PARAMETER Configuration
    Build configuration. Defaults to Release.

.PARAMETER SkipTests
    Skip the analyzer xUnit test run. Default: tests run.

.PARAMETER SkipPayloadRefresh
    Don't copy the freshly built artifacts into the
    plugins/winui/skills/.../ payload folders. Default:
    payloads are refreshed (this is what keeps CI provenance happy).

.PARAMETER CheckSchemaDrift
    Fail the script if the freshly-emitted src/tools/winui-cli/schemas/*.json set
    (added / changed / removed files) does not match the committed copy.
    Use in CI / pre-commit to catch stale schemas. Default: off.

.EXAMPLE
    ./scripts/build-tools.ps1
    # Build + test everything in Release, AOT-publish exes, refresh payloads.

.EXAMPLE
    ./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh
    # Quick build only — skip tests and payload copy. Useful while iterating.

.EXAMPLE
    ./scripts/build-tools.ps1 -SkipTests -SkipPayloadRefresh -CheckSchemaDrift
    # Verify committed winui-cli JSON schemas are still in sync with source.
#>

[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [switch]$SkipTests,
    [switch]$SkipPayloadRefresh,
    [switch]$CheckSchemaDrift
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vsInstallerDir = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer'
if (Test-Path (Join-Path $vsInstallerDir 'vswhere.exe')) {
    $env:PATH = "$vsInstallerDir;$env:PATH"
}

function Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Ok([string]$msg)   { Write-Host "    [OK] $msg"   -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "    [!]  $msg"   -ForegroundColor Yellow }

# -------------------- 1. Analyzer (build + tests + payload refresh) ---------

$analyzerDir   = Join-Path $repoRoot 'src/tools/winui-analyzer'
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
    $payload = Join-Path $repoRoot 'plugins/winui/skills/winui-dev-workflow/analyzer'
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

# -------------------- 3. winui-search ---------------------------------------

$searchProj = Join-Path $repoRoot 'src/tools/winui-search/winui-search.csproj'
Step "Building winui-search ($Configuration)"
dotnet publish $searchProj -c $Configuration -r win-x64 --self-contained true /p:PublishAot=true /p:StripSymbols=true --nologo
if ($LASTEXITCODE -ne 0) { throw "winui-search build failed" }
Ok "winui-search built"

if (-not $SkipPayloadRefresh) {
    Step "Refreshing winui-search skill payload"
    $searchPayloadDir = Join-Path $repoRoot 'plugins/winui/skills/winui-design'
    $publishedSearchExe = Join-Path $repoRoot "src/tools/winui-search/bin/$Configuration/net10.0/win-x64/publish/winui-search.exe"
    if (-not (Test-Path $publishedSearchExe)) {
        throw "Published winui-search.exe not found at: $publishedSearchExe"
    }
    Copy-Item $publishedSearchExe (Join-Path $searchPayloadDir 'winui-search.exe') -Force
    Ok "payload refreshed: $searchPayloadDir/winui-search.exe"
} else {
    Warn "skipping winui-search payload refresh (-SkipPayloadRefresh)"
}

# -------------------- 4. winui-cli ------------------------------------------

$winuiProj = Join-Path $repoRoot 'src/tools/winui-cli/winui-cli.csproj'
$schemaEmitProj = Join-Path $repoRoot 'src/tools/winui-cli/SchemaGen/WinUi.SchemaEmit.csproj'

Step "Building winui-cli ($Configuration)"
dotnet publish $winuiProj -c $Configuration -r win-x64 --self-contained true /p:PublishAot=true /p:StripSymbols=true --nologo
if ($LASTEXITCODE -ne 0) { throw "winui-cli build failed" }
Ok "winui-cli built"

Step "Building winui schema emitter ($Configuration)"
dotnet build $schemaEmitProj -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) { throw "winui schema emitter build failed" }
Ok "winui schema emitter built"

Step "Emitting JSON schemas from winui-cli payloads"
$winuiManagedDll = Join-Path $repoRoot "src/tools/winui-cli/bin/$Configuration/net10.0/win-x64/winui.dll"
if (-not (Test-Path $winuiManagedDll)) { throw "Managed winui.dll not found at: $winuiManagedDll" }
$schemasOutDir = Join-Path $repoRoot 'src/tools/winui-cli/schemas'
$schemaEmitDll = Join-Path $repoRoot "src/tools/winui-cli/SchemaGen/bin/$Configuration/net10.0/winui-schema-emit.dll"

# Always emit into a clean staging dir, then sync to the committed dir.
# This is what lets -CheckSchemaDrift detect deletions/renames: the committed
# dir is the baseline, and the staging dir is authoritative for what the
# emitter currently produces.
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "winui-schemas-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
try {
    dotnet $schemaEmitDll $winuiManagedDll $stagingDir
    if ($LASTEXITCODE -ne 0) { throw "schema emission failed" }

    if ($CheckSchemaDrift) {
        $committedFiles = @{}
        if (Test-Path $schemasOutDir) {
            foreach ($f in Get-ChildItem -Path $schemasOutDir -Filter '*.json' -File) {
                $committedFiles[$f.Name] = [System.IO.File]::ReadAllBytes($f.FullName)
            }
        }
        $stagedFiles = @{}
        foreach ($f in Get-ChildItem -Path $stagingDir -Filter '*.json' -File) {
            $stagedFiles[$f.Name] = [System.IO.File]::ReadAllBytes($f.FullName)
        }

        $driftReasons = @()
        foreach ($name in $stagedFiles.Keys) {
            if (-not $committedFiles.ContainsKey($name)) {
                $driftReasons += "added: $name"
            } elseif (-not [Linq.Enumerable]::SequenceEqual([byte[]]$committedFiles[$name], [byte[]]$stagedFiles[$name])) {
                $driftReasons += "changed: $name"
            }
        }
        foreach ($name in $committedFiles.Keys) {
            if (-not $stagedFiles.ContainsKey($name)) {
                $driftReasons += "removed: $name"
            }
        }
        if ($driftReasons.Count -gt 0) {
            Write-Host ""
            Write-Host "ERROR: Schema drift detected." -ForegroundColor Red
            foreach ($r in $driftReasons) { Write-Host "       $r" -ForegroundColor Red }
            Write-Host "       Committed src/tools/winui-cli/schemas/ does not match the live winui-cli payload shape." -ForegroundColor Red
            Write-Host "       Run './scripts/build-tools.ps1' locally and commit the regenerated schemas." -ForegroundColor Red
            throw "schema drift"
        }
        Ok "schemas in sync with payload (no drift)"
    }

    # Sync staging -> committed: remove obsolete .json, copy current.
    New-Item -ItemType Directory -Force -Path $schemasOutDir | Out-Null
    $stagedNames = @{}
    foreach ($f in Get-ChildItem -Path $stagingDir -Filter '*.json' -File) {
        $stagedNames[$f.Name] = $true
        Copy-Item $f.FullName (Join-Path $schemasOutDir $f.Name) -Force
    }
    foreach ($f in Get-ChildItem -Path $schemasOutDir -Filter '*.json' -File) {
        if (-not $stagedNames.ContainsKey($f.Name)) {
            Remove-Item $f.FullName -Force
        }
    }
    Ok "schemas emitted: $schemasOutDir"
}
finally {
    if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
}

# -------------------- Done --------------------------------------------------

Step "All tools built successfully"
Write-Host "    Analyzer payload: plugins/winui/skills/winui-dev-workflow/analyzer/" -ForegroundColor DarkGray
Write-Host "    AOT exes:" -ForegroundColor DarkGray
Write-Host "      src/tools/winmd-cli/bin/$Configuration/net10.0/<rid>/publish/winmd.exe"               -ForegroundColor DarkGray
Write-Host "      src/tools/winui-search/bin/$Configuration/net10.0/<rid>/publish/winui-search.exe"     -ForegroundColor DarkGray
Write-Host "      src/tools/winui-cli/bin/$Configuration/net10.0/win-x64/publish/winui.exe"             -ForegroundColor DarkGray
Write-Host "    Skill payloads:" -ForegroundColor DarkGray
Write-Host "      plugins/winui/skills/winui-design/winui-search.exe (refreshed)"                       -ForegroundColor DarkGray
Write-Host "    Schemas:" -ForegroundColor DarkGray
Write-Host "      src/tools/winui-cli/schemas/*.schema.json (auto-generated from [WinUiJsonSchema] records)" -ForegroundColor DarkGray
