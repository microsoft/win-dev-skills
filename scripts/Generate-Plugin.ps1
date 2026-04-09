<#
.SYNOPSIS
    Generates the assembled plugin for a given agent config, outputting to an artifacts folder.

.DESCRIPTION
    Replicates the benchmark's agent assembly logic:
    1. Reads config.json from the agent directory
    2. Stitches sections together via {{placeholder}} replacement
    3. Inlines skills from inline_skills declarations
    4. Copies non-inlined skills to the output skills/ directory
    5. Strips unused placeholders

.PARAMETER Agent
    Name of the agent config (folder name under src/agents/). E.g., "base-DV-turnopt"

.PARAMETER OutputDir
    Output directory. Defaults to artifacts/<Agent>/

.EXAMPLE
    .\Generate-Plugin.ps1 -Agent base-DV-turnopt
    .\Generate-Plugin.ps1 -Agent base-DARMV -OutputDir .\my-output
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Agent,

    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$agentDir = Join-Path $repoRoot "src\agents\$Agent"
$sectionsDir = Join-Path $repoRoot "src\agents\_sections"
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

# ── 1. Load config ──
$configPath = Join-Path $agentDir "config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
Write-Host "Agent: $Agent" -ForegroundColor Cyan
Write-Host "Description: $($config.description)"

# ── 2. Parse section frontmatter ──
function Parse-SectionDeps($sectionFile) {
    if (-not (Test-Path $sectionFile)) { return @{} }
    $raw = (Get-Content $sectionFile -Raw) -replace "`r`n", "`n"
    if ($raw -match '(?s)^---\s*\n(.*?)\n---') {
        try {
            # Simple YAML-ish parsing for our needs
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

# ── 3. Assemble agent.md ──
$sections = $config.sections
$baseSection = $sections[0]
$baseFile = Join-Path $sectionsDir "$baseSection.md"
$baseRaw = Get-Content $baseFile -Raw

# Extract frontmatter and agent name
$agentName = "winui3"
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

# ── 4. Inline skills ──
$inlinedSkills = @()
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
Write-Host ""
Write-Host "Agent: $agentMdPath" -ForegroundColor Green
Write-Host "  Size: $agentSize bytes, ~$agentWords words, ~$([math]::Round($agentWords * 1.3)) tokens"

# ── 5. Collect and install non-inlined skills ──
$allSkills = @()
# From config
if ($config.skills -and $config.skills.include) { $allSkills += $config.skills.include }
# From section deps
foreach ($section in $sections) {
    $deps = Parse-SectionDeps (Join-Path $sectionsDir "$section.md")
    if ($deps.skills) { $allSkills += $deps.skills }
    if ($deps.inline_skills) { $allSkills += $deps.inline_skills }
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

# ── 6. Copy MCP config if applicable ──
if ($config.mcp -and $config.mcp.include -and $config.mcp.include.Count -gt 0) {
    $srcMcpDir = Join-Path $repoRoot "src\mcp"
    $mergedMcp = @{}
    foreach ($server in $config.mcp.include) {
        $mcpFile = Join-Path $srcMcpDir "$server.json"
        if (Test-Path $mcpFile) {
            $content = Get-Content $mcpFile -Raw | ConvertFrom-Json
            if ($content.mcpServers) {
                $content.mcpServers.PSObject.Properties | ForEach-Object { $mergedMcp[$_.Name] = $_.Value }
            } else {
                $content.PSObject.Properties | ForEach-Object { $mergedMcp[$_.Name] = $_.Value }
            }
        }
    }
    if ($mergedMcp.Count -gt 0) {
        $copilotDir = Join-Path $OutputDir ".copilot"
        New-Item -ItemType Directory -Path $copilotDir -Force | Out-Null
        @{ mcpServers = $mergedMcp } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $copilotDir "mcp-config.json")
        Write-Host ""
        Write-Host "MCP servers: $($config.mcp.include -join ', ')" -ForegroundColor Green
    }
}

# ── 7. Summary ──
Write-Host ""
Write-Host "=== Output: $OutputDir ===" -ForegroundColor Cyan
Get-ChildItem $OutputDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Replace("$OutputDir\", "")
    Write-Host "  $rel ($([math]::Round($_.Length/1024, 1))KB)"
}
