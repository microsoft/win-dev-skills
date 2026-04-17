# Windows Development Skills - Installation Guide

This guide covers how to install the Windows Development Skills toolkit manually. Use this if the automated `install.cmd` script doesn't work on your machine, or if you prefer to install components individually.

## What's in the Bundle

```
win-dev-skills-vX.Y.Z/
  install.cmd              # Automated installer (double-click to run)
  scripts/install.ps1      # PowerShell installer script
  msix/                    # WinApp CLI MSIX packages + installer
  templates/               # WinUI 3 project templates (.nupkg)
  plugin/                  # Copilot CLI plugin (agents + skills)
```

## Prerequisites

| Requirement | How to install |
|-------------|---------------|
| Windows 10 v1903+ | — |
| Developer Mode | Settings > System > For developers > Developer Mode: **On** |
| .NET SDK 10+ | `winget install Microsoft.DotNet.SDK.10` |
| Copilot CLI | `winget install GitHub.Copilot` |
| Visual Studio *(recommended)* | Install with **.NET Desktop Development** workload |

## Step-by-Step Manual Installation

### 1. Enable Developer Mode

Required for WinUI 3 apps to deploy and run.

**Settings > System > For developers > Developer Mode: On**

Or via PowerShell (admin):
```powershell
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f
```

### 2. Install WinApp CLI (MSIX)

The `msix/` folder contains the MSIX packages and an installer script.

**Option A — Use the included installer:**
```powershell
.\msix\install.ps1
```
This handles certificate trust and MSIX installation. Requires admin elevation for the certificate.

**Option B — Manual MSIX install:**
1. Open `msix/` folder
2. Double-click the `.msix` file matching your architecture (x64 or ARM64)
3. If you get a certificate error, install the certificate first:
   ```powershell
   # Extract and trust the signing certificate (admin required)
   $msix = "msix\winappcli_X.X.X.X_x64.msix"  # adjust filename
   $sig = Get-AuthenticodeSignature $msix
   $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPeople", "LocalMachine")
   $store.Open("ReadWrite")
   $store.Add($sig.SignerCertificate)
   $store.Close()
   # Then install
   Add-AppxPackage -Path $msix
   ```

**Verify:** Open a new terminal and run `winapp --version`

### 3. Install WinUI 3 Project Templates

The `templates/` folder contains a `.nupkg` file with WinUI 3 project templates.

```powershell
# Remove any existing version first (avoids duplicates)
dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates

# Install from the local package
dotnet new install templates\Microsoft.WindowsAppSDK.WinUI.CSharp.Templates.*.nupkg --force
```

**Verify:** `dotnet new list winui` should show templates like `winui-mvvm`, `winui-navview`, etc.

### 4. Install Copilot CLI Plugin

The `plugin/` folder contains the agents and skills.

```powershell
# Use the full absolute path to the plugin folder
copilot plugin install "C:\full\path\to\plugin"
```

> **Note:** The path must be absolute. Relative paths may not work on some Copilot CLI versions.

**Verify:** `copilot plugin list` should show `win-dev-skills`

### 5. Clean Up Previous Installations (Optional)

If you had an older version installed via the exe-based installer:

```powershell
# Remove old tools directory and PATH entry
Remove-Item "$env:USERPROFILE\.win-dev-skills\tools" -Recurse -Force -ErrorAction SilentlyContinue

# Remove old PATH entries (edit manually or run)
$path = [Environment]::GetEnvironmentVariable("PATH", "User")
$path = ($path -split ";" | Where-Object { $_ -notmatch "\.win-dev-skills\\tools|\.winui3-agent\\tools" }) -join ";"
[Environment]::SetEnvironmentVariable("PATH", $path, "User")

# Remove legacy NuGet sources
dotnet nuget remove source "WinApp-Dev" 2>$null
dotnet nuget remove source "WinAppCLI-Local" 2>$null

# Remove legacy directory
Remove-Item "$env:USERPROFILE\.winui3-agent" -Recurse -Force -ErrorAction SilentlyContinue
```

## Uninstall

```powershell
# Remove MSIX package
Get-AppxPackage | Where-Object { $_.Name -match 'winapp' } | Remove-AppxPackage

# Remove templates
dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates

# Remove Copilot plugin
copilot plugin uninstall win-dev-skills

# Remove leftover files
Remove-Item "$env:USERPROFILE\.win-dev-skills" -Recurse -Force -ErrorAction SilentlyContinue
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `install.cmd` shows "Invalid command format" | Use manual steps above instead |
| MSIX install fails with certificate error | Run `msix\install.ps1` as admin, or manually trust the cert (see step 2) |
| `dotnet new winui` shows "sequence contains more than one matching element" | Run `dotnet new uninstall Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` then reinstall |
| `copilot plugin install` fails with relative path | Use the full absolute path: `copilot plugin install "C:\full\path\to\plugin"` |
| Templates not found after install | Open a **new** terminal and retry `dotnet new list winui` |
| Developer Mode not enabled error | Settings > System > For developers > Developer Mode: On |
| App builds but won't launch | Check Developer Mode is on, run with `winapp run` not the .exe directly |
