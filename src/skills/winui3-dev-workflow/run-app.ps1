<#
.SYNOPSIS
    Launches a WinUI 3 app with automatic crash diagnostics.
    Wraps 'winapp run' with procdump monitoring — if the app crashes,
    automatically analyzes the dump and prints the crashing control/stack.

.PARAMETER OutputFolder
    Path to the build output folder (same as winapp run argument).

.PARAMETER DebugOutput
    Include --debug-output flag for first-chance exception logging.

.EXAMPLE
    .\run-app.ps1 bin\x64\Debug\net10.0-windows10.0.26100.0\win-x64\
#>
param(
    [Parameter(Mandatory)][string]$OutputFolder,
    [switch]$DebugOutput
)

$ErrorActionPreference = 'SilentlyContinue'

# Resolve exe name from output folder
$exeName = Get-ChildItem $OutputFolder -Filter "*.exe" | Where-Object { $_.Name -ne "createdump.exe" } | Select-Object -First 1 -ExpandProperty Name
if (-not $exeName) {
    Write-Host "[run-app] Could not find exe in $OutputFolder" -ForegroundColor Red
    exit 1
}

# Ensure procdump is available
$procdump = Get-Command procdump64.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $procdump) {
    $pdDir = "$env:LOCALAPPDATA\procdump"
    if (Test-Path "$pdDir\procdump64.exe") {
        $env:PATH += ";$pdDir"
        $procdump = "$pdDir\procdump64.exe"
    } else {
        Write-Host "[run-app] Installing procdump..." -ForegroundColor Yellow
        Invoke-WebRequest https://download.sysinternals.com/files/Procdump.zip -OutFile $env:TEMP\pd.zip
        Expand-Archive $env:TEMP\pd.zip $pdDir -Force
        $env:PATH += ";$pdDir"
        $procdump = "$pdDir\procdump64.exe"
    }
}

# Find cdb
$cdb = Get-AppxPackage -Name "*WinDbg*" | ForEach-Object { Join-Path $_.InstallLocation "amd64\cdb.exe" } | Where-Object { Test-Path $_ } | Select-Object -First 1

# Clean up old dump
$dumpFile = Join-Path (Get-Location) "crash.dmp"
Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue

# Start procdump in background monitoring for the exe (suppress verbose output)
$pdProc = Start-Process $procdump -ArgumentList "-accepteula","-e","-ma","-w",$exeName,$dumpFile -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\procdump-out.txt" -RedirectStandardError "$env:TEMP\procdump-err.txt"
Start-Sleep 2

# Launch app with winapp run (no --debug-output when procdump is active — only one debugger can attach)
$winappArgs = "run `"$OutputFolder`""
Write-Host "[run-app] winapp $winappArgs" -ForegroundColor Cyan
Invoke-Expression "winapp $winappArgs"

# Wait for procdump to finish (it exits when the monitored process exits)
if (-not $pdProc.HasExited) {
    $pdProc | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue
}

# Check for crash dump
if (Test-Path $dumpFile) {
    $sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 1)
    Write-Host ""
    Write-Host "========== CRASH DETECTED ==========" -ForegroundColor Red
    Write-Host "[run-app] Crash dump: $dumpFile ($sizeMB MB)" -ForegroundColor Red

    if ($cdb) {
        Write-Host "[run-app] Analyzing crash..." -ForegroundColor Yellow
        $env:_NT_SYMBOL_PATH = "srv*C:\Symbols*https://msdl.microsoft.com/download/symbols"
        $analysisLog = Join-Path (Get-Location) "crash-analysis.log"
        & $cdb -z $dumpFile -c "!sym quiet; !analyze -v; q" -logo $analysisLog 2>&1 | Out-Null

        # Extract key findings
        $findings = Get-Content $analysisLog | Select-String "SYMBOL_NAME|FAILURE_BUCKET" | ForEach-Object { $_.Line.Trim() }
        $stackLines = @()
        $inStack = $false
        foreach ($line in (Get-Content $analysisLog)) {
            if ($line -match '^STACK_TEXT') { $inStack = $true; continue }
            if ($inStack -and ($line -match '^SYMBOL_NAME|^MODULE_NAME|^IMAGE_NAME|^FAULTING_SOURCE|^$')) { $inStack = $false }
            if ($inStack -and $line.Trim()) { $stackLines += $line.Trim() }
        }

        Write-Host ""
        Write-Host "[CRASH ANALYSIS]" -ForegroundColor Red
        foreach ($f in $findings) { Write-Host "  $f" -ForegroundColor Yellow }
        if ($stackLines.Count -gt 0) {
            Write-Host "  STACK:" -ForegroundColor Yellow
            $stackLines | Select-Object -First 10 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        }
        Write-Host "=====================================" -ForegroundColor Red

        Remove-Item $analysisLog -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[run-app] cdb not available — install WinDbg for automatic analysis:" -ForegroundColor Yellow
        Write-Host "  winget install Microsoft.WinDbg" -ForegroundColor Yellow
        Write-Host "  Then manually: cdb -z `"$dumpFile`" -c `"!sym quiet; !analyze -v; q`"" -ForegroundColor Yellow
    }

    Remove-Item $dumpFile -Force -ErrorAction SilentlyContinue
} else {
    # No crash — procdump exited cleanly
    if ($pdProc -and -not $pdProc.HasExited) {
        Stop-Process -Id $pdProc.Id -Force -ErrorAction SilentlyContinue
    }
}
