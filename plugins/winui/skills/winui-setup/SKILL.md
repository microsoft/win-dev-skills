---
name: winui-setup
description: "Install and verify the prerequisites the win-dev-skills WinUI 3 toolchain depends on — .NET SDK 8.0.100+, WinApp CLI 0.6+, and Developer Mode. Use on a new machine, after a Windows reset, or when another winui skill reports that winapp/dotnet is missing or too old, or Developer Mode is off."
disable-model-invocation: true
---

### Purpose

Install and verify the prerequisites every other `winui-*` skill assumes. WinApp CLI 0.6 owns WinUI template discovery and installation through `winapp new`; **do not install the template pack separately**.

This skill is idempotent: detect everything first, install or upgrade only what is needed, and print one final summary.

### Steps

#### Detect everything

Run these checks together so the user sees the full state before anything changes:

```powershell
$minimumDotNet = [version]'8.0.100'
$minimumWinApp = [version]'0.6.0'

# .NET SDK — project-mode winapp run requires SDK 8.0.100+
$dotnetSdks = @(& dotnet --list-sdks 2>$null) | ForEach-Object {
    $text = ($_ -replace ' \[.*$','').Trim()
    $parsed = $null
    if ([version]::TryParse(($text -split '-')[0], [ref]$parsed)) { $parsed }
}
$dotnetVersion = $dotnetSdks |
    Where-Object { $_ -ge $minimumDotNet } |
    Sort-Object -Descending |
    Select-Object -First 1
$dotnetOk = $null -ne $dotnetVersion

# WinApp CLI — require 0.6+ for winapp new, find-ui, and project-mode run
$winappCmd = Get-Command winapp -ErrorAction SilentlyContinue
$winappVersion = $null
if ($winappCmd) {
    foreach ($line in @(& winapp --version 2>$null)) {
        $match = [regex]::Match(
            [string]$line,
            '^\s*v?(?<version>\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\s*$'
        )
        if ($match.Success) {
            $parsed = $null
            if ([version]::TryParse($match.Groups['version'].Value, [ref]$parsed)) {
                $winappVersion = $parsed
            }
        }
    }
}
$winappOk = $winappVersion -ge $minimumWinApp

# Developer Mode
$devModeOk = ((Get-ItemProperty `
    -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' `
    -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue
).AllowDevelopmentWithoutDevLicense) -eq 1
```

Print a one-shot status table:

```text
.NET SDK >= 8.0.100     [OK] found 10.0.100
WinApp CLI >= 0.6.0     [!] found 0.5.1 — will upgrade
Developer Mode          [X] disabled — needs admin to enable
```

#### Install what's missing

##### .NET SDK

Only when no SDK at or above `8.0.100` was found:

```powershell
winget install --id Microsoft.DotNet.SDK.10 --exact --silent --accept-package-agreements --accept-source-agreements
```

Do not install another SDK when 8.0.100+, 9.x, or 10.x is already present.

##### WinApp CLI

If `winapp` is missing, install it. If it is present but below 0.6.0, try to upgrade it. Skip both commands when the installed version already meets the minimum:

```powershell
# When winapp is missing
winget install --id Microsoft.WinAppCli --exact --silent --accept-package-agreements --accept-source-agreements

# When winapp is present but older than 0.6.0
winget upgrade --id Microsoft.WinAppCli --exact --silent --accept-package-agreements --accept-source-agreements
```

Refresh PATH after any winget install or upgrade:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')
```

Run the version detection again. **WinGet may lag a just-published WinApp CLI release.** If WinApp CLI is still below `0.6.0`, install the standalone executable from the official v0.6.0 GitHub release. The archive path avoids the MSIX package's newer OS-manifest floor:

```powershell
$releaseVersion = '0.6.0'
$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($architecture -notin 'x64', 'arm64') {
    throw "WinApp CLI supports x64 and arm64; detected $architecture."
}

$assetName = "winappcli-${architecture}.zip"
$downloadUrl = "https://github.com/microsoft/winappCli/releases/download/v$releaseVersion/$assetName"
$downloadPath = Join-Path ([System.IO.Path]::GetTempPath()) $assetName
$installRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinAppCli\$releaseVersion"
$expectedHashes = @{
    arm64 = '423d24d8d361841f78643a05c1212125bd33d85d710619c7b9819f5754061056'
    x64   = 'f6dc42e3b4e4709c8f617003008e2cfdd9a51735e04e7170d60edda258db78a8'
}
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath
    $actualHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHashes[$architecture]) {
        throw "WinApp CLI archive checksum mismatch."
    }
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Expand-Archive -LiteralPath $downloadPath -DestinationPath $installRoot -Force

    $winappExe = Get-ChildItem -LiteralPath $installRoot -Filter winapp.exe -File -Recurse |
        Select-Object -First 1
    if (-not $winappExe) {
        throw "The official archive did not contain winapp.exe."
    }

    $binPath = $winappExe.DirectoryName
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $userPathEntries = @($userPath -split ';' | Where-Object { $_ -and $_ -ine $binPath })
    if (($userPath -split ';' | Select-Object -First 1) -ine $binPath) {
        $updatedUserPath = (@($binPath) + $userPathEntries) -join ';'
        [Environment]::SetEnvironmentVariable('Path', $updatedUserPath, 'User')
    }
    $env:Path = "$binPath;$env:Path"
}
finally {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
}
```

Refresh PATH and run version detection once more. If the result is still below `0.6.0`, report the actual version and mark setup failed; do not continue with old command fallbacks.

> `winapp new` installs the official `Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` pack on demand and can update it with `--template-version latest`. Do not run `dotnet new install` during setup.

##### Developer Mode (ask first)

Developer Mode requires admin elevation. **Ask the user before triggering UAC.** Only if they agree, elevate this one operation:

```powershell
Start-Process powershell -Verb RunAs -ArgumentList @(
    '-NoProfile','-Command',
    "New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Force | Out-Null; " +
    "Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' " +
    "-Name AllowDevelopmentWithoutDevLicense -Type DWord -Value 1"
) -Wait
```

If the user declines or dismisses UAC, continue to the summary and print the command for later use.

### Final summary

Always print a single summary:

```text
==== winui-setup summary ====
.NET SDK >= 8.0.100     [>] already present (10.0.100)
WinApp CLI >= 0.6.0     [OK] upgraded to 0.6.0
Developer Mode          [OK] enabled

You're ready. Create an app with:
  winapp new --name MyApp --template winui-mvvm --template-version latest --use-defaults
```

### Things to NOT do

- Do not install Visual Studio; these skills build and run with `dotnet` and `winapp`.
- Do not install GitHub Copilot CLI; this skill is already running inside an agent harness.
- Do not install the WinUI template pack separately; `winapp new` owns it in 0.6+.
- Do not elevate the entire session; only the Developer Mode registry write needs admin.
- Do not trigger UAC without asking the user first.
- Do not silently retry failed installs or accept WinApp CLI below 0.6.0.
- Do not install .NET 10 when any SDK at or above 8.0.100 is already available.
