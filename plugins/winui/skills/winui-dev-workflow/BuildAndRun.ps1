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
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

# PowerShell binds the first unlabelled token to the positional Project parameter even
# when it is an MSBuild property. Recover the common `-SkipRun "/p:..."` invocation by
# moving known build switches to ExtraArgs and allowing normal project auto-detection.
if ($Project -and $Project -match '^[/|-](?:p:|property:|t:|target:|restore$)') {
    $ExtraArgs = @($Project) + @($ExtraArgs)
    $Project = $null
}

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

function Get-EvaluatedProjectBuildData {
    param(
        [string]$ProjectPath,
        [string]$Platform,
        [string]$Configuration
    )

    try {
        $output = & dotnet msbuild $ProjectPath `
            "-p:Platform=$Platform" `
            "-p:Configuration=$Configuration" `
            "-getItem:AppxManifest,CustomAppxManifest" `
            "-getProperty:CustomAfterMicrosoftCommonTargets" `
            -nologo -verbosity:quiet 2>$null | Out-String
        if ($LASTEXITCODE -eq 0 -and $output.Trim()) {
            return $output | ConvertFrom-Json
        }
    } catch {
        # The normal build will surface evaluation failures with full diagnostics.
    }

    return $null
}

function Test-AppxManifestCapabilityOrder {
    param(
        [string]$ProjectPath,
        [object]$BuildData
    )

    $projectDirectory = Split-Path (Resolve-Path $ProjectPath) -Parent
    $manifestPaths = @()
    if ($BuildData.Items) {
        foreach ($itemName in @("AppxManifest", "CustomAppxManifest")) {
            foreach ($item in @($BuildData.Items.$itemName)) {
                if ($item.FullPath -and (Test-Path -LiteralPath $item.FullPath)) {
                    $manifestPaths += $item.FullPath
                }
            }
        }
    }
    if ($manifestPaths.Count -eq 0) {
        $defaultManifest = Join-Path $projectDirectory "Package.appxmanifest"
        if (Test-Path -LiteralPath $defaultManifest) {
            $manifestPaths = @($defaultManifest)
        }
    }

    foreach ($manifestPath in $manifestPaths) {
        try {
            [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
        } catch {
            Write-Host "ERROR: Invalid app manifest XML: $manifestPath" -ForegroundColor Red
            Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }

        $capabilities = @($manifest.SelectNodes("/*[local-name()='Package']/*[local-name()='Capabilities']/*"))
        $highestCapabilityPhase = -1
        foreach ($capability in $capabilities) {
            $capabilityPhase = switch ($capability.LocalName) {
                "DeviceCapability" { 2 }
                "CustomCapability" { 1 }
                default { 0 }
            }
            if ($capabilityPhase -lt $highestCapabilityPhase) {
                $elementName = if ($capability.Prefix) {
                    "$($capability.Prefix):$($capability.LocalName)"
                } else {
                    $capability.LocalName
                }
                Write-Host "ERROR: Invalid capability order in $(Split-Path $manifestPath -Leaf)." -ForegroundColor Red
                Write-Host "       <$elementName> appears after a later capability category." -ForegroundColor Red
                Write-Host "       Required order: Capability, CustomCapability, then DeviceCapability." -ForegroundColor Red
                Write-Host "       MSBuild can accept this ordering, but MSIX registration rejects it with 0xC00CE014." -ForegroundColor Yellow
                return $false
            }
            $highestCapabilityPhase = [math]::Max($highestCapabilityPhase, $capabilityPhase)
        }
    }

    return $true
}

function Write-BuildState {
    param(
        [string]$Path,
        [string]$Status,
        [string]$ProjectPath,
        [string]$BuildTool,
        [datetime]$StartedAt,
        [string]$OutputLog
    )

    [ordered]@{
        status = $Status
        project = $ProjectPath
        buildTool = $BuildTool
        outputLog = $OutputLog
        ownerPid = $PID
        startedAt = $StartedAt.ToString("o")
        updatedAt = [datetime]::UtcNow.ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath $Path
}

function Write-BuildResult {
    param(
        [string]$Path,
        [int]$ExitCode
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Host "WARNING: Build output log was not created: $Path" -ForegroundColor Yellow
        return
    }

    $lines = @(Get-Content -LiteralPath $Path)
    if ($ExitCode -ne 0) {
        $selected = @($lines | Where-Object {
            $_ -match '(?i)\berror\b' -or
            $_ -match '(?i)build failed' -or
            $_ -match '(?i)time elapsed' -or
            $_ -match '^\s*\d+\s+(?:Warning|Error)\(s\)'
        })
        if ($selected.Count -eq 0) {
            $selected = @($lines | Select-Object -Last 80)
        }
    } else {
        $selected = @($lines | Where-Object {
            $_ -match '(?i)build succeeded' -or
            $_ -match '(?i)time elapsed' -or
            $_ -match '^\s*\d+\s+(?:Warning|Error)\(s\)'
        })
        if ($selected.Count -eq 0) {
            $selected = @($lines | Select-Object -Last 20)
        }
    }

    $selected = @($selected | Select-Object -Unique)
    foreach ($line in $selected) {
        Write-Host $line
    }
    Write-Host "--> Full build log: $Path" -ForegroundColor DarkGray
}

function Invoke-LoggedNativeCommand {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$OutputLog
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 surfaces redirected native stderr as an
        # ErrorRecord. Keep it in the log without aborting before ExitCode.
        $ErrorActionPreference = 'Continue'
        & $FilePath @Arguments *> $OutputLog
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

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

$projectBuildData = Get-EvaluatedProjectBuildData `
    -ProjectPath $Project `
    -Platform $detectedPlatform `
    -Configuration $detectedConfig
if (-not (Test-AppxManifestCapabilityOrder -ProjectPath $Project -BuildData $projectBuildData)) {
    exit 1
}

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

$tempAnalyzerTargets = $null
$migrationBlockingDiagnostics = "WUI0001;WUI0002;WUI0003;WUI0004;WUI0005;WUI2003;WUI2004;WUI2005"
if (Test-Path $analyzerDll) {
    $analyzerDll = (Resolve-Path $analyzerDll).Path
    $analyzerTargets = (Resolve-Path $analyzerTargets).Path

    $projectDir = Split-Path (Resolve-Path $Project) -Parent
    if (-not $projectDir) { $projectDir = "." }
    $tempAnalyzerTargets = Join-Path $projectDir ".winapp-analyzers-$([guid]::NewGuid().ToString('N')).targets"
    $escapedAnalyzerDll = [Security.SecurityElement]::Escape($analyzerDll)
    $escapedAnalyzerTargets = [Security.SecurityElement]::Escape($analyzerTargets)
    $existingCustomTargets = @(
        "$($projectBuildData.Properties.CustomAfterMicrosoftCommonTargets)" -split ';' |
            Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    )
    $existingImports = $existingCustomTargets | ForEach-Object {
        $escapedPath = [Security.SecurityElement]::Escape($_)
        "  <Import Project=`"$escapedPath`" />"
    }
    @"
<Project>
$($existingImports -join [Environment]::NewLine)
  <ItemGroup>
    <Analyzer Include="$escapedAnalyzerDll" />
  </ItemGroup>
  <Import Project="$escapedAnalyzerTargets" />
</Project>
"@ | Set-Content -LiteralPath $tempAnalyzerTargets
    Write-Host "--> Microsoft.WindowsAppSDK.Analyzers: enabled" -ForegroundColor DarkGray
}

Write-Host ""
$resolvedProject = (Resolve-Path -LiteralPath $Project).Path
$lockKeySource = "$resolvedProject|$detectedPlatform|$detectedConfig".ToUpperInvariant()
$lockKeyBytes = [System.Text.Encoding]::UTF8.GetBytes($lockKeySource)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
    $lockHashBytes = $sha256.ComputeHash($lockKeyBytes)
}
finally {
    $sha256.Dispose()
}
$lockHash = ([BitConverter]::ToString($lockHashBytes)).Replace("-", "").Substring(0, 24)
$buildMutex = [System.Threading.Mutex]::new($false, "Local\WinAppBuild_$lockHash")
$lockAcquired = $false
try {
    try {
        $lockAcquired = $buildMutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
        $lockAcquired = $true
    }

    $buildStatePath = Join-Path ([System.IO.Path]::GetTempPath()) "winapp-build-$lockHash.json"
    $buildLogPath = Join-Path ([System.IO.Path]::GetTempPath()) "winapp-build-$lockHash.log"
    if (-not $lockAcquired) {
        Write-Host "BUILD ALREADY RUNNING for $resolvedProject" -ForegroundColor Yellow
        if (Test-Path -LiteralPath $buildStatePath) {
            Write-Host "Status: $buildStatePath" -ForegroundColor Yellow
            Get-Content -LiteralPath $buildStatePath | Write-Host
        }
        Write-Host "Wait for the existing build instead of starting another MSBuild or dotnet process." -ForegroundColor Yellow
        if ($tempAnalyzerTargets -and (Test-Path -LiteralPath $tempAnalyzerTargets)) {
            Remove-Item -LiteralPath $tempAnalyzerTargets -Force -ErrorAction SilentlyContinue
        }
        exit 75
    }

    $buildStartedAt = [datetime]::UtcNow
    $buildTool = if ($msbuild) { $msbuild } else { (Get-Command dotnet).Source }
    Remove-Item -LiteralPath $buildLogPath -Force -ErrorAction SilentlyContinue
    Write-BuildState -Path $buildStatePath -Status "running" -ProjectPath $resolvedProject -BuildTool $buildTool -StartedAt $buildStartedAt -OutputLog $buildLogPath
    Write-Host "--> Build status: $buildStatePath" -ForegroundColor DarkGray

try {
    # File-first capture avoids native output handles keeping an automated shell
    # open after the root build process exits.
    if ($msbuild) {
        Write-Host "--> Building with MSBuild (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Cyan
        Write-Host "--> MSBuild: $msbuild" -ForegroundColor DarkGray
        $allArgs = $defaultArgs + $autoArgs + @($Project) + $extraArgs +
            @(
                "/warnAsError:$migrationBlockingDiagnostics",
                "/nr:false",
                "/p:UseSharedCompilation=false"
            )
        if ($tempAnalyzerTargets) {
            $allArgs += "/p:CustomAfterMicrosoftCommonTargets=$tempAnalyzerTargets"
        }
        $buildExit = Invoke-LoggedNativeCommand -FilePath $msbuild -Arguments $allArgs -OutputLog $buildLogPath
        Write-BuildResult -Path $buildLogPath -ExitCode $buildExit
    } else {
        Write-Host "--> Building with dotnet build (Platform: $detectedPlatform, Config: $detectedConfig)" -ForegroundColor Cyan
        Write-Host "    WinUI XAML compilation can take several minutes. If the shell is still running, read the same shell again; do not start a duplicate build." -ForegroundColor DarkGray
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
        $dotnetArgs += "--warnaserror:$migrationBlockingDiagnostics"
        # Persistent build/compiler servers can retain inherited output handles
        # after dotnet exits, preventing non-interactive shells from completing.
        $dotnetArgs += "--disable-build-servers"
        $dotnetArgs += "-p:UseSharedCompilation=false"
        if ($tempAnalyzerTargets) {
            $dotnetArgs += "-p:CustomAfterMicrosoftCommonTargets=$tempAnalyzerTargets"
        }
        $dotnetArgs += "--tl:off"
        $buildExit = Invoke-LoggedNativeCommand -FilePath $buildTool -Arguments (@("build") + $dotnetArgs) -OutputLog $buildLogPath
        Write-BuildResult -Path $buildLogPath -ExitCode $buildExit
    }
}
finally {
    if ($tempAnalyzerTargets -and (Test-Path $tempAnalyzerTargets)) {
        Remove-Item $tempAnalyzerTargets -Force -ErrorAction SilentlyContinue
    }
}
}
finally {
    if ($lockAcquired) {
        if ($buildStatePath -and (Test-Path -LiteralPath $buildStatePath)) {
            Remove-Item -LiteralPath $buildStatePath -Force -ErrorAction SilentlyContinue
        }
        $buildMutex.ReleaseMutex()
    }
    $buildMutex.Dispose()
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