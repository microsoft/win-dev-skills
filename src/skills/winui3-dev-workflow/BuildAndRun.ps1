<#
.SYNOPSIS
Builds and optionally runs a WinUI 3 / .NET project.

.DESCRIPTION
One command to build and run:  .\BuildAndRun.ps1 MyApp.csproj

- Checks Developer Mode is enabled (required for packaged WinUI apps)
- Auto-detects platform (x64/ARM64), defaults to Debug, auto-restores
- Finds MSBuild via vswhere, falls back to dotnet build
- After successful build, finds the output folder and runs with winapp run
- Pass -SkipRun to build without launching

.EXAMPLE
.\BuildAndRun.ps1 MyApp.csproj                    # Build + run
.\BuildAndRun.ps1 MyApp.csproj -SkipRun           # Build only
.\BuildAndRun.ps1 MyApp.csproj /p:Configuration=Release  # Override config
#>

param(
    [Parameter(Position = 0)]
    [string]$Project,
    [switch]$SkipRun,
    [switch]$Detach,
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

# Accept --detach (CLI style) as an alias for -Detach (PS style)
if ($ExtraArgs -contains '--detach') {
    $Detach = $true
    $ExtraArgs = $ExtraArgs | Where-Object { $_ -ne '--detach' }
}

# Extra args are MSBuild-style flags like /p:Platform=x64
$extraArgs = $ExtraArgs

# -- 0. Check Developer Mode --
$devMode = $false
try {
    # Method 1: Registry (standard consumer path)
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
    if (Test-Path $regPath) {
        $val = Get-ItemProperty $regPath -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
        if ($val.AllowDevelopmentWithoutDevLicense -eq 1) { $devMode = $true }
    }
    # Method 2: Get-WindowsDeveloperLicense (works for MDM/policy-managed devices)
    if (-not $devMode) {
        $lic = Get-WindowsDeveloperLicense -ErrorAction SilentlyContinue
        if ($lic -and $lic.IsValid) { $devMode = $true }
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
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuild = $null

if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath 2>$null
    if ($vsPath) {
        $candidate = Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"
        if (Test-Path $candidate) { $msbuild = $candidate }
    }
}

# -- 4. Build --
$defaultArgs = @("/nologo")
$hasVerbosity = $extraArgs | Where-Object { $_ -match "^[/|-]v(erbosity)?:" }
if (-not $hasVerbosity) { $defaultArgs += "/v:m" }

# -- 4a. Inject WinUI3 Analyzer if available --
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Look for pre-built analyzer DLL in the skill folder first, then fall back to source tree
$analyzerDll = Join-Path $scriptDir "analyzer\WinUI3.Analyzer.dll"
$analyzerTargets = Join-Path $scriptDir "analyzer\WinUI3.Analyzer.targets"
if (-not (Test-Path $analyzerDll)) {
    $analyzerDll = Join-Path $scriptDir "..\..\tools\winui3-analyzer\WinUI3.Analyzer\bin\Release\netstandard2.0\WinUI3.Analyzer.dll"
    $analyzerTargets = Join-Path $scriptDir "..\..\tools\winui3-analyzer\WinUI3.Analyzer\WinUI3.Analyzer.targets"
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
        Write-Host "--> WinUI3 Analyzer: enabled" -ForegroundColor DarkGray
    } else {
        $tempBuildProps = $null  # Don't clean up a pre-existing file
        Write-Host "--> WinUI3 Analyzer: skipped (existing Directory.Build.props)" -ForegroundColor DarkGray
    }
}

$buildLog = Join-Path $env:TEMP "winui3-build-errors-$PID.log"

Write-Host ""
if ($msbuild) {
    Write-Host "--> Building with MSBuild (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Cyan
    Write-Host "--> MSBuild: $msbuild" -ForegroundColor DarkGray
    $allArgs = $defaultArgs + $autoArgs + @($Project) + $extraArgs
    & $msbuild $allArgs 2>&1 | Tee-Object -FilePath $buildLog
    $buildExit = $LASTEXITCODE
} else {
    Write-Host "--> Building with dotnet build (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Yellow
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
    & dotnet build @dotnetArgs 2>&1 | Tee-Object -FilePath $buildLog
    $buildExit = $LASTEXITCODE
}

if ($buildExit -ne 0) {
    # Clean up temporary analyzer props
    if ($tempBuildProps -and (Test-Path $tempBuildProps)) { Remove-Item $tempBuildProps -Force }

    # -- Enhanced error diagnostics with winmd --
    # Search for winmd.exe in multiple possible locations
    $winmdExe = $null
    $winmdCandidates = @(
        (Join-Path $scriptDir "..\winmd-api-search\winmd.exe"),
        (Join-Path $scriptDir "..\..\tools\winmd-api-search\winmd.exe"),
        (Join-Path $projectDir ".github\skills\winmd-api-search\winmd.exe")
    )
    # Also check PATH
    $winmdInPath = Get-Command winmd.exe -ErrorAction SilentlyContinue
    if ($winmdInPath) { $winmdCandidates += $winmdInPath.Source }

    foreach ($candidate in $winmdCandidates) {
        if (Test-Path $candidate) { $winmdExe = (Resolve-Path $candidate).Path; break }
    }

    if ($winmdExe) {
        try {
        $errorLines = Get-Content $buildLog -ErrorAction SilentlyContinue

        $enhanced = $false
        $seen = @{}
        foreach ($line in $errorLines) {
            $key = $null
            # WMC0011: Unknown member 'X' on element 'Y'
            if ($line -match "WMC0011.*Unknown member '(\w+)' on element '(\w+)'") {
                $prop = $Matches[1]; $type = $Matches[2]; $key = "WMC0011:" + $type + "." + $prop
                if (-not $seen[$key]) {
                    $result = & $winmdExe check-property $type $prop 2>&1
                    $hasAlt = $result | Where-Object { $_ -match "Types that have|Similar.*properties" }
                    if ($hasAlt) {
                        Write-Host ""
                        $result | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                        $enhanced = $true
                    }
                }
            }
            # WMC0055: Cannot assign text value to property 'X' of type 'Y'
            elseif ($line -match "WMC0055.*property '(\w+)' of type '(\w+)'") {
                $prop = $Matches[1]; $key = "WMC0055:" + $prop
                if (-not $seen[$key]) {
                    Write-Host ""
                    Write-Host ("[winmd] Property '" + $prop + "' type mismatch:") -ForegroundColor Magenta
                    & $winmdExe search $prop 2>&1 | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                    $enhanced = $true
                }
            }
            # CS0117: 'Type' does not contain a definition for 'Member'
            elseif ($line -match "CS0117.*'(\w+)' does not contain.*'(\w+)'") {
                $type = $Matches[1]; $member = $Matches[2]; $key = "CS0117:" + $type + "." + $member
                if (-not $seen[$key]) {
                    $result = & $winmdExe check-property $type $member 2>&1
                    $hasAlt = $result | Where-Object { $_ -match "Types that have|Similar.*properties" }
                    if ($hasAlt) {
                        Write-Host ""
                        $result | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                        $enhanced = $true
                    }
                }
            }
            # CS0246: Type or namespace 'X' could not be found
            elseif ($line -match "CS0246.*'(\w+)' could not be found") {
                $typeName = $Matches[1]; $key = "CS0246:" + $typeName
                $skipWinmd = @("System", "Task", "List", "Dictionary", "IEnumerable", "EventArgs", "Exception",
                    "StringBuilder", "String", "Int32", "Boolean", "Object", "Void", "Action", "Func",
                    "IDisposable", "CancellationToken", "TimeSpan", "DateTime", "Guid", "Type")
                if ($typeName -notin $skipWinmd -and -not $seen[$key]) {
                    $result = & $winmdExe search $typeName 2>&1
                    $hasResult = $result | Where-Object { $_ -match "^\s+\[" }
                    if ($hasResult) {
                        Write-Host ""
                        $result | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                        $enhanced = $true
                    }
                }
            }
            # CS0103: Name does not exist in current context
            elseif ($line -match "CS0103.*'(\w+)' does not exist") {
                $typeName = $Matches[1]; $key = "CS0103:" + $typeName
                $skipCS0103 = @("System", "Task", "var", "args", "value", "sender", "e", "this", "base")
                if ($typeName -notin $skipCS0103 -and -not $seen[$key]) {
                    $result = & $winmdExe search $typeName 2>&1
                    $hasResult = $result | Where-Object { $_ -match "^\s+\[" }
                    if ($hasResult) {
                        Write-Host ""
                        $result | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                        $enhanced = $true
                    }
                }
            }
            # CS0234: Type or namespace 'X' does not exist in namespace 'Y'
            elseif ($line -match "CS0234.*'(\w+)' does not exist in.*'([\w.]+)'") {
                $typeName = $Matches[1]; $ns = $Matches[2]; $key = "CS0234:" + $ns + "." + $typeName
                if (-not $seen[$key]) {
                    $result = & $winmdExe search $typeName 2>&1
                    $hasResult = $result | Where-Object { $_ -match "^\s+\[" }
                    if ($hasResult) {
                        Write-Host ""
                        $result | Select-Object -First 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                        $enhanced = $true
                    }
                }
            }
            # WMC1121: Invalid binding assignment (type mismatch in x:Bind)
            elseif ($line -match "WMC1121.*Cannot directly bind type '([^']+)' to '([^']+)'") {
                $sourceType = $Matches[1]; $targetType = $Matches[2]; $key = "WMC1121:" + $sourceType + "->" + $targetType
                if (-not $seen[$key]) {
                    Write-Host ""
                    Write-Host ("[winmd] x:Bind type mismatch: '" + $sourceType + "' cannot bind to '" + $targetType + "'") -ForegroundColor Magenta
                    Write-Host ("  The target property expects '" + $targetType + "'. Change your ViewModel property type.") -ForegroundColor Magenta
                    $shortTarget = $targetType -replace '.*\.', ''
                    & $winmdExe search $shortTarget 2>&1 | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Magenta }
                    $enhanced = $true
                }
            }
            if ($key) { $seen[$key] = $true }
        }

        if ($enhanced) {
            Write-Host ""
            Write-Host "[winmd] Use the suggestions above to fix the build errors." -ForegroundColor Magenta
        }
        } catch {
            Write-Host "[winmd] Error enhancement failed: $_" -ForegroundColor DarkGray
        }

        Remove-Item $buildLog -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "BUILD FAILED (exit code $buildExit)" -ForegroundColor Red
    exit $buildExit
}

# Clean up temporary analyzer props
if ($tempBuildProps -and (Test-Path $tempBuildProps)) { Remove-Item $tempBuildProps -Force }
Remove-Item $buildLog -Force -ErrorAction SilentlyContinue

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
    Write-Host "--> Launching app: winapp run $outputDir --debug-output" -ForegroundColor Cyan
    Write-Host "    The script will stay running while the app is open." -ForegroundColor DarkGray
    Write-Host "    Debug output and exceptions will appear below." -ForegroundColor DarkGray
    Write-Host ""
    & winapp run $outputDir --debug-output
}