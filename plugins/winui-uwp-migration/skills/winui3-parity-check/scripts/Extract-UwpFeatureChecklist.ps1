<#
.SYNOPSIS
Derive a feature-parity checklist from a UWP SDK-sample's *source code* — no
UWP build required. This is the always-available ground truth for the parity
check: it lists every scenario the original app exposes and the named/interactive
controls each scenario page contains.

.DESCRIPTION
UWP SDK samples share a uniform shell (SharedContent/xaml/MainPage.xaml):
  * SampleConfiguration.cs holds `FEATURE_NAME` and a `scenarios` list of
    `new Scenario { Title = "...", ClassType = typeof(PageClass) }`.
  * Each PageClass has a `<PageClass>.xaml` whose named / interactive controls
    are the scenario's UI surface.

This script parses those two sources and emits:
  1. checklist.json — machine-readable: { featureName, scenarios:[{ number, title,
     class, slug, controls:[{ name, type, label, events }] }] }
  2. info.md — the human/LLM baseline format the benchmark judge already consumes
     (`## Scenario N - <title>` blocks with `UI elements` + `Code behavior`),
     so the captured baseline doubles as the benchmark's behavioral baseline.

It never launches or builds anything, so it is safe and deterministic. Use it
when no pre-captured UWP baseline exists, or to seed one.

.PARAMETER Source
UWP sample C# source folder (contains SampleConfiguration.cs + page .xaml/.cs).

.PARAMETER OutDir
Output folder for checklist.json + info.md. Created if missing.

.EXAMPLE
.\Extract-UwpFeatureChecklist.ps1 -Source "C:\src\Clipboard\cs" -OutDir "C:\out\App\parity-baseline"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$OutDir
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Source)) { throw "Source not found: $Source" }
$Source = (Resolve-Path -LiteralPath $Source).ProviderPath
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path -LiteralPath $OutDir).ProviderPath

function Get-Slug([string]$text) {
    $s = ($text -replace '[^A-Za-z0-9]+', '_').Trim('_')
    if ([string]::IsNullOrWhiteSpace($s)) { $s = 'Scenario' }
    return $s
}

# ─── 1. Locate + parse SampleConfiguration.cs ─────────────────────────────────
$cfg = Get-ChildItem -Path $Source -Recurse -File -Filter 'SampleConfiguration.cs' -ErrorAction SilentlyContinue | Select-Object -First 1
$featureName = $null
$scenarioDefs = @()  # ordered: @{ Title; Class }

if ($cfg) {
    $cfgText = [System.IO.File]::ReadAllText($cfg.FullName)

    $mFeat = [regex]::Match($cfgText, 'FEATURE_NAME\s*=\s*"([^"]+)"')
    if ($mFeat.Success) { $featureName = $mFeat.Groups[1].Value }

    # Match: Title = "..."  ... ClassType = typeof(ClassName)
    # Tolerant of property order and whitespace/newlines between the two.
    $rx = [regex]'(?s)Title\s*=\s*"(?<title>[^"]+)"\s*,\s*ClassType\s*=\s*typeof\(\s*(?<class>[A-Za-z_][A-Za-z0-9_\.]*)\s*\)'
    foreach ($m in $rx.Matches($cfgText)) {
        $scenarioDefs += [PSCustomObject]@{ Title = $m.Groups['title'].Value; Class = ($m.Groups['class'].Value -split '\.')[-1] }
    }
    # Fallback: some samples put ClassType before Title.
    if ($scenarioDefs.Count -eq 0) {
        $rx2 = [regex]'(?s)ClassType\s*=\s*typeof\(\s*(?<class>[A-Za-z_][A-Za-z0-9_\.]*)\s*\)\s*,\s*Title\s*=\s*"(?<title>[^"]+)"'
        foreach ($m in $rx2.Matches($cfgText)) {
            $scenarioDefs += [PSCustomObject]@{ Title = $m.Groups['title'].Value; Class = ($m.Groups['class'].Value -split '\.')[-1] }
        }
    }
}

if (-not $featureName) {
    # Derive from folder name as a last resort.
    $featureName = Split-Path -Leaf (Split-Path -Parent $Source)
    if ([string]::IsNullOrWhiteSpace($featureName) -or $featureName -eq 'cs') {
        $featureName = Split-Path -Leaf $Source
    }
}

# If no scenario list was found, treat the whole app as a single "Main" scenario.
$singlePage = $false
if ($scenarioDefs.Count -eq 0) {
    $singlePage = $true
    Write-Host "    No scenario list found in SampleConfiguration.cs — treating as single-page app."
}

# ─── 2. Extract controls from each scenario page's XAML ───────────────────────
# Interactive / labelled control types worth listing as parity points.
$interactiveTypes = @(
    'Button','HyperlinkButton','ToggleButton','RepeatButton','AppBarButton','DropDownButton','SplitButton',
    'CheckBox','RadioButton','RadioButtons','ToggleSwitch','Slider','NumberBox',
    'TextBox','RichEditBox','PasswordBox','AutoSuggestBox','ComboBox','ListBox','ListView','GridView',
    'CalendarDatePicker','DatePicker','TimePicker','CalendarView','ColorPicker','RatingControl',
    'MediaPlayerElement','MediaElement','CaptureElement','Image','WebView','WebView2','InkCanvas',
    'PivotItem','Pivot','TabView','NavigationView','TreeView','Expander','MenuFlyoutItem','CommandBar'
)
$typeAlt = ($interactiveTypes | ForEach-Object { [regex]::Escape($_) }) -join '|'

function Get-PageControls([string]$xamlPath) {
    $controls = @()
    if (-not (Test-Path -LiteralPath $xamlPath)) { return ,$controls }
    $xaml = [System.IO.File]::ReadAllText($xamlPath)
    # Strip XML comments to avoid matching commented-out controls.
    $xaml = [regex]::Replace($xaml, '(?s)<!--.*?-->', '')
    $rx = [regex]("(?s)<(?<type>$typeAlt)\b(?<attrs>[^>]*?)/?>")
    foreach ($m in $rx.Matches($xaml)) {
        $type  = $m.Groups['type'].Value
        $attrs = $m.Groups['attrs'].Value
        $name  = ([regex]::Match($attrs, 'x:Name\s*=\s*"([^"]+)"')).Groups[1].Value
        $label = ''
        foreach ($la in @('Content','Header','Text','PlaceholderText','Title')) {
            $lm = [regex]::Match($attrs, "$la\s*=\s*`"([^`"]+)`"")
            if ($lm.Success) { $label = $lm.Groups[1].Value; break }
        }
        # Collect event-handler attribute names (Click, Tapped, Toggled, ...).
        $events = @()
        foreach ($em in [regex]::Matches($attrs, '(?<ev>[A-Z][A-Za-z]+)\s*=\s*"(?<h>[A-Za-z_][A-Za-z0-9_]*)"')) {
            $ev = $em.Groups['ev'].Value
            if ($ev -in @('Click','Tapped','Toggled','Checked','Unchecked','SelectionChanged','ValueChanged','TextChanged','Loaded','Tapped','PointerPressed')) {
                $events += $ev
            }
        }
        if ($name -or $label) {
            $controls += [PSCustomObject]@{ name = $name; type = $type; label = $label; events = @($events | Select-Object -Unique) }
        }
    }
    return ,$controls
}

# UWP SDK samples keep page .xaml in a sibling `shared/` folder (shared across
# cs/cpp/vb), not under cs/. Search the source folder AND its sibling shared/.
$xamlRoots = @($Source)
$parent = Split-Path -Parent $Source
if ($parent) {
    $sharedDir = Join-Path $parent 'shared'
    if (Test-Path -LiteralPath $sharedDir) { $xamlRoots += $sharedDir }
}
$xamlFiles = @()
foreach ($root in ($xamlRoots | Select-Object -Unique)) {
    $xamlFiles += Get-ChildItem -Path $root -Recurse -File -Filter '*.xaml' -ErrorAction SilentlyContinue
}

function Find-PageXaml([string]$class) {
    $hit = $xamlFiles | Where-Object { $_.BaseName -eq $class } | Select-Object -First 1
    if ($hit) { return $hit.FullName }
    return $null
}

$scenarios = @()
if ($singlePage) {
    # Single-page: use MainPage.xaml if present, else the first page xaml.
    $main = Find-PageXaml 'MainPage'
    if (-not $main -and $xamlFiles.Count -gt 0) { $main = ($xamlFiles | Select-Object -First 1).FullName }
    $controls = if ($main) { Get-PageControls $main } else { @() }
    $scenarios += [PSCustomObject]@{
        number = 1; title = $featureName; class = 'MainPage'; slug = (Get-Slug $featureName)
        xaml = $main; controls = $controls
    }
} else {
    $n = 0
    foreach ($s in $scenarioDefs) {
        $n++
        $xaml = Find-PageXaml $s.Class
        $controls = Get-PageControls $xaml
        $scenarios += [PSCustomObject]@{
            number = $n; title = $s.Title; class = $s.Class; slug = (Get-Slug $s.Title)
            xaml = $xaml; controls = $controls
        }
    }
}

# ─── 3. Write checklist.json ──────────────────────────────────────────────────
$checklist = [ordered]@{
    featureName = $featureName
    source      = $Source
    generated   = (Get-Date).ToString('o')
    scenarios   = @($scenarios | ForEach-Object {
        [ordered]@{
            number   = $_.number
            title    = $_.title
            class    = $_.class
            slug     = $_.slug
            screenshot = ('{0:00}_{1}.png' -f $_.number, $_.slug)
            controls = @($_.controls)
        }
    })
}
$jsonPath = Join-Path $OutDir 'checklist.json'
$checklist | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

# ─── 4. Seed info.md (benchmark behavioral-baseline format) ───────────────────
$md = New-Object System.Collections.Generic.List[string]
[void]$md.Add("# $featureName — behavioral baseline")
[void]$md.Add('')
[void]$md.Add("Derived from UWP source by Extract-UwpFeatureChecklist.ps1. Each scenario below")
[void]$md.Add("is a feature point the migrated WinUI 3 app must preserve. Screenshots (when")
[void]$md.Add("captured) live in ``screenshots/`` named ``NN_<slug>.png``.")
[void]$md.Add('')
foreach ($s in $scenarios) {
    [void]$md.Add(('## Scenario {0} - {1}' -f $s.number, $s.title))
    [void]$md.Add('')
    [void]$md.Add(('- **Screenshot:** `screenshots/{0:00}_{1}.png`' -f $s.number, $s.slug))
    [void]$md.Add(('- **Page class:** `{0}`' -f $s.class))
    [void]$md.Add('- **UI elements:**')
    if ($s.controls.Count -eq 0) {
        [void]$md.Add('  - _(no named/interactive controls detected — verify visually)_')
    } else {
        foreach ($c in $s.controls) {
            $bits = @($c.type)
            if ($c.name)  { $bits += "name=$($c.name)" }
            if ($c.label) { $bits += "label=`"$($c.label)`"" }
            if ($c.events -and $c.events.Count -gt 0) { $bits += "events=$([string]::Join('/', $c.events))" }
            [void]$md.Add('  - ' + ($bits -join ', '))
        }
    }
    [void]$md.Add('- **Code behavior:** _(verify the page''s handlers produce the analogous result; see source `' + $s.class + '.xaml.cs`)_')
    [void]$md.Add('')
}
$mdPath = Join-Path $OutDir 'info.md'
Set-Content -LiteralPath $mdPath -Value $md -Encoding UTF8

# ─── 5. Summary ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== FEATURE CHECKLIST EXTRACTED ==="
Write-Host "    Feature : $featureName"
Write-Host "    Scenarios: $($scenarios.Count)"
foreach ($s in $scenarios) {
    Write-Host ("      {0,2}. {1}  ({2} control(s))" -f $s.number, $s.title, $s.controls.Count)
}
Write-Host "    checklist.json -> $jsonPath"
Write-Host "    info.md        -> $mdPath"
Write-Host ""
Write-Host "Next: capture screenshots of the running app with Capture-AppScenarios.ps1,"
Write-Host "then run Compare-Parity.ps1 to grade the WinUI 3 app against this checklist."
