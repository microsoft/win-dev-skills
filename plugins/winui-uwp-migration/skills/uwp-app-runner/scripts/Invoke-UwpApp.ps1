<#
.SYNOPSIS
Build, deploy, launch, and health-check a (legacy C#) UWP app so it can be driven
by UI Automation (e.g. winapp ui) for screenshots / parity capture.

.DESCRIPTION
Encapsulates the mechanical, environment-specific steps required to get a running
UWP app on a modern dev box, and reports a STRUCTURED result so callers can degrade
gracefully when the app cannot be launched (legacy UWP samples frequently crash at
startup on newer OS builds — that is expected, not a script bug).

Pipeline (each stage can fail independently and is reported):
  1. resolve   — locate the .csproj (from -Project or -Source) and MSBuild (vswhere).
  2. sdk       — detect the newest INSTALLED Windows 10 SDK (UAP). Legacy samples pin
                 a TargetPlatformVersion that is usually NOT installed; we override it.
  3. build     — msbuild /restore /t:Build Debug|<Platform> with the SDK override.
  4. deps      — Add-AppxPackage the framework dependencies the build emits
                 (VCLibs.Debug, NET.CoreRuntime/CoreFramework) — required before register.
  5. launch    — winapp run <loose-layout> --detach  (registers + activates, prints PID).
  6. verify    — confirm the process stays alive and (optionally) shows a window. If it
                 crashed, capture the WER crash signature (faulting module + code).

The script NEVER throws on an expected operational failure; it returns a result object
and (with -Json) prints it as JSON. Exit code: 0 = app is running, 1 = could not run.

.PARAMETER Project
Path to the UWP .csproj to build. Either -Project or -Source is required.

.PARAMETER Source
Path to a folder containing the UWP project; the first *.csproj found is used.

.PARAMETER Platform
Build/runtime platform. Default x64.

.PARAMETER Configuration
Build configuration. Default Debug (faster — Release triggers slow .NET Native).

.PARAMETER SettleSeconds
Seconds to wait after launch before the alive/window health check. Default 6.

.PARAMETER NoInstallDeps
Skip the framework-dependency install step (use if deps are already present).

.PARAMETER Json
Emit the structured result as JSON to stdout (for programmatic callers).

.OUTPUTS
PSCustomObject (and JSON with -Json):
  { ok, stage, pid, aumid, processName, hasWindow, layout, project, sdk,
    crash:{ module, code } | $null, detail }

.EXAMPLE
.\Invoke-UwpApp.ps1 -Source ".\Samples\Clipboard\cs" -Json
# Build + launch; parse the JSON .pid and drive with Capture-AppScenarios.ps1.

.EXAMPLE
$r = .\Invoke-UwpApp.ps1 -Project .\Clipboard.csproj
if ($r.ok) { winapp ui screenshot ":root" -a $r.pid --output uwp.png } else { "UWP unavailable: $($r.detail)" }
#>
[CmdletBinding(DefaultParameterSetName = 'Source')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Project')][string]$Project,
    [Parameter(Mandatory, ParameterSetName = 'Source')][string]$Source,
    [string]$Platform = 'x64',
    [string]$Configuration = 'Debug',
    [int]$SettleSeconds = 6,
    [switch]$NoInstallDeps,
    [switch]$Json
)

# This script reports failures structurally; it must not abort on a non-zero
# external tool exit. We manage errors explicitly per stage.
$ErrorActionPreference = 'Continue'

function New-Result {
    param([bool]$Ok, [string]$Stage, [string]$Detail, [hashtable]$Extra)
    $r = [ordered]@{
        ok = $Ok; stage = $Stage; pid = $null; aumid = $null; processName = $null
        hasWindow = $false; layout = $null; project = $null; sdk = $null
        crash = $null; detail = $Detail
    }
    if ($Extra) { foreach ($k in $Extra.Keys) { $r[$k] = $Extra[$k] } }
    [pscustomobject]$r
}

function Write-Out {
    param([pscustomobject]$Result)
    if ($Json) {
        $Result | ConvertTo-Json -Depth 6
    } else {
        $tag = if ($Result.ok) { 'OK  ' } else { 'FAIL' }
        Write-Host ""
        Write-Host "==> Invoke-UwpApp [$tag] stage=$($Result.stage)"
        if ($Result.project) { Write-Host "    Project : $($Result.project)" }
        if ($Result.sdk)     { Write-Host "    SDK     : $($Result.sdk)" }
        if ($Result.layout)  { Write-Host "    Layout  : $($Result.layout)" }
        if ($Result.pid)     { Write-Host "    PID     : $($Result.pid)   AUMID: $($Result.aumid)" }
        if ($Result.crash)   { Write-Host "    Crash   : $($Result.crash.module)  code=$($Result.crash.code)" }
        if ($Result.detail)  { Write-Host "    Detail  : $($Result.detail)" }
    }
    exit ([int](-not $Result.ok))
}

# ---- Stage 1: resolve project + MSBuild --------------------------------------
if ($PSCmdlet.ParameterSetName -eq 'Source') {
    if (-not (Test-Path -LiteralPath $Source)) { Write-Out (New-Result $false 'resolve' "Source folder not found: $Source") }
    $Project = Get-ChildItem -LiteralPath $Source -Filter *.csproj -File | Select-Object -First 1 -ExpandProperty FullName
    if (-not $Project) { Write-Out (New-Result $false 'resolve' "No .csproj found under: $Source") }
}
if (-not (Test-Path -LiteralPath $Project)) { Write-Out (New-Result $false 'resolve' "Project not found: $Project") }
$Project = (Resolve-Path -LiteralPath $Project).Path
$projDir = Split-Path -Parent $Project

if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) {
    Write-Out (New-Result $false 'resolve' "winapp CLI not found on PATH (needed to register + launch the UWP app)." @{ project = $Project })
}

# Locate MSBuild via vswhere (covers VS 2019..2026).
$msbuild = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath 2>$null | Select-Object -First 1
    if ($vsPath) {
        $cand = Join-Path $vsPath 'MSBuild\Current\Bin\MSBuild.exe'
        if (Test-Path -LiteralPath $cand) { $msbuild = $cand }
    }
}
if (-not $msbuild) { $msbuild = (Get-Command msbuild.exe -ErrorAction SilentlyContinue).Source }
if (-not $msbuild) {
    Write-Out (New-Result $false 'resolve' "MSBuild not found (need Visual Studio with the 'Universal Windows Platform development' workload)." @{ project = $Project })
}

# ---- Stage 2: detect newest installed UAP SDK --------------------------------
# Legacy samples pin TargetPlatformVersion to an SDK that is usually not installed,
# which yields phantom "namespace 'Windows' does not exist" errors. Override it
# with the newest SDK that actually has the UWP union metadata (Windows.winmd).
$kitsRoot = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue).KitsRoot10
if (-not $kitsRoot) { $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10' }
$umDir = Join-Path $kitsRoot 'UnionMetadata'
$sdkVer = $null
if (Test-Path -LiteralPath $umDir) {
    $sdkVer = Get-ChildItem -LiteralPath $umDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^10\.' -and (Test-Path (Join-Path $_.FullName 'Windows.winmd')) } |
        Sort-Object { [version]$_.Name } -Descending |
        Select-Object -First 1 -ExpandProperty Name
}
if (-not $sdkVer) {
    Write-Out (New-Result $false 'sdk' "No installed Windows 10 SDK with UWP metadata found under $umDir. Install a Windows 10/11 SDK (UWP workload)." @{ project = $Project })
}

# ---- Stage 3: build ----------------------------------------------------------
$buildArgs = @(
    $Project, '/restore', '/t:Build', '/nologo', '/m',
    "/p:Configuration=$Configuration", "/p:Platform=$Platform",
    "/p:TargetPlatformVersion=$sdkVer", '/p:TargetPlatformMinVersion=10.0.17763.0',
    '/p:AppxBundle=Never', '/p:UapAppxPackageBuildMode=SideloadOnly',
    '/p:AppxPackageSigningEnabled=false', '/clp:Summary'
)
$buildLog = Join-Path ([System.IO.Path]::GetTempPath()) ("uwp-build-{0}.log" -f ([System.IO.Path]::GetFileNameWithoutExtension($Project)))
& $msbuild @buildArgs *>&1 | Tee-Object -FilePath $buildLog | Out-Null
if ($LASTEXITCODE -ne 0) {
    $errLines = (Select-String -Path $buildLog -Pattern ': error ' -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { $_.Line.Trim() }) -join ' | '
    Write-Out (New-Result $false 'build' "Build failed (SDK $sdkVer). First errors: $errLines  (full log: $buildLog)" @{ project = $Project; sdk = $sdkVer })
}

# Loose layout that winapp run consumes: <projDir>\bin\<plat>\<cfg>  (winapp finds the AppX subfolder).
$layout = Join-Path $projDir "bin\$Platform\$Configuration"
if (-not (Test-Path (Join-Path $layout 'AppxManifest.xml')) -and -not (Test-Path (Join-Path $layout 'AppX\AppxManifest.xml'))) {
    Write-Out (New-Result $false 'build' "Build reported success but no AppxManifest.xml found under $layout." @{ project = $Project; sdk = $sdkVer })
}

# ---- Stage 4: install framework dependencies ---------------------------------
if (-not $NoInstallDeps) {
    $depRoot = Join-Path $projDir 'AppPackages'
    if (Test-Path -LiteralPath $depRoot) {
        $depPkgs = Get-ChildItem -LiteralPath $depRoot -Recurse -Filter *.appx -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "\\Dependencies\\$Platform\\" }
        foreach ($d in $depPkgs) {
            try { Add-AppxPackage -Path $d.FullName -ErrorAction Stop }
            catch { } # already installed / higher version present — non-fatal
        }
    }
}

# ---- Stage 5: launch ---------------------------------------------------------
$runJson = winapp run $layout --detach --json 2>&1 | Out-String
$run = $null
try { $run = $runJson | ConvertFrom-Json } catch { }
$thePid = $null; $aumid = $null
if ($run) {
    if ($run.PID)   { $thePid = [int]$run.PID }
    elseif ($run.Pid) { $thePid = [int]$run.Pid }
    if ($run.AUMID) { $aumid = $run.AUMID }
}

# ---- Stage 6: verify alive + (best-effort) window ----------------------------
Start-Sleep -Seconds $SettleSeconds

$procName = [System.IO.Path]::GetFileNameWithoutExtension($Project)
$proc = Get-Process -Name $procName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc -and $thePid) { $proc = Get-Process -Id $thePid -ErrorAction SilentlyContinue }

if (-not $proc) {
    # App did not stay alive — capture the WER crash signature so the caller knows WHY.
    $crash = $null; $detail = "App registered but is not running (crashed or failed to activate)."
    $pkgToken = $procName
    $evt = Get-WinEvent -LogName Application -MaxEvents 60 -ErrorAction SilentlyContinue |
        Where-Object { $_.TimeCreated -gt (Get-Date).AddMinutes(-3) -and $_.Id -eq 1000 -and $_.Message -match [regex]::Escape($procName) } |
        Select-Object -First 1
    if ($evt) {
        $m = $evt.Message
        $mod  = if ($m -match 'Faulting module name:\s*([^,]+)') { $matches[1].Trim() } else { $null }
        $code = if ($m -match 'Exception code:\s*(0x[0-9a-fA-F]+)') { $matches[1] } else { $null }
        $crash = [ordered]@{ module = $mod; code = $code }
        $hint = switch ($code) {
            '0xc000027b' { 'native XAML stowed exception (legacy projection incompatibility)' }
            '0xe0434352' { 'managed .NET exception (e.g. TypeLoadException — legacy UWP projection/contract incompatible with current OS)' }
            default      { 'startup crash' }
        }
        $detail = "App crashed at startup in $mod ($code): $hint. This is common for legacy UWP samples on newer OS builds — fall back to source-derived checklist / cached golden screenshots."
    }
    Write-Out (New-Result $false 'launch' $detail @{ project = $Project; sdk = $sdkVer; layout = $layout; aumid = $aumid; crash = $crash })
}

$hasWindow = $false
try {
    $wins = winapp ui list-windows -a $proc.Id 2>&1 | Out-String
    if ($wins -notmatch 'Found 0 windows') { $hasWindow = $true }
} catch { }

Write-Out (New-Result $true 'verify' "UWP app is running (pid $($proc.Id))." @{
    project = $Project; sdk = $sdkVer; layout = $layout
    pid = $proc.Id; aumid = $aumid; processName = $proc.ProcessName; hasWindow = $hasWindow
})
