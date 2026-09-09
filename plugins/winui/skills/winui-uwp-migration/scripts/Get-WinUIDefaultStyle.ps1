# Get-WinUIDefaultStyle.ps1
# Extracts a WinUI 3 default control Style block from the WinUI SDK's generic.xaml (shipped as plain text inside the Microsoft.WindowsAppSDK.WinUI NuGet package).
#
# Use this when migrating a UWP custom <ControlTemplate> and you need to see what the WinUI 3 default for the same control looks like — so you can identify which setters in your custom Template are "demo intent" (keep) vs "incidental UWP-era default" (modernize). See MIGRATION-PATTERNS.md anchor #custom-styles.
#
# Usage examples:
#   ./Get-WinUIDefaultStyle.ps1 -StyleKey DefaultCheckBoxStyle
#   ./Get-WinUIDefaultStyle.ps1 -StyleKey DefaultButtonStyle -OutputPath C:\temp\btn.xaml
#   ./Get-WinUIDefaultStyle.ps1 -ListKeys -Filter 'CheckBox|Toggle'
#   ./Get-WinUIDefaultStyle.ps1 -StyleKey DefaultCheckBoxStyle -ProjectPath .\App.csproj
#
# Output starts with a REFERENCE-ONLY banner instructing not to paste-the-world.

[CmdletBinding(DefaultParameterSetName = 'Extract')]
param(
    [Parameter(ParameterSetName = 'Extract', Mandatory = $true, Position = 0)]
    [string]$StyleKey,

    [Parameter(ParameterSetName = 'Extract')]
    [string]$ProjectPath,

    [Parameter(ParameterSetName = 'Extract')]
    [string]$OutputPath,

    [Parameter(ParameterSetName = 'List', Mandatory = $true)]
    [switch]$ListKeys,

    [Parameter(ParameterSetName = 'List')]
    [string]$Filter
)

$ErrorActionPreference = 'Stop'

# ─── Resolve NuGet global-packages cache directory ─────────────────────────────
function Resolve-NuGetCache {
    $raw = (& dotnet nuget locals global-packages --list 2>&1 | Out-String)
    foreach ($line in $raw -split "`r?`n") {
        if ($line -match 'global-packages:\s*(.+)$') {
            return $Matches[1].Trim().TrimEnd('\', '/')
        }
    }
    throw "Could not parse 'dotnet nuget locals global-packages --list' output. Raw output:`n$raw"
}

# ─── Pick WinUI package version: project's actual version > highest cached ────
function Get-WinUIPackageVersion {
    param([string]$ProjectPath, [string]$NuGetCache)

    # Strategy 1: read project.assets.json (deterministic — matches what build resolved)
    if ($ProjectPath) {
        $resolvedProject = Resolve-Path -LiteralPath $ProjectPath -ErrorAction SilentlyContinue
        if ($resolvedProject) {
            $projDir = Split-Path -Parent $resolvedProject.Path
            $assets = Join-Path $projDir 'obj\project.assets.json'
            if (Test-Path $assets) {
                try {
                    $json = Get-Content $assets -Raw | ConvertFrom-Json
                    foreach ($prop in $json.libraries.PSObject.Properties) {
                        if ($prop.Name -like 'Microsoft.WindowsAppSDK.WinUI/*') {
                            return ($prop.Name -split '/')[1]
                        }
                    }
                } catch {
                    Write-Verbose "Could not parse project.assets.json: $_"
                }
            }
        }
    }

    # Strategy 2: highest semver in cache (numeric component ordering, ignores pre-release suffix)
    $pkgDir = Join-Path $NuGetCache 'microsoft.windowsappsdk.winui'
    if (-not (Test-Path $pkgDir)) {
        throw "Microsoft.WindowsAppSDK.WinUI not found in NuGet cache at '$pkgDir'. Run 'dotnet restore' on a project that references Microsoft.WindowsAppSDK first, or pass -ProjectPath."
    }
    $candidates = Get-ChildItem $pkgDir -Directory | ForEach-Object {
        $name = $_.Name
        $core = ($name -split '[-+]', 2)[0]
        $parts = ($core -split '\.') | ForEach-Object {
            $n = 0; [int]::TryParse($_, [ref]$n) | Out-Null; $n
        }
        # Pad to 4 components for stable sort
        while ($parts.Count -lt 4) { $parts += 0 }
        [PSCustomObject]@{
            Name = $name
            Sort = ($parts[0] * 1e12 + $parts[1] * 1e8 + $parts[2] * 1e4 + $parts[3])
        }
    }
    $highest = $candidates | Sort-Object -Property Sort -Descending | Select-Object -First 1
    if (-not $highest) {
        throw "No version subdirectories under '$pkgDir'."
    }
    return $highest.Name
}

# ─── Locate generic.xaml inside the package ────────────────────────────────────
function Get-GenericXamlPath {
    param([string]$NuGetCache, [string]$Version)
    $pkgRoot = Join-Path $NuGetCache "microsoft.windowsappsdk.winui\$Version"
    $candidates = @(
        (Join-Path $pkgRoot 'lib\native\Microsoft.UI\Themes\generic.xaml'),
        (Join-Path $pkgRoot 'lib\net6.0-windows10.0.17763.0\Microsoft.WinUI\Themes\generic.xaml')
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    throw "generic.xaml not found under '$pkgRoot'. Tried:`n  $($candidates -join "`n  ")"
}

# ─── Depth-aware extractor: walks tokens, handles comments + nested Styles ────
function Extract-StyleBlock {
    param([string]$Content, [string]$Key)

    # 1. Find the x:Key="<Key>" occurrence (supports " or ' quoting)
    $keyPattern = 'x:Key\s*=\s*["'']' + [regex]::Escape($Key) + '["'']'
    $keyMatch = [regex]::Match($Content, $keyPattern)
    if (-not $keyMatch.Success) { return $null }

    # 2. Walk backwards to find the enclosing <Style ...> tag.
    #    Skip <Style. (property element like <Style.BasedOn>) and <StyleX (different element).
    $startSearchAt = $keyMatch.Index
    $tagStart = -1
    while ($startSearchAt -ge 0) {
        $candidate = $Content.LastIndexOf('<Style', $startSearchAt)
        if ($candidate -lt 0) { break }
        $charAfter = if ($candidate + 6 -lt $Content.Length) { $Content[$candidate + 6] } else { ' ' }
        if ($charAfter -match '[\s>]') {
            $tagStart = $candidate
            break
        }
        # That was <Style.X or <StyleY — keep walking back
        $startSearchAt = $candidate - 1
    }
    if ($tagStart -lt 0) { return $null }

    # 3. Walk forward, tokenising <Style (real), </Style>, <!-- and -->.
    #    Track Style nesting depth, skipping anything inside XML comments.
    $slice = $Content.Substring($tagStart)
    $tokens = [regex]::Matches($slice, '<!--|-->|<Style(?=[\s>])|</Style>')
    $depth = 0
    $inComment = $false
    foreach ($t in $tokens) {
        $val = $t.Value
        if ($inComment) {
            if ($val -eq '-->') { $inComment = $false }
            continue
        }
        switch ($val) {
            '<!--'     { $inComment = $true }
            '</Style>' {
                $depth--
                if ($depth -eq 0) {
                    $endRel = $t.Index + 8
                    return $slice.Substring(0, $endRel)
                }
            }
            default { $depth++ }   # matched <Style with trailing space or '>'
        }
    }
    return $null
}

# ─── List all Default*Style (or any Style) keys ───────────────────────────────
function List-StyleKeys {
    param([string]$Content, [string]$Filter)
    $all = [regex]::Matches($Content, '<Style\b[^>]*?x:Key\s*=\s*["'']([^"'']+)["'']') | ForEach-Object { $_.Groups[1].Value }
    if ($Filter) {
        $all = $all | Where-Object { $_ -match $Filter }
    }
    $all | Sort-Object -Unique
}

# ─── Main ──────────────────────────────────────────────────────────────────────
$nugetCache = Resolve-NuGetCache
$version = Get-WinUIPackageVersion -ProjectPath $ProjectPath -NuGetCache $nugetCache
$genericXamlPath = Get-GenericXamlPath -NuGetCache $nugetCache -Version $version

# Always print which sources we're using (to stderr so it doesn't pollute stdout)
[Console]::Error.WriteLine("# NuGet cache       : $nugetCache")
[Console]::Error.WriteLine("# WinUI SDK version : $version")
[Console]::Error.WriteLine("# generic.xaml      : $genericXamlPath")
[Console]::Error.WriteLine("")

$content = Get-Content $genericXamlPath -Raw

if ($ListKeys) {
    $keys = List-StyleKeys -Content $content -Filter $Filter
    if (-not $keys) {
        [Console]::Error.WriteLine("# No keys match filter '$Filter'.")
        exit 0
    }
    $keys
    return
}

$block = Extract-StyleBlock -Content $content -Key $StyleKey
if (-not $block) {
    Write-Error "Style key '$StyleKey' not found in generic.xaml.`nTry: .\Get-WinUIDefaultStyle.ps1 -ListKeys -Filter '<your-control>'"
    exit 1
}

$lineCount = ([regex]::Matches($block, "`n")).Count + 1
$banner = @"
<!--
================================================================================
  REFERENCE ONLY — DO NOT PASTE THIS ENTIRE BLOCK INTO YOUR APP
================================================================================
  This is the WinUI 3 default Style for '$StyleKey'
  Source: $(Split-Path -Leaf $genericXamlPath)  (Microsoft.WindowsAppSDK.WinUI $version)
  Size  : $lineCount lines

  HOW TO USE:
    1. Read the official template to see which ThemeResource keys WinUI 3 uses
       (corner radii, brushes, glyphs, focus visuals).
    2. Compare against your custom Style. Identify which setters in YOUR style
       are demo-intent (keep) vs incidental UWP-era defaults (modernize).
    3. Make SURGICAL edits to your custom Style. Do NOT paste this whole block.

  FOR DEFAULT VISUALS WITHOUT CUSTOMIZATION:
    <Style TargetType="<Control>" BasedOn="{StaticResource $StyleKey}" />
    Override only the setters you actually need to change.
================================================================================
-->

"@

if ($OutputPath) {
    Set-Content -Path $OutputPath -Value ($banner + $block) -Encoding UTF8
    [Console]::Error.WriteLine("# Written $lineCount lines to: $OutputPath")
} else {
    Write-Output ($banner + $block)
}
