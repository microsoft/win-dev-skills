---
name: winui-setup
description: "Install and verify the prerequisites the win-dev-skills WinUI 3 toolchain depends on — .NET SDK 8.0.100+, WinApp CLI 0.6+, and Developer Mode. Use only when the user explicitly asks to set up or repair the toolchain. Do not invoke automatically when another skill reports a missing prerequisite; tell the user what is missing and ask them to invoke this skill."
---

### Purpose

Install and verify the prerequisites every other `winui-*` skill assumes. WinApp CLI 0.6 owns WinUI template discovery and installation through `winapp new`; **do not install the template pack separately**.

> [!IMPORTANT]
> Run this skill only when the user explicitly asks to set up or repair the toolchain. If it is loaded without an explicit request, do not run checks or installations; explain what the skill changes and wait for confirmation.

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

Run the version detection again. If the result is still below `0.6.0`, report the actual version and mark setup failed; do not continue with old command fallbacks.

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
```

You're ready. If the current harness exposes the `winui-dev` orchestrator agent,
start a fresh session with that agent and ask it to build a WinUI app. Otherwise,
start a fresh session in the current harness and ask it to perform the WinUI task;
it will load the relevant `winui-*` skills on demand.

For GitHub Copilot CLI, for example:

    copilot --agent winui:winui-dev -p "build me a WinUI 3 markdown editor"

### Things to NOT do

- Do not install Visual Studio; these skills build and run with `dotnet` and `winapp`.
- Do not install or upgrade the user's AI coding harness; this skill manages Windows/WinUI development prerequisites only.
- Do not install the WinUI template pack separately; `winapp new` owns it in 0.6+.
- Do not elevate the entire session; only the Developer Mode registry write needs admin.
- Do not skip the PATH refresh after a winget install or upgrade.
- Do not trigger UAC without asking the user first.
- Do not silently retry failed installs or accept WinApp CLI below 0.6.0.
- Do not install .NET 10 when any SDK at or above 8.0.100 is already available.
