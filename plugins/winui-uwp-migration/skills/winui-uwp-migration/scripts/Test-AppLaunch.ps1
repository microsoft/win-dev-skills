<#
.SYNOPSIS
Launch an already-built WinUI 3 app and report whether it survives startup -
and if not, capture the REAL unhandled-exception signature from Windows Error
Reporting so a startup crash can be diagnosed immediately instead of guessed at.

.DESCRIPTION
A packaged WinUI 3 app can build cleanly and still crash on startup. When that
happens the only durable signal is the Windows Application event log: event 1000
(faulting module + native exception code) and event 1026 (.NET Runtime - the
managed exception TYPE, message, and stack). This script launches the built
layout via 'winapp run --detach --json', waits for the cold-start window, and:

  - if the process is alive  -> status=running  (exit 0)
  - if it registered then died/threw at startup -> status=crashed (exit 1),
    with the captured WER signature + a pointer to PATTERNS.md#startup-crashes
  - if it never registered (deploy/env failure: Developer Mode off, missing
    framework, MAX_PATH, no winapp) -> status=unavailable (exit 2) - inconclusive,
    NOT a code defect.

It NEVER throws on an operational failure; it returns a structured result and
(with -Json) prints it as JSON. This is the single source of truth for the
"did the migrated app launch" question - both Step 3 (interactive, when the app
first crashes) and the Step 4 validator (Section 7) call it.

WHY THIS MATTERS: the common failure mode is an agent that sees a startup crash
and hand-rolls File.WriteAllText tracing for the rest of its budget. Don't. Run
this once; read the captured managed exception; fix the named frame.

NOTE: this script is intentionally ASCII-only. The Step 4 validator invokes it
via 'powershell -File' (Windows PowerShell 5.1), which reads a UTF-8-no-BOM file
as ANSI; non-ASCII characters would corrupt parsing under 5.1.

.PARAMETER Target
The migrated WinUI 3 project root (the folder with the .csproj). The build-output
layout is discovered under bin/<arch>/Debug/<tfm>/win-<rid>. Use this OR -Layout.

.PARAMETER Layout
An explicit build-output layout folder (the one containing AppxManifest.xml +
the app .exe, or an AppX\ subfolder). Use this OR -Target.

.PARAMETER SettleSeconds
Seconds to wait after launch before the alive check. Default 10 - enough to
catch OnLaunched / first-Page-navigation crashes without bloating runtime.

.PARAMETER Json
Emit the structured result as JSON to stdout (for programmatic callers).

.OUTPUTS
PSCustomObject (and JSON with -Json):
  { ok, status, pid, aumid, layout, crash:{ code, module, managedType, message,
    hint, anchor } | $null, detail }
status in { running, crashed, unavailable }.  exit: 0 running / 1 crashed / 2 unavailable.

.EXAMPLE
.\Test-AppLaunch.ps1 -Target "C:\out\MyWinUI3App"
# Interactive: launch and, on crash, print the real exception + the fix pointer.

.EXAMPLE
$r = .\Test-AppLaunch.ps1 -Layout $launchFolder -Json | ConvertFrom-Json
if ($r.status -eq 'crashed') { "FAIL: $($r.crash.hint)" }
#>
[CmdletBinding(DefaultParameterSetName = 'Target')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Target')][string]$Target,
    [Parameter(Mandatory, ParameterSetName = 'Layout')][string]$Layout,
    [int]$SettleSeconds = 10,
    [switch]$Json
)

# This script reports failures structurally; it must not abort on a non-zero
# external tool exit. Errors are handled explicitly per stage.
$ErrorActionPreference = 'Continue'

function New-LaunchResult {
    param([bool]$Ok, [string]$Status, [string]$Detail, [hashtable]$Extra)
    $r = [ordered]@{
        ok = $Ok; status = $Status; pid = $null; aumid = $null
        layout = $null; crash = $null; detail = $Detail
    }
    if ($Extra) { foreach ($k in $Extra.Keys) { $r[$k] = $Extra[$k] } }
    [pscustomobject]$r
}

function Write-LaunchOut {
    param([pscustomobject]$Result)
    # exit code: running=0, crashed=1, unavailable=2
    $exit = switch ($Result.status) { 'running' { 0 } 'crashed' { 1 } default { 2 } }
    if ($Json) {
        $Result | ConvertTo-Json -Depth 6
    } else {
        $tag = switch ($Result.status) { 'running' { 'OK  ' } 'crashed' { 'FAIL' } default { 'WARN' } }
        Write-Host ""
        Write-Host "==> Test-AppLaunch [$tag] status=$($Result.status)"
        if ($Result.layout) { Write-Host "    Layout : $($Result.layout)" }
        if ($Result.pid)    { Write-Host "    PID    : $($Result.pid)   AUMID: $($Result.aumid)" }
        if ($Result.crash) {
            Write-Host "    Crash  : code=$($Result.crash.code)  module=$($Result.crash.module)"
            if ($Result.crash.managedType) { Write-Host "    .NET   : $($Result.crash.managedType)" }
            if ($Result.crash.message)     { Write-Host "    Message: $($Result.crash.message)" }
            if ($Result.crash.hint)        { Write-Host "    Hint   : $($Result.crash.hint)" }
            if ($Result.crash.anchor)      { Write-Host "    Fix    : Get-MigrationPattern.ps1 -Anchor $($Result.crash.anchor)" }
        }
        if ($Result.detail) { Write-Host "    Detail : $($Result.detail)" }
    }
    exit $exit
}

# ---- Resolve the launch layout ----------------------------------------------
$exeNames = @()
if ($PSCmdlet.ParameterSetName -eq 'Target') {
    if (-not (Test-Path -LiteralPath $Target)) { Write-LaunchOut (New-LaunchResult $false 'unavailable' "Target not found: $Target") }
    $Target = (Resolve-Path -LiteralPath $Target).Path
    $csproj = Get-ChildItem -LiteralPath $Target -Recurse -Filter *.csproj -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source)\\' } | Select-Object -First 1 -ExpandProperty FullName
    if (-not $csproj) { Write-LaunchOut (New-LaunchResult $false 'unavailable' "No .csproj found under $Target") }
    $csprojDir = Split-Path -Parent $csproj
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
    $rid = $arch.ToLower()
    # Walk bin/<arch>/Debug and one level into the newest TFM dir, then win-<rid>.
    $binCandidates = @(
        (Join-Path $csprojDir "bin\$arch\Debug"),
        (Join-Path $csprojDir "bin\$rid\Debug")
    )
    foreach ($bin in $binCandidates) {
        if (-not (Test-Path -LiteralPath $bin)) { continue }
        $tfmDir = Get-ChildItem -LiteralPath $bin -Directory -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $tfmDir) { continue }
        $ridDir = Join-Path $tfmDir.FullName "win-$rid"
        $Layout = if (Test-Path -LiteralPath $ridDir) { $ridDir } else { $tfmDir.FullName }
        break
    }
    if (-not $Layout) { Write-LaunchOut (New-LaunchResult $false 'unavailable' "No build output found under bin\$arch\Debug - build the project first.") }
}

if (-not (Test-Path -LiteralPath $Layout)) { Write-LaunchOut (New-LaunchResult $false 'unavailable' "Layout folder not found: $Layout") }
$Layout = (Resolve-Path -LiteralPath $Layout).Path

# Sanity: the layout needs an exe + a manifest, else winapp run can't launch it.
$exes = @(Get-ChildItem -LiteralPath $Layout -Filter '*.exe' -File -ErrorAction SilentlyContinue)
$exeNames = @($exes | ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name) })
$hasMfst = (Test-Path -LiteralPath (Join-Path $Layout 'AppxManifest.xml')) -or
           (Test-Path -LiteralPath (Join-Path $Layout 'AppX\AppxManifest.xml'))
if ($exes.Count -eq 0 -or -not $hasMfst) {
    Write-LaunchOut (New-LaunchResult $false 'unavailable' "Layout is incomplete (need an .exe + AppxManifest.xml): $Layout" @{ layout = $Layout })
}
if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) {
    Write-LaunchOut (New-LaunchResult $false 'unavailable' "winapp CLI not on PATH - cannot launch the packaged app." @{ layout = $Layout })
}

# ---- Launch ------------------------------------------------------------------
$runRaw = & winapp run "$Layout" --detach --json 2>&1 | Out-String
$run = $null
try { $run = $runRaw.Trim() | ConvertFrom-Json -ErrorAction Stop } catch { }
$thePid = $null; $aumid = $null; $runErr = $null
if ($run) {
    foreach ($p in 'ProcessId','PID','Pid') { if ($run.$p) { $thePid = [int]$run.$p; break } }
    if ($run.AUMID) { $aumid = [string]$run.AUMID }
    if ($run.Error) { $runErr = [string]$run.Error }
}

# ---- WER capture helper ------------------------------------------------------
# Reads the real unhandled-exception signature for the just-crashed app:
#   event 1000  -> faulting module + native Exception code (e.g. 0x8001010E)
#   event 1026  -> .NET Runtime: managed exception TYPE + message + stack
# Match on the layout's exe base name(s) within a short recent window.
function Get-CrashSignature {
    param([string[]]$Names)
    $sig = [ordered]@{ code = $null; module = $null; managedType = $null; message = $null; hint = $null; anchor = $null }
    if (-not $Names -or $Names.Count -eq 0) { return $sig }
    $namePattern = ($Names | ForEach-Object { [regex]::Escape($_ + '.exe') }) -join '|'
    $events = Get-WinEvent -LogName Application -MaxEvents 80 -ErrorAction SilentlyContinue |
        Where-Object { $_.TimeCreated -gt (Get-Date).AddMinutes(-3) -and $_.Id -in 1000,1026 -and $_.Message -match $namePattern }

    $e1000 = $events | Where-Object { $_.Id -eq 1000 } | Select-Object -First 1
    if ($e1000) {
        if ($e1000.Message -match 'Faulting module name:\s*([^,]+)') { $sig.module = $matches[1].Trim() }
        if ($e1000.Message -match 'Exception code:\s*(0x[0-9a-fA-F]+)') { $sig.code = $matches[1].ToLower() }
    }
    $e1026 = $events | Where-Object { $_.Id -eq 1026 } | Select-Object -First 1
    if ($e1026) {
        # ".NET Runtime" event: "Exception Info: <Type>: <message>"
        if ($e1026.Message -match 'Exception Info:\s*([A-Za-z0-9_.]+Exception)') { $sig.managedType = $matches[1].Trim() }
        if ($e1026.Message -match 'Exception Info:\s*[A-Za-z0-9_.]+Exception[^\r\n:]*:\s*([^\r\n]+)') {
            $sig.message = $matches[1].Trim()
        } elseif ($e1026.Message -match 'Exception Info:\s*([^\r\n]+)') {
            $sig.message = $matches[1].Trim()
        }
    }

    # Map the native exception code to a conservative hint + pattern anchor.
    # These name the error CLASS and point at the captured stack / the doc; they
    # do not assert a single fix, since the real frame is in the captured exception.
    switch ($sig.code) {
        '0x80004003' {
            $sig.hint   = "E_POINTER - most often the static-window init-order race: a Page read App.MainWindow (or another static window ref) before OnLaunched assigned it. Keep MainWindow's ctor inert; navigate after Activate."
            $sig.anchor = 'windowing'
        }
        '0x8001010e' {
            $sig.hint   = "RPC_E_WRONG_THREAD - a thread/apartment-affined object was accessed during startup (commonly a view/CoreWindow-affined UWP API touched from a static initializer or off the UI thread). Construct/access it on the UI thread after Activate; if the API is unsupported on WinUI 3 desktop, defer it."
            $sig.anchor = 'startup-crashes'
        }
        '0xe0434352' {
            $sig.hint   = "Managed .NET exception - see the .NET exception type captured above (event 1026). Resolve that type (e.g. TypeLoad / FileNotFound usually means a missing or incompatible package reference)."
            $sig.anchor = 'startup-crashes'
        }
        '0xc000027b' {
            $sig.hint   = "Native stowed exception - frequently a legacy projection/activation incompatibility. If a UWP API/contract used at startup is unsupported on this OS, defer it per MIGRATION-DEFERRED.md."
            $sig.anchor = 'startup-crashes'
        }
        default {
            $sig.hint   = "Startup crash - read the captured exception (event 1026) to find the throwing frame."
            $sig.anchor = 'startup-crashes'
        }
    }
    return $sig
}

# ---- Classify ----------------------------------------------------------------
if ($thePid) {
    Start-Sleep -Seconds $SettleSeconds
    $alive = $null -ne (Get-Process -Id $thePid -ErrorAction SilentlyContinue)
    if ($alive) {
        # Best-effort cleanup so we don't leave the dev-registered app running.
        try { Stop-Process -Id $thePid -Force -ErrorAction SilentlyContinue } catch {}
        Write-LaunchOut (New-LaunchResult $true 'running' "App stayed alive ${SettleSeconds}s after launch (pid $thePid)." @{ layout = $Layout; pid = $thePid; aumid = $aumid })
    } else {
        $crash = Get-CrashSignature -Names $exeNames
        Write-LaunchOut (New-LaunchResult $false 'crashed' "App launched (pid $thePid) but exited within ${SettleSeconds}s - startup crash." @{ layout = $Layout; aumid = $aumid; crash = [pscustomobject]$crash })
    }
} else {
    # No PID. Distinguish a startup crash from a deploy/env failure by whether the
    # app actually got REGISTERED/ACTIVATED (winapp emits an AUMID once it does).
    if ($aumid) {
        # Registered + activated, then threw before it could report a PID => startup crash (DEFECT).
        $crash = Get-CrashSignature -Names $exeNames
        $detail = "App registered (AUMID present) but crashed during activation/startup"
        if ($runErr) { $detail = $detail + " - winapp reported '" + $runErr + "'" }
        $detail = $detail + "."
        Write-LaunchOut (New-LaunchResult $false 'crashed' $detail @{ layout = $Layout; aumid = $aumid; crash = [pscustomobject]$crash })
    } else {
        # Never registered => deployment/environment problem, not a code defect. Inconclusive.
        $detail = "winapp run did not register the app (no AUMID, no PID)"
        if ($runErr) { $detail = $detail + " - '" + $runErr + "'" }
        $detail = $detail + ". Usually Developer Mode off, a missing framework dependency, cert issue, or MAX_PATH - not a migration defect."
        Write-LaunchOut (New-LaunchResult $false 'unavailable' $detail @{ layout = $Layout })
    }
}
