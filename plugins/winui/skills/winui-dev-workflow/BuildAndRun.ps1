<#
.SYNOPSIS
Builds and optionally runs a WinUI 3 / .NET project.

.DESCRIPTION
One command to build and run:  .\BuildAndRun.ps1 MyApp.csproj

- Checks Developer Mode is enabled (required for packaged WinUI apps)
- Auto-detects platform (x64/ARM64), defaults to Debug, auto-restores
- Builds with dotnet build by default; pass -UseMSBuild to build with Visual Studio's MSBuild instead
- After successful build, finds the output folder and runs with winapp run
- Pass -SkipRun to build without launching
- Pass -Symbols to add --symbols (optional Symbol Server fallback for non-WinUI native frames)

.EXAMPLE
.\BuildAndRun.ps1 MyApp.csproj                    # Build + run
.\BuildAndRun.ps1 MyApp.csproj -SkipRun           # Build only
.\BuildAndRun.ps1 MyApp.csproj -UseMSBuild        # Build with Visual Studio MSBuild instead of dotnet build
.\BuildAndRun.ps1 MyApp.csproj -Symbols           # Build + run with --debug-output --symbols (optional Symbol Server fallback)
.\BuildAndRun.ps1 MyApp.csproj /p:Configuration=Release  # Override config
#>

param(
    [Parameter(Position = 0)]
    [string]$Project,
    [switch]$SkipRun,
    [switch]$Detach,
    [switch]$UseMSBuild,
    [switch]$Symbols,
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

# Accept --detach (CLI style) as an alias for -Detach (PS style)
if ($ExtraArgs -contains '--detach') {
    $Detach = $true
    $ExtraArgs = $ExtraArgs | Where-Object { $_ -ne '--detach' }
}

# Accept --use-msbuild (CLI style) as an alias for -UseMSBuild (PS style)
if ($ExtraArgs -contains '--use-msbuild') {
    $UseMSBuild = $true
    $ExtraArgs = $ExtraArgs | Where-Object { $_ -ne '--use-msbuild' }
}

# Accept --symbols (CLI style) as an alias for -Symbols (PS style)
if ($ExtraArgs -contains '--symbols') {
    $Symbols = $true
    $ExtraArgs = $ExtraArgs | Where-Object { $_ -ne '--symbols' }
}

# Extra args are MSBuild-style flags like /p:Platform=x64
$extraArgs = $ExtraArgs

# -- 0. Check Developer Mode --
$devMode = $false
try {
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
    if (Test-Path $regPath) {
        $val = Get-ItemProperty $regPath -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
        if ($val.AllowDevelopmentWithoutDevLicense -eq 1) { $devMode = $true }
    }
} catch {}

if (-not $devMode) {
    Write-Host "ERROR: Developer Mode is not enabled." -ForegroundColor Red
    Write-Host "WinUI 3 packaged apps require Developer Mode to deploy and run." -ForegroundColor Red
    Write-Host "Enable it: Settings > System > For developers > Developer Mode" -ForegroundColor Yellow
    exit 1
}

# -- 1. Find the .csproj if not specified --
if (-not $Project) {
    $csprojFiles = Get-ChildItem -Path . -Filter "*.csproj" -Depth 0
    if ($csprojFiles.Count -eq 1) {
        $Project = $csprojFiles[0].Name
    } elseif ($csprojFiles.Count -gt 1) {
        Write-Error "Multiple .csproj files found. Specify which one: .\BuildAndRun.ps1 <name>.csproj"
        exit 1
    } else {
        Write-Error "No .csproj file found in current directory."
        exit 1
    }
}

# -- 2. Auto-detect platform --
$detectedPlatform = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "x64" }
$detectedConfig = "Debug"

$hasPlatform = $extraArgs | Where-Object { $_ -match "^[/|-]p:Platform=" }
$hasConfig = $extraArgs | Where-Object { $_ -match "^[/|-]p:Configuration=" }
$hasRestore = $extraArgs | Where-Object { $_ -match "^[/|-]restore$|^[/|-]t:restore$|^--restore$" }

# Extract actual values if overridden
if ($hasPlatform -and $hasPlatform -match "Platform=(\w+)") { $detectedPlatform = $Matches[1] }
if ($hasConfig -and $hasConfig -match "Configuration=(\w+)") { $detectedConfig = $Matches[1] }

$autoArgs = @()
if (-not $hasPlatform) { $autoArgs += "/p:Platform=$detectedPlatform" }
if (-not $hasConfig)   { $autoArgs += "/p:Configuration=$detectedConfig" }
if (-not $hasRestore)  { $autoArgs += "/restore" }

# -- 3. Find build tool --
# dotnet build is the default. Current Windows App SDK releases (>= 2.1.3 on the
# 2.x line, >= 1.8 on the 1.x line) surface XAML compiler errors under dotnet
# build, so MSBuild is only used when explicitly requested via -UseMSBuild.
$msbuild = $null

if ($UseMSBuild) {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath 2>$null
        if ($vsPath) {
            $candidate = Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"
            if (Test-Path $candidate) { $msbuild = $candidate }
        }
    }
    if (-not $msbuild) {
        Write-Host "--> -UseMSBuild requested but Visual Studio MSBuild was not found; using dotnet build." -ForegroundColor Yellow
    }
}

# -- 4. Build --
$defaultArgs = @("/nologo")
$hasVerbosity = $extraArgs | Where-Object { $_ -match "^[/|-]v(erbosity)?:" }
if (-not $hasVerbosity) { $defaultArgs += "/v:m" }

# -- 4a. Inject Microsoft.WindowsAppSDK.Analyzers if available --
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Look for pre-built analyzer DLL in the skill folder first, then fall back to source tree
$analyzerDll = Join-Path $scriptDir "analyzer\Microsoft.WindowsAppSDK.Analyzers.dll"
$analyzerTargets = Join-Path $scriptDir "analyzer\Microsoft.WindowsAppSDK.Analyzers.targets"
if (-not (Test-Path $analyzerDll)) {
    $analyzerDll = Join-Path $scriptDir "..\..\tools\winui-analyzer\Microsoft.WindowsAppSDK.Analyzers\bin\Release\netstandard2.0\Microsoft.WindowsAppSDK.Analyzers.dll"
    $analyzerTargets = Join-Path $scriptDir "..\..\tools\winui-analyzer\Microsoft.WindowsAppSDK.Analyzers\Microsoft.WindowsAppSDK.Analyzers.targets"
}

$analyzerArgs = @()
$tempBuildProps = $null
if (Test-Path $analyzerDll) {
    $analyzerDll = (Resolve-Path $analyzerDll).Path
    $analyzerTargets = (Resolve-Path $analyzerTargets).Path

    # Inject via temporary Directory.Build.props (works with both MSBuild and dotnet build)
    $projectDir = Split-Path (Resolve-Path $Project) -Parent
    if (-not $projectDir) { $projectDir = "." }
    $tempBuildProps = Join-Path $projectDir "Directory.Build.props"
    $existingProps = $null

    if (Test-Path $tempBuildProps) {
        $existingProps = Get-Content $tempBuildProps -Raw
    }

    # Only create if one doesn't already exist (don't overwrite user's file)
    if (-not $existingProps) {
        @"
<Project>
  <ItemGroup>
    <Analyzer Include="$analyzerDll" />
  </ItemGroup>
  <Import Project="$analyzerTargets" />
</Project>
"@ | Set-Content $tempBuildProps
        Write-Host "--> Microsoft.WindowsAppSDK.Analyzers: enabled" -ForegroundColor DarkGray
    } else {
        $tempBuildProps = $null  # Don't clean up a pre-existing file
        Write-Host "--> Microsoft.WindowsAppSDK.Analyzers: skipped (existing Directory.Build.props)" -ForegroundColor DarkGray
    }
}

Write-Host ""
try {
    if ($msbuild) {
        Write-Host "--> Building with MSBuild (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Cyan
        Write-Host "--> MSBuild: $msbuild" -ForegroundColor DarkGray
        $allArgs = $defaultArgs + $autoArgs + @($Project) + $extraArgs
        & $msbuild $allArgs
        $buildExit = $LASTEXITCODE
    } else {
        Write-Host "--> Building with dotnet build (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Cyan
        $dotnetArgs = @($Project)
        foreach ($a in ($autoArgs + $extraArgs)) {
            if ($a -match "^[/|-]restore$|^[/|-]t:restore$") {
                # dotnet build restores by default
            } elseif ($a -match "^[/|-]p:(.+)$") {
                $dotnetArgs += "-p:$($Matches[1])"
            } elseif ($a -notmatch "\.(csproj|sln)$") {
                $dotnetArgs += $a
            }
        }
        & dotnet build @dotnetArgs
        $buildExit = $LASTEXITCODE
    }
}
finally {
    # Always clean up the temp Directory.Build.props we created — even on
    # Ctrl-C, throws, or unexpected exits. Otherwise the user's project
    # gets a stray file pointing at our analyzer that subsequent vanilla
    # `dotnet build` invocations will fail to resolve.
    if ($tempBuildProps -and (Test-Path $tempBuildProps)) {
        Remove-Item $tempBuildProps -Force -ErrorAction SilentlyContinue
    }
}

if ($buildExit -ne 0) {
    Write-Host ""
    Write-Host "BUILD FAILED (exit code $buildExit)" -ForegroundColor Red
    exit $buildExit
}

Write-Host ""
Write-Host "BUILD SUCCEEDED" -ForegroundColor Green

# -- 5. Run with winapp --
if ($SkipRun) {
    Write-Host "--> Skipping run (-SkipRun)" -ForegroundColor DarkGray
    exit 0
}

# Find the build output directory
$rid = $detectedPlatform.ToLower()
$projectDir = Split-Path (Resolve-Path $Project) -Parent
if (-not $projectDir) { $projectDir = "." }

# Search for the output folder pattern: bin\<Platform>\<Config>\<tfm>\win-<rid>\
$binDir = Join-Path $projectDir "bin\$detectedPlatform\$detectedConfig"
if (-not (Test-Path $binDir)) {
    Write-Host "WARNING: Build output not found at $binDir -- skipping run" -ForegroundColor Yellow
    exit 0
}

# Find the TFM folder (e.g., net10.0-windows10.0.26100.0)
$tfmDirs = Get-ChildItem $binDir -Directory | Where-Object { $_.Name -match "^net\d" }
if (-not $tfmDirs) {
    Write-Host "WARNING: No TFM folder found in $binDir -- skipping run" -ForegroundColor Yellow
    exit 0
}

$tfmDir = $tfmDirs | Sort-Object Name -Descending | Select-Object -First 1
$outputDir = Join-Path $tfmDir.FullName "win-$rid"
if (-not (Test-Path $outputDir)) {
    # Try without RID subfolder
    $outputDir = $tfmDir.FullName
}

# Check winapp is available
$winapp = Get-Command winapp -ErrorAction SilentlyContinue
if (-not $winapp) {
    Write-Host "WARNING: winapp CLI not found in PATH -- skipping run" -ForegroundColor Yellow
    Write-Host "Build output at: $outputDir"
    exit 0
}

Write-Host ""
if ($Detach) {
    Write-Host "--> Launching app in background..." -ForegroundColor Cyan
    & winapp run $outputDir --detach --json
} else {
    $runArgs = @($outputDir, '--debug-output')
    if ($Symbols) { $runArgs += '--symbols' }
    Write-Host "--> Launching app: winapp run $($runArgs -join ' ')" -ForegroundColor Cyan
    Write-Host "    The script will stay running while the app is open." -ForegroundColor DarkGray
    Write-Host "    Debug output and exceptions will appear below." -ForegroundColor DarkGray
    Write-Host ""
    & winapp run @runArgs
}