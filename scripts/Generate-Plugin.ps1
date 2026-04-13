<#
.SYNOPSIS
    Generates the assembled plugin for a given agent config, outputting to an artifacts folder.

.DESCRIPTION
    Supports two config modes:
    - v2 (recommended): config has "agent" field pointing to a pre-built agent.md file.
      Copies agent.md directly and installs skills from "skills.include".
    - v1 (legacy): config has "sections" array. Stitches sections together via
      {{placeholder}} replacement, inlines skills, strips unused placeholders.

.PARAMETER Agent
    Name of the agent config (folder name under src/agents/). E.g., "winui3-base"

.PARAMETER OutputDir
    Output directory. Defaults to artifacts/<Agent>/

.EXAMPLE
    .\Generate-Plugin.ps1 -Agent winui3-base
    .\Generate-Plugin.ps1 -Agent winui3+design+arch+verify -OutputDir .\my-output
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,

    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$agentDir = Join-Path $repoRoot "src\agents\$Agent"
$srcSkillsDirs = @(
    (Join-Path $repoRoot "src\skills"),
    (Join-Path $repoRoot ".github\plugin\skills\winui3")
)

if (-not (Test-Path $agentDir)) {
    Write-Error "Agent not found: $agentDir"
    exit 1
}

if (-not $OutputDir) {
    $OutputDir = Join-Path $repoRoot "artifacts\$Agent"
}

# Clean and create output structure
if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Path "$OutputDir\.github\agents" -Force | Out-Null
New-Item -ItemType Directory -Path "$OutputDir\.github\skills" -Force | Out-Null

# ── Helpers ──

function Strip-Frontmatter($content) {
    return ($content -replace '(?s)^---\s*\n.*?\n---\s*\n', '').Trim()
}

function Find-SkillPath($skillName) {
    foreach ($dir in $srcSkillsDirs) {
        $p = Join-Path $dir $skillName
        if (Test-Path $p) { return $p }
    }
    return $null
}

# ── Load config ──
$configPath = Join-Path $agentDir "config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Generate Plugin: $Agent" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Description: $($config.description)" -ForegroundColor Gray
Write-Host ""

$agentName = "winui3"
$inlinedSkills = @()

if ($config.agent) {
    # ══════════════════════════════════════════════
    # v2 mode: pre-built agent.md
    # ══════════════════════════════════════════════
    $agentSrc = Join-Path $repoRoot $config.agent
    if (-not (Test-Path $agentSrc)) {
        Write-Error "Agent file not found: $agentSrc"
        exit 1
    }

    $agentContent = Get-Content $agentSrc -Raw
    if ($agentContent -match '(?s)^---\s*\n.*?name:\s*(\S+).*?\n---') {
        $agentName = $Matches[1]
    }

    $agentMdPath = Join-Path $OutputDir ".github\agents\$agentName.agent.md"
    Copy-Item $agentSrc $agentMdPath -Force

    $agentSize = (Get-Item $agentMdPath).Length
    $agentWords = ($agentContent -split '\s+').Count
    Write-Host "[v2] Agent: $agentName (from $($config.agent))" -ForegroundColor Green
    Write-Host "  Size: $agentSize bytes, ~$agentWords words, ~$([math]::Round($agentWords * 1.3)) tokens"

    if ($config.prompt_skills) {
        Write-Host "  Prompt skills (benchmark only): $($config.prompt_skills -join ', ')" -ForegroundColor Gray
    }
    if ($config.scaffold) {
        Write-Host "  Scaffold template: $($config.scaffold)" -ForegroundColor Gray
    }

} elseif ($config.sections) {
    # ══════════════════════════════════════════════
    # v1 mode: section-based assembly
    # ══════════════════════════════════════════════
    $sectionsDir = Join-Path $repoRoot "src\agents\_sections"

    function Parse-SectionDeps($sectionFile) {
        if (-not (Test-Path $sectionFile)) { return @{} }
        $raw = (Get-Content $sectionFile -Raw) -replace "`r`n", "`n"
        if ($raw -match '(?s)^---\s*\n(.*?)\n---') {
            try {
                $yaml = $Matches[1]
                $result = @{}
                if ($yaml -match 'skills:\s*\[([^\]]*)\]') {
                    $result.skills = ($Matches[1] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
                }
                if ($yaml -match 'inline_skills:\s*\[([^\]]*)\]') {
                    $result.inline_skills = ($Matches[1] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
                }
                if ($yaml -match 'mcp:\s*\[([^\]]*)\]') {
                    $result.mcp = ($Matches[1] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
                }
                return $result
            } catch { return @{} }
        }
        return @{}
    }

    $sections = $config.sections
    $baseSection = $sections[0]
    $baseFile = Join-Path $sectionsDir "$baseSection.md"
    $baseRaw = Get-Content $baseFile -Raw

    if ($baseRaw -match '(?s)^---\s*\n.*?name:\s*(\S+).*?\n---') {
        $agentName = $Matches[1]
    }
    $frontmatter = ""
    if ($baseRaw -match '(?s)^(---\s*\n.*?\n---\s*\n)') {
        $frontmatter = $Matches[1]
    }
    $template = Strip-Frontmatter $baseRaw

    # Replace section placeholders
    foreach ($section in $sections) {
        if ($section -eq $baseSection) { continue }
        $sectionFile = Join-Path $sectionsDir "$section.md"
        if (Test-Path $sectionFile) {
            $content = Strip-Frontmatter (Get-Content $sectionFile -Raw)
            $template = $template -replace "\{\{$section\}\}", $content
        }
    }

    # Strip unused placeholders
    $template = $template -replace '\{\{[a-z_-]+\}\}\n?', ''

    # Inline skills
    if ($config.inline_skills) {
        foreach ($section in $sections) {
            $deps = Parse-SectionDeps (Join-Path $sectionsDir "$section.md")
            $toInline = @()
            if ($deps.inline_skills) { $toInline = $deps.inline_skills }
            foreach ($skill in $toInline) {
                if ($inlinedSkills -contains $skill) { continue }
                $skillPath = Find-SkillPath $skill
                if ($skillPath) {
                    $skillMd = Join-Path $skillPath "SKILL.md"
                    if (Test-Path $skillMd) {
                        $skillContent = Strip-Frontmatter (Get-Content $skillMd -Raw)
                        $template += "`n`n$skillContent`n"
                        $inlinedSkills += $skill
                    }
                }
            }
        }
    }

    # Write assembled agent.md
    $agentMdPath = Join-Path $OutputDir ".github\agents\$agentName.agent.md"
    Set-Content $agentMdPath -Value ($frontmatter + $template) -NoNewline
    $agentSize = (Get-Item $agentMdPath).Length
    $agentWords = (($frontmatter + $template) -split '\s+').Count
    Write-Host "[v1] Assembled agent: $agentName" -ForegroundColor Green
    Write-Host "  Sections: $($sections -join ' + ')"
    Write-Host "  Size: $agentSize bytes, ~$agentWords words, ~$([math]::Round($agentWords * 1.3)) tokens"
} else {
    Write-Error "Config has neither 'agent' nor 'sections' field."
    exit 1
}

# ── Install skills ──
$allSkills = @()
if ($config.skills -and $config.skills.include) { $allSkills += $config.skills.include }

# v1: also collect from section deps
if ($config.sections) {
    $sectionsDir = Join-Path $repoRoot "src\agents\_sections"
    foreach ($section in $config.sections) {
        $deps = Parse-SectionDeps (Join-Path $sectionsDir "$section.md")
        if ($deps.skills) { $allSkills += $deps.skills }
        if ($deps.inline_skills) { $allSkills += $deps.inline_skills }
    }
}
$allSkills = $allSkills | Select-Object -Unique

$installedSkills = @()
foreach ($skill in $allSkills) {
    $skillPath = Find-SkillPath $skill
    if ($skillPath) {
        $targetPath = Join-Path $OutputDir ".github\skills\$skill"
        Copy-Item $skillPath $targetPath -Recurse -Force
        $installedSkills += $skill
    }
}

Write-Host ""
Write-Host "Skills installed: $($installedSkills.Count)" -ForegroundColor Green
foreach ($s in $installedSkills) {
    $marker = if ($inlinedSkills -contains $s) { "(inlined)" } else { "(plugin)" }
    Write-Host "  $s $marker"
}

# ── Summary ──
Write-Host ""
Write-Host "=== Output: $OutputDir ===" -ForegroundColor Cyan
Get-ChildItem $OutputDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Replace("$OutputDir\", "")
    Write-Host "  $rel ($([math]::Round($_.Length/1024, 1))KB)"
}
