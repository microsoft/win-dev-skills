<#
.SYNOPSIS
Builds a WinUI 3 / .NET project using MSBuild or dotnet build.

.DESCRIPTION
Automatically finds MSBuild.exe via vswhere. If Visual Studio / MSBuild is not installed,
falls back to `dotnet build`. Auto-detects the current CPU architecture (x64/ARM64) and
injects /p:Platform if not already specified.

All arguments passed to this script are forwarded to the build tool.

*** IMPORTANT USAGE INSTRUCTIONS FOR AUTOMATED AGENTS ***
When passing properties via this PowerShell script, use forward slashes (not hyphens):

   .\build.ps1 .\Path\To\YourApp.csproj /p:Configuration=Debug /restore

Platform is auto-detected — you do NOT need to pass /p:Platform unless you want to override it.
#>

# 1. Auto-detect platform from CPU architecture
$detectedPlatform = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }

# Check if the caller already specified a platform
$hasPlatform = $args | Where-Object { $_ -match "^[/|-]p:Platform=" }
$platformArgs = if (-not $hasPlatform) { @("/p:Platform=$detectedPlatform") } else { @() }

# 2. Try to locate MSBuild via vswhere
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = $null

if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath 2>$null
    if ($vsPath) {
        $candidate = Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"
        if (Test-Path $candidate) { $msbuild = $candidate }
    }
}

# 3. Define default noise-reduction arguments
$defaultArgs = @("/nologo")
$hasVerbosity = $args | Where-Object { $_ -match "^[/|-]v(erbosity)?:" }
if (-not $hasVerbosity) { $defaultArgs += "/v:m" }

# 4. Build with MSBuild or fall back to dotnet build
if ($msbuild) {
    Write-Host "--> Using MSBuild: $msbuild (Platform: $detectedPlatform)" -ForegroundColor Cyan
    $allArgs = $defaultArgs + $platformArgs + $args
    & $msbuild $allArgs
} else {
    Write-Host "--> MSBuild not found, falling back to dotnet build (Platform: $detectedPlatform)" -ForegroundColor Yellow
    # Convert MSBuild-style args to dotnet build args
    $dotnetArgs = @()
    foreach ($a in $args) {
        if ($a -match "^[/|-]restore$|^[/|-]t:restore$") {
            $dotnetArgs += "--restore"
        } elseif ($a -match "^[/|-]p:(.+)$") {
            $dotnetArgs += "-p:$($Matches[1])"
        } elseif ($a -match "\.(csproj|sln)$") {
            $dotnetArgs += $a
        } else {
            $dotnetArgs += $a
        }
    }
    $dotnetArgs += "-p:Platform=$detectedPlatform"
    & dotnet build @dotnetArgs
}