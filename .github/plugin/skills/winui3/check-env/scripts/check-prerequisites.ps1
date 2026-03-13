#Requires -Version 5.1
<#
.SYNOPSIS
Checks prerequisites for building WinUI 3 C# apps with the Windows App SDK.

.DESCRIPTION
Validates the following prerequisites:
- Windows 10 version 1903 (19H1) or later (build >= 18362)
- .NET SDK 10.0 or later
- winapp CLI available on PATH
- raka CLI available on PATH

.PARAMETER Quiet
Only prints failures/warnings and the final result.

.PARAMETER PassThru
Returns a PowerShell object with detailed results.

.EXAMPLE
pwsh -ExecutionPolicy Bypass -File .\scripts\check-prerequisites.ps1

.EXAMPLE
pwsh -ExecutionPolicy Bypass -File .\scripts\check-prerequisites.ps1 -PassThru | Format-List
#>

[CmdletBinding()]
param(
    [switch]$Quiet,
    [switch]$PassThru
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Status {
    param(
        [Parameter(Mandatory)] [ValidateSet('OK','FAIL','WARN','INFO')] [string]$Level,
        [Parameter(Mandatory)] [string]$Message
    )

    if ($Quiet -and $Level -eq 'INFO') {
        return
    }

    $prefix = switch ($Level) {
        'OK'   { '[OK]  ' }
        'FAIL' { '[FAIL]' }
        'WARN' { '[WARN]' }
        'INFO' { '[INFO]' }
    }

    if ($Level -eq 'FAIL') {
        Write-Host "$prefix $Message" -ForegroundColor Red
    } elseif ($Level -eq 'WARN') {
        Write-Host "$prefix $Message" -ForegroundColor Yellow
    } elseif ($Level -eq 'OK') {
        Write-Host "$prefix $Message" -ForegroundColor Green
    } else {
        Write-Host "$prefix $Message"
    }
}

function Get-WindowsBuildNumber {
    $cv = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop
    $build = [int]$cv.CurrentBuildNumber
    $ubr = if ($null -ne $cv.UBR) { [int]$cv.UBR } else { 0 }
    $displayVersion = $cv.DisplayVersion
    $releaseId = $cv.ReleaseId

    [pscustomobject]@{
        BuildNumber    = $build
        UBR            = $ubr
        BuildString    = "$build.$ubr"
        DisplayVersion = $displayVersion
        ReleaseId      = $releaseId
        ProductName    = $cv.ProductName
    }
}

function Get-DotNetSdks {
    $dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
    if (-not $dotnet) {
        return @()
    }

    $lines = & dotnet --list-sdks 2>$null
    if (-not $lines) { return @() }

    foreach ($line in $lines) {
        if ($line -match '^\s*(?<ver>\d+\.\d+\.\d+)(?:\s|$)') {
            try {
                [pscustomobject]@{ Version = [version]$Matches['ver']; Raw = $line }
            } catch {
                # ignore unparsable lines
            }
        }
    }
}

# --- Thresholds ---
$minBuild = 18362    # Windows 10 version 1903 (19H1)
$minDotNet = [version]'10.0.0'

$result = [ordered]@{
    Windows = $null
    DotNet  = $null
    Winapp  = $null
    Raka    = $null
    Overall = [ordered]@{
        Passed   = $false
        ExitCode = 1
    }
}

# --- Windows check ---
$win = Get-WindowsBuildNumber
$result.Windows = $win

if ($win.BuildNumber -ge $minBuild) {
    $verText = if ($win.DisplayVersion) { $win.DisplayVersion } elseif ($win.ReleaseId) { $win.ReleaseId } else { 'unknown' }
    Write-Status OK "Windows: $($win.ProductName) build $($win.BuildString) (version $verText)"
    $windowsOk = $true
} else {
    Write-Status FAIL "Windows: build $($win.BuildString) detected; requires Windows 10 1903+ (build >= $minBuild)."
    $windowsOk = $false
}

# --- .NET SDK check ---
$sdks = @(Get-DotNetSdks)
$dotnetOk = $false

if ($sdks.Count -eq 0) {
    Write-Status FAIL '.NET SDK: dotnet not found or no SDKs detected; install .NET SDK 10.0+ from https://dot.net/download.'
} else {
    $max = ($sdks | Sort-Object Version -Descending | Select-Object -First 1).Version
    if ($max -ge $minDotNet) {
        Write-Status OK ".NET SDK: $max (latest detected)"
        $dotnetOk = $true
    } else {
        Write-Status FAIL ".NET SDK: latest detected is $max; requires $minDotNet or later."
    }
}

$result.DotNet = [pscustomobject]@{
    Sdks         = $sdks
    Latest       = if ($sdks.Count -gt 0) { ($sdks | Sort-Object Version -Descending | Select-Object -First 1).Version } else { $null }
    MeetsVersion = $dotnetOk
}

# --- winapp CLI check ---
$winappCmd = Get-Command winapp -ErrorAction SilentlyContinue
$winappOk = $false

if ($winappCmd) {
    Write-Status OK "winapp CLI: found at $($winappCmd.Source)"
    $winappOk = $true
} else {
    Write-Status WARN 'winapp CLI: not found on PATH. Install the winapp MSIX package for project setup and packaging.'
}

$result.Winapp = [pscustomobject]@{
    Found = $winappOk
    Path  = if ($winappCmd) { $winappCmd.Source } else { $null }
}

# --- raka CLI check ---
$rakaCmd = Get-Command raka -ErrorAction SilentlyContinue
$rakaOk = $false

if ($rakaCmd) {
    Write-Status OK "raka CLI: found at $($rakaCmd.Source)"
    $rakaOk = $true
} else {
    Write-Status WARN 'raka CLI: not found on PATH. Install the raka MSIX package for live UI automation.'
}

$result.Raka = [pscustomobject]@{
    Found = $rakaOk
    Path  = if ($rakaCmd) { $rakaCmd.Source } else { $null }
}

# --- Overall ---
# Hard requirements: Windows + .NET SDK. Tools are warnings only.
$passed = $windowsOk -and $dotnetOk
$exitCode = if ($passed) { 0 } else { 1 }

$result['Overall']['Passed'] = $passed
$result['Overall']['ExitCode'] = $exitCode

if ($passed) {
    Write-Status OK 'Prerequisites: PASS'
} else {
    Write-Status FAIL 'Prerequisites: FAIL'
}

if ($PassThru) {
    [pscustomobject]$result
}

exit [int]$exitCode
