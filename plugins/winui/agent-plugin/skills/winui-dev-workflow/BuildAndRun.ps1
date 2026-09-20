<#
.SYNOPSIS
Runs a WinUI 3 project with WinApp CLI 0.6+ and the bundled analyzer.

.DESCRIPTION
WinApp CLI owns input resolution, restore, build, architecture selection,
output discovery, runtime setup, package registration, and launch. This thin
wrapper forwards its arguments unchanged, injects
Microsoft.WindowsAppSDK.Analyzers through MSBuild, and enables
--debug-output by default for attached runs.

Use WinApp's `--args "<arguments>"` form for application arguments; PowerShell
consumes an unquoted `--` delimiter when it invokes another PowerShell script.

.EXAMPLE
.\BuildAndRun.ps1
.\BuildAndRun.ps1 MyApp.csproj -c Release --arch arm64
.\BuildAndRun.ps1 . --detach --json
.\BuildAndRun.ps1 . --symbols
#>

$ErrorActionPreference = 'Stop'
$minimumWinAppVersion = [version]'0.6.0'
$arguments = @($args)

$winapp = Get-Command winapp -ErrorAction SilentlyContinue
if (-not $winapp) {
    Write-Error "WinApp CLI 0.6 or later is required. Run /winui-setup, then retry."
    exit 1
}

$installedWinAppVersion = $null
foreach ($line in @(& winapp --version 2>$null)) {
    $match = [regex]::Match(
        [string]$line,
        '^\s*v?(?<version>\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\s*$'
    )
    if ($match.Success) {
        $installedWinAppVersion = [version]$match.Groups['version'].Value
    }
}
if (-not $installedWinAppVersion) {
    Write-Error "Could not determine the WinApp CLI version. Run /winui-setup, then retry."
    exit 1
}
if ($installedWinAppVersion -lt $minimumWinAppVersion) {
    Write-Error "WinApp CLI $minimumWinAppVersion or later is required; found $installedWinAppVersion. Run /winui-setup to upgrade."
    exit 1
}

$analyzerDir = Join-Path $PSScriptRoot 'analyzer'
$analyzerDll = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers.dll'
$analyzerTargets = Join-Path $analyzerDir 'Microsoft.WindowsAppSDK.Analyzers.targets'
if (-not (Test-Path -LiteralPath $analyzerDll -PathType Leaf) -or
    -not (Test-Path -LiteralPath $analyzerTargets -PathType Leaf)) {
    Write-Error "The bundled WinUI analyzer payload is incomplete. Reinstall the winui plugin."
    exit 1
}

$valueOptions = @(
    '--manifest', '--output-appx-directory', '--args', '--exe', '--executable',
    '-c', '--configuration', '--arch', '-r', '--runtime', '-f', '--framework',
    '-p', '--property', '--project'
)
$debugSpecified = $false
$jsonOutput = $false
$noLaunch = $false
$detach = $false

function Resolve-BooleanOption {
    param(
        [System.Text.RegularExpressions.Match]$Match,
        [ref]$Index,
        [object[]]$Tokens
    )

    if ($Match.Groups['value'].Success) {
        return $Match.Groups['value'].Value -ieq 'true'
    }
    if ($Index.Value + 1 -lt $Tokens.Count -and
        [string]$Tokens[$Index.Value + 1] -match '^(?i:true|false)$') {
        $Index.Value++
        return [string]$Tokens[$Index.Value] -ieq 'true'
    }
    return $true
}

for ($i = 0; $i -lt $arguments.Count; $i++) {
    $token = [string]$arguments[$i]

    if ($token -eq '--') {
        Write-Error 'PowerShell consumes an unquoted -- delimiter for script calls. Pass application arguments with --args "<arguments>".'
        exit 1
    }

    if ($valueOptions -icontains $token) {
        if ($i + 1 -lt $arguments.Count) {
            $value = [string]$arguments[++$i]
            if ($token -in '-p', '--property' -and
                $value -match '(?i)^CustomAfterDirectoryBuildProps\s*=') {
                Write-Error "CustomAfterDirectoryBuildProps is reserved for loading the bundled WinUI analyzer."
                exit 1
            }
        }
        continue
    }

    if ($token -match '(?i)^(?:-p|--property)[:=](?<value>.*)$') {
        if ($Matches['value'] -match '(?i)^CustomAfterDirectoryBuildProps\s*=') {
            Write-Error "CustomAfterDirectoryBuildProps is reserved for loading the bundled WinUI analyzer."
            exit 1
        }
        continue
    }

    $booleanMatch = [regex]::Match($token, '(?i)^--debug-output(?:=(?<value>true|false))?$')
    if ($booleanMatch.Success) {
        $debugSpecified = $true
        [void](Resolve-BooleanOption -Match $booleanMatch -Index ([ref]$i) -Tokens $arguments)
        continue
    }
    $booleanMatch = [regex]::Match($token, '(?i)^--json(?:=(?<value>true|false))?$')
    if ($booleanMatch.Success) {
        $jsonOutput = Resolve-BooleanOption -Match $booleanMatch -Index ([ref]$i) -Tokens $arguments
        continue
    }
    $booleanMatch = [regex]::Match($token, '(?i)^--no-launch(?:=(?<value>true|false))?$')
    if ($booleanMatch.Success) {
        $noLaunch = Resolve-BooleanOption -Match $booleanMatch -Index ([ref]$i) -Tokens $arguments
        continue
    }
    $booleanMatch = [regex]::Match($token, '(?i)^--detach(?:=(?<value>true|false))?$')
    if ($booleanMatch.Success) {
        $detach = Resolve-BooleanOption -Match $booleanMatch -Index ([ref]$i) -Tokens $arguments
    }
}

$tempBuildProps = Join-Path ([System.IO.Path]::GetTempPath()) "winui-build-$([guid]::NewGuid().ToString('N')).props"
$escapedAnalyzerDll = [System.Security.SecurityElement]::Escape((Resolve-Path -LiteralPath $analyzerDll).Path)
$escapedAnalyzerTargets = [System.Security.SecurityElement]::Escape((Resolve-Path -LiteralPath $analyzerTargets).Path)
$propsContent = @"
<Project>
  <ItemGroup>
    <Analyzer Include="$escapedAnalyzerDll" />
  </ItemGroup>
  <Import Project="$escapedAnalyzerTargets" />
</Project>
"@

$runArgs = $arguments
if (-not $debugSpecified -and -not $jsonOutput -and -not $noLaunch -and -not $detach) {
    $runArgs += '--debug-output'
}

$runExitCode = 1
$previousCustomAfterProps = $env:CustomAfterDirectoryBuildProps
try {
    Set-Content -LiteralPath $tempBuildProps -Value $propsContent -Encoding utf8
    # Microsoft.Common.props accepts a semicolon-delimited import list; the .NET SDK
    # composes its own UseArtifactsOutputPath.props hook the same way.
    $env:CustomAfterDirectoryBuildProps = if ($previousCustomAfterProps) {
        "$previousCustomAfterProps;$tempBuildProps"
    } else {
        $tempBuildProps
    }
    & winapp run @runArgs
    $runExitCode = $LASTEXITCODE
}
finally {
    if ($null -eq $previousCustomAfterProps) {
        Remove-Item Env:\CustomAfterDirectoryBuildProps -ErrorAction SilentlyContinue
    } else {
        $env:CustomAfterDirectoryBuildProps = $previousCustomAfterProps
    }
    Remove-Item -LiteralPath $tempBuildProps -Force -ErrorAction SilentlyContinue
}

exit $runExitCode
