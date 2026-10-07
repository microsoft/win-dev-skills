param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Diagnosis file not found: $Path"
}

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$content = Get-Content -LiteralPath $resolvedPath -Raw

function Get-SectionMatch {
    param([Parameter(Mandatory = $true)][string]$HeadingPattern)

    $pattern = "(?ims)^##\s+(?:$HeadingPattern)\b[^\r\n]*\r?\n(?<body>.*?)(?=^##\s+|\z)"
    return [regex]::Match($content, $pattern)
}

function Test-MermaidDiagram {
    $blocks = [regex]::Matches($content, '(?ims)^```mermaid\s*\r?\n(?<body>.*?)^```\s*$')
    foreach ($block in $blocks) {
        $body = $block.Groups["body"].Value

        if ($body -match '(?im)^\s*sequenceDiagram\s*$') {
            $actors = [System.Collections.Generic.HashSet[string]]::new(
                [System.StringComparer]::OrdinalIgnoreCase
            )

            foreach ($match in [regex]::Matches(
                $body,
                '(?im)^\s*(?:participant|actor)\s+([A-Za-z0-9_.-]+)'
            )) {
                [void]$actors.Add($match.Groups[1].Value)
            }

            foreach ($match in [regex]::Matches(
                $body,
                '(?im)^\s*([A-Za-z0-9_.-]+)\s*(?:--?>>|->>|--?>|--x|-x|--\)|-\))\s*([A-Za-z0-9_.-]+)\s*:'
            )) {
                [void]$actors.Add($match.Groups[1].Value)
                [void]$actors.Add($match.Groups[2].Value)
            }

            if ($actors.Count -ge 2) {
                return $true
            }
        }

        if ($body -match '(?im)^\s*(?:flowchart|graph)\b') {
            $nodes = [System.Collections.Generic.HashSet[string]]::new(
                [System.StringComparer]::OrdinalIgnoreCase
            )

            foreach ($match in [regex]::Matches(
                $body,
                '(?im)^\s*([A-Za-z0-9_]+).*?(?:-->|---|-.->|==>)\s*([A-Za-z0-9_]+)'
            )) {
                [void]$nodes.Add($match.Groups[1].Value)
                [void]$nodes.Add($match.Groups[2].Value)
            }

            if ($nodes.Count -ge 2) {
                return $true
            }
        }
    }

    return $false
}

$analysis = Get-SectionMatch "Analysis"
$rootCause = Get-SectionMatch "Root Cause"
$fix = Get-SectionMatch "Fix"
$reasoning = Get-SectionMatch "Reasoning Chain"
$alternatives = Get-SectionMatch "Alternatives(?: Considered)?"
$trigger = Get-SectionMatch "Trigger Verification"
$contrarian = Get-SectionMatch "Contrarian Verdict"

$alternativeCount = 0
if ($alternatives.Success) {
    $alternativeCount = [regex]::Matches(
        $alternatives.Groups["body"].Value,
        '(?m)^\s*(?:[-*+]\s+|\d+[.)]\s+)'
    ).Count
}

$triggerBody = if ($trigger.Success) { $trigger.Groups["body"].Value } else { "" }
$triggerTableRows = [regex]::Matches($triggerBody, '(?m)^\s*\|.*\|\s*$').Count

$contrarianBody = if ($contrarian.Success) {
    $contrarian.Groups["body"].Value
} else {
    ""
}

$results = [ordered]@{
    AnalysisHeading = $analysis.Success
    RootCauseHeading = $rootCause.Success
    FixHeading = $fix.Success
    ReasoningChain = (
        $reasoning.Success -and
        $reasoning.Groups["body"].Value -match 'OBSERVE|HYPOTHESIZE|TEST|EVALUATE|CONCLUDE'
    )
    Alternatives = ($alternatives.Success -and $alternativeCount -ge 2)
    TriggerVerification = (
        $trigger.Success -and
        $triggerTableRows -ge 3 -and
        $triggerBody -match '(?i)\bVERIFIED\b|\bUNVERIFIED\b|verified by'
    )
    MermaidDiagram = Test-MermaidDiagram
    ContrarianVerdict = (
        $contrarian.Success -and
        $contrarianBody -match '\bACCEPTED\b|\bCHALLENGED\b' -and
        $contrarianBody -match '(?i)contrarian_loopback[^:\r\n]*:\s*(?:true|false)\b'
    )
    JsonSummary = $false
}

$requiredJsonProperties = @(
    "diagnosis_status",
    "routing_path",
    "root_cause",
    "confidence",
    "fix_confidence",
    "fix_code_path_coverage",
    "contrarian_review",
    "contrarian_loopback"
)

foreach ($block in [regex]::Matches($content, '(?is)```json\s*(?<body>.*?)```')) {
    try {
        $json = $block.Groups["body"].Value | ConvertFrom-Json
    } catch {
        continue
    }

    $propertyNames = @($json.PSObject.Properties.Name)
    $hasRequiredProperties = $true
    foreach ($property in $requiredJsonProperties) {
        if ($propertyNames -notcontains $property) {
            $hasRequiredProperties = $false
            break
        }
    }

    if (
        $hasRequiredProperties -and
        $json.contrarian_loopback -is [bool]
    ) {
        $results.JsonSummary = $true
        break
    }
}

$pass = @($results.Values | Where-Object { $_ -eq $false }).Count -eq 0
$output = [pscustomobject]@{
    Pass = $pass
    File = $resolvedPath
    Checks = [pscustomobject]$results
}

$output | ConvertTo-Json -Depth 5
if (-not $pass) {
    exit 1
}
