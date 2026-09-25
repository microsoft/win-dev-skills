[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\Initialize-UwpMigration.ps1'
$work = Join-Path $PSScriptRoot '.bootstrap-regression-work'

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Write-Fixture([string]$Path, [string]$Content) {
    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content)
}

try {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    $source = Join-Path $work 'sample\cs'
    $shared = Join-Path $work 'sample\shared'
    $target = Join-Path $work 'target'
    New-Item -ItemType Directory -Path $source, $shared, $target -Force | Out-Null

    Write-Fixture (Join-Path $source 'Sample.csproj') @'
<Project>
  <ItemGroup>
    <Compile Include="Common\NavigationHelper.cs" />
    <Page Include="..\shared\ActualStart.xaml"><Link>Pages\ActualStart.xaml</Link></Page>
    <Compile Include="..\shared\ActualStart.xaml.cs"><Link>Pages\ActualStart.xaml.cs</Link></Compile>
    <Content Include="runtime\data.bin"><Link>Assets\data.bin</Link></Content>
    <Content Include="Data\catalog.json"><CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory></Content>
    <None Include="$(GeneratedFile)" />
  </ItemGroup>
</Project>
'@
    Write-Fixture (Join-Path $source 'App.xaml.cs') @'
namespace Sample { class App { void Start() { rootFrame.Navigate(typeof(ActualStart)); } } }
'@
    Write-Fixture (Join-Path $source 'MainPage.xaml') @'
<Page x:Class="Sample.SourceMainPage" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"><Grid /></Page>
'@
    Write-Fixture (Join-Path $source 'Common\NavigationHelper.cs') @'
namespace Sample.Common { public class RootFrameNavigationHelper { public RootFrameNavigationHelper(object frame) { OriginalHook = frame; } public object OriginalHook; } }
'@
    Write-Fixture (Join-Path $source 'Radial.cs') @'
using Windows.UI.Input; namespace Sample { class Dial { RadialController controller; } }
'@
    Write-Fixture (Join-Path $source 'runtime\data.bin') 'runtime payload'
    Write-Fixture (Join-Path $source 'Data\catalog.json') '{"name":"catalog"}'
    Write-Fixture (Join-Path $source 'Assets\tone.wav') 'asset payload'
    Write-Fixture (Join-Path $source 'bin\must-not-copy.cs') 'excluded'
    Write-Fixture (Join-Path $shared 'ActualStart.xaml') @'
<Page x:Class="Sample.Pages.ActualStart" xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"><Grid /></Page>
'@
    Write-Fixture (Join-Path $shared 'ActualStart.xaml.cs') 'namespace Sample.Pages { public sealed partial class ActualStart { } }'

    Write-Fixture (Join-Path $target 'Target.csproj') '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><Content Include="Assets\**" /></ItemGroup></Project>'
    Write-Fixture (Join-Path $target 'MainPage.xaml') '<Page x:Class="Scaffold.MainPage" />'
    Write-Fixture (Join-Path $target 'MainWindow.xaml') @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"><Grid Grid.Row="1" /></Window>
'@
    Write-Fixture (Join-Path $target 'MainWindow.xaml.cs') @'
namespace Scaffold { public sealed partial class MainWindow { public MainWindow() { InitializeComponent(); RootFrame.Navigate(typeof(MainPage)); } } }
'@

    & $scriptPath -Source $source -Target $target *> $null

    Assert-True ((Get-Content (Join-Path $target 'Assets\data.bin') -Raw) -eq 'runtime payload') 'linked runtime Content was not copied to Link destination'
    [xml]$targetProject = Get-Content (Join-Path $target 'Target.csproj') -Raw
    $catalogItem = $targetProject.SelectSingleNode("//*[local-name()='Content' and @Include='Data\catalog.json']")
    Assert-True ($null -ne $catalogItem) 'non-Assets Content membership was not preserved in the target project'
    Assert-True ($catalogItem.CopyToOutputDirectory -eq 'PreserveNewest') 'Content copy metadata was not preserved'
    Assert-True ($targetProject.SelectNodes("//*[local-name()='Content' and @Include='Assets\**']").Count -eq 1) 'default Assets membership was duplicated'
    Assert-True ((Get-Content (Join-Path $target 'Assets\tone.wav') -Raw) -eq 'asset payload') 'non-whitelisted asset was not preserved'
    Assert-True (-not (Test-Path (Join-Path $target 'ActualStart.xaml'))) 'linked Page was also copied to an incorrect discovery destination'
    Assert-True (-not (Test-Path (Join-Path $target 'bin\must-not-copy.cs'))) 'bin content was imported'
    Assert-True ((Get-Content (Join-Path $target 'MainPage.xaml') -Raw).Contains('Sample.SourceMainPage')) 'source MainPage did not replace scaffold placeholder'
    $helper = Get-Content (Join-Path $target 'Common\NavigationHelper.cs') -Raw
    Assert-True ($helper.Contains('OriginalHook = frame')) 'navigation helper implementation was not preserved'
    Assert-True (-not $helper.Contains('params object[]')) 'navigation helper was replaced by a permissive no-op'

    $windowCode = Get-Content (Join-Path $target 'MainWindow.xaml.cs') -Raw
    Assert-True ($windowCode.Contains('DispatcherQueue.TryEnqueue(() => RootFrame.Navigate(typeof(Sample.Pages.ActualStart)))')) 'template navigation was not deferred to the fully-qualified actual entry page'
    Assert-True (-not $windowCode.Contains('RootFrame.Navigate(typeof(MainPage));')) 'template MainPage navigation survived'

    $mapping = Get-Content (Join-Path $target 'MIGRATION-MAPPING.md')
    $mappingRows = @($mapping | Where-Object { $_ -match '\| copied \|$' })
    $meta = Get-Content (Join-Path $target '.bootstrap-meta.json') -Raw | ConvertFrom-Json
    Assert-True ($meta.seededRowCount -eq $mappingRows.Count) "seededRowCount ($($meta.seededRowCount)) does not equal exact mapping-row count ($($mappingRows.Count))"
    Assert-True ($meta.baseline.mappingRows.Count -eq $mappingRows.Count) 'immutable baseline membership does not equal mapping membership'
    Assert-True ($meta.schema.name -eq 'winui-uwp-migration-bootstrap' -and $meta.schema.version -eq 4) 'typed metadata schema is missing'
    Assert-True (-not $meta.bootstrapComplete) 'unresolved MSBuild expression incorrectly reported as complete'
    Assert-True ($meta.unresolvedProjectItems.Count -eq 1) 'unsupported MSBuild expression was not reported'
    Assert-True ($meta.adaptationGuidance.radialController.Contains('RadialControllerInterop.CreateForWindow')) 'RadialController HWND guidance is missing'
    $radialRow = $mapping | Where-Object { $_ -match '^\| Radial\.cs \|' }
    Assert-True ($radialRow -match 'migrate-with-adaptation') 'RadialController file was deferred instead of marked adaptable'
    $radialCode = Get-Content (Join-Path $target 'Radial.cs') -Raw
    Assert-True ($radialCode.Contains('MIGRATION-PATTERNS.md#radial-controller')) 'generated TODO points to the wrong migration guide'
    Assert-True ($radialCode -notmatch '(?<!MIGRATION-)PATTERNS\.md') 'generated TODO contains stale PATTERNS.md guidance'

    Write-Fixture (Join-Path $target 'sentinel.txt') 'keep'
    $rerunRejected = $false
    try { & $scriptPath -Source $source -Target $target *> $null } catch { $rerunRejected = $true }
    Assert-True $rerunRejected 'already initialized target was accepted'
    Assert-True ((Get-Content (Join-Path $target 'sentinel.txt') -Raw) -eq 'keep') 'rerun changed completed target work'

    $deferredTarget = Join-Path $work 'deferred-target'
    New-Item -ItemType Directory -Path $deferredTarget -Force | Out-Null
    Write-Fixture (Join-Path $deferredTarget 'Target.csproj') '<Project />'
    Write-Fixture (Join-Path $deferredTarget 'MainWindow.xaml') @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"><Grid Grid.Row="1" /></Window>
'@
    Write-Fixture (Join-Path $deferredTarget 'MainWindow.xaml.cs') @'
namespace Scaffold { public sealed partial class MainWindow { public MainWindow() { InitializeComponent(); DispatcherQueue.TryEnqueue(() => RootFrame.Navigate(typeof(MainPage))); } } }
'@
    & $scriptPath -Source $source -Target $deferredTarget *> $null
    $deferredWindowCode = Get-Content (Join-Path $deferredTarget 'MainWindow.xaml.cs') -Raw
    Assert-True ($deferredWindowCode.Contains('DispatcherQueue.TryEnqueue(() => RootFrame.Navigate(typeof(Sample.Pages.ActualStart)))')) 'existing deferred navigation did not receive the actual entry-page type'
    Assert-True (-not $deferredWindowCode.Contains('=> )')) 'rewriting existing deferred navigation left an empty lambda'
    Assert-True (([regex]::Matches($deferredWindowCode, 'DispatcherQueue\.TryEnqueue')).Count -eq 1) 'existing deferred navigation was duplicated'

    $dedupRoot = Join-Path $work 'shared-content-dedup'
    $dedupSource = Join-Path $dedupRoot 'Samples\Widget\cs'
    $dedupSharedContent = Join-Path $dedupRoot 'SharedContent'
    $dedupTarget = Join-Path $dedupRoot 'target'
    New-Item -ItemType Directory -Path $dedupSource, $dedupSharedContent, $dedupTarget -Force | Out-Null
    Write-Fixture (Join-Path $dedupSource 'Sample.csproj') @'
<Project><ItemGroup>
  <Page Include="..\..\..\SharedContent\cs\MainPage.xaml"><Link>Views\MainPage.xaml</Link></Page>
  <Compile Include="..\..\..\SharedContent\cs\MainPage.xaml.cs"><Link>Views\MainPage.xaml.cs</Link></Compile>
</ItemGroup></Project>
'@
    Write-Fixture (Join-Path $dedupSource 'App.xaml.cs') 'class App { void Start() { rootFrame.Navigate(typeof(MainPage)); } }'
    Write-Fixture (Join-Path $dedupSharedContent 'xaml\Styles.xaml') '<ResourceDictionary />'
    Write-Fixture (Join-Path $dedupSharedContent 'cs\MainPage.xaml') '<Page x:Class="Sample.Shared.MainPage" />'
    Write-Fixture (Join-Path $dedupSharedContent 'cs\MainPage.xaml.cs') 'namespace Sample.Shared { partial class MainPage { } }'
    Write-Fixture (Join-Path $dedupTarget 'Target.csproj') '<Project />'
    Write-Fixture (Join-Path $dedupTarget 'MainPage.xaml') '<Page x:Class="Scaffold.Placeholder" />'
    Write-Fixture (Join-Path $dedupTarget 'MainWindow.xaml') '<Window><Grid Grid.Row="1" /></Window>'
    Write-Fixture (Join-Path $dedupTarget 'MainWindow.xaml.cs') 'class MainWindow { MainWindow() { InitializeComponent(); } }'
    & $scriptPath -Source $dedupSource -Target $dedupTarget *> $null
    Assert-True (Test-Path (Join-Path $dedupTarget 'Views\MainPage.xaml')) 'linked SharedContent MainPage was not copied'
    Assert-True ((Get-Content (Join-Path $dedupTarget 'MainPage.xaml') -Raw).Contains('Scaffold.Placeholder')) 'SharedContent fallback duplicated linked MainPage at root'
    $dedupMapping = Get-Content (Join-Path $dedupTarget 'MIGRATION-MAPPING.md')
    Assert-True (-not ($dedupMapping | Where-Object { $_ -match '^\| MainPage\.xaml(?:\.cs)? \|' })) 'root fallback duplicate was added to mapping'

    $manualSource = Join-Path $work 'manual-source'
    $manualTarget = Join-Path $work 'manual-target'
    New-Item -ItemType Directory -Path $manualSource, $manualTarget -Force | Out-Null
    Write-Fixture (Join-Path $manualSource 'Manual.csproj') '<Project />'
    Write-Fixture (Join-Path $manualSource 'Model.cs') 'namespace Sample { class Model { } }'
    Write-Fixture (Join-Path $manualTarget 'Target.csproj') '<Project />'
    Write-Fixture (Join-Path $manualTarget 'MainPage.xaml') '<Page x:Class="Scaffold.MainPage" />'
    Write-Fixture (Join-Path $manualTarget 'MainWindow.xaml.cs') 'class MainWindow { MainWindow() { InitializeComponent(); RootFrame.Navigate(typeof(MainPage)); } }'
    & $scriptPath -Source $manualSource -Target $manualTarget *> $null
    $manualWindowCode = Get-Content (Join-Path $manualTarget 'MainWindow.xaml.cs') -Raw
    $manualMeta = Get-Content (Join-Path $manualTarget '.bootstrap-meta.json') -Raw | ConvertFrom-Json
    Assert-True (-not $manualWindowCode.Contains('RootFrame.Navigate(typeof(MainPage))')) 'unresolved startup retained unconditional template MainPage navigation'
    Assert-True (-not $manualMeta.bootstrapComplete -and $manualMeta.startupAdaptationRequired.Count -eq 1) 'bounded manual startup adaptation was not recorded'

    $overlapRejected = $false
    try { & $scriptPath -Source $source -Target $source *> $null } catch { $overlapRejected = $true }
    Assert-True $overlapRejected 'equal Source and Target were accepted'

    $nestedTarget = Join-Path $source 'nested-target'
    New-Item -ItemType Directory -Path $nestedTarget | Out-Null
    $nestedRejected = $false
    try { & $scriptPath -Source $source -Target $nestedTarget *> $null } catch { $nestedRejected = $true }
    Assert-True $nestedRejected 'ancestor/descendant Source and Target were accepted'
    Assert-True ((Get-ChildItem -LiteralPath $nestedTarget -Force).Count -eq 0) 'overlap rejection occurred after a target write'

    $junctionTarget = Join-Path $work 'junction-target'
    $junctionExternal = Join-Path $work 'junction-external'
    New-Item -ItemType Directory -Path $junctionTarget, $junctionExternal -Force | Out-Null
    Write-Fixture (Join-Path $junctionTarget 'Target.csproj') '<Project />'
    Write-Fixture (Join-Path $junctionExternal 'sentinel.txt') 'untouched'
    $junctionPath = Join-Path $junctionTarget 'Assets'
    try {
        New-Item -ItemType Junction -Path $junctionPath -Target $junctionExternal -ErrorAction Stop | Out-Null
        $junctionRejected = $false
        try { & $scriptPath -Source $source -Target $junctionTarget *> $null } catch { $junctionRejected = $true }
        Assert-True $junctionRejected 'target junction was accepted'
        Assert-True ((Get-Content (Join-Path $junctionExternal 'sentinel.txt') -Raw) -eq 'untouched') 'bootstrap wrote through target junction'
        Assert-True ((Get-ChildItem -LiteralPath $junctionExternal -Force).Count -eq 1) 'bootstrap created files through target junction'
        Assert-True (-not (Test-Path (Join-Path $junctionTarget 'MIGRATION-MAPPING.md'))) 'junction rejection occurred after bootstrap writes'
        Remove-Item -LiteralPath $junctionPath -Force
    } catch {
        if (Test-Path -LiteralPath $junctionPath) { throw }
        Write-Host "SKIP: junction safety fixture unavailable: $($_.Exception.Message)"
    }

    Write-Host 'Initialize-UwpMigration bootstrap regression: PASS'
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
