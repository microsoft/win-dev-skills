#Requires -Version 5.1
<#
.SYNOPSIS
Collects native WinUI ETW events from an accessible desktop process without elevation.
.DESCRIPTION
Uses a PID-filtered private ETW file logger on Windows 10 1703 or later.
No group membership, ACL changes, privileged service, or app instrumentation is needed.
Requires FullLanguage PowerShell (Add-Type); does not change execution/security policy.
Writes bounded ETL files and capture.json to a new or empty output directory.
No real-time consumption, kernel CPU samples, scheduling stacks, or pre-attach events.
.EXAMPLE
.\Collect-WinUITrace.ps1 -ProcessId 1234 -OutputDirectory .\trace -DurationSeconds 20
.EXAMPLE
.\Collect-WinUITrace.ps1 -ProcessId 1234 -OutputDirectory .\trace-debug -ControlsDebug
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateRange(1, 2147483647)]
    [int]$ProcessId,

    [Parameter(Mandatory)]
    [string]$OutputDirectory,

    [ValidateRange(1, 300)]
    [int]$DurationSeconds = 30,

    [ValidateRange(1, 1024)]
    [int]$MaximumFileSizeMB = 128,

    [switch]$ControlsDebug,
    [switch]$Diagnostics
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
    [Environment]::OSVersion.Version -lt [Version]'10.0.15063') {
    throw 'Private capture requires Windows 10 version 1703 or later.'
}
if (-not [Environment]::Is64BitProcess) {
    throw 'Use 64-bit PowerShell for private WinUI capture.'
}
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
    throw 'This collector needs Add-Type in FullLanguage PowerShell. Do not change machine policy to run it.'
}

$target = Get-Process -Id $ProcessId -ErrorAction Stop
try {
    $targetStart = $target.StartTime.ToUniversalTime().ToString('o')
    $targetName = $target.ProcessName
    $xaml = @($target.Modules | Where-Object ModuleName -ieq 'Microsoft.UI.Xaml.dll')
    if ($xaml.Count -eq 0) {
        throw "PID $ProcessId has not loaded Microsoft.UI.Xaml.dll. Wait for WinUI initialization and retry."
    }
    $moduleInfo = @($xaml | ForEach-Object {
        [ordered]@{
            Path = $_.FileName
            FileVersion = $_.FileVersionInfo.FileVersion
            ProductVersion = $_.FileVersionInfo.ProductVersion
        }
    })

    $outputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
    if (Test-Path -LiteralPath $outputPath) {
        if (-not (Test-Path -LiteralPath $outputPath -PathType Container) -or
            @(Get-ChildItem -LiteralPath $outputPath -Force).Count -ne 0) {
            throw 'OutputDirectory must be a new or empty directory; existing traces are never overwritten.'
        }
    }
    else {
        $null = New-Item -ItemType Directory -Path $outputPath
    }

    if (-not ('WinUI.Diagnostics.PrivateEtwSession' -as [type])) {
        Add-Type -Path (Join-Path $PSScriptRoot 'assets\PrivateEtwSession.cs')
    }

    $providers = @(
        @{ Name = 'Microsoft-Windows-XAML'; Guid = '531A35AB-63CE-4BCF-AA98-F88C7A89E455'; Keywords = [uint64]::MaxValue }
        @{ Name = 'Microsoft.UI.Xaml'; Guid = '2DC72F6E-E4D1-5F58-3245-09A4243799DD'; Keywords = [uint64]::MaxValue }
        @{ Name = 'Microsoft.UI.Xaml.Controls.Perf'; Guid = 'F55F7011-988D-4674-A724-E01B39DC7AF6'; Keywords = [uint64]65535 }
    )
    if ($ControlsDebug) {
        $providers += @{ Name = 'Microsoft.UI.Xaml.Controls.Debug'; Guid = 'AFE0AE07-66A7-55BB-12FF-01116BC08C1A'; Keywords = [uint64]65535 }
    }
    if ($Diagnostics) {
        $providers += @{ Name = 'Microsoft-Windows-XAML-Diagnostics'; Guid = '59E7A714-73A4-4147-B47E-0957048C75C4'; Keywords = [uint64]::MaxValue }
    }

    $captureStart = [DateTime]::UtcNow.ToString('o')
    $session = [WinUI.Diagnostics.PrivateEtwSession]::new(
        $ProcessId, (Join-Path $outputPath 'winui.etl'), $MaximumFileSizeMB)
    $completed = $false
    $enabledProviders = @()
    try {
        foreach ($provider in $providers) {
            $session.Enable([Guid]$provider.Guid, $provider.Keywords)
            $enabledProviders += $provider
        }
        Write-Host "Recording PID $ProcessId ($targetName) for up to $DurationSeconds seconds. Reproduce now."
        $clock = [Diagnostics.Stopwatch]::StartNew()
        while ($clock.Elapsed.TotalSeconds -lt $DurationSeconds -and -not $target.HasExited) {
            Start-Sleep -Milliseconds 200
        }
        $completed = $true
    }
    finally {
        try {
            $session.Dispose()
        }
        finally {
            $etls = @(Get-ChildItem -LiteralPath $outputPath -Filter 'winui.etl*' -File)
            $capReached = @($etls | Where-Object { $_.Length -ge ([long]$MaximumFileSizeMB * 1MB) }).Count -gt 0
            $metadata = [ordered]@{
                Mode = 'Private ETW (PID filtered, file only)'
                ProcessId = $ProcessId
                ProcessName = $targetName
                ProcessStartUtc = $targetStart
                CaptureStartUtc = $captureStart
                CaptureEndUtc = [DateTime]::UtcNow.ToString('o')
                TargetExited = $target.HasExited
                CollectionLoopCompleted = $completed
                SessionName = $session.Name
                StopSucceeded = $session.StopSucceeded
                SessionAlreadyStopped = $session.SessionAlreadyStopped
                MaximumFileSizeMB = $MaximumFileSizeMB
                FileCapReached = $capReached
                XamlModules = $moduleInfo
                EnabledProviders = @($enabledProviders | ForEach-Object {
                    @{ Name = $_.Name; Guid = $_.Guid; Keywords = ('0x{0:x16}' -f $_.Keywords) }
                })
                EventsLost = $session.EventsLost
                LogBuffersLost = $session.LogBuffersLost
                TraceFiles = @($etls | ForEach-Object Name)
            }
            $metadata | ConvertTo-Json -Depth 6 |
                Set-Content -LiteralPath (Join-Path $outputPath 'capture.json') -Encoding UTF8
        }
    }
    if ($etls.Count -eq 0) {
        throw "ETW produced no trace files in $outputPath."
    }
    if ($session.EventsLost -gt 0 -or $session.LogBuffersLost -gt 0) {
        Write-Warning 'ETW reported dropped data. Shorten the reproduction or disable verbose providers.'
    }
    if ($capReached) {
        Write-Warning 'The ETL reached its file-size cap. The capture may have ended before the reproduction did.'
    }
    if ($session.SessionAlreadyStopped) {
        Write-Warning 'ETW had already stopped the session. Final loss statistics are unavailable; inspect trace coverage.'
    }
    if ($target.HasExited) {
        Write-Warning 'The target exited during capture; final per-process loss statistics may be unavailable.'
    }
    Write-Host 'Capture stopped. Decode the ETL and confirm target-provider records; a file alone does not prove coverage.'
    $etls | Select-Object FullName, Length
}
finally {
    $target.Dispose()
}
