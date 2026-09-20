<#
.SYNOPSIS
Mandatory final-validation pass for UWP -> WinUI 3 migration. Runs every mechanical check in one shot with PASS/FAIL diagnostics.

.DESCRIPTION
SKILL.md Step 4 = "run this script; if any FAIL, fix it and re-run; never declare done with FAIL." All [FAIL] output is sanitized - full diagnostics (snippets, compiler errors) go to .validator-diagnostics.txt at the target root, not to stdout, to keep concentrated API-name lists out of the agent's assistant turn.

Runs the sibling winui-dev-workflow BuildAndRun.ps1 with `--no-launch` as a required build gate, then performs a project-mode `winapp run` smoke launch when packaging and the environment support it.

Checks (numbering matches the `# --- N.` sections in the code):
1. Residue grep - leftover Windows.UI.Xaml using/xmlns, unsupported APIs not deferred, UWP-only csproj markers
1b. Adaptable regression scan - patterns that bootstrap injected TODOs for must no longer match in migrated source (else agent removed the TODO without addressing the issue). WARN tier, not FAIL - suppress per-line with a `migrate-keep` comment.
1c. Custom Setter-only Style on a built-in control must use BasedOn - else the control loses Fluent visuals entirely. WARN tier; see MIGRATION-PATTERNS.md#custom-styles-case-a.
1d. Custom ControlTemplate body must not carry UWP-era visual residue (SystemControl*Brush refs, NormalRectangle geometry). WARN tier; the message references `Get-WinUIDefaultStyle.ps1` for surgical fix-up. See MIGRATION-PATTERNS.md#custom-styles-case-b.
2. TODO[migrate-NNN] residue - every injected marker must be resolved
3. MIGRATION-MAPPING.md integrity - .bootstrap-meta.json present, row count, labels filled, no row stuck at Status=copied
4. MIGRATION-DEFERRED.md consistency - every defer row in mapping has a row here, and vice versa
5. Package.appxmanifest image refs + WinAppSDK packaging (TargetDeviceFamily=Windows.Desktop, rescap, runFullTrust)
6. BuildAndRun.ps1 healthcheck (surfaces WUI analyzer warnings for UWP-only API residue)
7. Runtime smoke launch - `winapp run --detach` + 10s alive check; catches App.MainWindow init-order races (E_POINTER)

.PARAMETER Target
Migrated WinUI 3 project root (same folder used as -Target for Initialize-UwpMigration.ps1).

.EXAMPLE
.\Validate-UwpMigration.ps1 -Target "C:\out\MyWinUI3App"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Target
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Target)) { throw "Target not found: $Target" }
$Target = (Resolve-Path -LiteralPath $Target).ProviderPath

Write-Host "==> Validate-UwpMigration"
Write-Host "    Target : $Target"
Write-Host ""

$failures = 0
$warnings = 0
$unverified = 0

function Normalize-MigrationIdentity([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    $normalized = $value.Trim().Replace('/', '\')
    while ($normalized.StartsWith('.\')) { $normalized = $normalized.Substring(2) }
    return $normalized.TrimStart('\').ToLowerInvariant()
}

function ConvertFrom-MappingRow([string]$line) {
    $columns = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    if ($columns.Count -ne 4) { return $null }
    [PSCustomObject]@{
        Source = $columns[0]
        Target = $columns[1]
        Triage = $columns[2].ToLowerInvariant()
        Status = $columns[3].ToLowerInvariant()
        Raw = $line
    }
}

function Get-ObjectProperty([object]$object, [string[]]$names) {
    if ($null -eq $object) { return $null }
    foreach ($name in $names) {
        $property = $object.PSObject.Properties[$name]
        if ($null -ne $property) { return ,$property.Value }
    }
    return $null
}

# Load the immutable bootstrap inventory before any scan uses defer exemptions.
$mapPath = Join-Path $Target 'MIGRATION-MAPPING.md'
$mapText = if (Test-Path -LiteralPath $mapPath) { Get-Content -LiteralPath $mapPath -Raw } else { '' }
$mapRows = @()
$mapMalformedRows = @()
foreach ($line in ($mapText -split "`n")) {
    if ($line -match '^\|' -and $line -notmatch '^\|\s*-+\s*\|' -and $line -notmatch '^\|\s*Source file\s*\|') {
        $row = ConvertFrom-MappingRow $line
        if ($row) { $mapRows += $row } else { $mapMalformedRows += $line }
    }
}

$meta = $null
$metaValid = $true
$baselineRows = @()
$metaPath = Join-Path $Target '.bootstrap-meta.json'
if (-not (Test-Path -LiteralPath $metaPath -PathType Leaf)) {
    Write-Host "[FAIL] .bootstrap-meta.json missing at target root"
    $failures++
    $metaValid = $false
} else {
    try {
        $metaRaw = Get-Content -LiteralPath $metaPath -Raw
        $meta = $metaRaw | ConvertFrom-Json -ErrorAction Stop
        if ($null -eq $meta -or $meta -is [System.Array] -or
            $meta.PSObject.Properties.Count -eq 0) {
            throw 'root must be a non-null JSON object'
        }
    } catch {
        Write-Host "[FAIL] .bootstrap-meta.json is malformed: $($_.Exception.Message)"
        $failures++
        $metaValid = $false
    }
}

if ($metaValid) {
    $version = Get-ObjectProperty $meta @('version')
    $seeded = Get-ObjectProperty $meta @('seededRowCount')
    $schema = Get-ObjectProperty $meta @('schema')
    $bootstrapComplete = Get-ObjectProperty $meta @('bootstrapComplete')
    $unresolvedProjectItems = Get-ObjectProperty $meta @('unresolvedProjectItems')
    $startupAdaptationRequired = Get-ObjectProperty $meta @('startupAdaptationRequired')
    $baselineContainer = Get-ObjectProperty $meta @('baseline')
    $baselineValue = Get-ObjectProperty $baselineContainer @('mappingRows')
    $baselineKind = Get-ObjectProperty $baselineContainer @('kind')
    $schemaName = Get-ObjectProperty $schema @('name')
    $schemaVersion = Get-ObjectProperty $schema @('version')
    if (($version -isnot [int] -and $version -isnot [long]) -or
        $schema -is [System.Array] -or $schemaName -ne 'winui-uwp-migration-bootstrap' -or
        ($schemaVersion -isnot [int] -and $schemaVersion -isnot [long]) -or
        [int]$schemaVersion -ne 4 -or [int]$version -ne 4) {
        Write-Host "[FAIL] .bootstrap-meta.json schema must be typed winui-uwp-migration-bootstrap version 4"
        $failures++; $metaValid = $false
    }
    if ($baselineContainer -is [System.Array] -or $baselineKind -ne 'immutable-bootstrap-input') {
        Write-Host "[FAIL] .bootstrap-meta.json baseline must be an immutable-bootstrap-input object"
        $failures++; $metaValid = $false
    }
    if ($bootstrapComplete -isnot [bool] -or -not $bootstrapComplete) {
        Write-Host "[FAIL] .bootstrap-meta.json bootstrapComplete must be boolean true"
        $failures++; $metaValid = $false
    }
    if ($unresolvedProjectItems -isnot [System.Array] -or
        $startupAdaptationRequired -isnot [System.Array] -or
        $unresolvedProjectItems.Count -gt 0 -or $startupAdaptationRequired.Count -gt 0) {
        Write-Host "[FAIL] .bootstrap-meta.json unresolvedProjectItems and startupAdaptationRequired must be empty arrays"
        $failures++; $metaValid = $false
    }
    if ($seeded -isnot [int] -and $seeded -isnot [long]) {
        Write-Host "[FAIL] .bootstrap-meta.json seededRowCount must be an integer"
        $failures++; $metaValid = $false
    }
    if ($null -eq $baselineValue -or $baselineValue -isnot [System.Array] -or $baselineValue.Count -eq 0) {
        Write-Host "[FAIL] .bootstrap-meta.json must contain a non-empty typed baselineRows inventory"
        $failures++; $metaValid = $false
    } else {
        foreach ($entry in $baselineValue) {
            if ($null -eq $entry -or $entry -is [string]) { $metaValid = $false; break }
            $baselineSource = Get-ObjectProperty $entry @('sourceFile', 'source', 'path')
            $baselineTarget = Get-ObjectProperty $entry @('targetFile', 'target', 'path')
            $baselineTriage = Get-ObjectProperty $entry @('initialTriageLabel', 'triageLabel', 'triage')
            $baselineHash = Get-ObjectProperty $entry @('originalSha256')
            $baselineOrigin = Get-ObjectProperty $entry @('importOrigin')
            if ($baselineSource -isnot [string] -or $baselineTarget -isnot [string] -or $baselineTriage -isnot [string] -or
                -not (Normalize-MigrationIdentity $baselineSource) -or -not (Normalize-MigrationIdentity $baselineTarget) -or
                $baselineTriage.ToLowerInvariant() -notin @('migrate-as-is','migrate-with-adaptation','defer') -or
                $baselineHash -isnot [string] -or $baselineHash -notmatch '^[0-9a-f]{64}$' -or
                $baselineOrigin -isnot [string] -or [string]::IsNullOrWhiteSpace($baselineOrigin)) {
                $metaValid = $false
                break
            }
            $baselineRows += [PSCustomObject]@{
                Source = $baselineSource
                Target = $baselineTarget
                Triage = $baselineTriage.ToLowerInvariant()
            }
        }
        if (-not $metaValid) {
            Write-Host "[FAIL] .bootstrap-meta.json baseline mappingRows entries must contain typed sourceFile, targetFile, initialTriageLabel, originalSha256, and importOrigin fields"
            $failures++
        }
    }
}

$immutableDeferredFiles = @{}
if ($metaValid) {
    foreach ($row in $baselineRows) {
        if ($row.Triage -eq 'defer') {
            $immutableDeferredFiles[(Normalize-MigrationIdentity $row.Target)] = $true
        }
    }
}

# All FAIL diagnostics with API names / code snippets / compiler messages go here, not stdout. Stdout gets a one-line summary + file:line pointers.
$diagPath = Join-Path $Target '.validator-diagnostics.txt'
$diagLines = New-Object System.Collections.Generic.List[string]
function Add-Diag([string]$section, [string]$text) {
    [void]$diagLines.Add('')
    [void]$diagLines.Add("=== $section ===")
    [void]$diagLines.Add($text)
}
[void]$diagLines.Add("# Validator diagnostics - generated $((Get-Date).ToString('o'))")
[void]$diagLines.Add('# Detailed snippets / build errors live here; stdout has only file:line summaries.')

# --- 1. Residue grep -----------------------------------------------------------
$invPath = Join-Path $PSScriptRoot 'unsupported-api-inventory.json'
$inv = $null
if (Test-Path -LiteralPath $invPath) {
    try { $inv = Get-Content -LiteralPath $invPath -Raw | ConvertFrom-Json } catch { Write-Warning "Failed to parse $invPath" }
}

$residuePatterns = @()
if ($inv) {
    foreach ($e in $inv.unsupported)  { $residuePatterns += [PSCustomObject]@{ Pattern = $e.pattern; Name = $e.name } }
    foreach ($e in $inv.residueOnly) { $residuePatterns += [PSCustomObject]@{ Pattern = $e.pattern; Name = $e.name } }
} else {
    # Fallback baseline if inventory file is missing
    $residuePatterns = @(
        [PSCustomObject]@{ Pattern = 'using\s+Windows\.UI\.Xaml';                                  Name = 'using Windows.UI.Xaml' },
        [PSCustomObject]@{ Pattern = 'xmlns:[a-zA-Z]+="using:Windows\.UI\.Xaml';                  Name = 'xmlns: using:Windows.UI.Xaml' },
        [PSCustomObject]@{ Pattern = 'Microsoft\.NETCore\.UniversalWindowsPlatform';              Name = 'UWP PackageReference' },
        [PSCustomObject]@{ Pattern = '<TargetPlatformIdentifier>\s*UAP';                          Name = '<TargetPlatformIdentifier>UAP' },
        [PSCustomObject]@{ Pattern = '<OutputType>\s*AppContainerExe';                            Name = '<OutputType>AppContainerExe' }
    )
}

$excludeDirs = @('bin', 'obj', '.uwp-source', '.vs', '.git', '.github', '.copilot')
$excludePattern = '\\(' + ($excludeDirs -join '|') + ')\\'
$files = Get-ChildItem -Path $Target -Recurse -File -Include *.cs,*.xaml,*.csproj -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludePattern }

$residueHits = New-Object System.Collections.Generic.List[object]
foreach ($f in $files) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    foreach ($p in $residuePatterns) {
        if ($text -match $p.Pattern) {
            $fileLines = $text -split "`r?`n"
            for ($i = 0; $i -lt $fileLines.Count; $i++) {
                if ($fileLines[$i] -match $p.Pattern) {
                    $rel = [System.IO.Path]::GetRelativePath($Target, $f.FullName)
                    [void]$residueHits.Add([PSCustomObject]@{ File = $rel; Line = $i+1; Name = $p.Name; Snippet = $fileLines[$i].Trim() })
                    break
                }
            }
        }
    }
}

# Only bootstrap-time defer membership is trusted; mapping labels are mutable.
$residueHits = @($residueHits | Where-Object {
    -not $immutableDeferredFiles.ContainsKey((Normalize-MigrationIdentity $_.File))
})

if ($residueHits.Count -eq 0) {
    Write-Host "[PASS] Residue grep - 0 UWP-only API references in non-deferred .cs/.xaml/.csproj"
} else {
    Write-Host "[FAIL] Residue grep - $($residueHits.Count) UWP-only reference(s) remain in non-deferred files (full diagnostics in .validator-diagnostics.txt):"
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $residueHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        # Stdout: file:line only - no [Name], no snippet - to avoid pushing
        # API-name lists into the agent's next assistant turn.
        $shown = @($g.Group | Select-Object -First 10)
        foreach ($h in $shown) {
            Write-Host "       $($g.Name):$($h.Line)"
        }
        if ($g.Group.Count -gt 10) { Write-Host "       $($g.Name): ($($g.Group.Count - 10) more)" }
        # Diagnostics file gets the full picture.
        [void]$diagBlock.Add("[$($g.Name)]")
        foreach ($h in $g.Group) {
            [void]$diagBlock.Add("  L$($h.Line)  $($h.Name)  | $($h.Snippet)")
        }
    }
    if (($residueHits | Group-Object File).Count -gt 30) { Write-Host "       (more files truncated; see .validator-diagnostics.txt)" }
    Add-Diag 'Residue grep' (($diagBlock) -join "`r`n")
    $failures++
}

# --- 1a-ii. Shell wiring integrity check ---------------------------------------
# The #1 cause of blank-screen failures is the agent overwriting MainWindow.Content
# or removing the Frame from MainWindow.xaml. Catch these at validation time.
$shellFails = @()
$mainWindowCs = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml.cs' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
$mainWindowXaml = Get-ChildItem -Path $Target -Filter 'MainWindow.xaml' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' } | Select-Object -First 1
if ($mainWindowXaml) {
    $mwXaml = [System.IO.File]::ReadAllText($mainWindowXaml.FullName)
    if ($mwXaml -notmatch '<Frame\b[^>]*x:Name\s*=\s*"RootFrame"') {
        $shellFails += 'MainWindow.xaml is missing <Frame x:Name="RootFrame"> - app content will not render'
    }
}
if ($mainWindowCs) {
    $mwCs = [System.IO.File]::ReadAllText($mainWindowCs.FullName)
    # Detect destructive MainWindow.Content assignment (overwrites XAML-defined content)
    if ($mwCs -match 'MainWindow\s*\.\s*Content\s*=' -or $mwCs -match '\bContent\s*=\s*new\s+(Frame|Page|MainPage|Grid)\b') {
        $shellFails += 'MainWindow.xaml.cs sets Content directly - this overwrites XAML-defined layout and causes blank screen'
    }
}
if ($shellFails.Count -eq 0) {
    Write-Host "[PASS] Shell wiring - MainWindow Frame intact, no destructive Content override"
} else {
    foreach ($msg in $shellFails) {
        Write-Host "[FAIL] Shell wiring - $msg"
    }
    Add-Diag 'Shell wiring' ($shellFails -join "`r`n")
    $failures++
}

# --- 1a-iii. Nested duplicate project / stray AppX source copy -----------------
# A build-clean scaffold can be silently broken when a full copy of the project
# tree ends up nested inside itself (commonly under an `AppX\` folder that an
# agent hand-created while chasing "AppX packaging"). SDK-style projects only
# auto-exclude their OWN bin/obj, so the nested copy's `obj\**\*.cs`
# (AssemblyInfo / AssemblyAttributes) get globbed into the outer compile and the
# build dies with a wall of confusing `CS0579: Duplicate '...Attribute'` errors -
# a build-fail zero (observed: BasicInput_i1, OCR_i1). Detect the nested project
# here and give a crisp "delete the copy" instruction instead of cryptic CS0579.
$allCsproj = Get-ChildItem -Path $Target -Filter '*.csproj' -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(bin|obj|\.uwp-source|\.vs|\.git)\\' }
if ($allCsproj.Count -gt 1) {
    # The shallowest .csproj is the real project; anything deeper is a stray copy.
    $primaryProj = $allCsproj | Sort-Object { ($_.FullName -split '[\\/]').Count } | Select-Object -First 1
    $nestedProjs = $allCsproj | Where-Object { $_.FullName -ne $primaryProj.FullName }
    Write-Host "[FAIL] Nested duplicate project - $($nestedProjs.Count) extra .csproj found inside the project tree:"
    foreach ($np in $nestedProjs) {
        $rel = $np.FullName.Substring($Target.TrimEnd('\','/').Length).TrimStart('\','/')
        Write-Host "         $rel"
    }
    Write-Host "       This nested copy poisons the outer build (its obj\*.cs cause CS0579 duplicate-attribute errors)."
    Write-Host "       Fix: delete the nested project folder entirely (e.g. the stray 'AppX\' source copy and its bin/obj)."
    Write-Host "       The real packaging AppX layout lives under bin\...\AppX and is build output - never a source folder."
    Add-Diag 'Nested duplicate project' (($nestedProjs | ForEach-Object { $_.FullName }) -join "`r`n")
    $failures++
} else {
    Write-Host "[PASS] Project layout - single project, no nested duplicate .csproj"
}
# unsupported-api-inventory.json `adaptable` patterns were matched by Initialize-UwpMigration.ps1 and TODOs were injected on the lines above. After migration, those patterns SHOULD no longer match (agent rewrote the line per the MIGRATION-PATTERNS.md anchor). A residual match means the agent removed the TODO marker without addressing the underlying issue - silently regressing on a deliberate concern (e.g. hit-test Background drop, custom-style without BasedOn). Suppress per-line by adding a `migrate-keep` comment on the matched line OR the line immediately above (for cases the MIGRATION-PATTERNS.md decision table explicitly allows keeping the original, e.g. hit-test case B: visible-content panel keeping its theme brush). WARN tier, not FAIL - does not block declaring done, but surfaces in diagnostics for the validator-agent to consider when scoring fidelity.
$adaptablePatterns = @()
if ($inv -and $inv.adaptable) {
    foreach ($e in $inv.adaptable) {
        if (-not $e.anchor) { continue }
        $adaptablePatterns += [PSCustomObject]@{ Pattern = $e.pattern; Anchor = $e.anchor; Name = $e.name }
    }
}

$adaptHits = New-Object System.Collections.Generic.List[object]
if ($adaptablePatterns.Count -gt 0) {
    $adaptFiles = Get-ChildItem -Path $Target -Recurse -File -Include *.cs,*.xaml -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch $excludePattern }
    foreach ($f in $adaptFiles) {
        $text = [System.IO.File]::ReadAllText($f.FullName)
        # File-level escape hatch: <!-- migrate-keep-all --> or // migrate-keep-all
        # suppresses every adaptable hit in this file.
        if ($text -match 'migrate-keep-all') { continue }
        $fileLinesCached = $null
        foreach ($p in $adaptablePatterns) {
            # Step 1c (below) implements a much more precise check for the
            # custom-styles anchor (parses each <Style> block, scopes to built-in
            # controls with a DefaultXxxStyle, excludes custom-styles-case-b templates).
            # The Step 1b broad pattern would over-warn on TextBlock styles etc.,
            # so let Step 1c own this anchor here. Bootstrap-time TODO injection
            # via this pattern is unaffected (this skip is only validator-side).
            if ($p.Anchor -eq 'custom-styles') { continue }
            if ($text -notmatch $p.Pattern) { continue }
            if (-not $fileLinesCached) { $fileLinesCached = $text -split "`r?`n" }
            $isXaml = $f.Extension -eq '.xaml'
            for ($i = 0; $i -lt $fileLinesCached.Count; $i++) {
                $line = $fileLinesCached[$i]
                if ($line -notmatch $p.Pattern) { continue }
                # Skip comment lines (XAML TODO markers, agent-written notes)
                $trim = $line.TrimStart()
                if ($isXaml -and $trim.StartsWith('<!--')) { continue }
                if (-not $isXaml -and $trim.StartsWith('//')) { continue }
                # Suppression: 'migrate-keep' on the same line OR walking up through
                # a contiguous block of comment/blank lines (up to 5 lines back).
                # Lets agents put a single block-level migrate-keep above a section
                # rather than tagging every individual line.
                if ($line -match 'migrate-keep') { continue }
                $suppressed = $false
                $maxBack = [Math]::Min(5, $i)
                for ($k = 1; $k -le $maxBack; $k++) {
                    $up = $fileLinesCached[$i - $k]
                    $upTrim = $up.TrimStart()
                    if ($isXaml) {
                        # Treat as part of a comment/blank prelude if:
                        # blank, starts with `<!--`, ends/equals `-->`, or contains
                        # no `<` character at all (line is fully inside a multi-
                        # line XAML comment). Any normal XAML element starts with
                        # `<` after whitespace, which breaks the lookback.
                        $isCommentOrBlank = (
                            [string]::IsNullOrWhiteSpace($up) -or
                            $upTrim.StartsWith('<!--') -or
                            $upTrim.StartsWith('-->') -or
                            $up -match '-->\s*$' -or
                            ($up -notmatch '<')
                        )
                    } else {
                        $isCommentOrBlank = (
                            [string]::IsNullOrWhiteSpace($up) -or
                            $upTrim.StartsWith('//') -or
                            $upTrim.StartsWith('/*') -or
                            $upTrim.StartsWith('*')
                        )
                    }
                    if (-not $isCommentOrBlank) { break }
                    if ($up -match 'migrate-keep') { $suppressed = $true; break }
                }
                if ($suppressed) { continue }
                $rel = [System.IO.Path]::GetRelativePath($Target, $f.FullName)
                [void]$adaptHits.Add([PSCustomObject]@{ File = $rel; Line = $i+1; Anchor = $p.Anchor; Name = $p.Name; Snippet = $line.Trim() })
            }
        }
    }
}
# Deferred files: skip - they kept the UWP API intentionally and DEFERRED.md documents why.
$adaptHits = @($adaptHits | Where-Object {
    -not $immutableDeferredFiles.ContainsKey((Normalize-MigrationIdentity $_.File))
})

if ($adaptHits.Count -eq 0) {
    Write-Host "[PASS] No unaddressed adaptable patterns remain"
} else {
    Write-Host "[WARN] $($adaptHits.Count) adaptable pattern hit(s) appear unaddressed - agent removed the TODO without changing the underlying line (full diagnostics in .validator-diagnostics.txt). Resolve via 'Get-MigrationPattern.ps1 -Anchor <id>' or add 'migrate-keep' comment to suppress."
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $adaptHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        $shown = @($g.Group | Select-Object -First 10)
        foreach ($h in $shown) {
            Write-Host "       $($g.Name):$($h.Line) anchor=$($h.Anchor)"
        }
        if ($g.Group.Count -gt 10) { Write-Host "       $($g.Name): ($($g.Group.Count - 10) more)" }
        [void]$diagBlock.Add("[$($g.Name)]")
        foreach ($h in $g.Group) {
            [void]$diagBlock.Add("  L$($h.Line)  anchor=$($h.Anchor) name=$($h.Name)  | $($h.Snippet)")
        }
    }
    if (($adaptHits | Group-Object File).Count -gt 30) { Write-Host "       (more files truncated; see .validator-diagnostics.txt)" }
    Add-Diag 'Unaddressed adaptable patterns (WARN)' (($diagBlock) -join "`r`n")
    $warnings += $adaptHits.Count
}

# --- 1c. Setter-only custom Style without BasedOn ------------------------------
# UWP convention let you write `<Style TargetType="Button">` with a few Setters and no BasedOn - UWP implicitly inherited the system default. WinUI 3 does NOT: a bare Style fully REPLACES the default ControlTemplate too, so the control renders with raw property defaults (no Fluent visuals, no rounded corners, no hover/focus VSM). MIGRATION-PATTERNS.md#custom-styles-case-a is the rule; this step enforces it mechanically.
#
# Scope: only flag controls that ship a `Default<X>Style` resource in the WinUI 3 themes (controls with a ControlTemplate). TextBlock/Image/Border etc. have no template, so a Setter-only Style on them is harmless. List is kept conservative - if uncertain whether a control has a published DefaultXxxStyle key, leave it off rather than emit wrong advice.
#
# Excluded by design:
#   - Styles whose body defines its own template (`<Setter Property="Template">` or inline `<ControlTemplate>`) - that is custom-styles-case-b territory, a different problem (the template fully replaces visuals on its own).
#   - Styles already using BasedOn (attribute OR `<Style.BasedOn>` property element form).
#   - TargetTypes with a custom prefix mapped to a non-WinUI namespace; if the prefix is `muxc:` / `controls:` / etc. and the local name is in the list, it still gets checked (handles WinUI 2 -> WinUI 3 prefix carryovers).
# Suppression: same `migrate-keep` (per-line + comment-block lookback) and file-level `migrate-keep-all` semantics as Step 1b.
$builtInControlsWithDefaultStyle = @(
    # buttons / toggles
    'Button','RepeatButton','HyperlinkButton','ToggleButton','SplitButton','ToggleSplitButton',
    # selectors
    'CheckBox','RadioButton','ToggleSwitch',
    # text input
    'TextBox','PasswordBox','RichEditBox','AutoSuggestBox','NumberBox',
    # combos / lists
    'ComboBox','ComboBoxItem','ListBox','ListBoxItem',
    'ListView','ListViewItem','GridView','GridViewItem',
    'TreeView','TreeViewItem','FlipView','FlipViewItem',
    # range / progress
    'Slider','ProgressBar','ProgressRing',
    # date / time
    'DatePicker','TimePicker','CalendarDatePicker','CalendarView',
    # menus / app bars
    'MenuFlyoutItem','MenuFlyoutSubItem','RadioMenuFlyoutItem','ToggleMenuFlyoutItem',
    'CommandBar','AppBarButton','AppBarToggleButton',
    # navigation
    'NavigationView','NavigationViewItem','NavigationViewItemHeader','NavigationViewItemSeparator',
    'TabView','TabViewItem',
    # misc
    'ContentDialog','Expander','InfoBar','ScrollViewer'
)
$builtInLookup = @{}
foreach ($c in $builtInControlsWithDefaultStyle) { $builtInLookup[$c] = $true }

$basedOnHits = New-Object System.Collections.Generic.List[object]
$xamlFiles = Get-ChildItem -Path $Target -Recurse -File -Include *.xaml -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludePattern }

foreach ($f in $xamlFiles) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text -match 'migrate-keep-all') { continue }
    $styleMatches = [regex]::Matches($text, '(?s)<Style\b([^>]*?)>(.*?)</Style>')
    if ($styleMatches.Count -eq 0) { continue }
    $lines = $text -split "`r?`n"
    foreach ($m in $styleMatches) {
        $attrs = $m.Groups[1].Value
        $body  = $m.Groups[2].Value
        # Need a TargetType. Support both quote styles.
        if ($attrs -notmatch 'TargetType\s*=\s*(["''])([^"'']+)\1') { continue }
        $rawType = $matches[2].Trim()
        # Strip namespace prefix if any - `muxc:Button` -> `Button`. Allow checking
        # so WinUI-2-era prefixes that survived migration still get flagged.
        $localType = if ($rawType.Contains(':')) { $rawType.Substring($rawType.IndexOf(':') + 1) } else { $rawType }
        if (-not $builtInLookup.ContainsKey($localType)) { continue }
        # Already correct (attribute form or property-element form).
        if ($attrs -match 'BasedOn\s*=') { continue }
        if ($body  -match '<Style\.BasedOn\b') { continue }
        # custom-styles-case-b territory - different problem, this rule does NOT cover it.
        if ($body -match '<Setter\b[^>]*Property\s*=\s*(["''])Template\1') { continue }
        if ($body -match '<ControlTemplate\b') { continue }
        $before = $text.Substring(0, $m.Index)
        $lineNum = ($before -split "`r?`n").Count
        $styleLine = $lines[$lineNum - 1]
        if ($styleLine -match 'migrate-keep') { continue }
        # Block-level escape: same lookback semantics as Step 1b.
        $suppressed = $false
        $maxBack = [Math]::Min(5, $lineNum - 1)
        for ($k = 1; $k -le $maxBack; $k++) {
            $up = $lines[$lineNum - 1 - $k]
            $upTrim = $up.TrimStart()
            $isCommentOrBlank = (
                [string]::IsNullOrWhiteSpace($up) -or
                $upTrim.StartsWith('<!--') -or
                $upTrim.StartsWith('-->') -or
                $up -match '-->\s*$' -or
                ($up -notmatch '<')
            )
            if (-not $isCommentOrBlank) { break }
            if ($up -match 'migrate-keep') { $suppressed = $true; break }
        }
        if ($suppressed) { continue }
        $rel = [System.IO.Path]::GetRelativePath($Target, $f.FullName)
        [void]$basedOnHits.Add([PSCustomObject]@{ File = $rel; Line = $lineNum; TargetType = $rawType; Snippet = $styleLine.Trim() })
    }
}
$basedOnHits = @($basedOnHits | Where-Object {
    -not $immutableDeferredFiles.ContainsKey((Normalize-MigrationIdentity $_.File))
})

if ($basedOnHits.Count -eq 0) {
    Write-Host "[PASS] All custom Setter-only Styles on built-in controls use BasedOn"
} else {
    Write-Host "[WARN] $($basedOnHits.Count) Setter-only Style(s) on built-in controls are missing BasedOn - controls will lose WinUI 3 Fluent visuals. Add BasedOn=`"{StaticResource Default<X>Style}`" (see MIGRATION-PATTERNS.md#custom-styles-case-a) or suppress with a 'migrate-keep' comment. Full diagnostics in .validator-diagnostics.txt."
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $basedOnHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        $shown = @($g.Group | Select-Object -First 10)
        foreach ($h in $shown) {
            Write-Host "       $($g.Name):$($h.Line) TargetType=$($h.TargetType)"
        }
        if ($g.Group.Count -gt 10) { Write-Host "       $($g.Name): ($($g.Group.Count - 10) more)" }
        [void]$diagBlock.Add("[$($g.Name)]")
        foreach ($h in $g.Group) {
            [void]$diagBlock.Add("  L$($h.Line)  TargetType=$($h.TargetType)  | $($h.Snippet)")
        }
    }
    if (($basedOnHits | Group-Object File).Count -gt 30) { Write-Host "       (more files truncated; see .validator-diagnostics.txt)" }
    Add-Diag 'Setter-only Style missing BasedOn (WARN)' (($diagBlock) -join "`r`n")
    $warnings += $basedOnHits.Count
}

# --- 1d. Custom ControlTemplate with UWP-era visual residue --------------------
# UWP-era custom ControlTemplate bodies frequently copied the 2015 system-default visuals verbatim. Two high-signal markers indicate "incidental UWP-era chrome" inside a Template (as opposed to the sample's actual demo intent):
#   (a) `SystemControl*Brush` ThemeResource references (pre-Fluent palette semantically replaced by `*FillColor*Brush` etc. in WinUI 3)
#   (b) `<Rectangle x:Name="NormalRectangle" />` - UWP CheckBox default geometry, hard-square corners, no Fluent rounded chrome
#
# When either appears INSIDE a `<ControlTemplate>` body the agent likely pasted the UWP system template verbatim and left the incidental visuals untouched. MIGRATION-PATTERNS.md#custom-styles-case-b teaches the "demo intent vs base chrome" split and points at `Get-WinUIDefaultStyle.ps1` as the reference tool for surgical edits.
#
# Scope (kept narrow on purpose - rubber-duck #10):
#   - ONLY fires on residue inside a `<ControlTemplate>` body, NOT on file-level `SystemControl*Brush` usage (those have other valid uses).
#   - Suppression: same `migrate-keep` (per-line on the Style opening line + 5-line comment-block lookback) and file-level `migrate-keep-all` semantics as Step 1b/1c.
#
# Severity: WARN (consistent with Step 1b/1c). Agent has historically reacted to WARN by either fixing or adding a suppression marker with rationale. Escalate to FAIL if WARN proves insufficient across multiple runs.
$step1dHits = New-Object System.Collections.Generic.List[object]
foreach ($f in $xamlFiles) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text -match 'migrate-keep-all') { continue }
    $lines = $text -split "`r?`n"
    $styleMatches = [regex]::Matches($text, '(?s)<Style\b([^>]*?)>(.*?)</Style>')
    foreach ($m in $styleMatches) {
        $attrs = $m.Groups[1].Value
        $body  = $m.Groups[2].Value
        if ($body -notmatch '<ControlTemplate\b') { continue }
        # Detect UWP-era residue inside the template body
        $residue = New-Object System.Collections.Generic.List[string]
        $sysCtl = [regex]::Matches($body, 'SystemControl[A-Z]\w+Brush')
        if ($sysCtl.Count -gt 0) {
            $first = $sysCtl[0].Value
            [void]$residue.Add("$($sysCtl.Count) SystemControl*Brush ref(s) (e.g. $first)")
        }
        if ($body -match '<Rectangle\b[^>]*x:Name\s*=\s*(["''])NormalRectangle\1') {
            [void]$residue.Add('NormalRectangle (UWP-era CheckBox geometry)')
        }
        if ($residue.Count -eq 0) { continue }
        # Compute inferred Default<X>Style key for the helper hint
        $rawType = $null
        if ($attrs -match 'TargetType\s*=\s*(["''])([^"'']+)\1') { $rawType = $matches[2].Trim() }
        $localType = if ($rawType -and $rawType.Contains(':')) { $rawType.Substring($rawType.IndexOf(':') + 1) } else { $rawType }
        $defaultKey = if ($localType -and $builtInLookup.ContainsKey($localType)) { "Default${localType}Style" } else { $null }
        # Line number - point at the Style opening tag (where suppression marker lives)
        $before = $text.Substring(0, $m.Index)
        $lineNum = ($before -split "`r?`n").Count
        $styleLine = $lines[$lineNum - 1]
        if ($styleLine -match 'migrate-keep') { continue }
        $suppressed = $false
        $maxBack = [Math]::Min(5, $lineNum - 1)
        for ($k = 1; $k -le $maxBack; $k++) {
            $up = $lines[$lineNum - 1 - $k]
            $upTrim = $up.TrimStart()
            $isCommentOrBlank = (
                [string]::IsNullOrWhiteSpace($up) -or
                $upTrim.StartsWith('<!--') -or
                $upTrim.StartsWith('-->') -or
                $up -match '-->\s*$' -or
                ($up -notmatch '<')
            )
            if (-not $isCommentOrBlank) { break }
            if ($up -match 'migrate-keep') { $suppressed = $true; break }
        }
        if ($suppressed) { continue }
        $rel = [System.IO.Path]::GetRelativePath($Target, $f.FullName)
        [void]$step1dHits.Add([PSCustomObject]@{
            File       = $rel
            Line       = $lineNum
            TargetType = $rawType
            DefaultKey = $defaultKey
            Residue    = ($residue -join '; ')
            Snippet    = $styleLine.Trim()
        })
    }
}
$step1dHits = @($step1dHits | Where-Object {
    -not $immutableDeferredFiles.ContainsKey((Normalize-MigrationIdentity $_.File))
})

if ($step1dHits.Count -eq 0) {
    Write-Host "[PASS] No custom ControlTemplate bodies carry UWP-era visual residue"
} else {
    Write-Host "[WARN] $($step1dHits.Count) custom ControlTemplate(s) contain UWP-era visual residue (SystemControl*Brush / NormalRectangle) - controls will render with 2015-era visuals (square corners, pre-Fluent palette). See MIGRATION-PATTERNS.md#custom-styles-case-b."
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $step1dHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        $shown = @($g.Group | Select-Object -First 10)
        foreach ($h in $shown) {
            $helperHint = if ($h.DefaultKey) {
                "scripts\Get-WinUIDefaultStyle.ps1 -StyleKey $($h.DefaultKey)"
            } elseif ($h.TargetType) {
                "scripts\Get-WinUIDefaultStyle.ps1 -ListKeys -Filter '$($h.TargetType)'"
            } else {
                "scripts\Get-WinUIDefaultStyle.ps1 -ListKeys -Filter '<your control name>'"
            }
            Write-Host "       $($g.Name):$($h.Line) TargetType=$($h.TargetType) residue=[$($h.Residue)]"
            Write-Host "         -> reference: $helperHint"
        }
        if ($g.Group.Count -gt 10) { Write-Host "       $($g.Name): ($($g.Group.Count - 10) more - see .validator-diagnostics.txt)" }
        [void]$diagBlock.Add("[$($g.Name)]")
        foreach ($h in $g.Group) {
            $helperHint = if ($h.DefaultKey) {
                "scripts\Get-WinUIDefaultStyle.ps1 -StyleKey $($h.DefaultKey)"
            } elseif ($h.TargetType) {
                "scripts\Get-WinUIDefaultStyle.ps1 -ListKeys -Filter '$($h.TargetType)'"
            } else {
                "scripts\Get-WinUIDefaultStyle.ps1 -ListKeys -Filter '<your control name>'"
            }
            [void]$diagBlock.Add("  L$($h.Line)  TargetType=$($h.TargetType)  residue=$($h.Residue)")
            [void]$diagBlock.Add("           reference: $helperHint")
            [void]$diagBlock.Add("           snippet:   $($h.Snippet)")
        }
    }
    if (($step1dHits | Group-Object File).Count -gt 30) { Write-Host "       (more files truncated; see .validator-diagnostics.txt)" }
    Add-Diag 'Custom ControlTemplate with UWP-era visual residue (WARN)' (($diagBlock) -join "`r`n")
    $warnings += $step1dHits.Count
}

# --- 2. TODO[migrate-NNN] residue ----------------------------------------------
# Initialize-UwpMigration.ps1 injects `TODO[migrate-NNN]: see MIGRATION-PATTERNS.md#<anchor>` markers above every adaptable API hit. Every one of them must be resolved (the marker removed) before the migration can be declared done.
$todoFiles = Get-ChildItem -Path $Target -Recurse -File -Include *.cs,*.xaml -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludePattern }
$todoHits = New-Object System.Collections.Generic.List[object]
foreach ($f in $todoFiles) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text -notmatch 'TODO\[migrate-') { continue }
    $fileLines = $text -split "`r?`n"
    for ($i = 0; $i -lt $fileLines.Count; $i++) {
        if ($fileLines[$i] -match 'TODO\[migrate-(\d+)\]') {
            $rel = [System.IO.Path]::GetRelativePath($Target, $f.FullName)
            [void]$todoHits.Add([PSCustomObject]@{ File = $rel; Line = $i + 1; Tag = $matches[1] })
        }
    }
}
if ($todoHits.Count -eq 0) {
    Write-Host "[PASS] No TODO[migrate-] markers remain in source"
} else {
    Write-Host "[FAIL] $($todoHits.Count) TODO[migrate-] marker(s) still in source (resolve each one via 'Get-MigrationPattern.ps1 -Anchor <id>'):"
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $todoHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        $shown = @($g.Group | Select-Object -First 10)
        foreach ($h in $shown) {
            Write-Host "       $($g.Name):$($h.Line) (#$($h.Tag))"
        }
        if ($g.Group.Count -gt 10) { Write-Host "       $($g.Name): ($($g.Group.Count - 10) more)" }
        [void]$diagBlock.Add("[$($g.Name)]")
        foreach ($h in $g.Group) {
            [void]$diagBlock.Add("  L$($h.Line)  TODO[migrate-$($h.Tag)]")
        }
    }
    Add-Diag 'TODO[migrate-] residue' (($diagBlock) -join "`r`n")
    $failures++
}

# --- 3. MIGRATION-MAPPING.md integrity -----------------------------------------
if (-not (Test-Path -LiteralPath $mapPath)) {
    Write-Host "[FAIL] MIGRATION-MAPPING.md not found at target root"
    $failures++
} else {
    $mappingFailures = New-Object System.Collections.Generic.List[string]
    foreach ($line in $mapMalformedRows) {
        [void]$mappingFailures.Add("malformed mapping row (expected four columns): $line")
    }
    $sourceIds = @{}
    $targetIds = @{}
    foreach ($row in $mapRows) {
        $sourceId = Normalize-MigrationIdentity $row.Source
        $targetId = Normalize-MigrationIdentity $row.Target
        if (-not $sourceId -or -not $targetId) {
            [void]$mappingFailures.Add("blank source or target identity: $($row.Raw)")
            continue
        }
        if ($sourceIds.ContainsKey($sourceId)) {
            [void]$mappingFailures.Add("duplicate source identity: $($row.Source)")
        } else { $sourceIds[$sourceId] = $row }
        if ($targetIds.ContainsKey($targetId)) {
            [void]$mappingFailures.Add("duplicate target identity: $($row.Target)")
        } else { $targetIds[$targetId] = $row }
        if ($row.Triage -notin @('migrate-as-is','migrate-with-adaptation','defer')) {
            [void]$mappingFailures.Add("unknown triage '$($row.Triage)' for $($row.Source)")
        }
        if ($row.Status -notin @('done','defer','deferred')) {
            [void]$mappingFailures.Add("unknown or incomplete status '$($row.Status)' for $($row.Source)")
        }
        if ($row.Status -notin @('defer','deferred')) {
            $targetPath = Join-Path $Target ($row.Target.Replace('/', '\'))
            if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
                [void]$mappingFailures.Add("nondeferred target is missing: $($row.Target)")
            }
        }
    }

    if ($metaValid) {
        if ($mapRows.Count -ne [int]$seeded -or $baselineRows.Count -ne [int]$seeded) {
            [void]$mappingFailures.Add("row counts differ: mapping=$($mapRows.Count), baseline=$($baselineRows.Count), seeded=$seeded")
        }
        $baselineSourceIds = @{}
        $baselineTargetIds = @{}
        $baselinePairIds = @{}
        foreach ($row in $baselineRows) {
            $sourceId = Normalize-MigrationIdentity $row.Source
            $targetId = Normalize-MigrationIdentity $row.Target
            $pairId = "$sourceId|$targetId"
            if ($baselineSourceIds.ContainsKey($sourceId)) {
                [void]$mappingFailures.Add("duplicate bootstrap source identity: $($row.Source)")
            } else { $baselineSourceIds[$sourceId] = $row }
            if ($baselineTargetIds.ContainsKey($targetId)) {
                [void]$mappingFailures.Add("duplicate bootstrap target identity: $($row.Target)")
            } else { $baselineTargetIds[$targetId] = $row }
            $baselinePairIds[$pairId] = $row
        }
        foreach ($id in $baselineSourceIds.Keys) {
            if (-not $sourceIds.ContainsKey($id)) {
                [void]$mappingFailures.Add("bootstrap source identity removed from mapping: $($baselineSourceIds[$id].Source)")
            }
        }
        foreach ($id in $sourceIds.Keys) {
            if (-not $baselineSourceIds.ContainsKey($id)) {
                [void]$mappingFailures.Add("mapping source identity was not in bootstrap inventory: $($sourceIds[$id].Source)")
            }
        }
        $mappingPairIds = @{}
        foreach ($row in $mapRows) {
            $sourceId = Normalize-MigrationIdentity $row.Source
            $targetId = Normalize-MigrationIdentity $row.Target
            if ($sourceId -and $targetId) { $mappingPairIds["$sourceId|$targetId"] = $row }
        }
        foreach ($id in $baselinePairIds.Keys) {
            if (-not $mappingPairIds.ContainsKey($id)) {
                $row = $baselinePairIds[$id]
                [void]$mappingFailures.Add("bootstrap source/target identity pair changed or was removed: $($row.Source) -> $($row.Target)")
            }
        }
        foreach ($id in $mappingPairIds.Keys) {
            if (-not $baselinePairIds.ContainsKey($id)) {
                $row = $mappingPairIds[$id]
                [void]$mappingFailures.Add("mapping source/target identity pair was not in bootstrap inventory: $($row.Source) -> $($row.Target)")
            }
        }
        foreach ($id in $baselineSourceIds.Keys) {
            if (-not $sourceIds.ContainsKey($id)) { continue }
            $wasDeferred = $baselineSourceIds[$id].Triage -eq 'defer'
            $isDeferred = $sourceIds[$id].Status -in @('defer','deferred')
            if ($wasDeferred -ne $isDeferred) {
                [void]$mappingFailures.Add("deferred membership differs from immutable bootstrap triage: $($sourceIds[$id].Source)")
            }
        }
    }

    if ($mappingFailures.Count -eq 0) {
        Write-Host "[PASS] MIGRATION-MAPPING.md - identities, statuses, and target files are valid"
    } else {
        Write-Host "[FAIL] MIGRATION-MAPPING.md - $($mappingFailures.Count) integrity error(s)"
        foreach ($message in $mappingFailures | Select-Object -First 10) { Write-Host "       $message" }
        Add-Diag 'Mapping integrity' ($mappingFailures -join "`r`n")
        $failures++
    }

    # --- 4. MIGRATION-DEFERRED.md consistency ----------------------------------
    $deferRows = @($mapRows | Where-Object { $_.Status -in @('defer','deferred') })
    $deferPath = Join-Path $Target 'MIGRATION-DEFERRED.md'
    if ($deferRows.Count -gt 0) {
        if (-not (Test-Path -LiteralPath $deferPath)) {
            Write-Host "[FAIL] $($deferRows.Count) defer row(s) in MIGRATION-MAPPING.md but MIGRATION-DEFERRED.md missing"
            $failures++
        } else {
            $deferText = Get-Content -LiteralPath $deferPath -Raw
            $deferredIds = @{}
            $deferredDuplicates = @()
            foreach ($line in ($deferText -split "`n")) {
                if ($line -match '^\|' -and $line -notmatch '^\|\s*-+\s*\|' -and $line -notmatch '^\|\s*(Source file|File)\s*\|') {
                    $columns = @($line.Trim().Trim('|').Split('|') | ForEach-Object { $_.Trim() })
                    $identity = Normalize-MigrationIdentity $columns[0]
                    if (-not $identity -or $identity -eq '(none)') { continue }
                    if ($deferredIds.ContainsKey($identity)) { $deferredDuplicates += $columns[0] }
                    else { $deferredIds[$identity] = $columns[0] }
                }
            }
            $mappedDeferredIds = @{}
            foreach ($row in $deferRows) {
                $identity = Normalize-MigrationIdentity $row.Source
                if ($mappedDeferredIds.ContainsKey($identity)) { $deferredDuplicates += $row.Source }
                else { $mappedDeferredIds[$identity] = $row.Source }
            }
            $missingDeferred = @($mappedDeferredIds.Keys | Where-Object { -not $deferredIds.ContainsKey($_) })
            $extraDeferred = @($deferredIds.Keys | Where-Object { -not $mappedDeferredIds.ContainsKey($_) })
            if ($missingDeferred.Count -eq 0 -and $extraDeferred.Count -eq 0 -and $deferredDuplicates.Count -eq 0) {
                Write-Host "[PASS] MIGRATION-DEFERRED.md identities exactly match deferred mapping identities"
            } else {
                Write-Host "[FAIL] MIGRATION-DEFERRED.md identity set mismatch (missing=$($missingDeferred.Count), extra=$($extraDeferred.Count), duplicates=$($deferredDuplicates.Count))"
                $failures++
            }
        }
    } else {
        if (Test-Path -LiteralPath $deferPath) {
            $deferText = Get-Content -LiteralPath $deferPath -Raw
            $hasDeferredRow = @($deferText -split "`n" | Where-Object {
                $_ -match '^\|' -and $_ -notmatch '^\|\s*-+\s*\|' -and
                $_ -notmatch '^\|\s*(Source file|File)\s*\|' -and $_ -notmatch '^\|\s*\(none\)\s*\|'
            }).Count -gt 0
            if ($hasDeferredRow) {
                Write-Host "[FAIL] MIGRATION-DEFERRED.md contains identities but mapping has no deferred rows"
                $failures++
            } else {
                Write-Host "[PASS] No deferred identities in mapping or deferred ledger"
            }
        } else {
            Write-Host "[PASS] No defer rows; MIGRATION-DEFERRED.md not required"
        }
    }
}

# --- 5. Package.appxmanifest image references ---------------------------------
# AppX deployment (winapp run) fails with 0x80073CF6 / "image cannot be located" when the manifest references image files that don't exist on disk. UWP samples typically use names like `Splash-sdk.png` / `StoreLogo-sdk.png` while the WinUI 3 scaffold ships scaffold defaults (`SplashScreen.scale-200.png`, `StoreLogo.png`). Verify every image referenced by the manifest is present (either as the exact filename or as a scale-*/targetsize-*/altform-* variant of the same base name, which Windows resource resolution accepts).
$manifestPath = Join-Path $Target 'Package.appxmanifest'
if (Test-Path -LiteralPath $manifestPath) {
    $manifestXml = New-Object System.Xml.XmlDocument
    $manifestXml.PreserveWhitespace = $true
    try {
        $manifestXml.Load($manifestPath)
    } catch {
        Write-Host "[FAIL] Package.appxmanifest is not valid XML: $($_.Exception.Message)"
        $failures++
        $manifestXml = $null
    }
    $imageRefs = New-Object System.Collections.Generic.HashSet[string]
    if ($manifestXml) {
        foreach ($node in @($manifestXml.SelectNodes("//*[local-name()='Logo']"))) {
            if (-not [string]::IsNullOrWhiteSpace($node.InnerText)) {
                [void]$imageRefs.Add($node.InnerText.Trim())
            }
        }
        $imageAttributes = @('Square150x150Logo','Square71x71Logo','Square44x44Logo','Square310x310Logo','Wide310x150Logo','Image','BackgroundImage')
        foreach ($attribute in @($manifestXml.SelectNodes('//@*'))) {
            if ($attribute.LocalName -in $imageAttributes -and
                $attribute.Value -match '(?i)\.(png|jpg|jpeg|ico|svg|gif)$') {
                [void]$imageRefs.Add($attribute.Value.Trim())
            }
        }
    }

    $missing = @()
    foreach ($ref in $imageRefs) {
        # Normalise separators and resolve against project root
        $relPath = $ref -replace '/', '\'
        $absPath = Join-Path $Target $relPath
        if (Test-Path -LiteralPath $absPath) { continue }

        # Fall back: Windows resource resolution accepts scale-*/targetsize-*/altform-*
        # variants of the same base name. e.g. manifest says "Assets\StoreLogo.png"
        # and disk only has "Assets\StoreLogo.scale-200.png" - that's OK.
        $dir = Split-Path -Path $absPath -Parent
        $leaf = Split-Path -Path $absPath -Leaf
        $base = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
        $ext = [System.IO.Path]::GetExtension($leaf)
        $variantPattern = "$base.*$ext"
        if ((Test-Path -LiteralPath $dir) -and
            (@(Get-ChildItem -LiteralPath $dir -Filter $variantPattern -File -ErrorAction SilentlyContinue).Count -gt 0)) {
            continue
        }
        $missing += $ref
    }

    if ($missing.Count -eq 0) {
        Write-Host "[PASS] Package.appxmanifest - all $($imageRefs.Count) image reference(s) resolvable under Assets/"
    } else {
        Write-Host "[FAIL] Package.appxmanifest references $($missing.Count) image file(s) that don't exist on disk:"
        foreach ($r in $missing) { Write-Host "       $r" }
        Write-Host "       Fix: either (a) edit Package.appxmanifest to reference assets that exist under Assets/"
        Write-Host "       (the scaffold defaults like Assets\StoreLogo.png and Assets\SplashScreen.scale-200.png"
        Write-Host "       are the simplest path), or (b) copy the missing files from .uwp-source\Assets\ into Assets\."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Package.appxmanifest - reconcile image references'."
        $failures++
    }

    # --- 5b. Package.appxmanifest WinUI 3 packaging requirements --------------
    # `winapp run` refuses to register the AppX when the manifest still looks
    # UWP-shaped. Three things must be true for the packaged desktop app to
    # deploy and activate on Windows 10/11:
    #   1) <TargetDeviceFamily Name="Windows.Desktop"> (Windows.Universal is
    #      UWP-only; the registrar rejects it for a Win32 entrypoint).
    #   2) xmlns:rescap=".../restrictedcapabilities/..." declared on <Package> and
    #      added to IgnorableNamespaces (otherwise the rescap element below is
    #      stripped and the runFullTrust check below silently fails).
    #   3) <rescap:Capability Name="runFullTrust" /> present - packaged WinUI 3
    #      apps run elevated relative to AppContainer and must declare it.
    # Real-world impact: run18 Printing and run19 BasicSuspension both built
    # cleanly but failed `winapp run` registration with "requires runFullTrust
    # capability" - the agent migrated code but never touched the manifest.
    if ($manifestXml) {
    $manifestFailures = 0
    $foundationNs = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10'
    $rescapNs = 'http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities'
    $ns = New-Object System.Xml.XmlNamespaceManager($manifestXml.NameTable)
    $ns.AddNamespace('f', $foundationNs)
    $ns.AddNamespace('rescap', $rescapNs)
    $desktopFamilies = @($manifestXml.SelectNodes('//f:Dependencies/f:TargetDeviceFamily[@Name="Windows.Desktop"]', $ns))
    if ($desktopFamilies.Count -eq 0) {
        Write-Host "[FAIL] Package.appxmanifest <TargetDeviceFamily> is not Windows.Desktop"
        Write-Host "       Fix: change `<TargetDeviceFamily Name=`"Windows.Universal`" .../>` to `Windows.Desktop`."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    $hasRescapNs = $manifestXml.DocumentElement.GetNamespaceOfPrefix('rescap') -eq $rescapNs
    $ignorable = $manifestXml.DocumentElement.GetAttribute('IgnorableNamespaces')
    $rescapInIgnorable = @($ignorable -split '\s+') -contains 'rescap'
    if (-not $hasRescapNs -or -not $rescapInIgnorable) {
        Write-Host "[FAIL] Package.appxmanifest is missing the rescap namespace declaration"
        Write-Host "       Fix: on <Package> add xmlns:rescap=`".../restrictedcapabilities/...`" and append 'rescap' to IgnorableNamespaces."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    $runFullTrust = @($manifestXml.SelectNodes('//f:Capabilities/rescap:Capability[@Name="runFullTrust"]', $ns))
    if ($runFullTrust.Count -eq 0) {
        Write-Host "[FAIL] Package.appxmanifest is missing <rescap:Capability Name=`"runFullTrust`" />"
        Write-Host "       Without it, `winapp run` fails registration: 'requires runFullTrust capability'."
        Write-Host "       Fix: add it inside <Capabilities> (create the element if absent)."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    if ($manifestFailures -eq 0) {
        Write-Host "[PASS] Package.appxmanifest - Windows.Desktop target + rescap:runFullTrust capability declared"
    } else {
        $failures += $manifestFailures
    }
    }
} else {
    Write-Host "[WARN] Package.appxmanifest not found at $manifestPath - skipping image-reference check"
    $warnings++
}

# --- 6. BuildAndRun healthcheck -----------------------------------------------
# The validator must gate on a clean build, otherwise common namespace-rewrite fallout (CS0104 LaunchActivatedEventArgs ambiguity, CS0246 scaffold-vs-UWP namespace mismatch like MainWindow.xaml.cs referencing a moved MainPage, etc.) slips past validation. BuildAndRun.ps1 --no-launch makes the build a precondition for declaring done.
$csproj = $null
$candidates = @(Get-ChildItem -LiteralPath $Target -Filter '*.csproj' -File -ErrorAction SilentlyContinue)
if ($candidates.Count -eq 0) {
    # Fall back to a recursive scan for projects nested below the target root
    # (skip bin/obj/.github/.copilot/.uwp-source/Generated Files).
    $stack = New-Object System.Collections.Generic.Stack[string]
    $stack.Push($Target)
    $skip = @('bin','obj','.github','.copilot','.vs','.uwp-source','node_modules','.git','Generated Files')
    while ($stack.Count -gt 0 -and -not $csproj) {
        $dir = $stack.Pop()
        foreach ($f in Get-ChildItem -LiteralPath $dir -Filter '*.csproj' -File -ErrorAction SilentlyContinue) {
            $csproj = $f.FullName; break
        }
        if (-not $csproj) {
            foreach ($d in Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue) {
                if ($skip -notcontains $d.Name) { $stack.Push($d.FullName) }
            }
        }
    }
} else {
    $csproj = $candidates[0].FullName
}

if (-not $csproj) {
    Write-Host "[FAIL] No .csproj found under $Target - build validation is required"
    $failures++
} else {
    # BuildAndRun injects
    # the WindowsAppSDK analyzer via a temp Directory.Build.props so WUI000X
    # warnings (UWP-only API residue) actually surface.
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $buildAndRun = Join-Path $scriptDir '..\..\winui-dev-workflow\BuildAndRun.ps1'
    $useBuildAndRun = Test-Path -LiteralPath $buildAndRun -PathType Leaf

    if (-not $useBuildAndRun) {
        Write-Host "[FAIL] Required winui-dev-workflow BuildAndRun.ps1 not found at $buildAndRun"
        $failures++
    } else {
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
        Write-Host "[INFO] Running BuildAndRun.ps1 ($arch Debug, --no-launch) against $([System.IO.Path]::GetFileName($csproj)) (~60-90s)..."
        $buildOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $buildAndRun $csproj '--no-launch' '--arch' $arch '-c' 'Debug' 2>&1
        $buildExit = $LASTEXITCODE

        if ($buildExit -eq 0) {
        $allWarnLines = @($buildOut | Select-String -Pattern '\bwarning [A-Z]+\d+:')
        $warnCount = $allWarnLines.Count

        # WUI000X warnings are emitted by the WindowsAppSDK analyzer for
        # UWP-only API usage (Window.Current, CoreDispatcher,
        # SystemNavigationManager.GetForCurrentView, etc). They compile, but
        # the underlying calls throw COMException at runtime - usually inside
        # Application.Start() before any window can render. Treat them as FAIL
        # even when the build itself succeeds.
        $wuiLines = @($allWarnLines | Where-Object { $_.Line -match '\bwarning\s+WUI\d+:' })
        $wuiDistinct = @{}
        foreach ($w in $wuiLines) {
            $key = ($w.Line -replace '\s*\[.*\]\s*$','').Trim()
            if (-not $wuiDistinct.ContainsKey($key)) { $wuiDistinct[$key] = $true }
        }
        $wuiCount = $wuiDistinct.Count
        if ($wuiCount -gt 0) {
            Write-Host "[FAIL] BuildAndRun succeeded but emitted $wuiCount distinct WUI analyzer warning(s) (UWP-only API residue; full diagnostics in .validator-diagnostics.txt):"
            # Sanitized stdout: print only `<file>(line,col): warning WUIxxxx` -
            # strip the message body which names the offending API.
            $diagBlock = New-Object System.Collections.Generic.List[string]
            $shownN = 0
            foreach ($w in $wuiDistinct.Keys) {
                [void]$diagBlock.Add($w)
                if ($shownN -lt 15) {
                    $rest = $w -replace [regex]::Escape($Target + '\'),''
                    # Match `<path>(line,col): warning WUIxxxx`; drop the rest.
                    if ($rest -match '^(.+?:\s*warning\s+WUI\d+)\b') {
                        Write-Host "       $($matches[1])"
                    } else {
                        Write-Host "       $rest"
                    }
                    $shownN++
                }
            }
            if ($wuiCount -gt 15) { Write-Host "       ($($wuiCount - 15) more - see .validator-diagnostics.txt)" }
            Write-Host "       Resolve via MIGRATION-PATTERNS.md (run scripts/Get-MigrationPattern.ps1 -Anchor windowing|threading|getforcurrentview)."
            Add-Diag 'Build: WUI analyzer warnings' (($diagBlock) -join "`r`n")
            $failures++
        } else {
            Write-Host "[PASS] BuildAndRun succeeded ($warnCount warning(s), 0 WUI analyzer warning(s))"
        }
    } else {
        # Capture distinct CS#### errors (collapse the same error reported by multiple TFMs).
        $errLines = @($buildOut | Select-String -Pattern '\berror [A-Z]+\d+:' -AllMatches)
        $shown = @{}
        $distinct = @()
        foreach ($line in $errLines) {
            $key = ($line.Line -replace '\s*\[.*\]\s*$','').Trim()
            if (-not $shown.ContainsKey($key)) { $shown[$key] = $true; $distinct += $key }
        }
        $totalErr = $errLines.Count
        Write-Host "[FAIL] BuildAndRun FAILED (exit $buildExit, $totalErr error line(s), $($distinct.Count) distinct; full diagnostics in .validator-diagnostics.txt):"
        # Sanitized stdout: keep `<file>(line,col): error CSxxxx`, drop the message.
        $diagBlock = New-Object System.Collections.Generic.List[string]
        # Capture the full build output for the diagnostics file
        [void]$diagBlock.Add('--- BuildAndRun stdout (full) ---')
        foreach ($l in $buildOut) { [void]$diagBlock.Add([string]$l) }
        $shownN = 0
        foreach ($e in $distinct) {
            if ($shownN -ge 15) { break }
            $rest = $e -replace [regex]::Escape($Target + '\'),''
            if ($rest -match '^(.+?:\s*error\s+[A-Z]+\d+)\b') {
                Write-Host "       $($matches[1])"
            } else {
                Write-Host "       $rest"
            }
            $shownN++
        }
        if ($distinct.Count -gt 15) { Write-Host "       ($($distinct.Count - 15) more distinct - see .validator-diagnostics.txt)" }
        Write-Host "       Common patterns: MIGRATION-PATTERNS.md > 'Common build errors after the namespace rewrite'."
        Add-Diag 'Build: BuildAndRun failed' (($diagBlock) -join "`r`n")
        $failures++
        }
    }
}

# --- 7. Runtime smoke launch --------------------------------------------------
# A packaged WinUI 3 app can build cleanly and still crash on startup. The dominant culprit during UWP->WinUI 3 migration is the static-window race: `App.MainWindow = new MainWindow()` evaluates the RHS first, so any code triggered inside `new MainWindow()` (e.g. a synchronous Frame.Navigate that lands on a Page whose OnNavigatedTo reads `App.MainWindow`) sees `null` and throws E_POINTER (0x80004003) before the assignment completes. The compiler and analyzers can't see this; only a real launch does.
#
# We gate on `$failures -eq 0` because (a) launching a project that already has other FAILs adds noise without actionable signal, and (b) the agent's fix loop is clearer when validator returns the *root* set of issues, not downstream cascades.
#
# Report launch as not applicable or explicitly unverified when:
#   - $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH=1 (harness/debug escape hatch; intentionally undocumented in SKILL.md so agents don't learn to set it)
#   - no Package.appxmanifest (unpackaged path - winapp run won't help)
#   - no $csproj resolved
#   - winapp CLI not on PATH
if ($failures -eq 0 -and $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH) {
    Write-Host "[BLOCKED] Smoke launch explicitly disabled by UWP_MIGRATION_SKIP_SMOKE_LAUNCH"
    $unverified++
}
if ($failures -eq 0 -and -not $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH) {
    $hasManifest = (Test-Path -LiteralPath (Join-Path $Target 'Package.appxmanifest')) -or
                   (Test-Path -LiteralPath (Join-Path $Target 'appxmanifest.xml'))
    if ($csproj) {
        $csprojDirSmoke = Split-Path -Parent $csproj
        if (-not $hasManifest) {
            $hasManifest = (Test-Path -LiteralPath (Join-Path $csprojDirSmoke 'Package.appxmanifest')) -or
                           (Test-Path -LiteralPath (Join-Path $csprojDirSmoke 'appxmanifest.xml'))
        }
    }
    $haveWinapp = [bool](Get-Command winapp -ErrorAction SilentlyContinue)

    if (-not $hasManifest) {
        Write-Host "[INFO] Smoke launch not applicable - project has no package manifest"
    } elseif (-not $haveWinapp) {
        Write-Host "[BLOCKED] Smoke launch unavailable - winapp CLI is not installed"
        $unverified++
    } else {
        Write-Host "[INFO] Smoke-launching project via winapp run --detach (~10s settle)..."

        $smokePid = $null
        $smokeRawOut = ''
        $smokeExit = $null
        $smokeError = $null
        try {
            # Use normal project mode so WinApp owns output resolution,
            # registration, and activation.
            $smokeRawOut = & winapp run "$csproj" --detach --json 2>&1 | Out-String
            $smokeExit = $LASTEXITCODE
            if ($smokeRawOut.Trim()) {
                try {
                    $parsed = $smokeRawOut.Trim() | ConvertFrom-Json -ErrorAction Stop
                    if ($parsed.ProcessId) { $smokePid = [int]$parsed.ProcessId }
                } catch {
                    # Classification below uses the complete output and exit code.
                }
            }
        } catch {
            $smokeError = $_.Exception.Message
        }

        if (-not $smokePid -or $smokeExit -ne 0 -or $smokeError) {
            $launchDetails = "$smokeRawOut`r`n$smokeError"
            $recognizedUnavailable = $launchDetails -match '(?i)(developer mode|0x80073cff|certificate|0x800b0109|access is denied|0x80070005|not supported in this environment|interactive user session)'
            if ($recognizedUnavailable) {
                Write-Host "[BLOCKED] Smoke launch unavailable in this environment (exit $smokeExit; no verified PID)"
                $unverified++
            } else {
                Write-Host "[FAIL] winapp run failed or returned no ProcessId (exit $smokeExit)"
                $failures++
            }
            Add-Diag 'Smoke launch: no verified PID' (
                "project: $csproj`r`n" +
                "winapp run exit: $smokeExit`r`n" +
                "stdout/stderr:`r`n$smokeRawOut`r`n" +
                ($(if ($smokeError) { "exception: $smokeError" } else { '' }))
            )
        } else {
            Start-Sleep -Seconds 10
            $alive = $null -ne (Get-Process -Id $smokePid -ErrorAction SilentlyContinue)
            if ($alive) {
                Write-Host "[PASS] Smoke launch - process $smokePid stayed alive 10s"
                try { Stop-Process -Id $smokePid -Force -ErrorAction SilentlyContinue } catch {}
            } else {
                Write-Host "[FAIL] App crashed within 10s of launch (process $smokePid exited)"
                Write-Host "       Likely an unhandled exception in App.OnLaunched or the first Page navigation."
                Write-Host "       See MIGRATION-PATTERNS.md#windowing ('Initialization order')."
                Write-Host "       Reproduce locally: winapp run `"$csproj`""
                Add-Diag 'Smoke launch: process died within 10s' (
                    "project: $csproj`r`n" +
                    "winapp run exit: $smokeExit`r`n" +
                    "ProcessId: $smokePid`r`n" +
                    "winapp stdout/stderr:`r`n$smokeRawOut"
                )
                $failures++
            }
        }
    }
}

# --- Summary -------------------------------------------------------------------
# Always write the diagnostics file (even when empty) so its presence is predictable. The agent can grep / open it on FAIL without guessing.
Set-Content -LiteralPath $diagPath -Value $diagLines -Encoding UTF8

Write-Host ""
if ($failures -eq 0 -and $unverified -gt 0) {
    Write-Host "==> Validate-UwpMigration: UNVERIFIED ($unverified BLOCKED gate(s))"
    exit 2
} elseif ($failures -eq 0) {
    if ($warnings -gt 0) {
        Write-Host "==> Validate-UwpMigration: PASS with $warnings WARN(s) - review .validator-diagnostics.txt and decide whether each is intentional"
    } else {
        Write-Host "==> Validate-UwpMigration: PASS"
    }
    exit 0
} else {
    $warnNote = if ($warnings -gt 0) { " (+$warnings WARN)" } else { '' }
    Write-Host "==> Validate-UwpMigration: $failures FAIL(s)$warnNote - fix and re-run before declaring done"
    Write-Host "    Full diagnostics: $diagPath"
    exit 1
}