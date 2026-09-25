#Requires -Version 5.1
<#
.SYNOPSIS
Runs private-collector integration checks against an already-running WinUI test app.
.DESCRIPTION
Use an animated test app (for example, a Gallery home page) so FileCap reaches 1 MB.
Does not launch, close, or modify the app. Run unelevated; do not change execution policy.
OutputDirectory must not exist. ETLs are retained there for inspection.
.EXAMPLE
.\scripts\tests\Test-WinUITrace.ps1 -ProcessId 1234 -OutputDirectory .\trace-tests
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$ProcessId,
    [Parameter(Mandatory)]
    [string]$OutputDirectory,
    [ValidateSet('All', 'FileCap', 'Lifecycle')]
    [string]$Scenario = 'All'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$collector = Join-Path $PSScriptRoot '..\..\plugins\winui\agent-plugin\skills\winui-etw-diagnostics\Collect-WinUITrace.ps1'
$output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Use a new OutputDirectory.' }
$null = New-Item -ItemType Directory -Path $output

function Assert-True($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

if ($Scenario -in @('All', 'FileCap')) {
    $directory = Join-Path $output 'cap'
    & $collector -ProcessId $ProcessId -OutputDirectory $directory -DurationSeconds 20 `
        -MaximumFileSizeMB 1 -Diagnostics -ControlsDebug
    $capture = Get-Content (Join-Path $directory 'capture.json') -Raw | ConvertFrom-Json
    Assert-True $capture.FileCapReached 'Fixture did not reach the cap; exercise an animated app and retry.'
    Assert-True $capture.SessionAlreadyStopped 'Expected ETW to stop the full sequential log.'
    Assert-True (-not $capture.StopSucceeded) 'Do not report a successful STOP when ETW already stopped.'
    Assert-True ($null -eq $capture.EventsLost) 'Unavailable loss statistics must not appear as zero.'
    Write-Host 'PASS: full-file termination is reported without a cleanup exception.'
}

if ($Scenario -in @('All', 'Lifecycle')) {
    $directory = Join-Path $output 'cancel'
    $pipeline = [powershell]::Create()
    try {
        $null = $pipeline.AddCommand($collector).AddParameter('ProcessId', $ProcessId).
            AddParameter('OutputDirectory', $directory).AddParameter('DurationSeconds', 60)
        $pending = $pipeline.BeginInvoke()
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 100
            $ready = @($pipeline.Streams.Information | Where-Object {
                $_.MessageData.ToString() -like 'Recording*'
            }).Count -gt 0
        } while (-not $ready -and -not $pending.IsCompleted -and [DateTime]::UtcNow -lt $deadline)
        Assert-True ($ready -and -not $pending.IsCompleted) 'Collector did not become ready.'

        $rejected = $false
        try {
            & $collector -ProcessId $ProcessId -OutputDirectory (Join-Path $output 'overlap') -DurationSeconds 1
        }
        catch {
            $cause = $_.Exception
            while ($cause.InnerException) { $cause = $cause.InnerException }
            if ($cause -is [ComponentModel.Win32Exception] -and $cause.NativeErrorCode -eq 183) {
                $rejected = $true
            }
            else { throw }
        }
        Assert-True $rejected 'Overlapping capture was not rejected with ERROR_ALREADY_EXISTS.'
        $pipeline.Stop()
        $capture = Get-Content (Join-Path $directory 'capture.json') -Raw | ConvertFrom-Json
        Assert-True $capture.StopSucceeded 'Cancellation did not stop the original session.'
        Assert-True (-not $capture.CollectionLoopCompleted) 'Cancellation was reported as completed.'
        Write-Host 'PASS: overlap preserves the owner; graceful pipeline cancellation stops it.'
    }
    finally {
        $pipeline.Stop()
        $pipeline.Dispose()
    }
}

$directory = Join-Path $output 'repeat'
& $collector -ProcessId $ProcessId -OutputDirectory $directory -DurationSeconds 1
$capture = Get-Content (Join-Path $directory 'capture.json') -Raw | ConvertFrom-Json
Assert-True $capture.StopSucceeded 'Recapture failed after cleanup.'
$trace = Join-Path $directory $capture.TraceFiles[0]
$hash = (Get-FileHash -LiteralPath $trace).Hash
$rejected = $false
try { & $collector -ProcessId $ProcessId -OutputDirectory $directory -DurationSeconds 1 }
catch {
    if ($_.Exception.Message -ne 'OutputDirectory must be a new or empty directory; existing traces are never overwritten.') { throw }
    $rejected = $true
}
Assert-True ($rejected -and $hash -eq (Get-FileHash -LiteralPath $trace).Hash) 'Existing trace was not protected.'
Write-Host 'PASS: recapture succeeds and existing output is preserved.'
