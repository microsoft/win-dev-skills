<#
.SYNOPSIS
Mandatory bootstrap for UWP → WinUI 3 migration. Run BEFORE any manual edit.

.DESCRIPTION
Copies UWP source into a WinUI 3 scaffold, rewrites namespaces, injects TODO markers for unsupported APIs, and generates MIGRATION-MAPPING.md. See SKILL.md for the full workflow; run Validate-UwpMigration.ps1 after migration is complete.

.PARAMETER Source
UWP project's C# source folder (contains the .csproj and Package.appxmanifest).

.PARAMETER Target
Scaffolded WinUI 3 target project root (e.g. produced by `dotnet new winui`).

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
if (-not (Test-Path -LiteralPath $Target)) { throw "Target not found: $Target (scaffold the WinUI 3 project first with 'dotnet new winui')" }

$Source = Resolve-FullPath $Source
$Target = Resolve-FullPath $Target

Write-Host "==> Initialize-UwpMigration"
Write-Host "    Source : $Source"
Write-Host "    Target : $Target"

# ─── 1. Copy source files (everything except .csproj) ──────────────────────────
$patterns = @(
    '.xaml', '.cs', '.resw', '.resjson',
    '.png', '.jpg', '.jpeg', '.svg', '.ico', '.gif'
)

$copied = New-Object System.Collections.Generic.List[string]

Get-ChildItem -Path $Source -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
    $name = $_.Name.ToLowerInvariant()
    $match = $false
    foreach ($ext in $patterns) {
        if ($name.EndsWith($ext)) { $match = $true; break }
    }
    $match
} | ForEach-Object {
    $rel = [System.IO.Path]::GetRelativePath($Source, $_.FullName)
    $dst = Join-Path $Target $rel
    $dstDir = [System.IO.Path]::GetDirectoryName($dst)
    if (-not (Test-Path -LiteralPath $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
    [void]$copied.Add($rel)
}

Write-Host "    Copied $($copied.Count) source files"

# ─── 1b. Merge sibling shared/ folder (cross-language SDK Sample layout) ───────
# UWP SDK Samples that support multiple languages (cs/cpp/vb) place all .xaml files in `<sample>\shared\`, with the cs csproj referencing them via `<Page Include="..\shared\X.xaml" />`. When -Source is `<sample>\cs\`, those .xaml files are otherwise invisible to namespace rewrite, inventory scan, and TODO injection — silently no-op'ing every XAML inventory entry (hit-test, custom-styles, etc.) on these samples.
#
# Fix: detect a sibling `shared\` directory and flat-copy its files into the WinUI 3 target root. WinUI 3 SDK-style csproj auto-globs *.xaml so no csproj Include rewrite is needed. Files already copied from cs/ take precedence on name collision (warning emitted).
$sharedDir = Join-Path (Split-Path -Parent $Source) 'shared'
$sharedSourcePath = $null
$sharedCopiedCount = 0
$sharedSkippedCollisions = @()
if (Test-Path -LiteralPath $sharedDir -PathType Container) {
    $sharedSourcePath = (Resolve-Path -LiteralPath $sharedDir).ProviderPath
    Get-ChildItem -Path $sharedSourcePath -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $name = $_.Name.ToLowerInvariant()
        $match = $false
        foreach ($ext in $patterns) {
            if ($name.EndsWith($ext)) { $match = $true; break }
        }
        $match
    } | ForEach-Object {
        $rel = [System.IO.Path]::GetRelativePath($sharedSourcePath, $_.FullName)
        $dst = Join-Path $Target $rel
        if (Test-Path -LiteralPath $dst) {
            $sharedSkippedCollisions += $rel
            return
        }
        $dstDir = [System.IO.Path]::GetDirectoryName($dst)
        if ($dstDir -and -not (Test-Path -LiteralPath $dstDir)) {
            New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
        [void]$copied.Add($rel)
        $sharedCopiedCount++
    }
    if ($sharedCopiedCount -gt 0) {
        Write-Host "    Merged $sharedCopiedCount file(s) from sibling shared/ ($sharedSourcePath)"
    }
    if ($sharedSkippedCollisions.Count -gt 0) {
        Write-Warning ("    Skipped $($sharedSkippedCollisions.Count) shared/ file(s) due to name collision with cs/: " + ($sharedSkippedCollisions -join ', '))
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
        Write-Host "      See PATTERNS.md#manifest-extensions for migration guidance"
    }
}

# ─── 2b. Patch WinUI 3 .csproj RuntimeIdentifier for cross-arch F5 ─────────────
# `dotnet new winui` ties RuntimeIdentifier to the host's ProcessArchitecture instead of $(Platform). On an ARM64 host VS often opens the project with solution platform x64, so PlatformTarget=x64 but RID=win-arm64 → NETSDK1083 "platform 'win-arm64' and PlatformTarget 'x64' must be compatible". Inject Platform-aware RID overrides ahead of the host-arch fallback so F5 works on any host without requiring users to switch the active platform manually. Idempotent via a marker comment.
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
    Write-Warning "    No WinUI 3 .csproj found at Target — did you run 'dotnet new winui -n <Name>' first?"
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

# ─── 4a. Filter-prone class neutralization ────────────────────────────────────
# Some SDK Samples boilerplate helpers contain UWP-specific patterns whose WinUI 3 equivalents require low-level Win32 keyboard interop. The model provider's content-safety filter routinely blocks model output containing those patterns and kills the trial. Replace those classes with no-op stubs *before* the agent ever sees them.
$filterProneClassNeutralizations = @(
    @{
        FilePattern  = '(^|\\)Common\\NavigationHelper\.cs$'
        ClassName    = 'RootFrameNavigationHelper'
        Reason       = 'Filter-prone: keyboard back-nav handler. WinUI 3 equivalent requires Microsoft.UI.Input keyboard-state APIs that trigger the content-safety filter. Replaced with no-op stub.'
        StubBody     = @'
        // No-op stub written by Initialize-UwpMigration.ps1.
        //
        // The original UWP implementation hooked accelerator-key activation for
        // ALT+Left/Right and BrowserBack/Forward, and pointer events for mouse
        // XButton1/XButton2. The WinUI 3 equivalent goes through low-level
        // keyboard-state APIs that the model provider's content-safety filter
        // rejects. Back-nav is not the demonstrated feature of any UWP SDK
        // sample, so we leave the field bound but make activation a no-op.
        // If you really need ALT+Left back-nav, add a single
        //   <KeyboardAccelerator Key="Left" Modifiers="Menu"/>
        // to the AppBarButton or NavigationViewItem that triggers GoBack.
'@
    }
)

function Invoke-FilterProneNeutralization {
    param(
        [string]$FullPath,
        [string]$ClassName,
        [string]$StubBody,
        [string]$Reason
    )
    if (-not (Test-Path -LiteralPath $FullPath)) { return $false }
    $text = [System.IO.File]::ReadAllText($FullPath)
    $pattern = "(?ms)((?:public\s+|internal\s+)?class\s+$([regex]::Escape($ClassName))\b[^{]*\{)"
    $m = [regex]::Match($text, $pattern)
    if (-not $m.Success) { return $false }
    $bodyStart = $m.Index + $m.Length
    $depth = 1
    $i = $bodyStart
    while ($i -lt $text.Length -and $depth -gt 0) {
        $ch = $text[$i]
        if ($ch -eq '{') { $depth++ }
        elseif ($ch -eq '}') { $depth-- }
        $i++
    }
    if ($depth -ne 0) { return $false }
    $bodyEnd = $i - 1
    $before = $text.Substring(0, $bodyStart)
    $after = $text.Substring($bodyEnd)
    $stubCtor = "        public $ClassName(params object[] args) { /* no-op; accepts any call shape */ }`r`n"
    $newText = $before + "`r`n" + $StubBody + "`r`n" + $stubCtor + "    " + $after
    [System.IO.File]::WriteAllText($FullPath, $newText)
    return $true
}

$neutralizedFiles = @{}
foreach ($n in $filterProneClassNeutralizations) {
    foreach ($rel in $copied) {
        if ($rel -notmatch $n.FilePattern) { continue }
        $full = Join-Path $Target $rel
        $ok = Invoke-FilterProneNeutralization -FullPath $full -ClassName $n.ClassName -StubBody $n.StubBody -Reason $n.Reason
        if ($ok) {
            $key = $rel
            if (-not $neutralizedFiles.ContainsKey($key)) { $neutralizedFiles[$key] = @() }
            $neutralizedFiles[$key] += $n.ClassName
            Write-Host "    Neutralized class $($n.ClassName) in $rel"
        }
    }
}

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
#   * C# (.cs):   `// TODO[migrate-NNN]: see PATTERNS.md#<anchor>` inserted on a new line ABOVE the matched line, with matching indent. Skip if the matched line is itself a single-line `//` comment. Skip if the match falls inside a string literal (heuristic: odd number of `"` characters before the match on the same line — covers the common case, not 100% complete).
#   * XAML:       `<!-- TODO[migrate-NNN]: see PATTERNS.md#<anchor> -->` inserted ABOVE the matched line, only if the matched line's first non-whitespace character is `<` (element start). This avoids injecting inside multi-line attribute lists, inside CDATA, or between an opening tag's `<Element` and its `>`.
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
                "$indent<!-- TODO[migrate-$seqStr]: see PATTERNS.md#$($inj.Anchor) -->"
            } else {
                "$indent// TODO[migrate-$seqStr]: see PATTERNS.md#$($inj.Anchor)"
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
    [void]$mlines.Add('These are **NOT** in the scaffold manifest and must be handled per PATTERNS.md#manifest-extensions:')
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
[void]$dlines.Add('more PATTERNS.md anchors that describe the WinUI 3 equivalent — refer to that section')
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

# ─── 6b. Inject RootFrame into MainWindow.xaml and Navigate into .xaml.cs ──────
# The `dotnet new winui` template provides MainWindow with an empty <Grid Grid.Row="1" />.
# Replace that empty grid with a Frame for page navigation, then inject the Navigate call.
# This is the #1 cause of blank-screen failures: agent forgets to add Frame or Navigate.
$mainWindowXaml = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
$mainWindowCs = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml.cs' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
$navInjected = $false
if ($mainWindowXaml) {
    # Step 1: Replace empty Grid with Frame in MainWindow.xaml
    $mwXamlBody = [System.IO.File]::ReadAllText($mainWindowXaml.FullName)
    $frameMarker = '<!-- shell-frame:Initialize-UwpMigration -->'
    if (-not $mwXamlBody.Contains('x:Name="RootFrame"') -and -not $mwXamlBody.Contains($frameMarker)) {
        # Replace <Grid Grid.Row="1" /> or <Grid Grid.Row="1"></Grid> with Frame
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
if ($mainWindowCs) {
    # Step 2: Inject RootFrame.Navigate(typeof(MainPage)) into MainWindow.xaml.cs
    $mainPageXaml = Get-ChildItem -Path $Target -Filter 'MainPage.xaml' -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
    if ($mainPageXaml) {
        $mpContent = [System.IO.File]::ReadAllText($mainPageXaml.FullName)
        $xClassMatch = [regex]::Match($mpContent, 'x:Class="([^"]+)"')
        $mainPageClass = if ($xClassMatch.Success) { $xClassMatch.Groups[1].Value } else { $null }
        if ($mainPageClass) {
            $mwBody = [System.IO.File]::ReadAllText($mainWindowCs.FullName)
            $navMarker = '// shell-nav:Initialize-UwpMigration'
            if (-not $mwBody.Contains($navMarker) -and -not $mwBody.Contains('RootFrame.Navigate')) {
                # Find InitializeComponent() call and inject navigation after it
                $initMatch = [regex]::Match($mwBody, '(?m)([ \t]*this\.InitializeComponent\(\);|[ \t]*InitializeComponent\(\);)')
                if ($initMatch.Success) {
                    $insertPos = $initMatch.Index + $initMatch.Length
                    $indent = [regex]::Match($initMatch.Value, '^(\s*)').Groups[1].Value
                    $navCode = "`r`n`r`n${indent}${navMarker}`r`n${indent}RootFrame.Navigate(typeof($mainPageClass));"
                    $mwBody = $mwBody.Substring(0, $insertPos) + $navCode + $mwBody.Substring($insertPos)
                    [System.IO.File]::WriteAllText($mainWindowCs.FullName, $mwBody)
                    $navInjected = $true
                    Write-Host "    Injected RootFrame.Navigate(typeof($mainPageClass)) into MainWindow.xaml.cs"
                }
            } elseif ($mwBody.Contains('RootFrame.Navigate')) {
                Write-Host "    MainWindow.xaml.cs already has RootFrame.Navigate — skipped"
            }
        }
    }
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
$meta = [ordered]@{
    version             = 3
    timestamp           = (Get-Date).ToString('o')
    sourcePath          = $Source
    sharedSourcePath    = $sharedSourcePath
    sharedMergedCount   = $sharedCopiedCount
    seededRowCount      = $copied.Count
    todoCount           = $todoCountTotal
    sensitiveFileCount  = $sensitiveFileCount
    deferredCount       = $deferredKeys.Count
    perFileMode         = $perFileModeObj
    todoIndex           = $todoIndexObj
    neutralizedClasses  = @($neutralizedFiles.Keys | Sort-Object)
    manifestExtensions  = @($uwpManifestExtensions)
} | ConvertTo-Json -Depth 6
Set-Content -LiteralPath $metaPath -Value $meta -Encoding UTF8

# ─── 8. BOOTSTRAP COMPLETE summary ────────────────────────────────────────────
$labelOrder = @('migrate-as-is','migrate-with-adaptation','defer')
Write-Host ""
Write-Host "=== BOOTSTRAP COMPLETE ==="
Write-Host "Source files copied   : $($copied.Count)"
if ($sharedSourcePath) {
    Write-Host "  shared/ merged      : $sharedCopiedCount from $sharedSourcePath"
}
Write-Host "Namespace rewrites    : $nsChanged of $($nsFiles.Count) .cs/.xaml files"
Write-Host "Csproj ARM64 RID fix  : $csprojPatched patched, $csprojAlreadyPatched already-patched"
Write-Host "Neutralized classes   : $($neutralizedFiles.Count) file(s)"
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
Write-Host "  .bootstrap-meta.json       (per-file mode, schema v2)"
Write-Host "  .uwp-source/               (original UWP .csproj.reference for reference)"
Write-Host "Next:"
Write-Host "  1. Open a TODO-bearing source file (search for TODO[migrate- )"
Write-Host "  2. Read its mode in .bootstrap-meta.json (perFileMode[<path>])"
Write-Host "  3. Resolve each TODO via: scripts/Get-MigrationPattern.ps1 -Anchor <id>"
Write-Host "  4. BATCH = fix all TODOs in file then build; SEQUENTIAL = fix one then build"
Write-Host "  5. End by running scripts/Validate-UwpMigration.ps1 -Target <target>"
Write-Host "=========================="

if ($neutralizedFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "=== NavigationHelper neutralization notice ==="
    Write-Host "The bootstrap rewrote the body of RootFrameNavigationHelper in:"
    foreach ($f in ($neutralizedFiles.Keys | Sort-Object)) {
        Write-Host "  $f"
    }
    Write-Host ""
    Write-Host "Why: that class wires ALT+Left / BrowserBack / mouse XButton1+XButton2"
    Write-Host "to frame back/forward navigation via virtual-key code reads. The model"
    Write-Host "provider's content-safety filter classifies that shape as keylogger"
    Write-Host "code and rejects the migration output."
    Write-Host ""
    Write-Host "What you do: leave the neutralized class AND its call site (typically"
    Write-Host "  new RootFrameNavigationHelper(rootFrame) in App.xaml.cs OnLaunched)"
    Write-Host "untouched. Back-nav is not a demonstrated feature of any SDK sample."
    Write-Host "The remainder of NavigationHelper.cs (the NavigationHelper class for"
    Write-Host "per-page state save/restore, LoadStateEventArgs / SaveStateEventArgs)"
    Write-Host "migrates normally — it does not trip the filter."
    Write-Host ""
    Write-Host "If you really want ALT+Left back-nav, attach a KeyboardAccelerator"
    Write-Host "to your back AppBarButton — declarative XAML does not trip the filter."
    Write-Host "============================================="
}
