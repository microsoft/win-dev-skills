<#
  run.ps1 — build a WinUI 3 / .NET project and launch it with `winapp run --detach`,
  emitting exactly one JSON object on stdout so the extension can track the app.

  Mirrors the blessed BuildAndRun.ps1 (winui-dev-workflow) build+run logic, but:
    * all human-readable progress goes to STDERR,
    * the ONLY thing on STDOUT is a single compact JSON result line,
    * it returns the launched PID (via `winapp run --detach --json`) so the
      Studio's Stop button can terminate exactly what it started.

  Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File run.ps1 -Project <folder-or-csproj>
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Project
)

$ErrorActionPreference = 'Stop'

function Emit($obj) { Write-Output ($obj | ConvertTo-Json -Compress) }
function Note($msg) { [Console]::Error.WriteLine($msg) }

try {
    # -- 1. Resolve the .csproj -------------------------------------------------
    $proj = $Project
    if (Test-Path $proj -PathType Container) {
        $csList = @(Get-ChildItem -LiteralPath $proj -Filter *.csproj -File -Depth 0)
        if ($csList.Count -eq 0) { Emit @{ ok = $false; stage = 'resolve'; error = "No .csproj file in $proj" }; exit 1 }
        elseif ($csList.Count -eq 1) { $proj = $csList[0].FullName }
        else {
            $leaf = Split-Path $proj -Leaf
            $named = $csList | Where-Object { $_.BaseName -eq $leaf } | Select-Object -First 1
            $proj = if ($named) { $named.FullName } else { $csList[0].FullName }
        }
    }
    if (-not (Test-Path $proj -PathType Leaf)) { Emit @{ ok = $false; stage = 'resolve'; error = "Project not found: $Project" }; exit 1 }
    $proj = (Resolve-Path $proj).Path
    $projectDir = Split-Path $proj -Parent
    $appName = [System.IO.Path]::GetFileNameWithoutExtension($proj)

    # -- 2. Developer Mode (required to deploy packaged WinUI apps) --------------
    $devMode = $false
    try {
        $rp = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
        if (Test-Path $rp) {
            $v = Get-ItemProperty $rp -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
            if ($v.AllowDevelopmentWithoutDevLicense -eq 1) { $devMode = $true }
        }
    } catch {}

    # -- 3. Platform / config ---------------------------------------------------
    $platform = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
    $config = 'Debug'
    $rid = $platform.ToLower()

    # -- 4. Build tool (MSBuild via vswhere, else dotnet build) -----------------
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $msbuild = $null
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath 2>$null
        if ($vsPath) {
            $cand = Join-Path $vsPath 'MSBuild\Current\Bin\MSBuild.exe'
            if (Test-Path $cand) { $msbuild = $cand }
        }
    }

    Note "--> Building $appName ($platform / $config)"
    if ($msbuild) {
        Note "--> MSBuild: $msbuild"
        $bargs = @('/nologo', '/v:m', "/p:Platform=$platform", "/p:Configuration=$config", '/restore', $proj)
        $buildOut = & $msbuild @bargs 2>&1
    } else {
        Note '--> dotnet build'
        $bargs = @('build', $proj, "-p:Platform=$platform", "-p:Configuration=$config")
        $buildOut = & dotnet @bargs 2>&1
    }
    $buildExit = $LASTEXITCODE
    $buildText = ($buildOut | Out-String)
    [Console]::Error.Write($buildText)

    if ($buildExit -ne 0) {
        $lines = $buildText -split "`r?`n"
        $tail = ($lines | Where-Object { $_ -match ': error' } | Select-Object -Last 6) -join "`n"
        if (-not $tail) { $tail = (($lines | Where-Object { $_.Trim() -ne '' }) | Select-Object -Last 8) -join "`n" }
        Emit @{ ok = $false; stage = 'build'; exit = $buildExit; error = $tail; devMode = $devMode }
        exit 1
    }
    Note '--> BUILD SUCCEEDED'

    # -- 5. Locate the build output --------------------------------------------
    $binDir = Join-Path $projectDir "bin\$platform\$config"
    if (-not (Test-Path $binDir)) { Emit @{ ok = $false; stage = 'output'; error = "Build output not found at $binDir" }; exit 1 }
    $tfm = Get-ChildItem $binDir -Directory | Where-Object { $_.Name -match '^net\d' } | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $tfm) { Emit @{ ok = $false; stage = 'output'; error = "No target-framework folder under $binDir" }; exit 1 }
    $outputDir = Join-Path $tfm.FullName "win-$rid"
    if (-not (Test-Path $outputDir)) { $outputDir = $tfm.FullName }

    if (-not $devMode) {
        Emit @{ ok = $false; stage = 'devmode'; error = 'Developer Mode is off. Enable it: Settings > System > For developers > Developer Mode.'; output = $outputDir }
        exit 1
    }

    # -- 6. Launch via winapp (returns the PID with --detach --json) ------------
    $winapp = Get-Command winapp -ErrorAction SilentlyContinue
    if (-not $winapp) { Emit @{ ok = $false; stage = 'launch'; error = 'winapp CLI not found in PATH.'; output = $outputDir }; exit 1 }

    Note "--> Launching $appName"
    $runOut = & winapp run $outputDir --detach --json 2>&1
    $runText = ($runOut | Out-String)
    [Console]::Error.Write($runText)

    $appPid = $null
    try {
        $j = $runText | ConvertFrom-Json
        if ($j.pid) { $appPid = [int]$j.pid }
        elseif ($j.processId) { $appPid = [int]$j.processId }
        elseif ($j.ProcessId) { $appPid = [int]$j.ProcessId }
    } catch {}
    if (-not $appPid) {
        $m = [regex]::Match($runText, '(?im)(?:pid|processId)\D{0,6}(\d{2,7})')
        if ($m.Success) { $appPid = [int]$m.Groups[1].Value }
    }
    if (-not $appPid) {
        $all = [regex]::Matches($runText, '\b(\d{3,7})\b')
        if ($all.Count -gt 0) { $appPid = [int]$all[$all.Count - 1].Groups[1].Value }
    }

    if ($appPid) {
        Emit @{ ok = $true; pid = $appPid; proc = $appName; output = $outputDir }
        exit 0
    }
    Emit @{ ok = $false; stage = 'launch'; error = ("winapp run did not report a PID. " + $runText.Trim()); output = $outputDir }
    exit 1
}
catch {
    Emit @{ ok = $false; stage = 'exception'; error = $_.Exception.Message }
    exit 1
}
