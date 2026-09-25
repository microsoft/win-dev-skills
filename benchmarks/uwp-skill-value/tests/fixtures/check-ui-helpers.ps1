param([string]$EvaluatorScript, [string]$FixtureDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($EvaluatorScript, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Load only pure function definitions and pixel helpers, never the app runner.
foreach ($function in $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
    . ([scriptblock]::Create($function.Extent.Text))
}
Add-Type -AssemblyName System.Drawing.Common
foreach ($definition in $ast.FindAll({
    param($n)
    $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Add-Type' -and
    ($n.CommandElements | Where-Object {
        $_ -is [Management.Automation.Language.StringConstantExpressionAst] -and
        $_.Value -like '*public static class BenchmarkPixels*'
    })
}, $true)) { Invoke-Expression $definition.Extent.Text }

function Expect-Failure([scriptblock]$Action) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    if (-not $failed) { throw 'Mutant incorrectly passed' }
}
$script:Scale = 1
$canvas = [Drawing.Bitmap]::new(400, 400)
$graphics = [Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([Drawing.Color]::White)
$before = [pscustomobject]@{ Colors = [BenchmarkPixels]::ColorCounts($canvas) }
foreach ($color in @('F65314', '7CBB00', '00A1F1', 'FFBB00')) {
    $index = [array]::IndexOf(@('F65314', '7CBB00', '00A1F1', 'FFBB00'), $color)
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#$color"))
    $graphics.FillRectangle($brush, 20 + ($index % 2) * 110, 20 + [int][Math]::Floor($index / 2) * 110, 100, 100)
    $brush.Dispose()
}
$after = [pscustomobject]@{ Colors = [BenchmarkPixels]::ColorCounts($canvas) }
Require-Realized $before $after
Require-SameColors $after $after
Expect-Failure { Require-Realized $before $before }
Expect-Failure { Require-SameColors $after ([pscustomobject]@{ Colors = @(20000,20000,20000,20000) }) }
$node = [pscustomobject]@{
    name = '1) Basic Deferral'; type = 'Text'; isOffscreen = $false
    width = 100; height = 30; children = @()
}
$nodes = @(Get-VisibleNodes @($node))
Require-Labels $nodes @('Basic Deferral')
Expect-Failure { Require-Labels $nodes @('Adaptive Deferral') }
$node.isOffscreen = $true
Expect-Failure { Require-Labels @(Get-VisibleNodes @($node)) @('Basic Deferral') }
$node.isOffscreen = $false

$script:OwnedProcess = [pscustomobject]@{ Id = 4242 }
$script:AppWindow = [IntPtr]234
$script:Evidence = [Collections.Generic.List[string]]::new()
$script:OutputDirectory = $FixtureDirectory
[void](New-Item -ItemType Directory -Path $FixtureDirectory)
$script:MockPid = 4242
$script:EmptyTree = $false
function Invoke-Ui([string[]]$Arguments) {
    if ($Arguments[0] -eq 'inspect') {
        $elements = @($node, $node)
        if ($script:EmptyTree) { $elements = @() }
        $data = [pscustomobject]@{ windows = @([pscustomobject]@{
            hwnd = 234; elementCount = $elements.Count; elements = $elements
        }) }
        [IO.File]::WriteAllText((Join-Path $FixtureDirectory 'tree.json'), ($data | ConvertTo-Json -Depth 10))
        return [pscustomobject]@{ Data = $data; Stdout = 'tree.json' }
    }
    if ($Arguments[0] -ne 'screenshot') { throw 'Fixture forbids all other UI commands' }
    $path = $Arguments[2]
    $canvas.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    return [pscustomobject]@{ Data = [pscustomobject]@{
        filePath = $path; width = 400; height = 400; processId = $script:MockPid; hwnd = 234
    } }
}
[void](Capture-State 'golden')
$script:MockPid = 9999
Expect-Failure { Capture-State 'wrong-pid' }
$script:MockPid = 4242
$script:EmptyTree = $true
Expect-Failure { Capture-State 'empty-tree' }
$reference = [Drawing.Bitmap]::new(300, 200)
$photoCanvas = [Drawing.Bitmap]::new(240, 240)
$photoGraphics = [Drawing.Graphics]::FromImage($photoCanvas)
$photoGraphics.Clear([Drawing.Color]::Black)
for ($y = 0; $y -lt 200; $y++) {
    for ($x = 0; $x -lt 300; $x++) {
        $color = if ($x -ge 200) { [Drawing.Color]::Magenta } else {
            [Drawing.Color]::FromArgb([int]($x / 20) * 20, [int]($y / 20) * 20, (($x + 2 * $y) % 120) + 80)
        }
        $reference.SetPixel($x, $y, $color)
    }
}
for ($y = 0; $y -lt 150; $y++) {
    for ($x = 0; $x -lt 150; $x++) {
        $photoCanvas.SetPixel(30 + $x, 30 + $y,
            $reference.GetPixel([int][Math]::Floor(($x + .5) * 200 / 150),
                [int][Math]::Floor(($y + .5) * 200 / 150)))
    }
}
$match = [BenchmarkPixels]::MatchPhoto($photoCanvas, $reference, 150)
Require ($match[0] -lt 24) 'Asymmetric source top-left crop was not recognized'
$photoGraphics.Clear([Drawing.Color]::Black)
Expect-Failure { Require ([BenchmarkPixels]::MatchPhoto($photoCanvas, $reference, 150)[0] -lt 24) 'Blank photograph' }
$photoGraphics.Clear([Drawing.Color]::Magenta)
Expect-Failure { Require ([BenchmarkPixels]::MatchPhoto($photoCanvas, $reference, 150)[0] -lt 24) 'Wrong photograph' }
$photoGraphics.Dispose()
$photoCanvas.Dispose()
$reference.Dispose()
$graphics.Dispose()
$canvas.Dispose()
Write-Output 'PowerShell helper goldens and mutants passed; no native app/UI commands executed'
