#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Installer for Windows Development Skills toolkit.
.DESCRIPTION
    Installs from the extracted release bundle:
    - WinApp CLI (via MSIX package — handles certs and app registration)
    - WinUI 3 project templates (from bundled NuGet package)
    - Copilot CLI plugin (agents and skills for Windows development)

    Run this script from inside the extracted release zip.
.PARAMETER Uninstall
    Remove all installed components.
.EXAMPLE
    .\install.ps1
.EXAMPLE
    .\install.ps1 -Uninstall
#>
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# --- Unblock downloaded files ---
Write-Host "Checking for blocked files..." -ForegroundColor Gray
$ScriptPath = $PSCommandPath
if ($ScriptPath -and (Test-Path $ScriptPath)) {
    try {
        $ScriptDir = Split-Path $ScriptPath -Parent
        Get-ChildItem -Path $ScriptDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue
        }
    } catch { }
}

# --- Error trap ---
trap {
    Write-Host "`nERROR: $_" -ForegroundColor Red
    if ($_.Exception) { Write-Host $_.Exception.Message -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "For manual installation steps, see INSTALL.md in this folder." -ForegroundColor Cyan
    Write-Host "You can also open INSTALL.md in Copilot and ask it to install for you." -ForegroundColor Cyan
    exit 1
}

# --- Shared paths ---
$LegacyToolsTarget = Join-Path $env:USERPROFILE ".win-dev-skills\tools"
$AgentDir = Join-Path $env:USERPROFILE ".win-dev-skills"
$PluginTarget = Join-Path $env:USERPROFILE ".copilot\agents\win-dev-skills"

# ============================================================================
# Uninstall mode
# ============================================================================
if ($Uninstall) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host "  Windows Development Skills - Uninstall" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host ""

    $itemsToRemove = @()
    $itemsToRemove += "  - WinApp CLI MSIX package (if installed)"
    $itemsToRemove += "  - WinUI 3 project templates"
    $itemsToRemove += "  - Copilot CLI plugin"
    $itemsToRemove += "  - Legacy exe-based install (tools dir, PATH entries)"
    $itemsToRemove += "  - Legacy NuGet sources (WinApp-Dev, WinAppCLI-Local)"

    foreach ($item in $itemsToRemove) { Write-Host $item -ForegroundColor Gray }
    Write-Host ""

    $response = Read-Host "Proceed with uninstall? (Y/N)"
    if ($response -ne 'Y' -and $response -ne 'y') {
        Write-Host "[CANCELLED]" -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""

    # Remove WinApp CLI MSIX package
    $winappPackages = Get-AppxPackage | Where-Object { $_.Name -eq 'winapp' -or $_.Name -eq 'winapp-dev' -or $_.Name -like 'winappcli*' }
    if ($winappPackages) {
        foreach ($pkg in $winappPackages) {
            try {
                Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction Stop
                Write-Host "[OK] Removed MSIX: $($pkg.Name) v$($pkg.Version)" -ForegroundColor Green
            } catch {
                Write-Host "[WARN] Could not remove $($pkg.Name): $_" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "[SKIP] No WinApp MSIX packages found" -ForegroundColor Gray
    }

    # Uninstall WinUI 3 templates
    $dotnetAvailable = $false
    try { $null = Get-Command dotnet -ErrorAction Stop; $dotnetAvailable = $true } catch { }
    if ($dotnetAvailable) {
        try {
            $templateList = dotnet new uninstall 2>$null | Out-String
            if ($templateList -match 'Microsoft\.WindowsAppSDK\.WinUI\.CSharp\.Templates') {
                dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates 2>$null | Out-Null
                Write-Host "[OK] Removed WinUI 3 templates" -ForegroundColor Green
            } else {
                Write-Host "[SKIP] WinUI 3 templates not installed" -ForegroundColor Gray
            }
        } catch { }
    }

    # Remove legacy exe-based tools directory
    if (Test-Path $LegacyToolsTarget) {
        Remove-Item $LegacyToolsTarget -Recurse -Force
        Write-Host "[OK] Removed legacy tools directory" -ForegroundColor Green
    }

    # Remove tools from user PATH (legacy paths)
    $userPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
    if ($userPath) {
        $legacyToolsDir = Join-Path $env:USERPROFILE ".winui3-agent\tools"
        $parts = $userPath -split ";" | Where-Object {
            $_ -ne $LegacyToolsTarget -and
            $_ -ne $legacyToolsDir -and
            $_ -ne ".winapp\tools" -and
            $_ -ne ""
        }
        $newPath = $parts -join ";"
        if ($newPath -ne $userPath) {
            [Environment]::SetEnvironmentVariable("PATH", $newPath, [EnvironmentVariableTarget]::User)
            Write-Host "[OK] Removed legacy PATH entries" -ForegroundColor Green
        }
    }

    # Remove legacy NuGet sources
    try {
        $existingSources = dotnet nuget list source 2>$null | Out-String
        foreach ($sourceName in @("WinApp-Dev", "WinAppCLI-Local")) {
            if ($existingSources -match $sourceName) {
                dotnet nuget remove source $sourceName 2>$null | Out-Null
                Write-Host "[OK] Removed NuGet source '$sourceName'" -ForegroundColor Green
            }
        }
    } catch { }

    # Remove Copilot plugin
    $copilotAvailable = $false
    try { $null = Get-Command copilot -ErrorAction Stop; $copilotAvailable = $true } catch { }
    if ($copilotAvailable) {
        $pluginList = & copilot plugin list 2>&1
        if ($pluginList -match "win-dev-skills") {
            & copilot plugin uninstall win-dev-skills 2>&1 | Out-Null
            Write-Host "[OK] Removed Copilot plugin" -ForegroundColor Green
        } else {
            Write-Host "[SKIP] Copilot plugin not installed" -ForegroundColor Gray
        }
    } else {
        Write-Host "[SKIP] Copilot CLI not installed" -ForegroundColor Gray
    }

    # Remove legacy .winui3-agent directory
    $legacyDir = Join-Path $env:USERPROFILE ".winui3-agent"
    if (Test-Path $legacyDir) {
        Remove-Item $legacyDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Removed legacy .winui3-agent directory" -ForegroundColor Green
    }

    # Remove .win-dev-skills directory
    if (Test-Path $AgentDir) {
        Remove-Item $AgentDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Removed $AgentDir" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Uninstall complete." -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ============================================================================
# Install mode
# ============================================================================
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Windows Development Skills - Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Clean up previous installations" -ForegroundColor Gray
Write-Host "  2. Install WinApp CLI (MSIX package)" -ForegroundColor Gray
Write-Host "  3. Install WinUI 3 project templates" -ForegroundColor Gray
Write-Host "  4. Install Copilot CLI plugin" -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Proceed with installation? (Y/N)"
if ($response -ne 'Y' -and $response -ne 'y') {
    Write-Host "[CANCELLED]" -ForegroundColor Yellow
    exit 0
}
Write-Host ""

$ScriptDir = Split-Path $PSCommandPath -Parent

# Find bundle root
$BundleRoot = $ScriptDir
if (-not (Test-Path (Join-Path $BundleRoot "msix")) -and (Test-Path (Join-Path (Split-Path $BundleRoot -Parent) "msix"))) {
    $BundleRoot = Split-Path $BundleRoot -Parent
}
$MsixDir = Join-Path $BundleRoot "msix"
$TemplatesDir = Join-Path $BundleRoot "templates"
$PluginDir = Join-Path $BundleRoot "plugin"

# ============================================================================
# Step 0: Clean up previous installations
# ============================================================================
Write-Host "[0/4] Cleaning up previous installations..." -ForegroundColor Cyan

# Remove legacy .winui3-agent directory and its PATH entry
$legacyDir = Join-Path $env:USERPROFILE ".winui3-agent"
if (Test-Path $legacyDir) {
    Remove-Item $legacyDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Removed legacy .winui3-agent directory" -ForegroundColor Green
}

# Remove legacy exe-based tools directory
if (Test-Path $LegacyToolsTarget) {
    Remove-Item $LegacyToolsTarget -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Removed legacy exe-based tools" -ForegroundColor Green
}

# Remove legacy NuGet sources (only if dotnet is available)
$hasDotnet = $false
try { $null = Get-Command dotnet -ErrorAction Stop; $hasDotnet = $true } catch { }
if ($hasDotnet) {
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $existingSources = dotnet nuget list source 2>&1 | Out-String
        foreach ($sourceName in @("WinApp-Dev", "WinAppCLI-Local")) {
            if ($existingSources -match $sourceName) {
                dotnet nuget remove source $sourceName 2>&1 | Out-Null
                Write-Host "  [OK] Removed legacy NuGet source '$sourceName'" -ForegroundColor Green
            }
        }
    } catch { }
    $ErrorActionPreference = $prevEAP
}

# Remove legacy PATH entries (exe-based tools dirs)
$userPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
if ($userPath) {
    $legacyToolsDir = Join-Path $env:USERPROFILE ".winui3-agent\tools"
    $parts = $userPath -split ";" | Where-Object {
        $_ -ne "" -and
        $_ -ne $LegacyToolsTarget -and
        $_ -ne $legacyToolsDir
    }
    $cleanPath = $parts -join ";"
    if ($cleanPath -ne $userPath) {
        [Environment]::SetEnvironmentVariable("PATH", $cleanPath, [EnvironmentVariableTarget]::User)
        Write-Host "  [OK] Cleaned legacy PATH entries" -ForegroundColor Green
    }
}

# Uninstall existing Copilot plugin (will be reinstalled)
$copilotAvailable = $false
try { $null = Get-Command copilot -ErrorAction Stop; $copilotAvailable = $true } catch { }
if ($copilotAvailable) {
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $pluginList = & copilot plugin list 2>&1
        if ($pluginList -match "win-dev-skills") {
            & copilot plugin uninstall win-dev-skills 2>&1 | Out-Null
            Write-Host "  [OK] Removed previous Copilot plugin" -ForegroundColor Green
        }
    } catch { }
    $ErrorActionPreference = $prevEAP
}
}

Write-Host ""

# ============================================================================
# Step 1: Install WinApp CLI via MSIX
# ============================================================================
Write-Host "[1/4] Installing WinApp CLI (MSIX)..." -ForegroundColor Cyan

if (Test-Path $MsixDir) {
    $msixInstallScript = Join-Path $MsixDir "install.ps1"
    if (Test-Path $msixInstallScript) {
        Write-Host "  Launching MSIX installer (may request admin elevation)..." -ForegroundColor Gray
        & $msixInstallScript
        # The MSIX script may self-elevate into a separate admin window.
        # Check if winapp is now available; if not, wait for the user.
        if (-not (Get-Command winapp -ErrorAction SilentlyContinue)) {
            Write-Host ""
            Write-Host "  If an elevated installer window opened, wait for it to finish." -ForegroundColor Yellow
            Read-Host "  Press Enter when the MSIX installation is complete"
        }
        if (Get-Command winapp -ErrorAction SilentlyContinue) {
            Write-Host "[OK] WinApp CLI installed via MSIX" -ForegroundColor Green
        } else {
            Write-Host "[WARN] winapp command not found yet - you may need to open a new terminal" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARN] MSIX install script not found at: $msixInstallScript" -ForegroundColor Yellow
        Write-Host "  You can install manually by double-clicking the .msix file in $MsixDir" -ForegroundColor Gray
    }
} else {
    Write-Host "[SKIP] MSIX directory not found in bundle" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# Step 2: Install WinUI 3 project templates
# ============================================================================
Write-Host "[2/4] Installing WinUI 3 project templates..." -ForegroundColor Cyan

$dotnetAvailable = $false
try { $null = Get-Command dotnet -ErrorAction Stop; $dotnetAvailable = $true } catch { }

if ($dotnetAvailable -and (Test-Path $TemplatesDir)) {
    $nupkgFile = Get-ChildItem -Path $TemplatesDir -Filter "*.nupkg" | Select-Object -First 1
    if ($nupkgFile) {
        Write-Host "  Installing: $($nupkgFile.Name)" -ForegroundColor Gray
        $absNupkg = (Resolve-Path $nupkgFile.FullName).Path
        $prevPref = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        # Uninstall any existing version first to avoid duplicates
        dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates 2>&1 | Out-Null
        $installResult = dotnet new install $absNupkg --force 2>&1
        $ErrorActionPreference = $prevPref
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] WinUI 3 templates installed (dotnet new winui)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Template install failed (exit code $LASTEXITCODE)" -ForegroundColor Yellow
            $installResult | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        }
    } else {
        Write-Host "[SKIP] No .nupkg file found in $TemplatesDir" -ForegroundColor Yellow
    }
} elseif (-not $dotnetAvailable) {
    Write-Host "  .NET SDK not found." -ForegroundColor Yellow
    $installDotnet = Read-Host "  Install .NET 10 SDK via winget? (Y/N)"
    if ($installDotnet -eq 'Y' -or $installDotnet -eq 'y') {
        Write-Host "  Installing .NET 10 SDK..." -ForegroundColor Gray
        try {
            winget install Microsoft.DotNet.SDK.10 --source winget --accept-package-agreements --accept-source-agreements 2>$null
        } catch { }
        # Refresh PATH so dotnet is available
        $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        try { $null = Get-Command dotnet -ErrorAction Stop; $dotnetAvailable = $true } catch { }
        if ($dotnetAvailable -and (Test-Path $TemplatesDir)) {
            $nupkgFile = Get-ChildItem -Path $TemplatesDir -Filter "*.nupkg" | Select-Object -First 1
            if ($nupkgFile) {
                Write-Host "  Installing templates: $($nupkgFile.Name)" -ForegroundColor Gray
                $absNupkg = (Resolve-Path $nupkgFile.FullName).Path
                $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates 2>&1 | Out-Null
                $installResult = dotnet new install $absNupkg --force 2>&1
                $ErrorActionPreference = $prevEAP
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "[OK] WinUI 3 templates installed" -ForegroundColor Green
                } else {
                    Write-Host "[WARN] Template install failed (exit code $LASTEXITCODE)" -ForegroundColor Yellow
                }
            }
        } elseif (-not $dotnetAvailable) {
            Write-Host "[WARN] dotnet still not found - open a new terminal and re-run" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[SKIP] Install .NET 10 SDK manually: winget install Microsoft.DotNet.SDK.10" -ForegroundColor Yellow
    }
} else {
    Write-Host "[SKIP] Templates directory not found in bundle" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# Step 3: Install Copilot CLI plugin
# ============================================================================
Write-Host "[3/4] Installing Copilot CLI plugin..." -ForegroundColor Cyan

$copilotAvailable = $false
try { $null = Get-Command copilot -ErrorAction Stop; $copilotAvailable = $true } catch { }

if (-not $copilotAvailable) {
    $installResponse = Read-Host "  Copilot CLI not found. Install via winget? (Y/N)"
    if ($installResponse -eq 'Y' -or $installResponse -eq 'y') {
        winget install --id GitHub.Copilot --source winget --accept-package-agreements --accept-source-agreements 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        try { $null = Get-Command copilot -ErrorAction Stop; $copilotAvailable = $true } catch { }
    }
}

if ($copilotAvailable -and (Test-Path $PluginDir)) {
    $absPluginDir = (Resolve-Path $PluginDir).Path
    $prevEAP = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $installOutput = & copilot plugin install $absPluginDir 2>&1
    $ErrorActionPreference = $prevEAP
    Write-Host "  $installOutput" -ForegroundColor Gray
    Write-Host "[OK] Copilot CLI plugin installed" -ForegroundColor Green
} elseif (-not (Test-Path $PluginDir)) {
    Write-Host "[SKIP] Plugin directory not found" -ForegroundColor Yellow
} else {
    Write-Host "[SKIP] Install Copilot CLI first, then run: copilot plugin install `"$PluginDir`"" -ForegroundColor Yellow
}
Write-Host ""

# ============================================================================
# Step 4: Place uninstall scripts in ~/.win-dev-skills/
# ============================================================================
Write-Host "[4/4] Placing uninstall scripts..." -ForegroundColor Cyan

if (-not (Test-Path $AgentDir)) {
    New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null
}

# Copy install.ps1 (which contains the -Uninstall logic) to ~/.win-dev-skills/
$uninstallTarget = Join-Path $AgentDir "uninstall.ps1"
Copy-Item $PSCommandPath $uninstallTarget -Force

# Generate uninstall.cmd for easy double-click uninstall
$uninstallCmdContent = @"
@echo off
echo.
echo ================================================
echo  Windows Development Skills - Uninstall
echo ================================================
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" -Uninstall
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Uninstall completed.
) else (
    echo.
    echo Uninstall encountered an error.
)
echo.
pause
"@
Set-Content -Path (Join-Path $AgentDir "uninstall.cmd") -Value $uninstallCmdContent -NoNewline
Write-Host "[OK] Uninstall scripts placed in $AgentDir" -ForegroundColor Green
Write-Host ""

# ============================================================================
# Summary
# ============================================================================
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
if (Get-Command winapp -ErrorAction SilentlyContinue) {
    Write-Host "    [x] WinApp CLI" -ForegroundColor Green
} else {
    Write-Host "    [!] WinApp CLI - check MSIX install above" -ForegroundColor Yellow
}
if ($copilotAvailable) {
    Write-Host "    [x] Copilot CLI plugin - run 'copilot' to start" -ForegroundColor Green
} else {
    Write-Host "    [ ] Copilot CLI - install it, then re-run" -ForegroundColor Yellow
}

# Check for Developer Mode
$devMode = $false
$regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
try {
    $val = Get-ItemProperty $regPath -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
    if ($val.AllowDevelopmentWithoutDevLicense -eq 1) { $devMode = $true }
} catch { }

if ($devMode) {
    Write-Host "    [x] Developer Mode" -ForegroundColor Green
} else {
    Write-Host "    [!] Developer Mode not enabled" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Developer Mode is required to deploy and run WinUI 3 apps." -ForegroundColor Yellow
    $enableDev = Read-Host "  Enable Developer Mode now? (Y/N)"
    if ($enableDev -eq 'Y' -or $enableDev -eq 'y') {
        try {
            Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", "if (-not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock')) { New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Force | Out-Null }; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name AllowDevelopmentWithoutDevLicense -Value 1 -Type DWord"
            Write-Host "    [x] Developer Mode enabled" -ForegroundColor Green
        } catch {
            Write-Host "    [!] Elevation cancelled or failed" -ForegroundColor Yellow
            Write-Host "    Enable manually: Settings > System > For developers > Developer Mode" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    Enable it later: Settings > System > For developers > Developer Mode" -ForegroundColor Gray
    }
}

# Check for Visual Studio with WinUI/Desktop workload
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVsWithWinUI = $false
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath 2>$null
    if ($vsPath -and (Test-Path (Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"))) {
        $hasVsWithWinUI = $true
        Write-Host "    [x] Visual Studio with MSBuild" -ForegroundColor Green
    }
}
if (-not $hasVsWithWinUI) {
    Write-Host "    [!] Visual Studio not detected" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Recommendation: Install Visual Studio with the WinUI workload" -ForegroundColor Yellow
    Write-Host "  for the best WinUI 3 development experience." -ForegroundColor Yellow
    Write-Host "  The agent can build with 'dotnet build' without VS, but" -ForegroundColor Yellow
    Write-Host "  MSBuild from VS produces XAML compiler diagnostics." -ForegroundColor Yellow
    Write-Host "  This is temporary - future WinAppSDK update will improve this." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Run: copilot" -ForegroundColor Cyan
Write-Host ""
