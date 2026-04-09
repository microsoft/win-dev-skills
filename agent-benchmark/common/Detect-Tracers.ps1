<#
.SYNOPSIS
    Detects tracer rules in a built WinUI 3 app to measure skill adherence.

.DESCRIPTION
    Reads tracers.json and checks for each tracer rule in the specified app directory.
    Outputs a JSON report with per-tracer hit/miss and an overall adherence score.

.PARAMETER AppDir
    Path to the built app directory (e.g., the trial's app/ folder).

.PARAMETER TracersConfig
    Path to the tracers.json config file. Defaults to the one in agent-benchmark/common/.

.PARAMETER OutputFile
    Optional path to write the JSON results. If not specified, outputs to stdout.

.EXAMPLE
    .\Detect-Tracers.ps1 -AppDir "D:\results\run6\trial_1\app" -OutputFile "adherence.json"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AppDir,

    [string]$TracersConfig = "",

    [string]$OutputFile = ""
)

$ErrorActionPreference = "Stop"

# Find the tracers config
if (-not $TracersConfig) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $TracersConfig = Join-Path $scriptDir "tracers.json"
}

if (-not (Test-Path $TracersConfig)) {
    Write-Error "Tracers config not found at: $TracersConfig"
    exit 1
}

if (-not (Test-Path $AppDir)) {
    Write-Error "App directory not found at: $AppDir"
    exit 1
}

# Load config
$config = Get-Content $TracersConfig -Raw | ConvertFrom-Json

$results = @()
$totalHits = 0
$totalTracers = 0
$skillResults = @{}

foreach ($tracer in $config.tracers) {
    $totalTracers++
    $hit = $false
    $matchCount = 0
    $details = ""

    $detection = $tracer.detection

    if ($detection.type -eq "grep") {
        # Search for pattern in matching files
        $searchPath = Join-Path $AppDir $detection.glob
        $files = Get-ChildItem -Path $AppDir -Filter (Split-Path -Leaf $detection.glob) -Recurse -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content -and $content.Contains($detection.pattern)) {
                $matchCount++
            }
        }

        $expectMin = if ($detection.expect_min) { $detection.expect_min } else { 1 }
        $hit = $matchCount -ge $expectMin
        $details = "Found $matchCount matches (expected >= $expectMin)"

    } elseif ($detection.type -eq "file_exists") {
        # Check if file exists and optionally grep secondary pattern
        $files = Get-ChildItem -Path $AppDir -Filter (Split-Path -Leaf $detection.glob) -Recurse -ErrorAction SilentlyContinue

        if ($files -and $files.Count -gt 0) {
            $hit = $true
            $matchCount = $files.Count
            $details = "File found ($matchCount)"

            # Check secondary pattern if specified
            if ($detection.secondary) {
                $secondaryHit = $false
                foreach ($file in $files) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if ($content -and $content.Contains($detection.secondary.pattern)) {
                        $secondaryHit = $true
                        break
                    }
                }
                if (-not $secondaryHit) {
                    $hit = $false
                    $details += " but secondary pattern '$($detection.secondary.pattern)' not found"
                } else {
                    $details += " with matching content"
                }
            }
        } else {
            $details = "File not found"
        }
    }

    if ($hit) { $totalHits++ }

    # Track per-skill
    $skill = $tracer.skill
    if (-not $skillResults.ContainsKey($skill)) {
        $skillResults[$skill] = @{ hits = 0; total = 0 }
    }
    $skillResults[$skill].total++
    if ($hit) { $skillResults[$skill].hits++ }

    $results += [PSCustomObject]@{
        id       = $tracer.id
        skill    = $tracer.skill
        rule     = $tracer.rule
        hit      = $hit
        matches  = $matchCount
        details  = $details
    }
}

# Build per-skill summary
$skillSummary = @{}
foreach ($key in $skillResults.Keys) {
    $s = $skillResults[$key]
    $skillSummary[$key] = [PSCustomObject]@{
        hits = $s.hits
        total = $s.total
        rate = if ($s.total -gt 0) { [math]::Round($s.hits / $s.total, 2) } else { 0 }
    }
}

$adherenceRate = if ($totalTracers -gt 0) { [math]::Round($totalHits / $totalTracers, 2) } else { 0 }

$report = [PSCustomObject]@{
    app_dir         = $AppDir
    timestamp       = (Get-Date -Format "o")
    total_tracers   = $totalTracers
    total_hits      = $totalHits
    adherence_rate  = $adherenceRate
    per_skill       = $skillSummary
    tracers         = $results
}

$json = $report | ConvertTo-Json -Depth 5

if ($OutputFile) {
    $json | Out-File -FilePath $OutputFile -Encoding utf8
    Write-Host "Tracer report written to: $OutputFile"
    Write-Host "Adherence: $totalHits / $totalTracers ($([math]::Round($adherenceRate * 100))%)"
} else {
    $json
}
