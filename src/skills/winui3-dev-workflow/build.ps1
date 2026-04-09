<#
.SYNOPSIS
Builds a WinUI 3 / .NET project using MSBuild or dotnet build.

.DESCRIPTION
Automatically finds MSBuild.exe via vswhere. If Visual Studio / MSBuild is not installed,
falls back to `dotnet build`. Auto-detects platform, defaults to Debug configuration,
and restores packages — so you can just run:

   .\build.ps1 .\Path\To\YourApp.csproj

All defaults can be overridden by passing explicit arguments:
   .\build.ps1 .\Path\To\YourApp.csproj /p:Configuration=Release /p:Platform=x86
#>

# 1. Auto-detect platform from CPU architecture
$detectedPlatform = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }

# Check what the caller already specified
$hasPlatform = $args | Where-Object { $_ -match "^[/|-]p:Platform=" }
$hasConfig = $args | Where-Object { $_ -match "^[/|-]p:Configuration=" }
$hasRestore = $args | Where-Object { $_ -match "^[/|-]restore$|^[/|-]t:restore$|^--restore$" }

$autoArgs = @()
if (-not $hasPlatform) { $autoArgs += "/p:Platform=$detectedPlatform" }
if (-not $hasConfig)   { $autoArgs += "/p:Configuration=Debug" }
if (-not $hasRestore)  { $autoArgs += "/restore" }

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
    $allArgs = $defaultArgs + $autoArgs + $args
    & $msbuild $allArgs
} else {
    Write-Host "--> MSBuild not found, falling back to dotnet build (Platform: $detectedPlatform)" -ForegroundColor Yellow
    # Convert MSBuild-style args to dotnet build args
    $dotnetArgs = @()
    foreach ($a in ($autoArgs + $args)) {
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
    & dotnet build @dotnetArgs
}