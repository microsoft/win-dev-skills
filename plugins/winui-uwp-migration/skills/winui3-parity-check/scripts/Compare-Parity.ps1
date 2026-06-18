<#
.SYNOPSIS
Grade a migrated WinUI 3 app's functional parity against the UWP feature
checklist. Deterministic structural gate (exit 0 = PASS, 1 = FAIL) plus a
human/LLM-readable PARITY-REPORT.md that drives the agent's fix loop.

.DESCRIPTION
Layered comparison (cheap + robust first, no pixel diff — none of the toolchain
ships ImageMagick, and a screenshot-byte diff is fragile across theme/DPI):

  L1  Reachability — did the WinUI 3 capture produce a non-blank screenshot for
      each baseline scenario? (blank window == failed migration; mirrors the
      benchmark's own blank-screenshot penalty.)
  L2  Control coverage — for each baseline scenario, what fraction of its named
      / labelled controls appear (by AutomationId, name, or label text) in the
      WinUI 3 scenario's captured UIA dump? This is the primary structural signal.

Per-scenario verdict:
  - pass    : reachable AND coverage >= -PassThreshold (default 0.8)
  - partial : reachable AND coverage >= -PartialThreshold (default 0.4)
  - fail    : not reachable, blank screenshot, or coverage below partial

The script exits non-zero if ANY scenario is `fail` (or, with -StrictPartial,
if any is below `pass`). Visual fidelity + behavioural nuance are intentionally
left to the agent (it has the screenshots) / the benchmark judge — this gate
catches the dominant failure mode: silently dropped scenarios and controls.

.PARAMETER Checklist
Baseline checklist.json (from Extract-UwpFeatureChecklist.ps1).

.PARAMETER Candidate
Folder produced by Capture-AppScenarios.ps1 against the WinUI 3 app (contains
ui/ + screenshots/ + capture-manifest.json).

.PARAMETER OutDir
Where to write PARITY-REPORT.md + parity-result.json. Defaults to -Candidate.

.PARAMETER PassThreshold
Coverage fraction for a `pass`. Default 0.8.

.PARAMETER PartialThreshold
Coverage fraction for a `partial`. Default 0.4.

.PARAMETER BlankBytes
Screenshots at/under this size are treated as blank/unrendered. Default 15360.

.PARAMETER StrictPartial
Treat `partial` scenarios as failures for the exit code.

.EXAMPLE
.\Compare-Parity.ps1 -Checklist .\parity-baseline\checklist.json -Candidate .\parity-winui3
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Checklist,
    [Parameter(Mandatory)][string]$Candidate,
    [string]$OutDir,
    [double]$PassThreshold = 0.8,
    [double]$PartialThreshold = 0.4,
    [int]$BlankBytes = 15360,
    [switch]$StrictPartial
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Checklist)) { throw "Checklist not found: $Checklist" }
if (-not (Test-Path -LiteralPath $Candidate)) { throw "Candidate capture folder not found: $Candidate" }
$Candidate = (Resolve-Path -LiteralPath $Candidate).ProviderPath
if (-not $OutDir) { $OutDir = $Candidate }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$cl = Get-Content -LiteralPath $Checklist -Raw | ConvertFrom-Json
$uiDir   = Join-Path $Candidate 'ui'
$shotDir = Join-Path $Candidate 'screenshots'

# Control types that legitimately expose no AutomationId / name / label text
# through the WinUI 3 UIA automation peer (so they can never match by token).
# A correct migration still has them in the tree — match these by control TYPE
# (className) instead, otherwise the checker reports false-negative FAILs.
$Script:TextlessControlTypes = @(
    'MediaPlayerElement', 'MediaPlayer', 'MediaTransportControls',
    'Image', 'CaptureElement', 'SwapChainPanel', 'WebView2'
)

# The captured UIA dump is read as RAW JSON text, so non-ASCII / symbol chars are
# stored as \uXXXX escapes (e.g. the seek-button label "<<15m" is "\u003C\u003C15m").
# Decode those escapes so symbol tokens like "<<" / ">>" can substring-match.
function Expand-JsonUnicodeEscapes([string]$text) {
    if ([string]::IsNullOrEmpty($text)) { return $text }
    return [regex]::Replace($text, '\\u([0-9a-fA-F]{4})', {
        param($m) [char][int]('0x' + $m.Groups[1].Value)
    })
}

function Test-Token([string]$haystack, [string]$token) {
    if ([string]::IsNullOrWhiteSpace($token)) { return $false }
    # Normalize whitespace and case for substring match.
    $t = ($token -replace '\s+', ' ').Trim()
    if ($t.Length -lt 2) { return $false }
    return $haystack.ToLowerInvariant().Contains($t.ToLowerInvariant())
}

$scenarioResults = @()
foreach ($s in $cl.scenarios) {
    $num = [int]$s.number
    $uiFile = Join-Path $uiDir ('{0:00}.json' -f $num)
    $shotFile = Join-Path $shotDir ('{0:00}_{1}.png' -f $num, $s.slug)

    $uiText = ''
    if (Test-Path -LiteralPath $uiFile) { $uiText = Get-Content -LiteralPath $uiFile -Raw }
    # Decode \uXXXX escapes so symbol labels (e.g. seek buttons "<<" / ">>") match.
    $uiText = Expand-JsonUnicodeEscapes $uiText

    $shotBytes = if (Test-Path -LiteralPath $shotFile) { (Get-Item -LiteralPath $shotFile).Length } else { 0 }
    $reachable = ($shotBytes -gt $BlankBytes) -or ($uiText.Length -gt 200)
    $blank = ($shotBytes -gt 0 -and $shotBytes -le $BlankBytes)

    # Control coverage: a control counts as "present" if its AutomationId, name,
    # or label text appears in the captured UIA dump.
    $controls = @($s.controls)
    $total = $controls.Count
    $hits = 0
    $missing = @()
    foreach ($c in $controls) {
        $found = $false
        foreach ($tok in @($c.name, $c.label)) {
            if (Test-Token $uiText $tok) { $found = $true; break }
        }
        # Fallback for text-less controls (e.g. MediaPlayerElement) that expose no
        # AutomationId/name/label through the UIA peer: match by control type so a
        # correctly-migrated element isn't reported as a false-negative miss.
        if (-not $found -and $c.type -and ($Script:TextlessControlTypes -contains $c.type)) {
            if (Test-Token $uiText $c.type) { $found = $true }
        }
        if ($found) { $hits++ }
        else {
            $desc = $c.type
            if ($c.label) { $desc += " `"$($c.label)`"" } elseif ($c.name) { $desc += " ($($c.name))" }
            $missing += $desc
        }
    }
    $coverage = if ($total -eq 0) { 1.0 } else { [math]::Round($hits / $total, 3) }

    $verdict =
        if (-not $reachable) { 'fail' }
        elseif ($coverage -ge $PassThreshold) { 'pass' }
        elseif ($coverage -ge $PartialThreshold) { 'partial' }
        else { 'fail' }

    $reason = ''
    if (-not $reachable) {
        $reason = if ($blank) { "Scenario screenshot is blank ($shotBytes bytes) — page did not render." } else { "Scenario not reachable — no screenshot/UIA captured." }
    } elseif ($missing.Count -gt 0) {
        $reason = "Missing $($missing.Count)/$total control(s): " + (($missing | Select-Object -First 8) -join '; ')
    }

    $scenarioResults += [PSCustomObject]@{
        number = $num; title = $s.title; verdict = $verdict
        coverage = $coverage; controlsTotal = $total; controlsFound = $hits
        reachable = $reachable; screenshotBytes = $shotBytes
        missing = $missing; reason = $reason
        screenshot = ('{0:00}_{1}.png' -f $num, $s.slug)
    }
}

$counts = @{ pass = 0; partial = 0; fail = 0 }
foreach ($r in $scenarioResults) { $counts[$r.verdict]++ }
$totalScenarios = $scenarioResults.Count
# Parity score: pass=1, partial=0.5, fail=0.
$parityScore = if ($totalScenarios -eq 0) { 0 } else {
    [math]::Round((($counts.pass * 1.0) + ($counts.partial * 0.5)) / $totalScenarios * 100, 1)
}

$failGate = ($counts.fail -gt 0) -or ($StrictPartial -and $counts.partial -gt 0)

# ─── PARITY-REPORT.md ─────────────────────────────────────────────────────────
$md = New-Object System.Collections.Generic.List[string]
[void]$md.Add("# Parity Report — $($cl.featureName)")
[void]$md.Add('')
[void]$md.Add("Generated $((Get-Date).ToString('o')) by Compare-Parity.ps1.")
[void]$md.Add('')
[void]$md.Add("**Parity score: $parityScore / 100**  ·  pass=$($counts.pass) partial=$($counts.partial) fail=$($counts.fail)  ·  $totalScenarios scenario(s)")
[void]$md.Add('')
[void]$md.Add('| # | Scenario | Verdict | Coverage | Screenshot | Notes |')
[void]$md.Add('|---|----------|---------|----------|------------|-------|')
foreach ($r in $scenarioResults) {
    $cov = if ($r.controlsTotal -eq 0) { 'n/a' } else { "$($r.controlsFound)/$($r.controlsTotal)" }
    $note = ($r.reason -replace '\|', '\\|')
    [void]$md.Add("| $($r.number) | $($r.title) | $($r.verdict.ToUpper()) | $cov | $($r.screenshot) | $note |")
}
[void]$md.Add('')
$failing = @($scenarioResults | Where-Object { $_.verdict -ne 'pass' })
if ($failing.Count -gt 0) {
    [void]$md.Add('## Scenarios needing work')
    [void]$md.Add('')
    foreach ($r in $failing) {
        [void]$md.Add("### Scenario $($r.number) — $($r.title)  [$($r.verdict.ToUpper())]")
        [void]$md.Add('')
        if ($r.reason) { [void]$md.Add("- $($r.reason)") }
        if ($r.missing.Count -gt 0) {
            [void]$md.Add('- Controls not found in the WinUI 3 UIA tree:')
            foreach ($m in $r.missing) { [void]$md.Add("  - $m") }
        }
        [void]$md.Add("- Inspect: ``winapp ui inspect -a <PID> --interactive`` after navigating to this scenario, and compare ``screenshots/$($r.screenshot)`` against the baseline.")
        [void]$md.Add('')
    }
} else {
    [void]$md.Add('All scenarios reached `pass`. ✔')
    [void]$md.Add('')
}
[void]$md.Add('> Coverage is a structural proxy (AutomationId / name / label text found in the')
[void]$md.Add('> captured UIA tree). A `pass` here is necessary but not sufficient: also confirm')
[void]$md.Add('> visually (screenshots) and behaviourally that each control does what the UWP')
[void]$md.Add('> source does. Set `AutomationProperties.AutomationId` on controls to make this')
[void]$md.Add('> check reliable.')

$reportPath = Join-Path $OutDir 'PARITY-REPORT.md'
Set-Content -LiteralPath $reportPath -Value $md -Encoding UTF8

$resultJson = [ordered]@{
    featureName  = $cl.featureName
    parityScore  = $parityScore
    counts       = $counts
    totalScenarios = $totalScenarios
    pass         = (-not $failGate)
    thresholds   = @{ pass = $PassThreshold; partial = $PartialThreshold; strictPartial = [bool]$StrictPartial }
    scenarios    = @($scenarioResults)
}
$resultPath = Join-Path $OutDir 'parity-result.json'
$resultJson | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8

# ─── stdout summary ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> Compare-Parity"
Write-Host "    Feature : $($cl.featureName)"
Write-Host "    Score   : $parityScore / 100  (pass=$($counts.pass) partial=$($counts.partial) fail=$($counts.fail))"
foreach ($r in $scenarioResults) {
    $cov = if ($r.controlsTotal -eq 0) { 'n/a  ' } else { ('{0}/{1}' -f $r.controlsFound, $r.controlsTotal) }
    Write-Host ("    [{0,-7}] {1,2}. {2}  ({3})" -f $r.verdict, $r.number, $r.title, $cov)
}
Write-Host "    Report  : $reportPath"
Write-Host ""
if ($failGate) {
    Write-Host "==> Compare-Parity: FAIL — $($counts.fail) scenario(s) failed$(if($StrictPartial){" / $($counts.partial) partial"}). Fix and re-capture."
    exit 1
} else {
    Write-Host "==> Compare-Parity: PASS"
    exit 0
}
