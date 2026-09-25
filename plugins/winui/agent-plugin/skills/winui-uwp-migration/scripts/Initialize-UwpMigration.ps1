<#
.SYNOPSIS
Mandatory bootstrap for UWP → WinUI 3 migration. Run BEFORE any manual edit.

.DESCRIPTION
Copies UWP source into a WinUI 3 scaffold, rewrites namespaces, injects TODO markers for unsupported APIs, and generates MIGRATION-MAPPING.md. See SKILL.md for the full workflow; run Validate-UwpMigration.ps1 after migration is complete.

.PARAMETER Source
UWP project's C# source folder (contains the .csproj and Package.appxmanifest).

.PARAMETER Target
Scaffolded WinUI 3 target project root (produced by `winapp new --name <Name> --template winui-mvvm --template-version latest --use-defaults`).

.EXAMPLE
.\Initialize-UwpMigration.ps1 -Source "C:\src\UwpSample\cs" -Target "C:\out\MyWinUI3App"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Target
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string]$p) {
    return (Resolve-Path -LiteralPath $p).ProviderPath
}

if (-not (Test-Path -LiteralPath $Source)) { throw "Source not found: $Source" }
if (-not (Test-Path -LiteralPath $Target)) { throw "Target not found: $Target (first run 'winapp new --name <Name> --template winui-mvvm --template-version latest --use-defaults')" }

$Source = Resolve-FullPath $Source
$Target = Resolve-FullPath $Target

function Test-PathWithin([string]$Path, [string]$Root) {
    $rootWithSeparator = $Root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    return $Path.Equals($Root, [System.StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePointOnPath([string]$Path, [string]$Description) {
    $cursor = [System.IO.Path]::GetFullPath($Path)
    while (-not (Test-Path -LiteralPath $cursor)) {
        $parent = [System.IO.Path]::GetDirectoryName($cursor)
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    while ($cursor -and (Test-Path -LiteralPath $cursor)) {
        $item = Get-Item -LiteralPath $cursor -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "$Description traverses reparse point '$($item.FullName)'. Junctions and symbolic links are not accepted for bootstrap containment."
        }
        $parent = [System.IO.Path]::GetDirectoryName($item.FullName)
        if (-not $parent -or $parent -eq $item.FullName) { break }
        $cursor = $parent
    }
}

function Assert-NoReparsePointsInTree([string]$Root, [string]$Description) {
    Assert-NoReparsePointOnPath $Root $Description
    $reparsePoint = Get-ChildItem -LiteralPath $Root -Force -Recurse -ErrorAction Stop |
        Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } |
        Select-Object -First 1
    if ($reparsePoint) {
        throw "$Description contains reparse point '$($reparsePoint.FullName)'. Refusing bootstrap before any writes."
    }
}

Assert-NoReparsePointsInTree $Source 'Source'
Assert-NoReparsePointsInTree $Target 'Target'

if ((Test-PathWithin $Source $Target) -or (Test-PathWithin $Target $Source)) {
    throw "Source and Target must be separate, non-overlapping directories. Source='$Source'; Target='$Target'."
}

$initializationArtifacts = @('.bootstrap-meta.json', 'MIGRATION-MAPPING.md', 'MIGRATION-DEFERRED.md', '.uwp-source')
foreach ($artifact in $initializationArtifacts) {
    if (Test-Path -LiteralPath (Join-Path $Target $artifact)) {
        throw "Target is already initialized ('$artifact' exists). Refusing to overwrite migration work; use a fresh WinUI 3 scaffold."
    }
}

Write-Host "==> Initialize-UwpMigration"
Write-Host "    Source : $Source"
Write-Host "    Target : $Target"

# ─── 1. Build and execute a bounded import plan ────────────────────────────────
$patterns = @(
    '.xaml', '.cs', '.resw', '.resjson',
    '.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif'
)
$excludedImportPattern = '(^|[\\/])(bin|obj|\.git)([\\/]|$)'
$sharedDir = Join-Path (Split-Path -Parent $Source) 'shared'
$sharedSourcePath = $null
$sharedCopiedCount = 0
if (Test-Path -LiteralPath $sharedDir -PathType Container) {
    $sharedSourcePath = (Resolve-Path -LiteralPath $sharedDir).ProviderPath
    Assert-NoReparsePointsInTree $sharedSourcePath 'Sibling shared source'
}

$sharedContentDir = $null
$probe = Split-Path -Parent $Source
for ($i = 0; $i -lt 4; $i++) {
    $candidate = Join-Path $probe 'SharedContent'
    if (Test-Path -LiteralPath (Join-Path $candidate 'xaml\Styles.xaml')) {
        $sharedContentDir = $candidate
        break
    }
    $probe = Split-Path -Parent $probe
    if (-not $probe) { break }
}

$allowedImportRoots = @($Source, (Split-Path -Parent $Source))
if ($sharedSourcePath) { $allowedImportRoots += $sharedSourcePath }
if ($sharedContentDir) { $allowedImportRoots += (Resolve-FullPath $sharedContentDir) }
if ($sharedContentDir) { Assert-NoReparsePointsInTree $sharedContentDir 'SharedContent source' }
$copyPlan = @{}
$unresolvedProjectItems = New-Object System.Collections.Generic.List[object]
$projectItemRegistrations = New-Object System.Collections.Generic.List[object]

function Add-ImportCandidate {
    param([string]$InputPath, [string]$TargetRelativePath, [string]$Origin, [int]$Priority)
    if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) { return $false }
    $inputFull = (Resolve-Path -LiteralPath $InputPath).ProviderPath
    Assert-NoReparsePointOnPath $inputFull 'Import source'
    if ($inputFull -match $excludedImportPattern) { return $false }
    if (Test-PathWithin $inputFull $Target) { return $false }
    $insideAllowedRoot = $false
    foreach ($root in $allowedImportRoots) {
        if (Test-PathWithin $inputFull $root) { $insideAllowedRoot = $true; break }
    }
    if (-not $insideAllowedRoot) { return $false }

    $targetFull = [System.IO.Path]::GetFullPath((Join-Path $Target $TargetRelativePath))
    Assert-NoReparsePointOnPath $targetFull 'Import destination'
    if (-not (Test-PathWithin $targetFull $Target)) { return $false }
    $rel = [System.IO.Path]::GetRelativePath($Target, $targetFull)
    if ($rel -match $excludedImportPattern) { return $false }
    $key = $rel.ToLowerInvariant()
    if (-not $copyPlan.ContainsKey($key) -or $Priority -gt $copyPlan[$key].Priority) {
        $copyPlan[$key] = [PSCustomObject]@{
            SourcePath = $inputFull
            RelativePath = $rel
            Origin = $Origin
            Priority = $Priority
        }
    }
    return $true
}

Get-ChildItem -Path $Source -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $relative = [System.IO.Path]::GetRelativePath($Source, $_.FullName)
        $_.FullName -notmatch $excludedImportPattern -and
        (($patterns -contains [System.IO.Path]::GetExtension($_.Name).ToLowerInvariant()) -or
            $relative -match '(^|[\\/])Assets([\\/]|$)')
    } | ForEach-Object {
        [void](Add-ImportCandidate $_.FullName ([System.IO.Path]::GetRelativePath($Source, $_.FullName)) 'source-discovery' 30)
    }

if ($sharedSourcePath) {
    Get-ChildItem -Path $sharedSourcePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $relative = [System.IO.Path]::GetRelativePath($sharedSourcePath, $_.FullName)
            $_.FullName -notmatch $excludedImportPattern -and
            (($patterns -contains [System.IO.Path]::GetExtension($_.Name).ToLowerInvariant()) -or
                $relative -match '(^|[\\/])Assets([\\/]|$)')
        } | ForEach-Object {
            [void](Add-ImportCandidate $_.FullName ([System.IO.Path]::GetRelativePath($sharedSourcePath, $_.FullName)) 'sibling-shared' 20)
        }
}

# Explicit MSBuild items are authoritative and may include runtime files whose extensions
# are not in the discovery list. Link controls their destination in the target.
$uwpCsprojs = Get-ChildItem -Path $Source -Filter '*.csproj' -File -ErrorAction SilentlyContinue
$explicitInputPaths = @{}
foreach ($project in $uwpCsprojs) {
    try {
        [xml]$projectXml = [System.IO.File]::ReadAllText($project.FullName)
        $itemNodes = $projectXml.SelectNodes("//*[local-name()='Compile' or local-name()='Page' or local-name()='Content' or local-name()='Resource' or local-name()='None']")
        foreach ($item in $itemNodes) {
            $spec = if ($item.Include) { [string]$item.Include } elseif ($item.Update) { [string]$item.Update } else { $null }
            if (-not $spec) { continue }
            foreach ($itemSpec in ($spec -split ';')) {
                if ($itemSpec -match '\$\(|@\(|%\(|[*?]') {
                    [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = $item.LocalName; include = $itemSpec; reason = 'unsupported MSBuild expression or wildcard' })
                    continue
                }
                $input = [System.IO.Path]::GetFullPath((Join-Path $project.DirectoryName $itemSpec))
                $linkNode = $item.SelectSingleNode("*[local-name()='Link']")
                $link = if ($linkNode) { [string]$linkNode.InnerText } else { $null }
                if ($link -and $link -match '\$\(|@\(|%\(|[*?]') {
                    [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = $item.LocalName; include = $itemSpec; link = $link; reason = 'unsupported Link expression or wildcard' })
                    continue
                }
                if (-not (Test-Path -LiteralPath $input -PathType Leaf)) {
                    [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = $item.LocalName; include = $itemSpec; reason = 'referenced file was not found' })
                    continue
                }
                $bounded = $false
                foreach ($root in $allowedImportRoots) { if (Test-PathWithin $input $root) { $bounded = $true; break } }
                if (-not $bounded) {
                    [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = $item.LocalName; include = $itemSpec; reason = 'referenced file is outside bounded import roots' })
                    continue
                }
                $destination = $link
                if (-not $destination) {
                    if (Test-PathWithin $input $Source) {
                        $destination = [System.IO.Path]::GetRelativePath($Source, $input)
                    } else {
                        $matchedRoot = $allowedImportRoots | Where-Object { Test-PathWithin $input $_ } | Select-Object -First 1
                        $destination = [System.IO.Path]::GetRelativePath($matchedRoot, $input)
                    }
                }
                if (Add-ImportCandidate $input $destination "project-$($item.LocalName)" 40) {
                    $explicitInputPaths[$input] = $true
                    $copyOutputNode = $item.SelectSingleNode("*[local-name()='CopyToOutputDirectory']")
                    $copyPublishNode = $item.SelectSingleNode("*[local-name()='CopyToPublishDirectory']")
                    if (($item.LocalName -eq 'Content' -and $destination -notmatch '(^|[\\/])Assets([\\/]|$)') -or
                        $copyOutputNode -or $copyPublishNode) {
                        [void]$projectItemRegistrations.Add([ordered]@{
                            itemType = [string]$item.LocalName
                            targetPath = [string]$destination
                            isAssetsPath = [bool]($destination -match '(^|[\\/])Assets([\\/]|$)')
                            copyToOutputDirectory = if ($copyOutputNode) { [string]$copyOutputNode.InnerText } else { $null }
                            copyToPublishDirectory = if ($copyPublishNode) { [string]$copyPublishNode.InnerText } else { $null }
                        })
                    }
                } else {
                    [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = $item.LocalName; include = $itemSpec; link = $link; reason = 'unsafe destination or excluded path' })
                }
            }
        }
    } catch {
        [void]$unresolvedProjectItems.Add([ordered]@{ project = $project.Name; itemType = 'Project'; include = $project.FullName; reason = "project XML could not be read: $($_.Exception.Message)" })
    }
}
if ($sharedContentDir) {
    [void](Add-ImportCandidate (Join-Path $sharedContentDir 'xaml\Styles.xaml') 'Styles.xaml' 'shared-content' 10)
    [void](Add-ImportCandidate (Join-Path $sharedContentDir 'cs\MainPage.xaml') 'MainPage.xaml' 'shared-content-shell' 25)
    [void](Add-ImportCandidate (Join-Path $sharedContentDir 'cs\MainPage.xaml.cs') 'MainPage.xaml.cs' 'shared-content-shell' 25)
    $mediaDir = Join-Path $sharedContentDir 'media'
    if (Test-Path -LiteralPath $mediaDir -PathType Container) {
        Get-ChildItem -Path $mediaDir -File -ErrorAction SilentlyContinue | ForEach-Object {
            [void](Add-ImportCandidate $_.FullName (Join-Path 'Assets' $_.Name) 'shared-content-asset' 10)
        }
    }
}

# Explicit Link destinations win over all convention-based fallback destinations,
# including SharedContent shell candidates added above.
foreach ($key in @($copyPlan.Keys)) {
    $planned = $copyPlan[$key]
    if ($planned.Priority -lt 40 -and $explicitInputPaths.ContainsKey($planned.SourcePath)) {
        $copyPlan.Remove($key)
    }
}

$copied = New-Object System.Collections.Generic.List[string]
$importRecords = @{}
foreach ($entry in ($copyPlan.Values | Sort-Object RelativePath)) {
    $dst = Join-Path $Target $entry.RelativePath
    $dstDir = [System.IO.Path]::GetDirectoryName($dst)
    if ($dstDir -and -not (Test-Path -LiteralPath $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $entry.SourcePath -Destination $dst -Force
    [void]$copied.Add($entry.RelativePath)
    $importRecords[$entry.RelativePath] = [ordered]@{
        sourcePath = $entry.SourcePath
        origin = $entry.Origin
        originalSha256 = (Get-FileHash -LiteralPath $entry.SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    if ($entry.Origin -eq 'sibling-shared') { $sharedCopiedCount++ }
}
Write-Host "    Imported $($copied.Count) source/project files"
if ($sharedCopiedCount -gt 0) { Write-Host "    Merged $sharedCopiedCount file(s) from sibling shared/ ($sharedSourcePath)" }

# Keep explicitly imported runtime content deployable. The WinUI template already
# handles Assets recursively, so only add non-Assets items or explicit copy metadata.
if ($projectItemRegistrations.Count -gt 0) {
    $targetProjects = @(Get-ChildItem -LiteralPath $Target -Filter '*.csproj' -File -ErrorAction SilentlyContinue)
    if ($targetProjects.Count -ne 1) {
        [void]$unresolvedProjectItems.Add([ordered]@{
            project = $null; itemType = 'TargetProject'; include = $null
            reason = "could not preserve runtime item membership because Target has $($targetProjects.Count) root .csproj files"
        })
    } else {
        [xml]$targetProjectXml = [System.IO.File]::ReadAllText($targetProjects[0].FullName)
        $projectElement = $targetProjectXml.DocumentElement
        $namespaceUri = $projectElement.NamespaceURI
        $newItemGroup = $null
        foreach ($registration in $projectItemRegistrations) {
            $normalizedTarget = $registration.targetPath.Replace('/', '\')
            $existingItem = $targetProjectXml.SelectNodes("//*[local-name()='$($registration.itemType)']") |
                Where-Object {
                    $candidateSpec = if ($_.Include) { [string]$_.Include } elseif ($_.Update) { [string]$_.Update } else { '' }
                    $candidateSpec.Replace('/', '\').Equals($normalizedTarget, [System.StringComparison]::OrdinalIgnoreCase)
                } | Select-Object -First 1
            if (-not $existingItem) {
                if (-not $newItemGroup) {
                    $newItemGroup = $targetProjectXml.CreateElement('ItemGroup', $namespaceUri)
                    [void]$projectElement.AppendChild($newItemGroup)
                }
                $existingItem = $targetProjectXml.CreateElement($registration.itemType, $namespaceUri)
                $assetsGlobExists = $registration.isAssetsPath -and @(
                    $targetProjectXml.SelectNodes("//*[local-name()='Content']") | Where-Object {
                        $_.Include -and ([string]$_.Include).Replace('/', '\') -match '(?i)^Assets\\(?:\*\*|\*\*\\\*)$'
                    }
                ).Count -gt 0
                if ($registration.itemType -eq 'None' -or $assetsGlobExists) {
                    $existingItem.SetAttribute('Update', $normalizedTarget)
                } else {
                    $existingItem.SetAttribute('Include', $normalizedTarget)
                }
                [void]$newItemGroup.AppendChild($existingItem)
            }
            foreach ($metadataName in @('CopyToOutputDirectory', 'CopyToPublishDirectory')) {
                $value = if ($metadataName -eq 'CopyToOutputDirectory') {
                    $registration.copyToOutputDirectory
                } else {
                    $registration.copyToPublishDirectory
                }
                if (-not $value) { continue }
                $metadataNode = $existingItem.SelectSingleNode("*[local-name()='$metadataName']")
                if (-not $metadataNode) {
                    $metadataNode = $targetProjectXml.CreateElement($metadataName, $namespaceUri)
                    [void]$existingItem.AppendChild($metadataNode)
                }
                $metadataNode.InnerText = $value
            }
        }
        $xmlSettings = [System.Xml.XmlWriterSettings]::new()
        $xmlSettings.Indent = $true
        $xmlSettings.Encoding = [System.Text.UTF8Encoding]::new($false)
        $writer = [System.Xml.XmlWriter]::Create($targetProjects[0].FullName, $xmlSettings)
        try { $targetProjectXml.Save($writer) } finally { $writer.Dispose() }
    }
}
foreach ($unresolved in $unresolvedProjectItems) {
    Write-Warning "Unresolved project item [$($unresolved.itemType)] '$($unresolved.include)': $($unresolved.reason)"
}

# ─── 1d. Register Styles.xaml in App.xaml MergedDictionaries ──────────────────
# If Styles.xaml is now in the project (from SharedContent or sibling shared/),
# ensure App.xaml references it so styles are available at runtime.
$stylesFile = Join-Path $Target 'Styles.xaml'
$appXamlFile = Join-Path $Target 'App.xaml'
if ((Test-Path -LiteralPath $stylesFile) -and (Test-Path -LiteralPath $appXamlFile)) {
    $appXamlContent = [System.IO.File]::ReadAllText($appXamlFile)
    if (-not $appXamlContent.Contains('Source="Styles.xaml"') -and -not $appXamlContent.Contains("Source='Styles.xaml'")) {
        # Insert into existing MergedDictionaries or create one
        if ($appXamlContent -match '<ResourceDictionary\.MergedDictionaries>') {
            $appXamlContent = $appXamlContent -replace '(<ResourceDictionary\.MergedDictionaries>)', "`$1`r`n                <ResourceDictionary Source=`"Styles.xaml`"/>"
        } elseif ($appXamlContent -match '(<Application\.Resources>\s*<ResourceDictionary>)') {
            $appXamlContent = $appXamlContent -replace '(<Application\.Resources>\s*<ResourceDictionary>)', "`$1`r`n            <ResourceDictionary.MergedDictionaries>`r`n                <ResourceDictionary Source=`"Styles.xaml`"/>`r`n            </ResourceDictionary.MergedDictionaries>"
        }
        [System.IO.File]::WriteAllText($appXamlFile, $appXamlContent)
        Write-Host "    Added Styles.xaml to App.xaml MergedDictionaries"
    }
}

# ─── 2. Preserve UWP .csproj as read-only reference ────────────────────────────
$uwpCsprojs = Get-ChildItem -Path $Source -Filter '*.csproj' -File -ErrorAction SilentlyContinue
$refDir = Join-Path $Target '.uwp-source'
if ($uwpCsprojs.Count -gt 0) {
    if (-not (Test-Path -LiteralPath $refDir)) {
        New-Item -ItemType Directory -Path $refDir -Force | Out-Null
    }
    foreach ($p in $uwpCsprojs) {
        $refName = $p.Name + '.reference'
        $dst = Join-Path $refDir $refName
        Copy-Item -LiteralPath $p.FullName -Destination $dst -Force
        Write-Host "    Preserved $($p.Name) as .uwp-source/$refName (reference only — MSBuild won't discover this extension)"
    }
} else {
    Write-Warning "    No .csproj found under Source — agent has no reference for original PackageReference list"
}

# Also preserve UWP Package.appxmanifest as reference (do NOT copy into target — scaffold already has the correct WinUI 3 manifest)
$uwpManifests = Get-ChildItem -Path $Source -Filter '*.appxmanifest' -File -ErrorAction SilentlyContinue
$uwpManifestExtensions = @()
if ($uwpManifests.Count -gt 0) {
    if (-not (Test-Path -LiteralPath $refDir)) {
        New-Item -ItemType Directory -Path $refDir -Force | Out-Null
    }
    foreach ($mf in $uwpManifests) {
        $refName = $mf.Name + '.reference'
        $dst = Join-Path $refDir $refName
        Copy-Item -LiteralPath $mf.FullName -Destination $dst -Force
        Write-Host "    Preserved $($mf.Name) as .uwp-source/$refName (reference only — scaffold manifest must not be overwritten)"

        # Detect UWP Extension declarations that need migration attention
        $mfContent = [System.IO.File]::ReadAllText($mf.FullName)
        $extMatches = [regex]::Matches($mfContent, '(?i)<(?:uap\d?:)?Extension\s+Category="([^"]+)"')
        foreach ($em in $extMatches) {
            $cat = $em.Groups[1].Value
            $uwpManifestExtensions += $cat
        }
    }
    if ($uwpManifestExtensions.Count -gt 0) {
        Write-Host "    ⚠ UWP manifest declares $($uwpManifestExtensions.Count) Extension(s): $($uwpManifestExtensions -join ', ')"
        Write-Host "      See MIGRATION-PATTERNS.md#manifest-extensions for migration guidance"
    }
}

# ─── 2b. Patch WinUI 3 .csproj RuntimeIdentifier for cross-arch F5 ─────────────
# Some scaffold versions tie RuntimeIdentifier to the host's ProcessArchitecture instead of $(Platform). On an ARM64 host VS often opens the project with solution platform x64, so PlatformTarget=x64 but RID=win-arm64 → NETSDK1083 "platform 'win-arm64' and PlatformTarget 'x64' must be compatible". Inject Platform-aware RID overrides ahead of the host-arch fallback so F5 works on any host without requiring users to switch the active platform manually. Idempotent via a marker comment.
$ridFixMarker = '<!-- arm64-f5-fix:Initialize-UwpMigration -->'
$ridLineRegex = '(?m)^(?<indent>\s*)<RuntimeIdentifier\s+Condition="''\$\(RuntimeIdentifier\)''\s*==\s*''''">win-\$\(\[System\.Runtime\.InteropServices\.RuntimeInformation\][^<]+</RuntimeIdentifier>\s*$'
$winuiCsprojs = Get-ChildItem -Path $Target -Filter '*.csproj' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' }
$csprojPatched = 0
$csprojAlreadyPatched = 0
foreach ($cp in $winuiCsprojs) {
    $body = [System.IO.File]::ReadAllText($cp.FullName)
    if ($body.Contains($ridFixMarker)) { $csprojAlreadyPatched++; continue }
    $m = [regex]::Match($body, $ridLineRegex)
    if (-not $m.Success) { continue }
    $indent = $m.Groups['indent'].Value
    $injection = @"
${indent}${ridFixMarker}
${indent}<RuntimeIdentifier Condition="'`$(RuntimeIdentifier)' == '' AND '`$(Platform)' == 'x86'">win-x86</RuntimeIdentifier>
${indent}<RuntimeIdentifier Condition="'`$(RuntimeIdentifier)' == '' AND '`$(Platform)' == 'x64'">win-x64</RuntimeIdentifier>
${indent}<RuntimeIdentifier Condition="'`$(RuntimeIdentifier)' == '' AND '`$(Platform)' == 'ARM64'">win-arm64</RuntimeIdentifier>
${indent}<RuntimeIdentifier Condition="'`$(RuntimeIdentifier)' == ''">win-`$([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString().ToLowerInvariant())</RuntimeIdentifier>
"@
    $body = $body.Substring(0, $m.Index) + $injection + $body.Substring($m.Index + $m.Length)
    [System.IO.File]::WriteAllText($cp.FullName, $body)
    $csprojPatched++
    Write-Host "    Patched RuntimeIdentifier in $($cp.Name) — F5 now works on x86/x64/ARM64 hosts"
}
if ($winuiCsprojs.Count -eq 0) {
    Write-Warning "    No WinUI 3 .csproj found at Target — first run 'winapp new --name <Name> --template winui-mvvm --template-version latest --use-defaults'"
} elseif ($csprojPatched -eq 0 -and $csprojAlreadyPatched -gt 0) {
    Write-Host "    RuntimeIdentifier already patched in $csprojAlreadyPatched .csproj file(s) — no change"
} elseif ($csprojPatched -eq 0 -and $csprojAlreadyPatched -eq 0) {
    Write-Host "    RuntimeIdentifier pattern not found in any .csproj — template likely changed; skipped"
}

# ─── 3. Namespace mass-replace: Windows.UI.Xaml → Microsoft.UI.Xaml ────────────
$excludeDirs = @('bin', 'obj', '.uwp-source', '.vs', '.git', '.github', '.copilot')
$excludePattern = '\\(' + ($excludeDirs -join '|') + ')\\'
$nsFiles = Get-ChildItem -Path $Target -Recurse -File -Include *.cs,*.xaml -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludePattern }
$nsChanged = 0
foreach ($f in $nsFiles) {
    $orig = [System.IO.File]::ReadAllText($f.FullName)
    $new = $orig -replace 'Windows\.UI\.Xaml', 'Microsoft.UI.Xaml'
    if ($new -ne $orig) {
        [System.IO.File]::WriteAllText($f.FullName, $new)
        $nsChanged++
    }
}
Write-Host "    Rewrote Windows.UI.Xaml -> Microsoft.UI.Xaml in $nsChanged of $($nsFiles.Count) .cs/.xaml files"

# Preserve navigation helpers verbatim. Their input and window APIs require adaptation,
# but replacing the class with a permissive no-op destroys working behavior and type safety.
$neutralizedFiles = @{}

# ─── 4b. Load inventory ────────────────────────────────────────────────────────
$invPath = Join-Path $PSScriptRoot 'unsupported-api-inventory.json'
$inv = $null
if (Test-Path -LiteralPath $invPath) {
    try { $inv = Get-Content -LiteralPath $invPath -Raw | ConvertFrom-Json } catch { Write-Warning "Failed to parse $invPath - skipping pre-triage" }
}

# Adaptable patterns with anchor (for TODO injection). Each entry: { name, pattern, anchor, tier }
$adaptableEntries = @()
if ($inv -and $inv.adaptable) {
    foreach ($e in $inv.adaptable) {
        if (-not $e.anchor) { continue }
        $adaptableEntries += [PSCustomObject]@{
            Name    = $e.name
            Pattern = $e.pattern
            Anchor  = $e.anchor
            Tier    = $e.tier
        }
    }
}
# Sensitive-presence patterns (mode classification only — no TODOs)
$sensitivePresenceEntries = @()
if ($inv -and $inv.sensitivePresence) {
    foreach ($e in $inv.sensitivePresence) {
        $sensitivePresenceEntries += [PSCustomObject]@{
            Name    = $e.name
            Pattern = $e.pattern
            Anchor  = $e.anchor
        }
    }
}

# ─── 4c. Per-file scan: triage + plan TODO injections + mode ──────────────────
# TODO injection rules:
#   * C# (.cs):   `// TODO[migrate-NNN]: see MIGRATION-PATTERNS.md#<anchor>` inserted on a new line ABOVE the matched line, with matching indent. Skip if the matched line is itself a single-line `//` comment. Skip if the match falls inside a string literal (heuristic: odd number of `"` characters before the match on the same line — covers the common case, not 100% complete).
#   * XAML:       `<!-- TODO[migrate-NNN]: see MIGRATION-PATTERNS.md#<anchor> -->` inserted ABOVE the matched line, only if the matched line's first non-whitespace character is `<` (element start). This avoids injecting inside multi-line attribute lists, inside CDATA, or between an opening tag's `<Element` and its `>`.
# Mode classification:
#   * Any sensitive-presence hit anywhere in the file → SEQUENTIAL.
#   * Otherwise BATCH. Mode is recorded only for files that have at least one TODO (migrate-with-adaptation); files with no TODOs don't need a mode.

$fileTriage     = @{}   # rel → @{ Label }
$fileMode       = @{}   # rel → 'BATCH' | 'SEQUENTIAL'
$fileDeferRsn   = @{}   # rel → list of anchor categories for DEFERRED.md
$fileTodoIndex  = @{}   # rel → list of @{ line; id; anchor } for todoIndex in meta.json
$todoSeq        = 0
$todoCountTotal = 0
$sensitiveFileCount = 0
$radialControllerFiles = New-Object System.Collections.Generic.List[string]

# Sort copied files for deterministic NNN numbering (exclude build artifacts)
$sortedFiles = $copied | Where-Object { $_ -notmatch '(^|\\)(bin|obj|\.uwp-source|\.vs|\.git|\.github|\.copilot)(\\|$)' } | Sort-Object

foreach ($rel in $sortedFiles) {
    $ext = [System.IO.Path]::GetExtension($rel).ToLowerInvariant()
    if ($ext -ne '.cs' -and $ext -ne '.xaml') {
        $fileTriage[$rel] = @{ Label = 'migrate-as-is' }
        continue
    }
    if (-not $inv) {
        $fileTriage[$rel] = @{ Label = 'migrate-as-is' }
        continue
    }

    $full = Join-Path $Target $rel
    if (-not (Test-Path -LiteralPath $full)) {
        $fileTriage[$rel] = @{ Label = 'migrate-as-is' }
        continue
    }
    $text = [System.IO.File]::ReadAllText($full)
    if ($text -match '\bRadialController\b|Windows\.UI\.Input\.RadialController') {
        [void]$radialControllerFiles.Add($rel)
    }

    # 1. Unsupported scan → any hit collapses the file to `defer`.
    $unsupHits = @()
    foreach ($e in $inv.unsupported) {
        if ($text -match $e.pattern) { $unsupHits += $e.name }
    }

    if ($unsupHits.Count -gt 0) {
        $fileTriage[$rel] = @{ Label = 'defer' }
        # Collect generic anchor categories from any adaptable hits the same
        # file also has — gives DEFERRED.md a meaningful (but API-name-free)
        # rationale. If there are no adaptable hits, fall back to a generic
        # "unsupported-only" tag.
        $reasonAnchors = New-Object System.Collections.Generic.HashSet[string]
        foreach ($ae in $adaptableEntries) {
            if ($text -match $ae.Pattern) { [void]$reasonAnchors.Add($ae.Anchor) }
        }
        foreach ($se in $sensitivePresenceEntries) {
            if ($text -match $se.Pattern) { [void]$reasonAnchors.Add($se.Anchor) }
        }
        if ($reasonAnchors.Count -eq 0) {
            $fileDeferRsn[$rel] = @('unsupported-only')
        } else {
            $fileDeferRsn[$rel] = @($reasonAnchors)
        }
        continue
    }

    # 2. Adaptable scan → plan TODO injections.
    $injections = @()  # list of @{ LineIndex; Anchor }
    $lines = $text -split "`r?`n"
    $isXaml = $ext -eq '.xaml'

    foreach ($ae in $adaptableEntries) {
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $line = $lines[$i]
            if ($line -notmatch $ae.Pattern) { continue }
            if ($isXaml) {
                if ($line.TrimStart() -notmatch '^<') { continue }
                # Skip if line is already a TODO marker
                if ($line.TrimStart() -match '^<!--\s*TODO\[migrate-') { continue }
            } else {
                if ($line.TrimStart() -match '^//') { continue }
                # Heuristic string-literal skip
                $mInfo = [regex]::Match($line, $ae.Pattern)
                if ($mInfo.Success) {
                    $before = $line.Substring(0, $mInfo.Index)
                    $qCount = ($before.ToCharArray() | Where-Object { $_ -eq '"' }).Count
                    if ($qCount % 2 -eq 1) { continue }
                }
            }
            $injections += [PSCustomObject]@{ LineIndex = $i; Anchor = $ae.Anchor }
        }
    }

    # Deduplicate: at most one TODO per source line, preferring the first anchor seen.
    $injections = $injections | Sort-Object LineIndex | Group-Object LineIndex | ForEach-Object {
        $_.Group | Select-Object -First 1
    }

    if (-not $injections -or @($injections).Count -eq 0) {
        $fileTriage[$rel] = @{ Label = 'migrate-as-is' }
    } else {
        $fileTriage[$rel] = @{ Label = 'migrate-with-adaptation' }

        # Apply injections from bottom to top so line indices stay stable.
        $sortedDesc = @($injections) | Sort-Object LineIndex -Descending
        $injCount = @($injections).Count
        $reservedStart = $todoSeq + 1
        $reservedEnd   = $todoSeq + $injCount
        $todoSeq = $reservedEnd

        $linesList = [System.Collections.Generic.List[string]]::new()
        $linesList.AddRange([string[]]$lines)
        $nextSeq = $reservedEnd
        foreach ($inj in $sortedDesc) {
            $indent = ''
            if ($linesList[$inj.LineIndex] -match '^(\s*)') { $indent = $matches[1] }
            $seqStr = $nextSeq.ToString('000')
            $todoText = if ($isXaml) {
                "$indent<!-- TODO[migrate-$seqStr]: see MIGRATION-PATTERNS.md#$($inj.Anchor) -->"
            } else {
                "$indent// TODO[migrate-$seqStr]: see MIGRATION-PATTERNS.md#$($inj.Anchor)"
            }
            $linesList.Insert($inj.LineIndex, $todoText)
            $nextSeq--
        }

        $newText = ($linesList -join "`r`n")
        # If the original text ended without a trailing newline preserve that;
        # otherwise keep a single trailing newline.
        if ($text -match "`r?`n$" -and -not ($newText -match "`r?`n$")) {
            $newText += "`r`n"
        }
        [System.IO.File]::WriteAllText($full, $newText)
        $todoCountTotal += $injCount

        # Build todoIndex: final 1-based line numbers for each injected TODO.
        # After bottom-to-top insertion, the k-th TODO (ascending by original
        # LineIndex) ends up at finalLine = originalLineIndex + k (0-based).
        $sortedAsc = @($injections) | Sort-Object LineIndex
        $todoEntries = @()
        for ($k = 0; $k -lt $sortedAsc.Count; $k++) {
            $finalLine = $sortedAsc[$k].LineIndex + $k + 1  # +1 for 1-based
            $seqId = ($reservedStart + $k).ToString('000')
            $todoEntries += [ordered]@{
                line   = $finalLine
                id     = "migrate-$seqId"
                anchor = $sortedAsc[$k].Anchor
            }
        }
        $fileTodoIndex[$rel] = $todoEntries

        # 3. Mode classification — sensitive presence anywhere in file.
        $sensitive = $false
        foreach ($se in $sensitivePresenceEntries) {
            if ($text -match $se.Pattern) { $sensitive = $true; break }
        }
        if ($sensitive) {
            $fileMode[$rel] = 'SEQUENTIAL'
            $sensitiveFileCount++
        } else {
            $fileMode[$rel] = 'BATCH'
        }
    }
}

# Count triage buckets for stdout
$counts = @{}
foreach ($k in $fileTriage.Keys) {
    $label = $fileTriage[$k].Label
    if (-not $counts.ContainsKey($label)) { $counts[$label] = 0 }
    $counts[$label]++
}

# ─── 5. Write MIGRATION-MAPPING.md (no Notes column) ──────────────────────────
$mappingPath = Join-Path $Target 'MIGRATION-MAPPING.md'
$mlines = New-Object System.Collections.Generic.List[string]
[void]$mlines.Add('# Migration Mapping')
[void]$mlines.Add('')
[void]$mlines.Add('Seeded by Initialize-UwpMigration.ps1. **Do not add or remove rows** during Steps 2-5;')
[void]$mlines.Add('only refine the Triage label and flip the Status. Deferred rows must also appear')
[void]$mlines.Add('in `MIGRATION-DEFERRED.md`.')
[void]$mlines.Add('')
[void]$mlines.Add('| Source file | Target file | Triage label | Status |')
[void]$mlines.Add('|---|---|---|---|')
foreach ($rel in $sortedFiles) {
    $t = $fileTriage[$rel]
    [void]$mlines.Add("| $rel | $rel | $($t.Label) | copied |")
}
# Add manifest extension warning if UWP had extensions
if ($uwpManifestExtensions.Count -gt 0) {
    [void]$mlines.Add('')
    [void]$mlines.Add('## ⚠ Manifest Extensions Requiring Migration')
    [void]$mlines.Add('')
    [void]$mlines.Add('The original UWP `Package.appxmanifest` declares the following `<Extension>` categories.')
    [void]$mlines.Add('These are **NOT** in the scaffold manifest and must be handled per MIGRATION-PATTERNS.md#manifest-extensions:')
    [void]$mlines.Add('')
    foreach ($ext in $uwpManifestExtensions) { [void]$mlines.Add("- ``$ext``") }
    [void]$mlines.Add('')
    [void]$mlines.Add('**Do NOT copy UWP extensions verbatim** — they will fail AppX registration. See the reference')
    [void]$mlines.Add("manifest at ``.uwp-source/Package.appxmanifest.reference`` for the original declarations.")
}
Set-Content -LiteralPath $mappingPath -Value $mlines -Encoding UTF8

# ─── 6. Pre-seed MIGRATION-DEFERRED.md ────────────────────────────────────────
# Generic anchor-based rationale only — never API names. The agent may extend the rationale during Step 5, but it does not need to seed any rows.
$deferredPath = Join-Path $Target 'MIGRATION-DEFERRED.md'
$dlines = New-Object System.Collections.Generic.List[string]
[void]$dlines.Add('# Deferred Files')
[void]$dlines.Add('')
[void]$dlines.Add('Files in this list have a triage label of `defer` in MIGRATION-MAPPING.md and were')
[void]$dlines.Add('skipped by Initialize-UwpMigration.ps1''s mechanical pass. Each row references one or')
[void]$dlines.Add('more MIGRATION-PATTERNS.md anchors that describe the WinUI 3 equivalent — refer to that section')
[void]$dlines.Add('(via `Get-MigrationPattern.ps1 -Anchor <id>`) before deciding the final disposition.')
[void]$dlines.Add('')
[void]$dlines.Add('| File | Anchors |')
[void]$dlines.Add('|---|---|')
$deferredKeys = @($fileDeferRsn.Keys) | Sort-Object
foreach ($rel in $deferredKeys) {
    $anchorList = ($fileDeferRsn[$rel] | Sort-Object -Unique) -join ', '
    [void]$dlines.Add("| $rel | $anchorList |")
}
if ($deferredKeys.Count -eq 0) {
    [void]$dlines.Add('| (none) | — |')
}
Set-Content -LiteralPath $deferredPath -Value $dlines -Encoding UTF8

# ─── 6b. Wire the scaffold shell to the imported entry page ───────────────────
$mainWindowXaml = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
$mainWindowCs = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml.cs' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
$navInjected = $false
$navWiringVerified = $false
$startupAdaptationRequired = @()
$entryPageClass = $null
$xamlClasses = @()
foreach ($rel in ($sortedFiles | Where-Object { $_.EndsWith('.xaml', [System.StringComparison]::OrdinalIgnoreCase) })) {
    $xamlPath = Join-Path $Target $rel
    if (-not (Test-Path -LiteralPath $xamlPath)) { continue }
    $xamlBody = [System.IO.File]::ReadAllText($xamlPath)
    $classMatch = [regex]::Match($xamlBody, 'x:Class\s*=\s*"([^"]+)"')
    if ($classMatch.Success -and $rel -notmatch '(^|\\)(App|MainWindow)\.xaml$') {
        $xamlClasses += $classMatch.Groups[1].Value
    }
}

# Prefer the source application's own startup navigation over a filename convention.
foreach ($rel in ($sortedFiles | Where-Object { $_ -match '(^|\\)App\.xaml\.cs$' })) {
    $appCode = [System.IO.File]::ReadAllText((Join-Path $Target $rel))
    $startupMatch = [regex]::Match($appCode, '\b(?:RootFrame|rootFrame|frame)\.Navigate\s*\(\s*typeof\s*\(\s*([\w.]+)\s*\)')
    if (-not $startupMatch.Success) { continue }
    $requestedType = $startupMatch.Groups[1].Value
    if ($requestedType.Contains('.')) {
        $entryPageClass = $xamlClasses | Where-Object { $_ -eq $requestedType } | Select-Object -First 1
    } else {
        $entryPageClass = $xamlClasses | Where-Object { $_ -eq $requestedType -or $_.EndsWith(".$requestedType") } | Select-Object -First 1
    }
    if ($entryPageClass) { break }
}
if (-not $entryPageClass) {
    $entryPageClass = $xamlClasses | Where-Object { $_ -eq 'MainPage' -or $_.EndsWith('.MainPage') } | Select-Object -First 1
}
if (-not $entryPageClass -and $xamlClasses.Count -eq 1) {
    $entryPageClass = $xamlClasses[0]
}

if ($entryPageClass -and $mainWindowXaml) {
    $mwXamlBody = [System.IO.File]::ReadAllText($mainWindowXaml.FullName)
    $frameMarker = '<!-- shell-frame:Initialize-UwpMigration -->'
    if (-not $mwXamlBody.Contains('x:Name="RootFrame"') -and -not $mwXamlBody.Contains($frameMarker)) {
        $emptyGridPattern = '<Grid\s+Grid\.Row="1"\s*/>'
        if ([regex]::IsMatch($mwXamlBody, $emptyGridPattern)) {
            $mwXamlBody = [regex]::Replace($mwXamlBody, $emptyGridPattern, "$frameMarker`r`n        <Frame x:Name=""RootFrame"" Grid.Row=""1"" />")
            [System.IO.File]::WriteAllText($mainWindowXaml.FullName, $mwXamlBody)
            Write-Host "    Replaced empty Grid with <Frame x:Name=""RootFrame""> in MainWindow.xaml"
        }
    } elseif ($mwXamlBody.Contains('x:Name="RootFrame"')) {
        Write-Host "    MainWindow.xaml already has RootFrame — skipped"
    }
}
if ($entryPageClass -and $mainWindowCs) {
    $mwBody = [System.IO.File]::ReadAllText($mainWindowCs.FullName)
    $navMarker = '// shell-nav:Initialize-UwpMigration'
    $deferredCall = "this.DispatcherQueue.TryEnqueue(() => RootFrame.Navigate(typeof($entryPageClass)));"
    $existingDeferredPattern = '(?:this\.)?DispatcherQueue\.TryEnqueue\s*\(\s*\(\s*\)\s*=>\s*(?:this\.)?RootFrame\.Navigate\s*\(\s*typeof\s*\(\s*[\w.]+\s*\)\s*\)\s*\)\s*;'
    $existingNavigationPattern = '(?:this\.)?RootFrame\.Navigate\s*\(\s*typeof\s*\(\s*[\w.]+\s*\)\s*\)\s*;'
    if ([regex]::IsMatch($mwBody, $existingDeferredPattern)) {
        $mwBody = [regex]::Replace($mwBody, $existingDeferredPattern, $deferredCall, 1)
        $navInjected = $true
        Write-Host "    Preserved deferred startup navigation and updated its entry page to $entryPageClass"
    } elseif ([regex]::IsMatch($mwBody, $existingNavigationPattern)) {
        $mwBody = [regex]::Replace($mwBody, $existingNavigationPattern, '', 1)
        Write-Host "    Removed existing synchronous RootFrame.Navigate template call"
    }
    if (-not $navInjected -and -not $mwBody.Contains($navMarker)) {
        $initMatch = [regex]::Match($mwBody, '(?m)([ \t]*this\.InitializeComponent\(\);|[ \t]*InitializeComponent\(\);)')
        if ($initMatch.Success) {
            $insertPos = $initMatch.Index + $initMatch.Length
            $indent = [regex]::Match($initMatch.Value, '^(\s*)').Groups[1].Value
            $navCode = "`r`n`r`n${indent}${navMarker}`r`n${indent}// Run after the constructor returns so App can assign its Window field.`r`n${indent}$deferredCall"
            $mwBody = $mwBody.Substring(0, $insertPos) + $navCode + $mwBody.Substring($insertPos)
            $navInjected = $true
            Write-Host "    Injected deferred RootFrame.Navigate(typeof($entryPageClass)) into MainWindow.xaml.cs"
        } else {
            $startupAdaptationRequired += 'MainWindow code-behind has no recognized InitializeComponent call; wire deferred startup navigation manually.'
        }
    }
    if ($navInjected) { [System.IO.File]::WriteAllText($mainWindowCs.FullName, $mwBody) }
} elseif (-not $entryPageClass) {
    if ($mainWindowCs) {
        $mwBody = [System.IO.File]::ReadAllText($mainWindowCs.FullName)
        $templateDeferredPattern = '(?:this\.)?DispatcherQueue\.TryEnqueue\s*\(\s*\(\s*\)\s*=>\s*(?:this\.)?RootFrame\.Navigate\s*\(\s*typeof\s*\(\s*MainPage\s*\)\s*\)\s*\)\s*;'
        $templateNavigationPattern = '(?:this\.)?RootFrame\.Navigate\s*\(\s*typeof\s*\(\s*MainPage\s*\)\s*\)\s*;'
        if ([regex]::IsMatch($mwBody, $templateDeferredPattern)) {
            $mwBody = [regex]::Replace(
                $mwBody,
                $templateDeferredPattern,
                '// TODO[startup-adaptation]: select the imported entry Page and navigate after App assigns its Window.',
                1
            )
            [System.IO.File]::WriteAllText($mainWindowCs.FullName, $mwBody)
        } elseif ([regex]::IsMatch($mwBody, $templateNavigationPattern)) {
            $mwBody = [regex]::Replace(
                $mwBody,
                $templateNavigationPattern,
                '// TODO[startup-adaptation]: select the imported entry Page and navigate after App assigns its Window.',
                1
            )
            [System.IO.File]::WriteAllText($mainWindowCs.FullName, $mwBody)
        }
    }
    $startupAdaptationRequired += 'No unambiguous imported entry Page was found; choose the startup Page and wire navigation manually.'
} elseif (-not $mainWindowCs) {
    $startupAdaptationRequired += 'No MainWindow.xaml.cs was found; adapt startup in the target shell manually.'
}

if ($entryPageClass -and $mainWindowXaml -and $mainWindowCs -and $navInjected) {
    $verifiedXaml = [System.IO.File]::ReadAllText($mainWindowXaml.FullName)
    $verifiedCode = [System.IO.File]::ReadAllText($mainWindowCs.FullName)
    $navWiringVerified = $xamlClasses -contains $entryPageClass -and
        $verifiedXaml.Contains('x:Name="RootFrame"') -and
        $verifiedCode.Contains("RootFrame.Navigate(typeof($entryPageClass))")
    if (-not $navWiringVerified) {
        $startupAdaptationRequired += 'MainWindow startup wiring did not pass static Frame, imported x:Class, and deferred Navigate checks; adapt it manually.'
    }
}
if ($entryPageClass -and -not $navWiringVerified -and $startupAdaptationRequired.Count -eq 0) {
    $startupAdaptationRequired += 'MainWindow startup wiring could not be verified; adapt it manually before claiming functional navigation.'
}
foreach ($startupNote in $startupAdaptationRequired) {
    Write-Warning $startupNote
}

# ─── 7. Write .bootstrap-meta.json at target root ─────────────────────────────
$metaPath = Join-Path $Target '.bootstrap-meta.json'
$perFileModeObj = [ordered]@{}
foreach ($k in ($fileMode.Keys | Sort-Object)) {
    $perFileModeObj[$k] = $fileMode[$k]
}
$todoIndexObj = [ordered]@{}
foreach ($k in ($fileTodoIndex.Keys | Sort-Object)) {
    $todoIndexObj[$k] = @($fileTodoIndex[$k])
}
$baselineRows = @()
foreach ($rel in $sortedFiles) {
    $record = $importRecords[$rel]
    $baselineRows += [ordered]@{
        sourceFile = [string]$rel
        targetFile = [string]$rel
        initialTriageLabel = [string]$fileTriage[$rel].Label
        originalSha256 = [string]$record.originalSha256
        importOrigin = [string]$record.origin
    }
}
$bootstrapComplete = $unresolvedProjectItems.Count -eq 0 -and $startupAdaptationRequired.Count -eq 0
$unresolvedItemsForMeta = @()
foreach ($unresolvedItem in $unresolvedProjectItems) { $unresolvedItemsForMeta += $unresolvedItem }
$meta = [ordered]@{
    schema              = [ordered]@{ name = 'winui-uwp-migration-bootstrap'; version = 4 }
    version             = 4
    timestamp           = (Get-Date).ToString('o')
    bootstrapComplete   = [bool]$bootstrapComplete
    sourcePath          = $Source
    sharedSourcePath    = $sharedSourcePath
    sharedMergedCount   = $sharedCopiedCount
    seededRowCount      = [int]$baselineRows.Count
    todoCount           = $todoCountTotal
    sensitiveFileCount  = $sensitiveFileCount
    deferredCount       = $deferredKeys.Count
    perFileMode         = $perFileModeObj
    todoIndex           = $todoIndexObj
    neutralizedClasses  = @()
    manifestExtensions  = @($uwpManifestExtensions)
    unresolvedProjectItems = $unresolvedItemsForMeta
    startupAdaptationRequired = @($startupAdaptationRequired)
    navigation = [ordered]@{
        entryPageClass = $entryPageClass
        wiringVerified = [bool]$navWiringVerified
    }
    adaptationGuidance = [ordered]@{
        radialController = if ($radialControllerFiles.Count -gt 0) {
            'Create the controller for the target HWND with RadialControllerInterop.CreateForWindow; adapt the marked call sites.'
        } else { $null }
    }
    baseline = [ordered]@{
        kind = 'immutable-bootstrap-input'
        mappingRows = @($baselineRows)
    }
} | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $metaPath -Value $meta -Encoding UTF8

# ─── 8. BOOTSTRAP COMPLETE summary ────────────────────────────────────────────
$labelOrder = @('migrate-as-is','migrate-with-adaptation','defer')
Write-Host ""
if ($bootstrapComplete) {
    Write-Host "=== BOOTSTRAP COMPLETE ==="
} else {
    Write-Host "=== BOOTSTRAP REQUIRES MANUAL ADAPTATION ==="
}
Write-Host "Source files copied   : $($copied.Count)"
if ($sharedSourcePath) {
    Write-Host "  shared/ merged      : $sharedCopiedCount from $sharedSourcePath"
}
Write-Host "Namespace rewrites    : $nsChanged of $($nsFiles.Count) .cs/.xaml files"
Write-Host "Csproj ARM64 RID fix  : $csprojPatched patched, $csprojAlreadyPatched already-patched"
Write-Host "Navigation helpers    : preserved for adaptation"
if ($navWiringVerified) {
    Write-Host "MainWindow navigation : seeded to imported $entryPageClass (static checks passed; runtime validation still required)"
} else {
    Write-Host "MainWindow navigation : not claimed; review startupAdaptationRequired in .bootstrap-meta.json"
}
Write-Host "Triage breakdown      :"
foreach ($lbl in $labelOrder) {
    if ($counts.ContainsKey($lbl)) {
        Write-Host ("  {0,-26} {1}" -f $lbl, $counts[$lbl])
    }
}
foreach ($lbl in ($counts.Keys | Where-Object { $labelOrder -notcontains $_ })) {
    Write-Host ("  {0,-26} {1}" -f $lbl, $counts[$lbl])
}
Write-Host "Inline TODOs injected : $todoCountTotal"
Write-Host "  SEQUENTIAL files    : $sensitiveFileCount"
Write-Host "  BATCH files         : $($fileMode.Count - $sensitiveFileCount)"
Write-Host "Artifacts:"
Write-Host "  MIGRATION-MAPPING.md       (triage labels per file)"
Write-Host "  MIGRATION-DEFERRED.md      (pre-seeded; anchors only)"
Write-Host "  .bootstrap-meta.json       (typed baseline and per-file mode, schema v4)"
Write-Host "  .uwp-source/               (original UWP .csproj.reference for reference)"
Write-Host "Next:"
Write-Host "  1. Open a TODO-bearing source file (search for TODO[migrate- )"
Write-Host "  2. Read its mode in .bootstrap-meta.json (perFileMode[<path>])"
Write-Host "  3. Resolve each TODO via: scripts/Get-MigrationPattern.ps1 -Anchor <id>"
Write-Host "  4. Work per file: resolve its related TODO anchors as one coherent batch, then build once before moving to the next file."
Write-Host "  5. End by running scripts/Validate-UwpMigration.ps1 -Target <target>"
Write-Host "=========================="
if ($radialControllerFiles.Count -gt 0) {
    Write-Host "RadialController guidance: use HWND RadialControllerInterop.CreateForWindow; do not defer the whole file."
}
