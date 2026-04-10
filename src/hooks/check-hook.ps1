<#
.SYNOPSIS
    Copilot CLI preToolUse hook — checks XAML/C# file content for WinUI 3 anti-patterns
    before the agent writes the file. Blocks the write with a fix suggestion if issues found.

.DESCRIPTION
    Reads hook input from stdin (JSON with toolName, toolArgs).
    Intercepts 'create' and 'edit' tool calls on .xaml and .cs files.
    Runs the checker rules against the proposed content.
    Returns { permissionDecision: "deny", permissionDecisionReason: "..." } if issues found.
    Returns {} to allow the write if no issues found.
#>
$ErrorActionPreference = 'SilentlyContinue'
$raw = [Console]::In.ReadToEnd()
$hookInput = $raw | ConvertFrom-Json

$toolName = $hookInput.toolName

# Only intercept create and edit
if ($toolName -notin @("create", "edit")) {
    Write-Output '{}'
    exit 0
}

# Parse tool args
$toolArgs = $null
try { $toolArgs = $hookInput.toolArgs | ConvertFrom-Json } catch {}
if (-not $toolArgs) {
    Write-Output '{}'
    exit 0
}

$filePath = $toolArgs.path
$fileContent = if ($toolName -eq "create") { $toolArgs.file_text } else { $toolArgs.new_str }

if (-not $filePath -or -not $fileContent) {
    Write-Output '{}'
    exit 0
}

# Only check .xaml and .cs files
if ($filePath -notmatch '\.(xaml|cs)$') {
    Write-Output '{}'
    exit 0
}

# Load rules
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Rules are in the skills directory, try relative paths
$rulesFile = $null
$searchPaths = @(
    (Join-Path $scriptDir "check-rules.json"),
    (Join-Path $hookInput.cwd ".github\skills\winui3-dev-workflow\check-rules.json"),
    (Join-Path $hookInput.cwd "src\skills\winui3-dev-workflow\check-rules.json")
)
foreach ($p in $searchPaths) {
    if (Test-Path $p) { $rulesFile = $p; break }
}

if (-not $rulesFile) {
    Write-Output '{}'
    exit 0
}

$rules = Get-Content $rulesFile -Raw | ConvertFrom-Json

# Determine file type
$ext = if ($filePath -match '\.xaml$') { 'xaml' } else { 'cs' }

# Check single-file rules against the proposed content
$issues = @()
$singleFileRules = $rules | Where-Object { $_.scope -eq $ext }

foreach ($rule in $singleFileRules) {
    # Check main pattern
    $matches = [regex]::Matches($fileContent, $rule.pattern, 'Multiline')
    if ($matches.Count -eq 0) { continue }

    $hasIssue = $false
    foreach ($m in $matches) {
        # Check exclude pattern
        if ($rule.exclude_pattern) {
            $lineStart = $fileContent.LastIndexOf("`n", [Math]::Max(0, $m.Index - 1)) + 1
            $lineEnd = $fileContent.IndexOf("`n", $m.Index)
            if ($lineEnd -lt 0) { $lineEnd = $fileContent.Length }
            $line = $fileContent.Substring($lineStart, $lineEnd - $lineStart)
            if ($line -match $rule.exclude_pattern) { continue }
        }

        # Check context pattern
        if ($rule.context_pattern) {
            if ($fileContent -notmatch $rule.context_pattern) { continue }
        }

        $hasIssue = $true
        break
    }

    if ($hasIssue) {
        $issues += "$($rule.id): $($rule.description) Fix: $($rule.fix)"
    }

    # Check absence-in-file cross check
    if ($rule.cross_file_check -and $rule.cross_file_check.type -eq 'absence_in_file') {
        if ($matches.Count -gt 0 -and $fileContent -notmatch $rule.cross_file_check.required_pattern) {
            if (-not $hasIssue) {
                $issues += "$($rule.id): $($rule.cross_file_check.message) Fix: $($rule.fix)"
            }
        }
    }
}

if ($issues.Count -eq 0) {
    Write-Output '{}'
    exit 0
}

# Block the write with fix suggestions
$reason = "WinUI 3 checker found $($issues.Count) issue(s) in the proposed code for $(Split-Path $filePath -Leaf):`n"
$reason += ($issues | ForEach-Object { "- $_" }) -join "`n"
$reason += "`n`nFix these issues in your code before writing the file."

$output = @{
    permissionDecision       = "deny"
    permissionDecisionReason = $reason
} | ConvertTo-Json -Compress

Write-Output $output
exit 0
