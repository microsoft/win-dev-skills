#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build a release bundle by downloading artifacts from GitHub and publishing to GitHub Releases.
.DESCRIPTION
    Downloads artifacts from source repositories, bundles them with the plugin and install script,
    and publishes as a GitHub Release on microsoft/win-dev-skills.

    Artifact sources:
    - WinApp CLI: Portable exe + NuGet from GitHub Actions artifacts on microsoft/winappCli (requires gh auth)
    - Raka CLI: Portable exe + NuGet from latest GitHub Release on nmetulev/raka (no auth needed)
    - WinUI Templates: NuGet from Azure DevOps internal feed (requires az login)

    Prerequisites:
    - GitHub CLI (gh) installed and authenticated (for winapp CLI artifacts + publishing)
    - Azure CLI (az) installed and logged in (for WinUI template NuGet, optional)
.PARAMETER Version
    Release version (e.g., "0.3.0"). If omitted, auto-bumps the patch version from the latest release.
.PARAMETER WinAppPrNumber
    WinApp CLI PR number to pull artifacts from. Default: 341.
.PARAMETER SkipTemplates
    Skip downloading WinUI templates from ADO feed.
.PARAMETER Publish
    Publish the zip to GitHub Releases. Off by default - the script just creates the zip.
.EXAMPLE
    .\build-release.ps1                          # auto-bump patch, download, bundle -> zip
    .\build-release.ps1 -Publish                 # same + publish to GitHub Releases
    .\build-release.ps1 -Version "0.3.0"         # explicit version
    .\build-release.ps1 -WinAppPrNumber 341      # pull from specific PR
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [int]$WinAppPrNumber = 341,

    [Parameter(Mandatory=$false)]
    [switch]$SkipTemplates,

    [Parameter(Mandatory=$false)]
    [switch]$Publish
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path $PSCommandPath -Parent
$RepoRoot = Split-Path $ScriptDir -Parent
$PluginJsonPath = Join-Path $RepoRoot ".github\plugin\plugin.json"
$ReleaseRepo = "microsoft/win-dev-skills"

# ============================================================================
# Resolve version
# ============================================================================
function Get-CurrentVersion {
    if (Test-Path $PluginJsonPath) {
        $pluginData = Get-Content $PluginJsonPath -Raw | ConvertFrom-Json
        return $pluginData.version
    } else {
        Write-Error "plugin.json not found at: $PluginJsonPath"
        exit 1
    }
}

function Get-NextVersion {
    $current = [System.Version]::new((Get-CurrentVersion))
    return "$($current.Major).$($current.Minor).$($current.Build + 1)"
}

if ([string]::IsNullOrEmpty($Version)) {
    if ($Publish) {
        # Bump version only when publishing
        $Version = Get-NextVersion
        Write-Host "[VERSION] Auto-bumped to v$Version (will update plugin.json on publish)" -ForegroundColor Magenta
    } else {
        # Use current version for zip-only builds
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

$ScriptDir = Split-Path $PSCommandPath -Parent
$RepoRoot = Split-Path $ScriptDir -Parent
$PluginDir = Join-Path $RepoRoot ".github\plugin"
$InstallScript = Join-Path $ScriptDir "install.ps1"
$InstallCmd = Join-Path $ScriptDir "install.cmd"

$BundleName = "win-dev-skills-v$Version"
$StagingDir = Join-Path $RepoRoot "staging\$BundleName"
$DownloadDir = Join-Path $RepoRoot "staging\downloads"
$ZipPath = Join-Path $RepoRoot "staging\$BundleName.zip"

# Repos
$WinAppRepo = "microsoft/winappCli"
$RakaRepo = "nmetulev/raka"

# ADO feed for WinUI templates
$AdoFeedUrl = "https://pkgs.dev.azure.com/microsoft/ProjectReunion/_packaging/Project.Reunion.nuget.internal/nuget/v3/index.json"
$TemplatePackageName = "Microsoft.WindowsAppSDK.WinUI.CSharp.Templates"

# ============================================================================
# Prerequisites - verify everything before doing any work
# ============================================================================
Write-Host "[CHECK] Verifying prerequisites..." -ForegroundColor Blue
Write-Host ""

$prereqFailed = $false

# --- GitHub CLI (required: downloads winapp artifacts + publishes releases) ---
$ghAvailable = $false
if (Get-Command gh -ErrorAction SilentlyContinue) {
    # Check authentication
    $null = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        $ghAvailable = $true
        Write-Host "  [OK] GitHub CLI (gh) - installed and authenticated" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] GitHub CLI (gh) - installed but NOT authenticated" -ForegroundColor Red
        Write-Host "         Run: gh auth login" -ForegroundColor Yellow
        $prereqFailed = $true
    }
} else {
    Write-Host "  [FAIL] GitHub CLI (gh) - not found" -ForegroundColor Red
    Write-Host "         Install with: winget install GitHub.cli" -ForegroundColor Yellow
    $prereqFailed = $true
}

# --- Azure CLI (required for ADO template feed unless -SkipTemplates) ---
$azAvailable = $false
if (-not $SkipTemplates) {
    if (Get-Command az -ErrorAction SilentlyContinue) {
        $account = $null
        try { $account = az account show 2>$null | ConvertFrom-Json } catch { }
        if ($account) {
            $azAvailable = $true
            Write-Host "  [OK] Azure CLI (az) - installed and authenticated as $($account.user.name)" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Azure CLI (az) - installed but NOT logged in" -ForegroundColor Red
            Write-Host "         Run: az login   (or use -SkipTemplates to skip)" -ForegroundColor Yellow
            $prereqFailed = $true
        }
    } else {
        Write-Host "  [FAIL] Azure CLI (az) - not found" -ForegroundColor Red
        Write-Host "         Install with: winget install Microsoft.AzureCLI   (or use -SkipTemplates to skip)" -ForegroundColor Yellow
        $prereqFailed = $true
    }
} else {
    Write-Host "  [--]  Azure CLI (az) - skipped (-SkipTemplates)" -ForegroundColor DarkGray
}

# --- .NET SDK (required for template restore unless -SkipTemplates) ---
if (-not $SkipTemplates) {
    if (Get-Command dotnet -ErrorAction SilentlyContinue) {
        $dotnetVersion = dotnet --version 2>$null
        Write-Host "  [OK] .NET SDK - $dotnetVersion" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] .NET SDK (dotnet) - not found" -ForegroundColor Red
        Write-Host "         Install with: winget install Microsoft.DotNet.SDK.8   (or use -SkipTemplates to skip)" -ForegroundColor Yellow
        $prereqFailed = $true
    }
} else {
    Write-Host "  [--]  .NET SDK (dotnet) - skipped (-SkipTemplates)" -ForegroundColor DarkGray
}

# --- Local files ---
$localFilesOk = $true
if (-not (Test-Path $PluginDir)) {
    Write-Host "  [FAIL] Plugin directory not found: $PluginDir" -ForegroundColor Red
    $prereqFailed = $true
    $localFilesOk = $false
}
if (-not (Test-Path $InstallScript)) {
    Write-Host "  [FAIL] install.ps1 not found: $InstallScript" -ForegroundColor Red
    $prereqFailed = $true
    $localFilesOk = $false
}
if ($localFilesOk) {
    Write-Host "  [OK] Local files - plugin and install script found" -ForegroundColor Green
}

Write-Host ""

if ($prereqFailed) {
    Write-Host "[ABORT] Fix the issues above and try again." -ForegroundColor Red
    exit 1
}

Write-Host "  All checks passed - proceeding with build." -ForegroundColor White
Write-Host ""

# ============================================================================
# Clean staging
# ============================================================================
if (Test-Path (Join-Path $RepoRoot "staging")) {
    Remove-Item (Join-Path $RepoRoot "staging") -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $StagingDir "tools") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StagingDir "nugets") -Force | Out-Null
New-Item -ItemType Directory -Path $DownloadDir -Force | Out-Null

# ============================================================================
# Step 1: Download WinApp CLI artifacts from GitHub Actions
# ============================================================================
Write-Host "[1/4] Downloading WinApp CLI artifacts from PR #$WinAppPrNumber..." -ForegroundColor Cyan
Write-Host ""

# Find the latest "Build and Package" workflow run for the PR branch
Write-Host "  Finding latest build run..." -ForegroundColor Gray
$prInfo = gh api "repos/$WinAppRepo/pulls/$WinAppPrNumber" --jq '{head_ref: .head.ref, head_sha: .head.sha}' 2>&1 | ConvertFrom-Json
$prBranch = $prInfo.head_ref
Write-Host "  PR branch: $prBranch" -ForegroundColor Gray

# List workflow runs for the "Build and Package" workflow on the PR branch
$runsJson = gh api "repos/$WinAppRepo/actions/workflows/build-package.yml/runs?branch=$prBranch&status=completed&per_page=10" 2>&1
$runs = ($runsJson | ConvertFrom-Json).workflow_runs | Where-Object { $_.conclusion -eq 'success' }

# Find the latest run that has cli-binaries and nuget artifacts
$selectedRun = $null
foreach ($run in $runs) {
    $artifactsJson = gh api "repos/$WinAppRepo/actions/runs/$($run.id)/artifacts" 2>&1
    $artifacts = ($artifactsJson | ConvertFrom-Json).artifacts
    $hasCli = $artifacts | Where-Object { $_.name -eq 'cli-binaries' -and -not $_.expired }
    $hasNuget = $artifacts | Where-Object { $_.name -eq 'nuget-packages' -and -not $_.expired }
    if ($hasCli -and $hasNuget) {
        $selectedRun = $run
        break
    }
}

if (-not $selectedRun) {
    Write-Error "No successful build run with cli-binaries + NuGet artifacts found for PR #$WinAppPrNumber (branch: $prBranch)"
    exit 1
}

Write-Host "  Run: #$($selectedRun.run_number) ($($selectedRun.id)) - $($selectedRun.display_title)" -ForegroundColor Gray
Write-Host "  SHA: $($selectedRun.head_sha.Substring(0, 8))" -ForegroundColor Gray
Write-Host ""

# Download CLI binaries (standalone exes)
$winappCliDir = Join-Path $DownloadDir "winapp-cli"
Write-Host "  Downloading cli-binaries artifact..." -ForegroundColor Gray
gh run download $selectedRun.id --repo $WinAppRepo --name "cli-binaries" --dir $winappCliDir

# Copy architecture-specific exes to tools dir
foreach ($arch in @("win-arm64", "win-x64")) {
    $exeFile = Get-ChildItem -Path (Join-Path $winappCliDir $arch) -Filter "winapp.exe" -ErrorAction SilentlyContinue
    if ($exeFile) {
        $targetDir = Join-Path $StagingDir "tools\$arch"
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        Copy-Item $exeFile.FullName $targetDir -Force
        Write-Host "    - tools/$arch/winapp.exe ($([math]::Round($exeFile.Length / 1MB, 1)) MB)" -ForegroundColor Gray
    }
}

$winappExes = Get-ChildItem -Path (Join-Path $StagingDir "tools") -Filter "winapp.exe" -Recurse
if (-not $winappExes) {
    Write-Error "No winapp.exe found in downloaded cli-binaries artifact"
    exit 1
}

# Download NuGet artifacts
$winappNugetDir = Join-Path $DownloadDir "winapp-nuget"
Write-Host "  Downloading nuget-packages artifact..." -ForegroundColor Gray
gh run download $selectedRun.id --repo $WinAppRepo --name "nuget-packages" --dir $winappNugetDir
$winappNugetFiles = Get-ChildItem -Path $winappNugetDir -Filter "*.nupkg" -Recurse
if (-not $winappNugetFiles) {
    Write-Error "No .nupkg files found in downloaded winapp nuget-packages artifact"
    exit 1
}
foreach ($f in $winappNugetFiles) {
    Write-Host "    - $($f.Name) ($([math]::Round($f.Length / 1MB, 1)) MB)" -ForegroundColor Gray
    Copy-Item $f.FullName (Join-Path $StagingDir "nugets") -Force
}

Write-Host "  [OK] WinApp CLI artifacts downloaded" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Step 2: Download Raka artifacts from latest GitHub Release (no auth needed)
# ============================================================================
Write-Host "[2/4] Downloading Raka CLI from latest release..." -ForegroundColor Cyan
Write-Host ""

$headers = @{ 'User-Agent' = 'win-dev-skills-build' }
$rakaRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$RakaRepo/releases/latest" -Headers $headers
Write-Host "  Release: $($rakaRelease.tag_name) - $($rakaRelease.name)" -ForegroundColor Gray

# Download CLI zips (standalone exes) for each architecture
foreach ($arch in @("arm64", "x64")) {
    $cliAsset = $rakaRelease.assets | Where-Object { $_.name -like "raka-win-$arch-*.zip" } | Select-Object -First 1
    if ($cliAsset) {
        $cliZip = Join-Path $DownloadDir $cliAsset.name
        $cliExtract = Join-Path $DownloadDir "raka-$arch"
        Write-Host "  Downloading $($cliAsset.name)..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $cliAsset.browser_download_url -OutFile $cliZip -Headers $headers
        Expand-Archive -Path $cliZip -DestinationPath $cliExtract -Force

        $rakaExe = Get-ChildItem -Path $cliExtract -Filter "raka.exe" -Recurse | Select-Object -First 1
        if ($rakaExe) {
            $targetDir = Join-Path $StagingDir "tools\win-$arch"
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            Copy-Item $rakaExe.FullName $targetDir -Force
            Write-Host "    - tools/win-$arch/raka.exe ($([math]::Round($rakaExe.Length / 1MB, 1)) MB)" -ForegroundColor Gray
        }
    }
}

$rakaExes = Get-ChildItem -Path (Join-Path $StagingDir "tools") -Filter "raka.exe" -Recurse
if (-not $rakaExes) {
    Write-Error "No raka.exe found in Raka release $($rakaRelease.tag_name)"
    exit 1
}

# Download NuGet package
$rakaNugetAsset = $rakaRelease.assets | Where-Object { $_.name -like "*.nupkg" } | Select-Object -First 1
if (-not $rakaNugetAsset) {
    Write-Error "No NuGet package found in Raka release $($rakaRelease.tag_name)"
    exit 1
}
$rakaNugetPath = Join-Path $DownloadDir $rakaNugetAsset.name
Write-Host "  Downloading $($rakaNugetAsset.name)..." -ForegroundColor Gray
Invoke-WebRequest -Uri $rakaNugetAsset.browser_download_url -OutFile $rakaNugetPath -Headers $headers
Copy-Item $rakaNugetPath (Join-Path $StagingDir "nugets") -Force
Write-Host "    - $($rakaNugetAsset.name)" -ForegroundColor Gray

Write-Host "  [OK] Raka CLI artifacts downloaded" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Step 3: Download WinUI Templates from ADO NuGet feed (requires az login)
# ============================================================================
if ($SkipTemplates) {
    Write-Host "[3/4] Skipping WinUI templates (--SkipTemplates)" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "[3/4] Downloading WinUI templates from ADO feed..." -ForegroundColor Cyan
    Write-Host ""

    $templateDownloaded = $false

    if ($azAvailable) {
        try {
            # Ensure we're logged in (may have been detected as not-logged-in in prereqs)
            $account = $null
            try { $account = az account show 2>$null | ConvertFrom-Json } catch { }
            if (-not $account) {
                Write-Host "  [INFO] Not logged in to Azure. Launching browser login..." -ForegroundColor Yellow
                az login 2>$null | Out-Null
            }
            Write-Host "  [OK] Azure CLI authenticated" -ForegroundColor Green

            # Use az artifacts to download the latest version of the template package
            Write-Host "  Searching for latest $TemplatePackageName..." -ForegroundColor Gray

            # Install/update credential provider - use Net8 (arch-independent) to support ARM64
            $credProviderDir = Join-Path $env:USERPROFILE ".nuget\plugins\netcore\CredentialProvider.Microsoft"
            $needsInstall = -not (Test-Path $credProviderDir)

            if (-not $needsInstall) {
                # Verify existing provider works by checking for architecture mismatch
                $hostPolicy = Join-Path $credProviderDir "hostpolicy.dll"
                if (Test-Path $hostPolicy) {
                    # Self-contained (win-x64) provider has hostpolicy.dll - won't work on ARM64
                    # Net8 provider does NOT have hostpolicy.dll, it uses the system .NET runtime
                    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
                        $needsInstall = $true
                        Write-Host "  Credential provider is x64 self-contained - reinstalling for ARM64 compat..." -ForegroundColor Yellow
                    }
                }
            }

            if ($needsInstall) {
                Write-Host "  Installing Azure Artifacts credential provider (Net8)..." -ForegroundColor Gray
                # Remove old install to avoid conflicts
                $pluginsRoot = Join-Path $env:USERPROFILE ".nuget\plugins"
                if (Test-Path $pluginsRoot) {
                    Remove-Item $pluginsRoot -Recurse -Force -ErrorAction SilentlyContinue
                }
                # Download and extract the Net8 (arch-independent) credential provider
                $cpZipUrl = ($rel = Invoke-RestMethod "https://api.github.com/repos/microsoft/artifacts-credprovider/releases/latest" -Headers @{'User-Agent'='win-dev-skills'}).assets |
                    Where-Object { $_.name -eq 'Microsoft.Net8.NuGet.CredentialProvider.zip' } |
                    Select-Object -First 1 -ExpandProperty browser_download_url
                $cpZip = Join-Path $DownloadDir "credprovider-net8.zip"
                Invoke-WebRequest -Uri $cpZipUrl -OutFile $cpZip
                Expand-Archive -Path $cpZip -DestinationPath (Join-Path $env:USERPROFILE ".nuget") -Force
                Write-Host "  [OK] Credential provider installed (Net8)" -ForegroundColor Green
            }

            # Download using dotnet restore into a temp project
            $tempProjDir = Join-Path $DownloadDir "template-download"
            New-Item -ItemType Directory -Path $tempProjDir -Force | Out-Null

            # Create a minimal project that references the template package
            $tempCsproj = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RestoreSources>$AdoFeedUrl;https://api.nuget.org/v3/index.json</RestoreSources>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="$TemplatePackageName" Version="*-*" />
  </ItemGroup>
</Project>
"@
            Set-Content -Path (Join-Path $tempProjDir "temp.csproj") -Value $tempCsproj

            Write-Host "  Restoring template package (may prompt for auth)..." -ForegroundColor Gray
            $env:NUGET_CREDENTIALPROVIDER_SESSIONTOKENCACHE_ENABLED = "true"
            $restoreOutput = dotnet restore (Join-Path $tempProjDir "temp.csproj") --interactive 2>&1
            $restoreExitCode = $LASTEXITCODE

            if ($restoreExitCode -ne 0) {
                Write-Host "  [FAIL] dotnet restore failed (exit code $restoreExitCode):" -ForegroundColor Red
                # Show the last lines which typically contain the error
                $errorLines = ($restoreOutput | Out-String).Trim() -split "`n" | Select-Object -Last 15
                foreach ($line in $errorLines) {
                    Write-Host "         $line" -ForegroundColor Red
                }
            } else {
                # Find the downloaded nupkg in the global packages cache
                $pkgCacheDir = Join-Path $env:USERPROFILE ".nuget\packages\$($TemplatePackageName.ToLower())"
                $templatePkgs = Get-ChildItem -Path $pkgCacheDir -Directory -ErrorAction SilentlyContinue |
                    Sort-Object Name -Descending | Select-Object -First 1

                if (-not $templatePkgs) {
                    Write-Host "  [FAIL] Restore succeeded but package not found in cache: $pkgCacheDir" -ForegroundColor Red
                } else {
                    $pkgVersion = $templatePkgs.Name
                    Write-Host "  Found version $pkgVersion in NuGet cache" -ForegroundColor Gray

                    # NuGet cache stores expanded packages - look for .nupkg file
                    $nupkgFile = Get-ChildItem -Path $templatePkgs.FullName -Filter "*.nupkg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1

                    if ($nupkgFile) {
                        Copy-Item $nupkgFile.FullName (Join-Path $StagingDir "nugets") -Force
                        Write-Host "    - $($nupkgFile.Name)" -ForegroundColor Gray
                        $templateDownloaded = $true
                    } else {
                        # Try the well-known lowercased path
                        $nupkgInCache = Join-Path $templatePkgs.FullName "$($TemplatePackageName.ToLower()).$pkgVersion.nupkg"
                        if (Test-Path $nupkgInCache) {
                            Copy-Item $nupkgInCache (Join-Path $StagingDir "nugets") -Force
                            Write-Host "    - $(Split-Path $nupkgInCache -Leaf)" -ForegroundColor Gray
                            $templateDownloaded = $true
                        } else {
                            # Try the http-cache as a fallback
                            $httpCache = Join-Path $env:LOCALAPPDATA "NuGet\v3-cache"
                            $cachedNupkg = Get-ChildItem -Path $httpCache -Filter "$($TemplatePackageName.ToLower())*.nupkg" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                            if ($cachedNupkg) {
                                Copy-Item $cachedNupkg.FullName (Join-Path $StagingDir "nugets") -Force
                                Write-Host "    - $($cachedNupkg.Name)" -ForegroundColor Gray
                                $templateDownloaded = $true
                            } else {
                                Write-Host "  [FAIL] Restore succeeded but .nupkg not found in cache or http-cache" -ForegroundColor Red
                                Write-Host "         Cache dir: $($templatePkgs.FullName)" -ForegroundColor Red
                                Write-Host "         Contents: $(Get-ChildItem $templatePkgs.FullName -Recurse | Select-Object -ExpandProperty Name)" -ForegroundColor Red
                            }
                        }
                    }
                }
            }
        } catch {
            Write-Host "  [FAIL] Template download failed: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  [FAIL] Azure CLI not available - cannot download from ADO feed" -ForegroundColor Red
    }

    if (-not $templateDownloaded) {
        Write-Host ""
        Write-Error "Failed to download WinUI template NuGet. Use -SkipTemplates to skip, or fix the error above."
        exit 1
    } else {
        Write-Host "  [OK] WinUI template downloaded" -ForegroundColor Green
    }
    Write-Host ""
}

# ============================================================================
# Step 4: Bundle everything
# ============================================================================
Write-Host "[4/4] Bundling release..." -ForegroundColor Cyan
Write-Host ""

# Update plugin.json version before copying
$pluginData = Get-Content $PluginJsonPath -Raw | ConvertFrom-Json
if ($pluginData.version -ne $Version) {
    $pluginData.version = $Version
    $pluginData | ConvertTo-Json -Depth 10 | Set-Content -Path $PluginJsonPath -Encoding UTF8
    Write-Host "  Updated plugin.json version to $Version" -ForegroundColor Gray
}

# Copy plugin
Write-Host "  Copying plugin..." -ForegroundColor Gray
Copy-Item $PluginDir (Join-Path $StagingDir "plugin") -Recurse -Force

# Copy install scripts
Write-Host "  Copying install scripts..." -ForegroundColor Gray
Copy-Item $InstallScript (Join-Path $StagingDir "install.ps1") -Force
if (Test-Path $InstallCmd) {
    Copy-Item $InstallCmd (Join-Path $StagingDir "install.cmd") -Force
}

# Generate bundle README
Write-Host "  Generating README..." -ForegroundColor Gray
$readmeContent = @"
# Windows Development Skills v$Version

Complete toolkit for Windows app development with GitHub Copilot.

## Quick Installation

1. Double-click ``install.cmd``
2. Done! No admin required.

## What's Included

- **WinApp CLI** - App packaging, code signing, Windows SDK management
- **Raka CLI** - UI automation for WinUI 3 apps (inspect, screenshot, interact)
- **NuGet packages** - Raka.DevTools, Windows SDK Build Tools
- **Copilot CLI plugin** - Agents and skills for Windows development

## After Installation

Open a **new** terminal and run:

``````
copilot
``````

Then ask:

``````
Build me a WinUI 3 app called TaskFlow
``````

The winui3-builder agent will automatically activate and handle everything.

## Manual Installation

If the automated installer doesn't work:

``````powershell
# Run the installer script directly
powershell -ExecutionPolicy Bypass -File install.ps1
``````
"@

Set-Content -Path (Join-Path $StagingDir "README.md") -Value $readmeContent -Encoding UTF8

# Show bundle summary
Write-Host ""
Write-Host "  Bundle contents:" -ForegroundColor White
$toolDirs = Get-ChildItem -Path (Join-Path $StagingDir "tools") -Directory -ErrorAction SilentlyContinue
foreach ($dir in $toolDirs) {
    $exes = Get-ChildItem -Path $dir.FullName -Filter "*.exe"
    foreach ($f in $exes) {
        Write-Host "    tools/$($dir.Name)/$($f.Name) ($([math]::Round($f.Length / 1MB, 1)) MB)" -ForegroundColor Gray
    }
}
$nugetFiles = Get-ChildItem -Path (Join-Path $StagingDir "nugets") -Filter "*.nupkg"
foreach ($f in $nugetFiles) {
    Write-Host "    nugets/$($f.Name) ($([math]::Round($f.Length / 1MB, 1)) MB)" -ForegroundColor Gray
}
Write-Host "    plugin/ (agents + skills)" -ForegroundColor Gray
Write-Host "    install.ps1 + install.cmd" -ForegroundColor Gray
Write-Host "    README.md" -ForegroundColor Gray
Write-Host ""

# --- Confirm (only when publishing) ---
if ($Publish) {
    Write-Host "--------------------------------------------" -ForegroundColor DarkGray
    $response = Read-Host "Proceed with creating and publishing release v$Version? (Y/N)"
    if ($response -ne 'Y' -and $response -ne 'y') {
        Write-Host "[CANCELLED]" -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
}

# ============================================================================
# Create zip
# ============================================================================
Write-Host "[ZIP] Creating release archive..." -ForegroundColor Blue

$allFiles = Get-ChildItem -Path $StagingDir -Recurse -File
$totalSize = ($allFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "  $($allFiles.Count) files, $([math]::Round($totalSize / 1MB, 1)) MB total" -ForegroundColor Gray

Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipPath -Force
$zipSize = (Get-Item $ZipPath).Length
Write-Host "[OK] Created: $ZipPath ($([math]::Round($zipSize / 1MB, 1)) MB)" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Publish to GitHub
# ============================================================================
if (-not $Publish) {
    Write-Host "[DONE] Zip created. Use -Publish to upload to GitHub Releases." -ForegroundColor Yellow
} else {
    Write-Host "[PUBLISH] Publishing to GitHub Releases..." -ForegroundColor Blue
    Write-Host ""

    $tag = "v$Version"
    $title = "Windows Development Skills v$Version"

    Write-Host "  Tag:   $tag" -ForegroundColor Gray
    Write-Host "  Title: $title" -ForegroundColor Gray
    Write-Host "  Asset: $ZipPath" -ForegroundColor Gray
    Write-Host ""

    try {
        gh release create $tag $ZipPath --repo "microsoft/win-dev-skills" --title $title --notes "Release v$Version of the Windows Development Skills toolkit.`n`nDownload the zip, extract, and double-click ``install.cmd`` to install." --latest
        Write-Host "[OK] Release published: https://github.com/microsoft/win-dev-skills/releases/tag/$tag" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to publish release: $_"
        Write-Host "  The zip is available at: $ZipPath" -ForegroundColor Yellow
        Write-Host "  Upload manually to GitHub Releases." -ForegroundColor Yellow
    }
}

Write-Host ""

# ============================================================================
# Cleanup
# ============================================================================
if (Test-Path $DownloadDir) {
    Remove-Item $DownloadDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $StagingDir) {
    Remove-Item $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[DONE] Build complete!" -ForegroundColor Green
Write-Host ""
