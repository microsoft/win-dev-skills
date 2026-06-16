<#
.SYNOPSIS
Mandatory final-validation pass for UWP → WinUI 3 migration. Runs every
mechanical check in one shot with PASS/FAIL diagnostics.

.DESCRIPTION
SKILL.md Step 4 = "run this script; if any FAIL, fix it and re-run; never
declare done with FAIL." All [FAIL] output is sanitized — full diagnostics
(snippets, compiler errors) go to .validator-diagnostics.txt at the target
root, not to stdout, to keep concentrated API-name lists out of the agent's
assistant turn.

Does NOT run `winapp build` itself — build cleanliness is a separate gate
the agent invokes alongside this (`winapp build` then this script).

Checks (numbering matches the `# ─── N.` sections in the code):
1. Residue grep — leftover Windows.UI.Xaml using/xmlns, unsupported APIs not deferred, UWP-only csproj markers
2. TODO[migrate-NNN] residue — every injected marker must be resolved
3. MIGRATION-MAPPING.md integrity — .bootstrap-meta.json present, row count, labels filled, no row stuck at Status=copied
4. MIGRATION-DEFERRED.md consistency — every defer row in mapping has a row here, and vice versa
5. Package.appxmanifest image refs + WinAppSDK packaging (TargetDeviceFamily=Windows.Desktop, rescap, runFullTrust)
6. dotnet build healthcheck via BuildAndRun.ps1 (surfaces WUI analyzer warnings for UWP-only API residue)
7. Runtime smoke launch — delegates to Test-AppLaunch.ps1: `winapp run --detach` + alive check, and on a startup crash captures the real WER signature (event 1000 native code + event 1026 .NET exception). FAILs on a registered-then-crashed app; WARNs only on a genuine deploy/environment failure

.PARAMETER Target
Migrated WinUI 3 project root (same folder used as -Target for
Initialize-UwpMigration.ps1).

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

# All FAIL diagnostics with API names / code snippets / compiler messages go
# here, not stdout. Stdout gets a one-line summary + file:line pointers.
$diagPath = Join-Path $Target '.validator-diagnostics.txt'
$diagLines = New-Object System.Collections.Generic.List[string]
function Add-Diag([string]$section, [string]$text) {
    [void]$diagLines.Add('')
    [void]$diagLines.Add("=== $section ===")
    [void]$diagLines.Add($text)
}
[void]$diagLines.Add("# Validator diagnostics — generated $((Get-Date).ToString('o'))")
[void]$diagLines.Add('# Detailed snippets / build errors live here; stdout has only file:line summaries.')

# ─── 1. Residue grep ───────────────────────────────────────────────────────────
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

# Filter: hits matching a row already labeled 'defer' or 'deferred' in mapping are EXPECTED.
$mapPath = Join-Path $Target 'MIGRATION-MAPPING.md'
$mapText = if (Test-Path -LiteralPath $mapPath) { Get-Content -LiteralPath $mapPath -Raw } else { '' }
$deferredFiles = @{}
foreach ($line in ($mapText -split "`n")) {
    if ($line -match '^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*(defer|deferred)\s*\|') {
        $deferredFiles[$matches[1].Trim()] = $true
    }
}
$residueHits = @($residueHits | Where-Object { -not $deferredFiles.ContainsKey($_.File) })

if ($residueHits.Count -eq 0) {
    Write-Host "[PASS] Residue grep — 0 UWP-only API references in non-deferred .cs/.xaml/.csproj"
} else {
    Write-Host "[FAIL] Residue grep — $($residueHits.Count) UWP-only reference(s) remain in non-deferred files (full diagnostics in .validator-diagnostics.txt):"
    $diagBlock = New-Object System.Collections.Generic.List[string]
    $byFile = $residueHits | Group-Object File | Select-Object -First 30
    foreach ($g in $byFile) {
        # Stdout: file:line only — no [Name], no snippet — to avoid pushing
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

# ─── 2. TODO[migrate-NNN] residue ──────────────────────────────────────────────
# Initialize-UwpMigration.ps1 injects `TODO[migrate-NNN]: see PATTERNS.md#<anchor>`
# markers above every adaptable API hit. Every one of them must be resolved
# (the marker removed) before the migration can be declared done.
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

# ─── 3. MIGRATION-MAPPING.md integrity ─────────────────────────────────────────
if (-not (Test-Path -LiteralPath $mapPath)) {
    Write-Host "[FAIL] MIGRATION-MAPPING.md not found at target root"
    $failures++
} else {
    $mapRows = @()
    foreach ($line in ($mapText -split "`n")) {
        if ($line -match '^\|' -and $line -notmatch '^\|\s*-+\s*\|' -and $line -notmatch '^\|\s*Source file\s*\|') {
            $mapRows += $line
        }
    }

    # Row count vs seed meta
    $metaPath = Join-Path $Target '.bootstrap-meta.json'
    if (Test-Path -LiteralPath $metaPath) {
        try {
            $meta = Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json
        } catch {
            Write-Host "[FAIL] .bootstrap-meta.json present but does not parse as JSON: $_"
            $meta = $null
            $failures++
        }
        if ($meta) {
            if (-not $meta.version -or [int]$meta.version -lt 2) {
                Write-Host "[FAIL] .bootstrap-meta.json schema version is missing or < 2 — re-run Initialize-UwpMigration.ps1"
                $failures++
            }
            $seeded = $meta.seededRowCount
            if ($null -eq $seeded) {
                Write-Host "[FAIL] .bootstrap-meta.json is missing seededRowCount"
                $failures++
            } elseif ($mapRows.Count -eq $seeded) {
                Write-Host "[PASS] MIGRATION-MAPPING.md row count = $($mapRows.Count) (matches seed)"
            } else {
                Write-Host "[FAIL] MIGRATION-MAPPING.md row count = $($mapRows.Count) but seed was $seeded (rows were added or removed during Steps 2-5)"
                $failures++
            }
        }
    } else {
        Write-Host "[FAIL] .bootstrap-meta.json missing at target root — Initialize-UwpMigration.ps1 was not run (or was run with an older script). Re-run it before continuing."
        $failures++
    }

    # Pending / LLM-review rows
    $pendingRows = @($mapRows | Where-Object { $_ -match '\(pending\)|\(LLM-review\)' })
    if ($pendingRows.Count -eq 0) {
        Write-Host "[PASS] MIGRATION-MAPPING.md — all Triage labels resolved"
    } else {
        Write-Host "[FAIL] MIGRATION-MAPPING.md — $($pendingRows.Count) row(s) still have Triage = (pending) or (LLM-review):"
        foreach ($r in $pendingRows | Select-Object -First 10) { Write-Host "       $($r.Trim())" }
        $failures++
    }

    # Status=copied stuck rows
    $copiedRows = @($mapRows | Where-Object { $_ -match '\|\s*copied\s*\|' })
    if ($copiedRows.Count -eq 0) {
        Write-Host "[PASS] MIGRATION-MAPPING.md — no rows stuck at Status=copied"
    } else {
        Write-Host "[FAIL] MIGRATION-MAPPING.md — $($copiedRows.Count) row(s) still Status=copied (flip to done or deferred):"
        foreach ($r in $copiedRows | Select-Object -First 10) { Write-Host "       $($r.Trim())" }
        $failures++
    }

    # ─── 4. MIGRATION-DEFERRED.md consistency ──────────────────────────────────
    $deferRows = @($mapRows | Where-Object { $_ -match '\|\s*(defer|deferred)\s*\|' })
    $deferPath = Join-Path $Target 'MIGRATION-DEFERRED.md'
    if ($deferRows.Count -gt 0) {
        if (-not (Test-Path -LiteralPath $deferPath)) {
            Write-Host "[FAIL] $($deferRows.Count) defer row(s) in MIGRATION-MAPPING.md but MIGRATION-DEFERRED.md missing"
            $failures++
        } else {
            $deferText = Get-Content -LiteralPath $deferPath -Raw
            $deferTextRows = @()
            foreach ($line in ($deferText -split "`n")) {
                if ($line -match '^\|' -and $line -notmatch '^\|\s*-+\s*\|' -and $line -notmatch '^\|\s*(Source file|File)\s*\|') {
                    $deferTextRows += $line
                }
            }
            if ($deferTextRows.Count -eq $deferRows.Count) {
                Write-Host "[PASS] MIGRATION-DEFERRED.md row count ($($deferTextRows.Count)) matches defer rows in mapping"
            } else {
                Write-Host "[FAIL] MIGRATION-DEFERRED.md has $($deferTextRows.Count) rows; MIGRATION-MAPPING.md has $($deferRows.Count) defer rows"
                $failures++
            }
        }
    } else {
        if (Test-Path -LiteralPath $deferPath) {
            $deferText = Get-Content -LiteralPath $deferPath -Raw
            if ($deferText -notmatch 'No items deferred') {
                Write-Host "[WARN] MIGRATION-DEFERRED.md exists with content but mapping has no defer rows — check consistency"
            } else {
                Write-Host "[PASS] No defer rows; MIGRATION-DEFERRED.md correctly notes 'No items deferred.'"
            }
        } else {
            Write-Host "[PASS] No defer rows; MIGRATION-DEFERRED.md not required"
        }
    }
}

# ─── 5. Package.appxmanifest image references ─────────────────────────────────
# AppX deployment (winapp run) fails with 0x80073CF6 / "image cannot be located"
# when the manifest references image files that don't exist on disk. UWP samples
# typically use names like `Splash-sdk.png` / `StoreLogo-sdk.png` while the
# WinUI 3 scaffold ships scaffold defaults (`SplashScreen.scale-200.png`,
# `StoreLogo.png`). Verify every image referenced by the manifest is present
# (either as the exact filename or as a scale-*/targetsize-*/altform-* variant
# of the same base name, which Windows resource resolution accepts).
$manifestPath = Join-Path $Target 'Package.appxmanifest'
if (Test-Path -LiteralPath $manifestPath) {
    $manifestText = Get-Content -LiteralPath $manifestPath -Raw
    $imageRefs = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in [regex]::Matches($manifestText, '<Logo>([^<]+)</Logo>')) {
        [void]$imageRefs.Add($m.Groups[1].Value.Trim())
    }
    $attrPattern = '(?:Square150x150Logo|Square71x71Logo|Square44x44Logo|Square310x310Logo|Wide310x150Logo|Image|BackgroundImage|LockScreen\s+Notification)\s*=\s*"([^"]+\.(?:png|jpg|jpeg|ico|svg|gif))"'
    foreach ($m in [regex]::Matches($manifestText, $attrPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        [void]$imageRefs.Add($m.Groups[1].Value.Trim())
    }

    $missing = @()
    foreach ($ref in $imageRefs) {
        # Normalise separators and resolve against project root
        $relPath = $ref -replace '/', '\'
        $absPath = Join-Path $Target $relPath
        if (Test-Path -LiteralPath $absPath) { continue }

        # Fall back: Windows resource resolution accepts scale-*/targetsize-*/altform-*
        # variants of the same base name. e.g. manifest says "Assets\StoreLogo.png"
        # and disk only has "Assets\StoreLogo.scale-200.png" — that's OK.
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
        Write-Host "[PASS] Package.appxmanifest — all $($imageRefs.Count) image reference(s) resolvable under Assets/"
    } else {
        Write-Host "[FAIL] Package.appxmanifest references $($missing.Count) image file(s) that don't exist on disk:"
        foreach ($r in $missing) { Write-Host "       $r" }
        Write-Host "       Fix: either (a) edit Package.appxmanifest to reference assets that exist under Assets/"
        Write-Host "       (the scaffold defaults like Assets\StoreLogo.png and Assets\SplashScreen.scale-200.png"
        Write-Host "       are the simplest path), or (b) copy the missing files from .uwp-source\Assets\ into Assets\."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Package.appxmanifest — reconcile image references'."
        $failures++
    }

    # ─── 5b. Package.appxmanifest WinUI 3 packaging requirements ──────────────
    # `winapp run` refuses to register the AppX when the manifest still looks
    # UWP-shaped. Three things must be true for the packaged desktop app to
    # deploy and activate on Windows 10/11:
    #   1) <TargetDeviceFamily Name="Windows.Desktop"> (Windows.Universal is
    #      UWP-only; the registrar rejects it for a Win32 entrypoint).
    #   2) xmlns:rescap="…/restrictedcapabilities/…" declared on <Package> and
    #      added to IgnorableNamespaces (otherwise the rescap element below is
    #      stripped and the runFullTrust check below silently fails).
    #   3) <rescap:Capability Name="runFullTrust" /> present — packaged WinUI 3
    #      apps run elevated relative to AppContainer and must declare it.
    # Real-world impact: run18 Printing and run19 BasicSuspension both built
    # cleanly but failed `winapp run` registration with "requires runFullTrust
    # capability" — the agent migrated code but never touched the manifest.
    $manifestFailures = 0
    if ($manifestText -notmatch '<TargetDeviceFamily\s+Name="Windows\.Desktop"') {
        Write-Host "[FAIL] Package.appxmanifest <TargetDeviceFamily> is not Windows.Desktop"
        Write-Host "       Fix: change `<TargetDeviceFamily Name=`"Windows.Universal`" …/>` to `Windows.Desktop`."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    $hasRescapNs = $manifestText -match 'xmlns:rescap\s*=\s*"http://schemas\.microsoft\.com/appx/manifest/foundation/windows10/restrictedcapabilities"'
    $rescapInIgnorable = $manifestText -match 'IgnorableNamespaces\s*=\s*"[^"]*\brescap\b[^"]*"'
    if (-not $hasRescapNs -or -not $rescapInIgnorable) {
        Write-Host "[FAIL] Package.appxmanifest is missing the rescap namespace declaration"
        Write-Host "       Fix: on <Package> add xmlns:rescap=`"…/restrictedcapabilities/…`" and append 'rescap' to IgnorableNamespaces."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    if ($manifestText -notmatch '<rescap:Capability\s+Name="runFullTrust"\s*/>') {
        Write-Host "[FAIL] Package.appxmanifest is missing <rescap:Capability Name=`"runFullTrust`" />"
        Write-Host "       Without it, `winapp run` fails registration: 'requires runFullTrust capability'."
        Write-Host "       Fix: add it inside <Capabilities> (create the element if absent)."
        Write-Host "       See MIGRATION-PATTERNS.md > 'Manifest migration checklist'."
        $manifestFailures++
    }
    if ($manifestFailures -eq 0) {
        Write-Host "[PASS] Package.appxmanifest — Windows.Desktop target + rescap:runFullTrust capability declared"
    } else {
        $failures += $manifestFailures
    }
} else {
    Write-Host "[WARN] Package.appxmanifest not found at $manifestPath — skipping image-reference check"
}

# ─── 6. dotnet build healthcheck ──────────────────────────────────────────────
# The validator must gate on a clean build, otherwise common namespace-rewrite
# fallout (CS0104 LaunchActivatedEventArgs ambiguity, CS0246 scaffold-vs-UWP
# namespace mismatch like MainWindow.xaml.cs referencing a moved MainPage, etc.)
# slips past validation and surfaces only during the benchmark's own build.
# Running `dotnet build` here forces the agent's `validator must PASS` loop to
# include the build as a precondition for declaring done.
$csproj = $null
$candidates = @(Get-ChildItem -LiteralPath $Target -Filter '*.csproj' -File -ErrorAction SilentlyContinue)
if ($candidates.Count -eq 0) {
    # Fall back to a recursive scan that mirrors what the benchmark/launch flow does
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
    Write-Host "[WARN] No .csproj found under $Target — skipping build healthcheck"
} else {
    # Prefer BuildAndRun.ps1 over a bare `dotnet build`: BuildAndRun injects
    # the WindowsAppSDK analyzer via a temp Directory.Build.props so WUI000X
    # warnings (UWP-only API residue) actually surface. A vanilla
    # `dotnet build` would silently pass the same tree because the analyzer
    # ships with winui-dev-workflow and is not referenced by the csproj.
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $buildAndRun = Join-Path $scriptDir '..\..\winui-dev-workflow\BuildAndRun.ps1'
    $useBuildAndRun = Test-Path -LiteralPath $buildAndRun
    $haveDotnet = [bool](Get-Command dotnet -ErrorAction SilentlyContinue)

    if (-not $useBuildAndRun -and -not $haveDotnet) {
        Write-Host "[WARN] Neither BuildAndRun.ps1 nor dotnet CLI available — skipping build healthcheck"
    } else {
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
        if ($useBuildAndRun) {
            Write-Host "[INFO] Running BuildAndRun.ps1 ($arch Debug, -SkipRun) against $([System.IO.Path]::GetFileName($csproj)) (~60-90s)..."
            $buildOut = & powershell -NoProfile -ExecutionPolicy Bypass -File $buildAndRun $csproj -SkipRun "/p:Platform=$arch" '/p:Configuration=Debug' 2>&1
            $buildExit = $LASTEXITCODE
        } else {
            Write-Host "[INFO] Running dotnet build ($arch Debug, -t:Rebuild) against $([System.IO.Path]::GetFileName($csproj)) (~30-60s)..."
            # -t:Rebuild forces a fresh compile so any analyzers re-emit. Note
            # this path won't surface WUI warnings because the analyzer isn't
            # referenced — BuildAndRun.ps1 is the correct route. This fallback
            # exists for environments without the bundled analyzer.
            $buildArgs = @('build', $csproj, '-c', 'Debug', "-p:Platform=$arch", '-t:Rebuild', '--nologo', '-v:m')
            $buildOut = & dotnet @buildArgs 2>&1
            $buildExit = $LASTEXITCODE
        }

        if ($buildExit -eq 0) {
        $allWarnLines = @($buildOut | Select-String -Pattern '\bwarning [A-Z]+\d+:')
        $warnCount = $allWarnLines.Count

        # WUI000X warnings are emitted by the WindowsAppSDK analyzer for
        # UWP-only API usage (Window.Current, CoreDispatcher,
        # SystemNavigationManager.GetForCurrentView, etc). They compile, but
        # the underlying calls throw COMException at runtime — usually inside
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
            Write-Host "[FAIL] dotnet build succeeded but emitted $wuiCount distinct WUI analyzer warning(s) (UWP-only API residue; full diagnostics in .validator-diagnostics.txt):"
            # Sanitized stdout: print only `<file>(line,col): warning WUIxxxx` —
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
            if ($wuiCount -gt 15) { Write-Host "       ($($wuiCount - 15) more — see .validator-diagnostics.txt)" }
            Write-Host "       Resolve via PATTERNS.md (run scripts/Get-MigrationPattern.ps1 -Anchor windowing|threading|getforcurrentview)."
            Add-Diag 'Build: WUI analyzer warnings' (($diagBlock) -join "`r`n")
            $failures++
        } else {
            Write-Host "[PASS] dotnet build succeeded ($warnCount warning(s), 0 WUI analyzer warning(s))"
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
        Write-Host "[FAIL] dotnet build FAILED (exit $buildExit, $totalErr error line(s), $($distinct.Count) distinct; full diagnostics in .validator-diagnostics.txt):"
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
        if ($distinct.Count -gt 15) { Write-Host "       ($($distinct.Count - 15) more distinct — see .validator-diagnostics.txt)" }
        Write-Host "       Common patterns: PATTERNS.md > 'Common build errors after the namespace rewrite'."
        Add-Diag 'Build: dotnet build failed' (($diagBlock) -join "`r`n")
        $failures++
        }
    }
}

# ─── 7. Runtime smoke launch ──────────────────────────────────────────────────
# A packaged WinUI 3 app can build cleanly and still crash on startup. A common
# UWP→WinUI 3 culprit is the static-window init-order race (a Page reads
# App.MainWindow before OnLaunched assigns it → E_POINTER 0x80004003), but there
# are others (thread/apartment-affined APIs touched at startup, missing package
# refs, legacy activation incompatibility). The compiler and analyzers can't see
# any of these; only a real launch does. We delegate the launch + crash
# classification + WER signature capture to Test-AppLaunch.ps1 (the same tool
# Step 3 uses) so a startup crash is reported as FAIL with the real captured
# exception — never a false PASS.
#
# We gate on `$failures -eq 0` because (a) launching a project that already
# has other FAILs adds noise without actionable signal, and (b) the agent's
# fix loop is clearer when validator returns the *root* set of issues, not
# downstream cascades.
#
# Skip silently (no FAIL) when the smoke launch isn't applicable:
#   - $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH=1 (harness/debug escape hatch;
#     intentionally undocumented in SKILL.md so agents don't learn to set it)
#   - no Package.appxmanifest (unpackaged path — winapp run won't help)
#   - no $csproj resolved
#   - winapp CLI not on PATH
#   - build output folder not discoverable
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

    if (-not $csproj -or -not $hasManifest -or -not $haveWinapp) {
        # Silent skip — not an applicable environment.
    } else {
        # Discover the most recently written build-output layout.
        # Prefer the host-arch x64/ARM64 Debug bin/<arch>/Debug/<tfm>/win-<rid>
        # but fall back to whatever the newest TFM dir is. We always anchor to
        # bin/<arch>/Debug and walk one level into the TFM dir.
        $archSmoke = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
        $ridSmoke = $archSmoke.ToLower()
        $launchFolder = $null
        $binCandidates = @(
            (Join-Path $csprojDirSmoke "bin\$archSmoke\Debug"),
            (Join-Path $csprojDirSmoke "bin\$($archSmoke.ToLower())\Debug")
        )
        foreach ($bc in $binCandidates) {
            if (-not (Test-Path -LiteralPath $bc)) { continue }
            $tfmDir = Get-ChildItem -LiteralPath $bc -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^net\d' } |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
            if (-not $tfmDir) { continue }
            $ridDir = Join-Path $tfmDir.FullName "win-$ridSmoke"
            if (Test-Path -LiteralPath $ridDir) { $launchFolder = $ridDir; break }
            $launchFolder = $tfmDir.FullName
            break
        }

        if (-not $launchFolder) {
            # Silent skip — the build hasn't produced a layout we can launch.
            # This shouldn't normally happen because the build healthcheck just
            # passed, but rather than emit a misleading FAIL we let the build
            # step own that signal.
        } else {
            # Confirm the folder actually contains the .exe + AppxManifest.xml
            # (winapp run will fail noisily otherwise, which we'd interpret as
            # a launch crash). If either is missing, silent skip.
            $hasExe = @(Get-ChildItem -LiteralPath $launchFolder -Filter '*.exe' -File -ErrorAction SilentlyContinue).Count -gt 0
            $hasMfst = (Test-Path -LiteralPath (Join-Path $launchFolder 'AppxManifest.xml')) -or
                       (Test-Path -LiteralPath (Join-Path $launchFolder 'AppX\AppxManifest.xml'))
            if (-not ($hasExe -and $hasMfst)) {
                # Silent skip — incomplete layout.
            } else {
                Write-Host "[INFO] Smoke-launching app via Test-AppLaunch.ps1 (~10s settle)..."

                # Delegate launch + crash classification + WER capture to the
                # shared diagnose script (the same tool Step 3 uses). It returns
                # JSON: status = running | crashed | unavailable. Map to:
                #   running     -> [PASS]
                #   crashed     -> [FAIL]  (registered then died at startup — a real defect)
                #   unavailable -> [WARN]  (deploy/env problem, not a code defect)
                $testLaunch = Join-Path $PSScriptRoot 'Test-AppLaunch.ps1'
                $launchJson = ''
                try {
                    $launchJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $testLaunch -Layout $launchFolder -Json 2>&1 | Out-String
                } catch {
                    $launchJson = ''
                }
                $lr = $null
                if ($launchJson.Trim()) { try { $lr = $launchJson.Trim() | ConvertFrom-Json -ErrorAction Stop } catch { } }

                if (-not $lr) {
                    # No parseable result — don't invent a verdict.
                    Write-Host "[WARN] Smoke launch — diagnose helper returned no parseable result; skipping"
                    Add-Diag 'Smoke launch: no parseable result' $launchJson
                } elseif ($lr.status -eq 'running') {
                    Write-Host "[PASS] Smoke launch — app stayed alive after launch (pid $($lr.pid))"
                } elseif ($lr.status -eq 'crashed') {
                    Write-Host "[FAIL] App crashed at startup — it registered, then died before showing a window (full diagnostics in .validator-diagnostics.txt):"
                    if ($lr.crash) {
                        if ($lr.crash.code)        { Write-Host "       Exception code : $($lr.crash.code)" }
                        if ($lr.crash.managedType) { Write-Host "       .NET exception : $($lr.crash.managedType)" }
                        if ($lr.crash.hint)        { Write-Host "       $($lr.crash.hint)" }
                        if ($lr.crash.anchor)      { Write-Host "       Fix pattern    : Get-MigrationPattern.ps1 -Anchor $($lr.crash.anchor)" }
                    }
                    Write-Host "       Diagnose / reproduce: scripts/Test-AppLaunch.ps1 -Target `"$Target`""
                    $diagText = "status: crashed`r`ndetail: $($lr.detail)`r`nlayout: $($lr.layout)"
                    if ($lr.crash) {
                        $diagText += "`r`ncode: $($lr.crash.code)`r`nmodule: $($lr.crash.module)`r`nmanagedType: $($lr.crash.managedType)`r`nmessage: $($lr.crash.message)`r`nhint: $($lr.crash.hint)`r`nanchor: $($lr.crash.anchor)"
                    }
                    Add-Diag 'Smoke launch: startup crash' $diagText
                    $failures++
                } else {
                    # unavailable — inconclusive deploy/environment failure.
                    Write-Host "[WARN] Smoke launch — could not launch the app (environment/deploy issue, not a code defect); skipping"
                    if ($lr.detail) { Write-Host "       $($lr.detail)" }
                    Add-Diag 'Smoke launch: unavailable (env)' "status: unavailable`r`ndetail: $($lr.detail)"
                }
            }
        }
    }
}

# ─── Summary ───────────────────────────────────────────────────────────────────
# Always write the diagnostics file (even when empty) so its presence is
# predictable. The agent can grep / open it on FAIL without guessing.
Set-Content -LiteralPath $diagPath -Value $diagLines -Encoding UTF8

Write-Host ""
if ($failures -eq 0) {
    Write-Host "==> Validate-UwpMigration: PASS"
    exit 0
} else {
    Write-Host "==> Validate-UwpMigration: $failures FAIL(s) — fix and re-run before declaring done"
    Write-Host "    Full diagnostics: $diagPath"
    exit 1
}