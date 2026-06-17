<#
.SYNOPSIS
Fetch a single anchored section from MIGRATION-PATTERNS.md.

.DESCRIPTION
Use this instead of opening MIGRATION-PATTERNS.md wholesale — the full file's concentrated API-name listings have historically tripped the model provider's content-safety filter. This helper returns only the requested section.

Common UWP-API-domain aliases (capture, sensors, media, ...) are auto-mapped to their WinUI 3-fix anchor names. If the requested anchor (after aliasing) is still not found, the helper lists every available anchor on stderr to self-correct.

.PARAMETER Anchor
Anchor ID (e.g. 'threading', 'windowing', 'dialogs', 'pickers'). The full list lives in unsupported-api-inventory.json under each entry's `anchor`.

.PARAMETER PatternsPath
Optional path to MIGRATION-PATTERNS.md. Defaults to the sibling file under the winui-uwp-migration skill folder.

.OUTPUTS
The section text (heading + content up to the next ## heading) on stdout. Exits 0 on success, 1 if the anchor is not found.

.EXAMPLE
.\Get-MigrationPattern.ps1 -Anchor threading
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Anchor,
    [string]$PatternsPath
)

$ErrorActionPreference = 'Stop'

if (-not $PatternsPath) {
    $PatternsPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'MIGRATION-PATTERNS.md'
}
if (-not (Test-Path -LiteralPath $PatternsPath)) {
    Write-Error "MIGRATION-PATTERNS.md not found at $PatternsPath"
    exit 1
}

# Alias map — agents historically invent UWP-API-domain names (capture, sensors, media, printmanager, ...) instead of using our WinUI 3-fix anchor names. These aliases catch the most common hallucinations observed in run30-run45 (188+ wasted fetches) and route them to the right anchor. Keep keys lowercase.
$aliasMap = @{
    'capture'         = 'capture-preview'
    'captureelement'  = 'capture-preview'
    'sensors'         = 'controls'
    'media'           = 'controls'
    'printmanager'    = 'windowing'
}

$requestedAnchor = $Anchor
$lookupKey = $Anchor.ToLowerInvariant()
if ($aliasMap.ContainsKey($lookupKey)) {
    $aliased = $aliasMap[$lookupKey]
    if ($aliased -ne $lookupKey) {
        Write-Information "Anchor '$Anchor' aliased to '$aliased'" -InformationAction Continue
        $Anchor = $aliased
    }
}

$lines = Get-Content -LiteralPath $PatternsPath
$anchorPattern = "<a\s+id=`"$([regex]::Escape($Anchor))`""

$startIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $anchorPattern) {
        $startIdx = $i
        break
    }
}

if ($startIdx -lt 0) {
    # Collect all available anchors for self-correcting hint on stderr.
    $available = @()
    foreach ($line in $lines) {
        if ($line -match '<a\s+id="([^"]+)"') {
            $available += $Matches[1]
        }
    }
    $hint = "Anchor '#$requestedAnchor' not found in MIGRATION-PATTERNS.md."
    if ($available.Count -gt 0) {
        $hint += " Available anchors: " + ($available -join ', ') + "."
    }
    $hint += " (Tip: pass an anchor ID exactly as shown above — see unsupported-api-inventory.json for which anchor handles each UWP API.)"
    Write-Error $hint
    exit 1
}

# Walk forward: skip the anchor line itself and the heading; collect until the next top-level ##.
$endIdx = $lines.Count - 1
for ($j = $startIdx + 1; $j -lt $lines.Count; $j++) {
    # Stop on next anchor (covers cases where two anchors precede consecutive sections)
    if ($lines[$j] -match '<a\s+id="' -and $j -gt $startIdx) {
        $endIdx = $j - 1
        break
    }
    # Stop on next top-level heading
    if ($lines[$j] -match '^##\s' -and $j -gt $startIdx + 1) {
        $endIdx = $j - 1
        break
    }
}

# Trim trailing blank lines for cleaner output
while ($endIdx -gt $startIdx -and [string]::IsNullOrWhiteSpace($lines[$endIdx])) {
    $endIdx--
}

for ($k = $startIdx; $k -le $endIdx; $k++) {
    Write-Output $lines[$k]
}
