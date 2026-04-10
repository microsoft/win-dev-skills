<#
.SYNOPSIS
    WinUI 3 code checker — scans XAML and C# files for known-bad patterns.
    Catches issues before build/runtime (TabView layout, WebView2 init, UWP APIs, etc.)

.DESCRIPTION
    Two modes:
    - File mode:    check.ps1 MainWindow.xaml.cs     (single file)
    - Project mode: check.ps1 . -or- check.ps1 MyApp.csproj  (full project, includes cross-file checks)

    Rules are loaded from check-rules.json in the same directory as this script.

.PARAMETER Path
    File path, directory, or .csproj to check. Defaults to current directory.

.PARAMETER Severity
    Minimum severity to report: "error" or "warning" (default: "warning").

.PARAMETER Json
    Output results as JSON instead of text.

.EXAMPLE
    .\check.ps1 .
    .\check.ps1 MainWindow.xaml.cs
    .\check.ps1 . -Severity error
#>
param(
    [Parameter(Position = 0)]
    [string]$Path = ".",

    [ValidateSet("error", "warning")]
    [string]$Severity = "warning",

    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rulesFile = Join-Path $scriptDir "check-rules.json"

if (-not (Test-Path $rulesFile)) {
    Write-Error "Rules file not found: $rulesFile"
    exit 1
}

$rules = Get-Content $rulesFile -Raw | ConvertFrom-Json

# Resolve target files
function Get-TargetFiles([string]$target) {
    if (Test-Path $target -PathType Leaf) {
        if ($target -match '\.(xaml|cs)$') {
            return @(Get-Item $target)
        }
        if ($target -match '\.csproj$') {
            $dir = Split-Path $target -Parent
            return Get-ChildItem $dir -Recurse -Include *.xaml, *.cs | Where-Object {
                $_.FullName -notmatch '[\\/](obj|bin)[\\/]'
            }
        }
        return @()
    }
    if (Test-Path $target -PathType Container) {
        return Get-ChildItem $target -Recurse -Include *.xaml, *.cs | Where-Object {
            $_.FullName -notmatch '[\\/](obj|bin)[\\/]'
        }
    }
    Write-Error "Path not found: $target"
    exit 1
}

function Test-SingleFileRule($rule, $filePath, $content) {
    $issues = @()

    # Check scope matches file type
    $ext = [System.IO.Path]::GetExtension($filePath).TrimStart('.')
    if ($rule.scope -eq 'cs' -and $ext -ne 'cs') { return $issues }
    if ($rule.scope -eq 'xaml' -and $ext -ne 'xaml') { return $issues }

    # Check main pattern
    $matches = [regex]::Matches($content, $rule.pattern, 'Multiline')
    if ($matches.Count -eq 0) { return $issues }

    foreach ($m in $matches) {
        # Check exclude pattern
        if ($rule.exclude_pattern) {
            $lineStart = $content.LastIndexOf("`n", [Math]::Max(0, $m.Index - 1)) + 1
            $lineEnd = $content.IndexOf("`n", $m.Index)
            if ($lineEnd -lt 0) { $lineEnd = $content.Length }
            $line = $content.Substring($lineStart, $lineEnd - $lineStart)
            if ($line -match $rule.exclude_pattern) { continue }
        }

        # Check context pattern (must appear somewhere in the file)
        if ($rule.context_pattern) {
            if ($content -notmatch $rule.context_pattern) { continue }
        }

        # Calculate line number
        $lineNum = ($content.Substring(0, $m.Index) -split "`n").Count

        $issues += [PSCustomObject]@{
            RuleId      = $rule.id
            Severity    = $rule.severity
            File        = $filePath
            Line        = $lineNum
            Name        = $rule.name
            Description = $rule.description
            Fix         = $rule.fix
            Match       = $m.Value.Trim().Substring(0, [Math]::Min($m.Value.Trim().Length, 80))
        }
    }

    # Check cross-file absence check (within same file)
    if ($rule.cross_file_check -and $rule.cross_file_check.type -eq 'absence_in_file') {
        if ($matches.Count -gt 0 -and $content -notmatch $rule.cross_file_check.required_pattern) {
            # Only add if we haven't already reported this rule for this file
            if ($issues.Count -eq 0) {
                $issues += [PSCustomObject]@{
                    RuleId      = $rule.id
                    Severity    = $rule.severity
                    File        = $filePath
                    Line        = 0
                    Name        = $rule.name
                    Description = $rule.cross_file_check.message
                    Fix         = $rule.fix
                    Match       = ""
                }
            }
        }
    }

    return $issues
}

function Test-CrossFileRules($rules, $fileMap) {
    $issues = @()
    $crossRules = $rules | Where-Object { $_.scope -eq 'cross' }

    foreach ($rule in $crossRules) {
        # Find XAML files matching the xaml_pattern
        foreach ($xamlFile in ($fileMap.Keys | Where-Object { $_ -match '\.xaml$' -and $_ -notmatch '\.xaml\.cs$' })) {
            $xamlContent = $fileMap[$xamlFile]
            if ($xamlContent -notmatch $rule.xaml_pattern) { continue }

            # Find corresponding code-behind
            $csBehind = "$xamlFile.cs"
            if (-not $fileMap.ContainsKey($csBehind)) { continue }
            $csContent = $fileMap[$csBehind]

            # Check for required pattern (absence = issue)
            if ($rule.cs_pattern_required) {
                if ($csContent -notmatch $rule.cs_pattern_required) {
                    $issues += [PSCustomObject]@{
                        RuleId      = $rule.id
                        Severity    = $rule.severity
                        File        = "$xamlFile + $csBehind"
                        Line        = 0
                        Name        = $rule.name
                        Description = $rule.description
                        Fix         = $rule.fix
                        Match       = "XAML has $($rule.xaml_pattern), code-behind missing $($rule.cs_pattern_required)"
                    }
                }
            }

            # Check for trigger pattern (presence = issue)
            if ($rule.cs_pattern_trigger) {
                $triggerMatch = [regex]::Match($csContent, $rule.cs_pattern_trigger)
                if ($triggerMatch.Success) {
                    $lineNum = ($csContent.Substring(0, $triggerMatch.Index) -split "`n").Count
                    $issues += [PSCustomObject]@{
                        RuleId      = $rule.id
                        Severity    = $rule.severity
                        File        = [System.IO.Path]::GetFileName($csBehind)
                        Line        = $lineNum
                        Name        = $rule.name
                        Description = $rule.description
                        Fix         = $rule.fix
                        Match       = $triggerMatch.Value.Trim()
                    }
                }
            }
        }
    }

    return $issues
}

# --- Main ---

$files = Get-TargetFiles $Path
if ($files.Count -eq 0) {
    Write-Host "No .xaml or .cs files found." -ForegroundColor Yellow
    exit 0
}

$allIssues = @()
$fileMap = @{}
$singleFileRules = $rules | Where-Object { $_.scope -ne 'cross' }

# Read all files and run single-file checks
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    $fileMap[$file.FullName] = $content

    foreach ($rule in $singleFileRules) {
        if ($Severity -eq 'error' -and $rule.severity -ne 'error') { continue }
        $issues = Test-SingleFileRule $rule $file.FullName $content
        $allIssues += $issues
    }
}

# Run cross-file checks (only in project mode)
$isProjectMode = (Test-Path $Path -PathType Container) -or ($Path -match '\.csproj$')
if ($isProjectMode) {
    $crossIssues = Test-CrossFileRules $rules $fileMap
    if ($Severity -eq 'error') {
        $crossIssues = $crossIssues | Where-Object { $_.Severity -eq 'error' }
    }
    $allIssues += $crossIssues
}

# Deduplicate (same rule + same file + same line)
$allIssues = $allIssues | Sort-Object RuleId, File, Line -Unique

# Output
if ($Json) {
    $allIssues | ConvertTo-Json -Depth 3 -Compress
    exit ($allIssues.Count -gt 0 ? 1 : 0)
}

if ($allIssues.Count -eq 0) {
    Write-Host "No issues found." -ForegroundColor Green
    exit 0
}

$errors = ($allIssues | Where-Object { $_.Severity -eq 'error' }).Count
$warnings = ($allIssues | Where-Object { $_.Severity -eq 'warning' }).Count

foreach ($issue in $allIssues) {
    $icon = if ($issue.Severity -eq 'error') { '✗' } else { '⚠' }
    $color = if ($issue.Severity -eq 'error') { 'Red' } else { 'Yellow' }
    $fileName = [System.IO.Path]::GetFileName($issue.File)
    $loc = if ($issue.Line -gt 0) { "${fileName}:$($issue.Line)" } else { $fileName }

    Write-Host "$icon $($issue.RuleId) " -ForegroundColor $color -NoNewline
    Write-Host "$loc" -ForegroundColor White -NoNewline
    Write-Host " — $($issue.Description)" -ForegroundColor Gray
    Write-Host "  Fix: $($issue.Fix)" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "$($allIssues.Count) issue(s) found ($errors error(s), $warnings warning(s))" -ForegroundColor $(if ($errors -gt 0) { 'Red' } else { 'Yellow' })
exit ($errors -gt 0 ? 2 : 1)
