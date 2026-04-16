#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build a release bundle with MSIX packages, templates, and the Copilot CLI plugin.
.DESCRIPTION
    Bundles:
    - WinApp CLI MSIX packages (from winappcli build output) + their install scripts
    - WinUI 3 project templates NuGet package
    - Copilot CLI plugin (agents and skills, assembled from src/)
    - Install/uninstall scripts

    The resulting zip can be distributed and installed by running install.cmd.
.PARAMETER MsixPath
    Path to winappcli msix-packages directory (contains .msix files + install.ps1/cmd).
.PARAMETER TemplatesPath
    Path to directory containing the WinUI templates .nupkg file.
.PARAMETER Agent
    Agent config to use for the winui3 agent (folder name under src/agents/).
    Defaults to "winui3-base". Uses Generate-Plugin.ps1 to assemble the agent + skills.
.PARAMETER Version
    Release version. If omitted, auto-bumps patch from plugin.json.
.PARAMETER Publish
    Publish the zip to GitHub Releases.
.EXAMPLE
    .\build-release.ps1 -MsixPath D:\winappcli\artifacts\msix-packages -TemplatesPath D:\WindowsAppSDK\localpackages
    .\build-release.ps1 -MsixPath D:\winappcli\artifacts\msix-packages -TemplatesPath D:\WindowsAppSDK\localpackages -Agent winui3+design
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$MsixPath,

    [Parameter(Mandatory=$true)]
    [string]$TemplatesPath,

    [string]$Agent = "winui3-simple-base",

    [Parameter(Mandatory=$false)]
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [switch]$Publish
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path $PSCommandPath -Parent
$RepoRoot = Split-Path $ScriptDir -Parent
$PluginJsonPath = Join-Path $RepoRoot ".github\plugin\plugin.json"
$PluginDir = Join-Path $RepoRoot ".github\plugin"
$ReleaseRepo = "microsoft/win-dev-skills"

# ============================================================================
# Resolve version
# ============================================================================
function Get-CurrentVersion {
    $pluginData = Get-Content $PluginJsonPath -Raw | ConvertFrom-Json
    return $pluginData.version
}

function Get-NextVersion {
    $current = [System.Version]::New((Get-CurrentVersion))
    return "$($current.Major).$($current.Minor).$($current.Build + 1)"
}

if ([string]::IsNullOrEmpty($Version)) {
    if ($Publish) {
        $Version = Get-NextVersion
        Write-Host "[VERSION] Auto-bumped to v$Version" -ForegroundColor Magenta
    } else {
        $Version = Get-CurrentVersion
        Write-Host "[VERSION] Using current v$Version" -ForegroundColor Magenta
    }
} else {
    Write-Host "[VERSION] Using explicit v$Version" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Win-Dev-Skills Release Builder v$Version" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# Validate inputs
# ============================================================================
Write-Host "[CHECK] Validating..." -ForegroundColor Blue

# MSIX packages
if (-not (Test-Path $MsixPath)) {
    Write-Error "MSIX path not found: $MsixPath"
    exit 1
}
$msixFiles = Get-ChildItem -Path $MsixPath -Filter "*.msix"
if ($msixFiles.Count -eq 0) {
    Write-Error "No .msix files found in: $MsixPath"
    exit 1
}
$msixInstallScript = Join-Path $MsixPath "install.ps1"
if (-not (Test-Path $msixInstallScript)) {
    Write-Error "install.ps1 not found in MSIX directory: $MsixPath"
    exit 1
}
Write-Host "  [OK] MSIX packages: $($msixFiles.Count) file(s)" -ForegroundColor Green

# Templates NuGet package
if (-not (Test-Path $TemplatesPath)) {
    Write-Error "Templates path not found: $TemplatesPath"
    exit 1
}
$nupkgFiles = Get-ChildItem -Path $TemplatesPath -Filter "*.nupkg"
if ($nupkgFiles.Count -eq 0) {
    Write-Error "No .nupkg files found in: $TemplatesPath"
    exit 1
}
Write-Host "  [OK] Templates package: $($nupkgFiles[0].Name)" -ForegroundColor Green

# Agent config
$agentDir = Join-Path $RepoRoot "src\agents\$Agent"
if (-not (Test-Path (Join-Path $agentDir "config.json"))) {
    Write-Error "Agent config not found: $agentDir\config.json"
    exit 1
}
Write-Host "  [OK] Agent config: $Agent" -ForegroundColor Green

# Plugin
if (-not (Test-Path $PluginDir)) {
    Write-Error "Plugin directory not found: $PluginDir"
    exit 1
}
Write-Host "  [OK] Plugin directory found" -ForegroundColor Green

# gh (only needed for publish)
if ($Publish) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Error "GitHub CLI (gh) required for publishing. Install with: winget install GitHub.cli"
        exit 1
    }
    $null = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "GitHub CLI not authenticated. Run: gh auth login"
        exit 1
    }
    Write-Host "  [OK] GitHub CLI authenticated" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# Build tools (ensures fresh binaries in skill directories)
# ============================================================================
Write-Host "[BUILD] Building tools..." -ForegroundColor Cyan
$buildToolsScript = Join-Path $ScriptDir "build-tools.ps1"
& $buildToolsScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "build-tools.ps1 failed"
    exit 1
}
Write-Host ""

# ============================================================================
# Stage the bundle
# ============================================================================
$BundleName = "win-dev-skills-v$Version"
$StagingDir = Join-Path $RepoRoot "staging\$BundleName"
$ZipPath = Join-Path $RepoRoot "staging\$BundleName.zip"

# Clean staging
$stagingRoot = Join-Path $RepoRoot "staging"
if (Test-Path $stagingRoot) { Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "[1/4] Copying MSIX packages..." -ForegroundColor Cyan
$msixTarget = Join-Path $StagingDir "msix"
New-Item -ItemType Directory -Path $msixTarget -Force | Out-Null
# Copy .msix files, install scripts, and README
Get-ChildItem -Path $MsixPath -File | ForEach-Object {
    Copy-Item $_.FullName $msixTarget -Force
    $size = if ($_.Length -gt 1MB) { "$([math]::Round($_.Length / 1MB, 1)) MB" } else { "$([math]::Round($_.Length / 1KB)) KB" }
    Write-Host "    - msix/$($_.Name) ($size)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "[2/4] Copying templates..." -ForegroundColor Cyan
$templatesTarget = Join-Path $StagingDir "templates"
New-Item -ItemType Directory -Path $templatesTarget -Force | Out-Null
foreach ($pkg in $nupkgFiles) {
    Copy-Item $pkg.FullName $templatesTarget -Force
    Write-Host "    - templates/$($pkg.Name) ($([math]::Round($pkg.Length / 1KB)) KB)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "[3/4] Assembling plugin (agent: $Agent)..." -ForegroundColor Cyan

# Generate winui3 agent + skills via Generate-Plugin
$genOutputDir = Join-Path $env:TEMP "win-dev-skills-gen-$(Get-Random)"
$generateScript = Join-Path $ScriptDir "Generate-Plugin.ps1"
& $generateScript -Agent $Agent -OutputDir $genOutputDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "Generate-Plugin.ps1 failed"
    exit 1
}

# Build plugin directory
$pluginTarget = Join-Path $StagingDir "plugin"
New-Item -ItemType Directory -Path "$pluginTarget\agents" -Force | Out-Null
New-Item -ItemType Directory -Path "$pluginTarget\skills" -Force | Out-Null

# Copy plugin.json (with version update)
$pluginData = Get-Content $PluginJsonPath -Raw | ConvertFrom-Json
if ($pluginData.version -ne $Version) {
    $pluginData.version = $Version
    $pluginData | ConvertTo-Json -Depth 10 | Set-Content -Path $PluginJsonPath -Encoding UTF8
    Write-Host "  Updated plugin.json version to $Version" -ForegroundColor Gray
}
Copy-Item $PluginJsonPath (Join-Path $pluginTarget "plugin.json") -Force

# Copy generated winui3 agent + skills
$genAgents = Join-Path $genOutputDir ".github\agents"
$genSkills = Join-Path $genOutputDir ".github\skills"
if (Test-Path $genAgents) {
    Get-ChildItem $genAgents -File | ForEach-Object {
        Copy-Item $_.FullName "$pluginTarget\agents\" -Force
        Write-Host "    - agents/$($_.Name) (v2, from $Agent)" -ForegroundColor Gray
    }
}
if (Test-Path $genSkills) {
    Get-ChildItem $genSkills -Directory | ForEach-Object {
        Copy-Item $_.FullName "$pluginTarget\skills\$($_.Name)" -Recurse -Force
    }
}

# Update plugin.json skills path to root skills directory
$pluginData.skills = @("skills/")
$pluginData | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $pluginTarget "plugin.json") -Encoding UTF8

$agentCount = (Get-ChildItem "$pluginTarget\agents" -File).Count
$totalSkills = (Get-ChildItem "$pluginTarget\skills" -Directory).Count
Write-Host "  Plugin: $agentCount agent(s), $totalSkills skill directories" -ForegroundColor Green

# Clean up temp
Remove-Item $genOutputDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""

Write-Host "[4/4] Creating bundle..." -ForegroundColor Cyan
# Copy install scripts
$bundleScriptsDir = Join-Path $StagingDir "scripts"
New-Item -ItemType Directory -Path $bundleScriptsDir -Force | Out-Null
Copy-Item (Join-Path $ScriptDir "install.ps1") (Join-Path $bundleScriptsDir "install.ps1") -Force

# Generate root install.cmd
$installCmdContent = @"
@echo off
echo.
echo ================================================
echo  Windows Development Skills - Installation
echo ================================================
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Installation completed successfully!
) else (
    echo.
    echo Installation encountered an error.
)
echo.
pause
"@
Set-Content -Path (Join-Path $StagingDir "install.cmd") -Value $installCmdContent -NoNewline

# Create zip
Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipPath -Force
$zipSize = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "  $ZipPath ($zipSize MB)" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# Publish (optional)
# ============================================================================
if ($Publish) {
    Write-Host "[PUBLISH] Publishing v$Version to GitHub Releases..." -ForegroundColor Cyan

    # Commit version bump
    git -C $RepoRoot add $PluginJsonPath
    git -C $RepoRoot commit -m "Bump version to $Version" --allow-empty 2>$null
    git -C $RepoRoot push 2>$null

    # Create release
    gh release create "v$Version" $ZipPath --repo $ReleaseRepo --title "v$Version" --generate-notes
    Write-Host "[OK] Published v$Version" -ForegroundColor Green
} else {
    Write-Host "Zip created at: $ZipPath" -ForegroundColor Green
    Write-Host "To publish: .\build-release.ps1 -MsixPath `"$MsixPath`" -TemplatesPath `"$TemplatesPath`" -Version `"$Version`" -Publish" -ForegroundColor Gray
}
Write-Host ""