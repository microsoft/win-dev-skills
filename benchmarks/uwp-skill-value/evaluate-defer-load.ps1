param(
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][string]$ScenarioFile,
    [Parameter(Mandatory)][string]$BuildArtifacts,
    [switch]$AllowDesktop
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Sequence = 0
$script:Evidence = [Collections.Generic.List[string]]::new()
$script:OwnedProcess = $null
$script:Ownership = $null
$script:AppWindow = [IntPtr]::Zero
$script:CurrentAssertion = 'launch_exit'
$script:Oracle = Get-Content -LiteralPath $ScenarioFile -Raw | ConvertFrom-Json
$uiIds = @('launch_exit', 'launch_identity', 'launch_survival', 'startup_content',
    'basic_initial', 'basic_realize', 'basic_repeat', 'adaptive_narrow', 'adaptive_tablet',
    'adaptive_desktop', 'adaptive_shrink', 'adaptive_reexpand', 'template_content',
    'basic_navigation_reset', 'basic_navigation_realize', 'template_repeat', 'screenshots', 'cleanup')
$script:Assertions = [ordered]@{}
foreach ($id in $uiIds) {
    $script:Assertions[$id] = [ordered]@{
        id = $id; status = 'not_run'; reason = 'A preceding required UI assertion did not pass'; evidence = @()
    }
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'UI evidence directory must not already exist' }
[void](New-Item -ItemType Directory -Path $OutputDirectory)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$Project = [IO.Path]::GetFullPath($Project)

function Save-Json([string]$Relative, $Value) {
    $path = Join-Path $OutputDirectory $Relative
    $json = ConvertTo-Json -InputObject $Value -Depth 100
    $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    $script:Evidence.Add($Relative)
}

function Set-Assertion([string]$Id, [string]$Status, [string]$Reason) {
    $script:Assertions[$Id].status = $Status
    $script:Assertions[$Id].reason = $Reason
    $script:Assertions[$Id].evidence = @($script:Evidence.ToArray())
}

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Invoke-Native([string[]]$Arguments, [int]$TimeoutSeconds = 20) {
    $script:Sequence++
    $prefix = '{0:d3}-{1}' -f $script:Sequence, $Arguments[0]
    $stdoutFile = "$prefix.stdout.txt"
    $stderrFile = "$prefix.stderr.txt"
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = 'winapp'
    $info.WorkingDirectory = Split-Path -Parent $Project
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $started = [DateTime]::UtcNow
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $exitCode = $null
    $timedOut = $false
    $nativePid = $null
    $errorText = $null
    $stdout = ''
    $stderr = ''
    try {
        [void]$process.Start()
        $nativePid = $process.Id
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $timedOut = $true
            $process.Kill($true)
            $process.WaitForExit()
        }
        if (-not $outTask.Wait(3000) -or -not $errTask.Wait(3000)) {
            throw 'Native output pipes remained open after process exit; refusing an unbounded wait'
        }
        $stdout = $outTask.GetAwaiter().GetResult()
        $stderr = $errTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
    } catch { $errorText = $_.Exception.Message }
    finally {
        $timer.Stop()
        $process.Dispose()
        [IO.File]::WriteAllText((Join-Path $OutputDirectory $stdoutFile), $stdout)
        [IO.File]::WriteAllText((Join-Path $OutputDirectory $stderrFile), $stderr)
    }
    $record = [ordered]@{
        argv = @('winapp') + $Arguments; cwd = $info.WorkingDirectory
        pid = $nativePid; exit_code = $exitCode; timed_out = $timedOut; error = $errorText
        started_at = $started.ToString('o'); ended_at = [DateTime]::UtcNow.ToString('o')
        elapsed_seconds = $timer.Elapsed.TotalSeconds; stdout = $stdoutFile; stderr = $stderrFile
    }
    Save-Json "$prefix.command.json" $record
    Require ($exitCode -eq 0 -and -not $timedOut -and -not $errorText) `
        "winapp $($Arguments[0]) failed: exit=$exitCode timeout=$timedOut error=$errorText"
    Require (-not [string]::IsNullOrWhiteSpace($stdout)) 'Native exit zero without JSON evidence'
    $parsed = ConvertFrom-Json -InputObject $stdout -Depth 100
    Require ($null -ne $parsed -and $parsed -isnot [array]) 'Expected a single JSON result object'
    foreach ($key in @('Error', 'error')) {
        if ($parsed.PSObject.Properties[$key]) {
            Require (-not $parsed.$key) "winapp reported an error despite exit zero: $($parsed.$key)"
        }
    }
    return [pscustomobject]@{ Data = $parsed; Record = $record; Stdout = $stdoutFile }
}

function Assert-Owned {
    Require ($null -ne $script:OwnedProcess) 'No verified run-owned process'
    $script:OwnedProcess.Refresh()
    Require (-not $script:OwnedProcess.HasExited) 'Run-owned app exited unexpectedly'
    Require ($script:OwnedProcess.StartTime.ToUniversalTime().ToString('o') -eq $script:Ownership.creation_time) `
        'Process identity changed'
    if ($script:AppWindow -ne [IntPtr]::Zero) {
        [uint32]$ownerId = 0
        [void][BenchmarkWindow]::GetWindowThreadProcessId($script:AppWindow, [ref]$ownerId)
        Require ($ownerId -eq $script:OwnedProcess.Id) 'Window no longer belongs to the run-owned PID'
    }
}

function Invoke-Ui([string[]]$Arguments) {
    Assert-Owned
    return Invoke-Native (@('ui') + $Arguments + @(
        '--app', [string]$script:OwnedProcess.Id, '--window', [string]$script:AppWindow.ToInt64(), '--json'))
}

function Get-VisibleNodes($Nodes, [bool]$AncestorVisible = $true) {
    foreach ($node in $Nodes) {
        $visible = $AncestorVisible -and $node.PSObject.Properties['isOffscreen'] -and
            $node.isOffscreen -eq $false -and $node.width -gt 0 -and $node.height -gt 0
        if ($visible) { $node }
        if ($node.PSObject.Properties['children'] -and $node.children) {
            Get-VisibleNodes $node.children $visible
        }
    }
}

function Normalize-Label([string]$Value) {
    return (($Value -replace '^\s*\d+\)\s*', '') -replace '\s+', ' ').Trim()
}

function Find-Label($Nodes, [string]$Name) {
    $expected = Normalize-Label $Name
    return @($Nodes | Where-Object {
        $_.PSObject.Properties['name'] -and (Normalize-Label $_.name) -ceq $expected
    })
}

function Require-Labels($Nodes, [string[]]$Names, [bool]$Present = $true) {
    foreach ($name in $Names) {
        $found = @(Find-Label $Nodes $name)
        Require (($found.Count -gt 0) -eq $Present) "Visible '$name' expected present=$Present"
    }
}

function Require-Description($Nodes, [string]$Prefix) {
    $matches = @($Nodes | Where-Object {
        $_.PSObject.Properties['name'] -and $_.name.StartsWith($Prefix, [StringComparison]::Ordinal)
    })
    Require ($matches.Count -gt 0) "Missing visible page content: $Prefix"
}

function Invoke-Label($Nodes, [string]$Name) {
    if ($Name -in $script:Oracle.oracle.navigation) {
        $tree = Invoke-Ui @('inspect', '--depth', '40')
        $Nodes = @(Get-VisibleNodes $tree.Data.windows[0].elements)
        if (@(Find-Label $Nodes $Name).Count -eq 0) {
            Invoke-Label $Nodes 'Menu'
            $tree = Invoke-Ui @('inspect', '--depth', '40')
            $Nodes = @(Get-VisibleNodes $tree.Data.windows[0].elements)
        }
    }
    $matches = @(Find-Label $Nodes $Name)
    $invokable = @($matches | Where-Object {
        $_.PSObject.Properties['isInvokable'] -and $_.isInvokable -and $_.isEnabled
    })
    if ($invokable.Count) { $matches = $invokable }
    Require ($matches.Count -gt 0) "No visible control to invoke: $Name"
    Require ($matches[0].PSObject.Properties['selector'] -and $matches[0].selector) "No selector for $Name"
    $response = Invoke-Ui @('invoke', $matches[0].selector)
    Require ($response.Data.hwnd -eq $script:AppWindow.ToInt64() -and $response.Data.pattern) `
        "Invocation did not acknowledge the owned window/control: $Name"
    Start-Sleep -Milliseconds 350
}

function Resize-Window([int]$WidthDips) {
    Assert-Owned
    # PowerShell is normally DPI-unaware: keep all geometry in physical pixels.
    $previousDpi = [BenchmarkWindow]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
    Require ($previousDpi -ne [IntPtr]::Zero) 'Cannot enter per-monitor DPI-aware geometry context'
    try {
        [void][BenchmarkWindow]::ShowWindow($script:AppWindow, 9)
        $dpi = [BenchmarkWindow]::GetDpiForWindow($script:AppWindow)
        Require ($dpi -gt 0) 'Cannot determine window DPI'
        $scale = $dpi / 96.0
        $screen = [Windows.Forms.Screen]::FromHandle($script:AppWindow).WorkingArea
        $width = [int][Math]::Round($WidthDips * $scale)
        $height = [int][Math]::Min(960 * $scale, $screen.Height - 60 * $scale)
        Require ($height / $scale -ge 760 -and $width + 32 -le $screen.Width) `
            "Desktop cannot accommodate frozen viewport ${WidthDips} DIPs at DPI $dpi"
        $outer = [BenchmarkWindow+Rect]::new()
        $client = [BenchmarkWindow+Rect]::new()
        Require ([BenchmarkWindow]::GetWindowRect($script:AppWindow, [ref]$outer)) 'Cannot read window bounds'
        Require ([BenchmarkWindow]::GetClientRect($script:AppWindow, [ref]$client)) 'Cannot read client bounds'
        $borderWidth = ($outer.Right - $outer.Left) - ($client.Right - $client.Left)
        $borderHeight = ($outer.Bottom - $outer.Top) - ($client.Bottom - $client.Top)
        Require ([BenchmarkWindow]::SetWindowPos($script:AppWindow, [IntPtr]::Zero,
            $screen.Left + 8, $screen.Top + 8, $width + $borderWidth, $height + $borderHeight, 0x0044)) `
            'Cannot resize run-owned window'
        Start-Sleep -Milliseconds 500
        Require ([BenchmarkWindow]::GetClientRect($script:AppWindow, [ref]$client)) 'Cannot verify resized bounds'
        $actualWidth = ($client.Right - $client.Left) / $scale
        Require ([Math]::Abs($actualWidth - $WidthDips) -le 2) "Requested viewport not realized: $actualWidth DIPs"
        $script:Sequence++
        Save-Json ('{0:d3}-viewport.json' -f $script:Sequence) @{
            pid = $script:OwnedProcess.Id; hwnd = $script:AppWindow.ToInt64()
            dpi = $dpi; requested_width_dips = $WidthDips; actual_width_dips = $actualWidth
            actual_height_dips = ($client.Bottom - $client.Top) / $scale
            screen = @{ width = $screen.Width; height = $screen.Height }; geometry_units = 'physical_pixels'
        }
        $script:Scale = $scale
    } finally {
        Require ([BenchmarkWindow]::SetThreadDpiAwarenessContext($previousDpi) -ne [IntPtr]::Zero) `
            'Cannot restore DPI awareness context'
    }
}

function Capture-State([string]$Name, [switch]$Photographs) {
    $tree = Invoke-Ui @('inspect', '--depth', '40')
    Require ($tree.Data.windows.Count -eq 1) 'Expected exactly the owned window in UIA evidence'
    Require ($tree.Data.windows[0].hwnd -eq $script:AppWindow.ToInt64()) 'UIA returned a different window'
    Require ($tree.Data.windows[0].elementCount -gt 1) 'UIA tree is empty'
    $nodes = @(Get-VisibleNodes $tree.Data.windows[0].elements)
    Require ($nodes.Count -gt 1) 'UIA tree has no visibly rendered content'
    $pngName = "$Name.png"
    $png = Join-Path $OutputDirectory $pngName
    $shot = Invoke-Ui @('screenshot', '--output', $png)
    Require ($shot.Data.processId -eq $script:OwnedProcess.Id) 'Screenshot came from the wrong PID'
    Require ($shot.Data.hwnd -eq $script:AppWindow.ToInt64()) 'Screenshot came from the wrong window'
    Require ([IO.Path]::GetFullPath($shot.Data.filePath) -eq $png -and
        (Test-Path -LiteralPath $png -PathType Leaf)) 'Screenshot file was not produced'
    Require ($shot.Data.width -gt 200 -and $shot.Data.height -gt 200) 'Screenshot dimensions are invalid'
    $bitmap = [Drawing.Bitmap]::new($png)
    try {
        Require ($bitmap.Width -eq $shot.Data.width -and $bitmap.Height -eq $shot.Data.height) `
            'Screenshot metadata does not describe its bytes'
        $colors = [BenchmarkPixels]::ColorCounts($bitmap)
        $photos = @()
        if ($Photographs) {
            foreach ($file in @('rainier.jpg', 'valley.jpg')) {
                $reference = [Drawing.Bitmap]::new((Join-Path (Split-Path -Parent $Project) "Assets\$file"))
                try {
                    $match = [BenchmarkPixels]::MatchPhoto($bitmap, $reference, [int](150 * $script:Scale))
                    $photos += @{ asset = $file; mean_error = $match[0]; x = $match[1]; y = $match[2] }
                } finally { $reference.Dispose() }
            }
        }
    } finally { $bitmap.Dispose() }
    $script:Evidence.Add($pngName)
    $script:Evidence.Add($tree.Stdout)
    Save-Json "$Name.visual.json" @{
        colors = $colors; photos = $photos; pid = $script:OwnedProcess.Id
        hwnd = $script:AppWindow.ToInt64(); screenshot = $pngName; uia = $tree.Stdout; scale = $script:Scale
    }
    return [pscustomobject]@{ Nodes = $nodes; Colors = $colors; Photos = $photos }
}

function Require-Realized($Before, $After) {
    for ($i = 0; $i -lt 4; $i++) {
        Require ($After.Colors[$i] - $Before.Colors[$i] -ge 2000 * $script:Scale * $script:Scale) `
            "Deferred rectangle color $i did not visibly appear"
    }
}

function Require-SameColors($Before, $After) {
    for ($i = 0; $i -lt 4; $i++) {
        Require ([Math]::Abs($After.Colors[$i] - $Before.Colors[$i]) -le
            [Math]::Max(60, $Before.Colors[$i] * 0.08)) "Deferred rectangle color $i duplicated or changed"
    }
}

function Require-Mail($State) {
    foreach ($row in $script:Oracle.oracle.pages[1].mail) { Require-Labels $State.Nodes $row }
}

function Require-Template($State) {
    Require-Description $State.Nodes $script:Oracle.oracle.pages[2].description_prefix
    $headers = @(Find-Label $State.Nodes 'Rainier' | Where-Object { $_.type -eq 'Text' })
    Require ($headers.Count -eq 1) 'Expected exactly one visible Rainier text header'
    Require ($State.Photos.Count -eq 2) 'Missing photograph render evidence'
    foreach ($photo in $State.Photos) {
        Require ($photo.mean_error -lt 24) "Original photograph was not visibly rendered: $($photo.asset)"
    }
    Require ([Math]::Abs($State.Photos[0].y - $State.Photos[1].y) -ge 100 * $script:Scale) `
        'The two photograph crops did not occupy distinct stacked positions'
}

try {
    Require $AllowDesktop.IsPresent 'Desktop evaluation requires explicit -AllowDesktop'
    Add-Type -AssemblyName System.Drawing.Common
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BenchmarkWindow {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
}
'@
    Add-Type -ReferencedAssemblies @(
        [Drawing.Bitmap].Assembly.Location,
        [Drawing.Color].Assembly.Location,
        [Runtime.InteropServices.Marshal].Assembly.Location
        (Get-ChildItem -LiteralPath $PSHOME -Filter 'System.Private.Windows.*.dll' | ForEach-Object FullName)
    ) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class BenchmarkPixels {
    static byte[] Pixels(Bitmap image) {
        using (var copy = image.Clone(new Rectangle(0, 0, image.Width, image.Height), PixelFormat.Format32bppArgb)) {
            var locked = copy.LockBits(new Rectangle(0, 0, copy.Width, copy.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try {
                var bytes = new byte[copy.Width * copy.Height * 4];
                for (int y = 0; y < copy.Height; y++)
                    Marshal.Copy(IntPtr.Add(locked.Scan0, y * locked.Stride), bytes, y * copy.Width * 4, copy.Width * 4);
                return bytes;
            } finally { copy.UnlockBits(locked); }
        }
    }
    public static int[] ColorCounts(Bitmap image) {
        var pixels = Pixels(image);
        int[] counts = new int[4];
        int[,] colors = { {246,83,20}, {124,187,0}, {0,161,241}, {255,187,0} };
        for (int i = 0; i < pixels.Length; i += 4)
            for (int c = 0; c < 4; c++)
                if (Math.Abs(pixels[i+2]-colors[c,0]) <= 6 &&
                    Math.Abs(pixels[i+1]-colors[c,1]) <= 6 &&
                    Math.Abs(pixels[i]-colors[c,2]) <= 6) counts[c]++;
        return counts;
    }
    // Compare a 10x10 interior sample of the original UniformToFill crop.
    // No screenshot similarity to another candidate, OCR, or judge model is used.
    public static double[] MatchPhoto(Bitmap image, Bitmap reference, int size) {
        var pixels = Pixels(image);
        var samples = new int[100, 5];
        int side = Math.Min(reference.Width, reference.Height);
        int left = 0, top = 0;
        int n = 0;
        for (int y = 0; y < 10; y++) for (int x = 0; x < 10; x++) {
            var color = reference.GetPixel(left+(int)((x+0.5)*side/10), top+(int)((y+0.5)*side/10));
            samples[n,0]=(int)((x+0.5)*size/10); samples[n,1]=(int)((y+0.5)*size/10);
            samples[n,2]=color.R; samples[n,3]=color.G; samples[n,4]=color.B; n++;
        }
        double best = 255; int bestX = -1, bestY = -1;
        for (int y = 0; y + size < image.Height; y += 3)
            for (int x = 0; x + size < image.Width; x += 3) {
                double sum = 0;
                for (int s = 0; s < 100; s++) {
                    int i = ((y+samples[s,1])*image.Width+x+samples[s,0])*4;
                    sum += Math.Abs(pixels[i+2]-samples[s,2]) + Math.Abs(pixels[i+1]-samples[s,3]) + Math.Abs(pixels[i]-samples[s,4]);
                    if (sum >= best*300) break;
                }
                double error = sum/300;
                if (error < best) { best=error; bestX=x; bestY=y; }
            }
        return new double[] { best, bestX, bestY };
    }
}
'@
    $launch = Invoke-Native @('run', $Project, '-c', 'Release', '--arch', 'x64',
        '-p', 'Platform=x64', '--no-build', '--detach', '--json') 90
    Require ($null -ne $launch.Data.PSObject.Properties['ProcessId'] -and
        ($launch.Data.ProcessId -is [long] -or $launch.Data.ProcessId -is [int])) `
        'Launch did not return an integer ProcessId'
    Require ($launch.Data.ProcessId -gt 0) 'Launch returned an invalid PID'
    Set-Assertion 'launch_exit' 'pass' 'Project-mode Release/x64 launch returned native zero and a PID'

    $script:CurrentAssertion = 'launch_identity'
    $candidate = Get-Process -Id $launch.Data.ProcessId -ErrorAction Stop
    try {
        # Open and retain the process handle before trusting a PID, pinning identity.
        [void]$candidate.Handle
        $binary = [IO.Path]::GetFullPath($candidate.MainModule.FileName)
        $created = $candidate.StartTime.ToUniversalTime()
        $built = Get-Content -LiteralPath $BuildArtifacts -Raw | ConvertFrom-Json
        $entry = $built.executables.PSObject.Properties[$binary]
        if ($null -eq $entry -and $built.PSObject.Properties['allowed_staged_executables']) {
            $entry = $built.allowed_staged_executables.PSObject.Properties[$binary]
        }
        Require ($null -ne $entry) "Returned PID is not one of the independently built executables: $binary"
        Require ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -eq $entry.Value) `
            'Launched executable bytes differ from the clean build artifact'
        Require ($created -ge ([DateTime]::Parse($launch.Record.started_at).ToUniversalTime()).AddSeconds(-1) -and
            $created -le ([DateTime]::Parse($launch.Record.ended_at).ToUniversalTime()).AddSeconds(1)) `
            'Returned PID predates or falls outside this launch interval'
        $script:Ownership = @{
            pid = $candidate.Id; executable = $binary; sha256 = $entry.Value
            creation_time = $created.ToString('o')
            launch_started_at = $launch.Record.started_at; launch_ended_at = $launch.Record.ended_at
            ownership_verified = $true
        }
        $script:OwnedProcess = $candidate
        Save-Json 'ownership.json' $script:Ownership
    } finally {
        if ($null -eq $script:OwnedProcess) { $candidate.Dispose() }
    }
    Set-Assertion 'launch_identity' 'pass' 'PID path, build hash, creation interval and retained handle verified'

    $script:CurrentAssertion = 'launch_survival'
    Start-Sleep -Seconds $script:Oracle.observation_seconds
    Assert-Owned
    $script:AppWindow = $script:OwnedProcess.MainWindowHandle
    Require ($script:AppWindow -ne [IntPtr]::Zero) 'Surviving process exposes no application window'
    Assert-Owned
    Save-Json 'survival.json' @{
        pid = $script:OwnedProcess.Id; hwnd = $script:AppWindow.ToInt64()
        observed_at = [DateTime]::UtcNow.ToString('o'); observation_seconds = $script:Oracle.observation_seconds
    }
    Set-Assertion 'launch_survival' 'pass' 'Same run-owned app survives observation and exposes its own window'

    $script:CurrentAssertion = 'startup_content'
    Resize-Window 1060
    $state = Capture-State 'startup'
    Require-Labels $state.Nodes (@($script:Oracle.oracle.feature_name) + $script:Oracle.oracle.navigation)
    Set-Assertion 'startup_content' 'pass' 'Feature title and all three source-derived navigation labels are visible'

    $script:CurrentAssertion = 'basic_initial'
    Invoke-Label $state.Nodes 'Basic Deferral'
    $initial = Capture-State 'basic-initial'
    Require-Description $initial.Nodes $script:Oracle.oracle.pages[0].description_prefix
    Require-Labels $initial.Nodes @('Realize Elements')
    foreach ($count in $initial.Colors) {
        Require ($count -lt 1200 * $script:Scale * $script:Scale) 'Deferred squares were already rendered before realization'
    }
    Set-Assertion 'basic_initial' 'pass' 'Basic page has actual visible content with its grid initially unrealized'

    $script:CurrentAssertion = 'basic_realize'
    Invoke-Label $initial.Nodes 'Realize Elements'
    $realized = Capture-State 'basic-realized'
    Require-Realized $initial $realized
    Set-Assertion 'basic_realize' 'pass' 'FindName action visibly realizes all four original colored squares'

    $script:CurrentAssertion = 'basic_repeat'
    Invoke-Label $realized.Nodes 'Realize Elements'
    $state = Capture-State 'basic-repeated'
    Require-SameColors $realized $state
    Set-Assertion 'basic_repeat' 'pass' 'Repeated realization is visibly idempotent'

    $script:CurrentAssertion = 'adaptive_narrow'
    Resize-Window 740
    Invoke-Label $state.Nodes 'Adaptive Deferral'
    $state = Capture-State 'adaptive-narrow'
    Require-Description $state.Nodes $script:Oracle.oracle.pages[1].description_prefix
    Require-Mail $state
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].labels $false
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].accounts $false
    Set-Assertion 'adaptive_narrow' 'pass' 'All five bound mails are visible; reading and account panes absent'

    $script:CurrentAssertion = 'adaptive_tablet'
    Resize-Window 1060
    $state = Capture-State 'adaptive-tablet'
    Require-Mail $state
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].labels
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].accounts $false
    Set-Assertion 'adaptive_tablet' 'pass' 'Tablet width realizes reading controls but not accounts'

    $script:CurrentAssertion = 'adaptive_desktop'
    Resize-Window 1440
    $state = Capture-State 'adaptive-desktop'
    Require-Mail $state
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].labels
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].accounts
    Set-Assertion 'adaptive_desktop' 'pass' 'Desktop width realizes all four bound accounts and retains mail and reading content'

    $script:CurrentAssertion = 'adaptive_shrink'
    Resize-Window 740
    $state = Capture-State 'adaptive-shrunk'
    Require-Mail $state
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].labels $false
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].accounts $false
    Set-Assertion 'adaptive_shrink' 'pass' 'Shrinking visibly hides previously realized reading and account panes'

    $script:CurrentAssertion = 'adaptive_reexpand'
    Resize-Window 1440
    $state = Capture-State 'adaptive-reexpanded'
    Require-Mail $state
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].labels
    Require-Labels $state.Nodes $script:Oracle.oracle.pages[1].accounts
    Set-Assertion 'adaptive_reexpand' 'pass' 'Re-expanding restores both deferred panes with bound content'

    $script:CurrentAssertion = 'template_content'
    Invoke-Label $state.Nodes 'Control Template Deferral'
    $state = Capture-State 'template' -Photographs
    Require-Template $state
    Set-Assertion 'template_content' 'pass' 'Exactly one Rainier text header and both source photograph crops visibly render'

    $script:CurrentAssertion = 'basic_navigation_reset'
    Resize-Window 1060
    Invoke-Label $state.Nodes 'Basic Deferral'
    $reset = Capture-State 'basic-navigation-reset'
    Require-Description $reset.Nodes $script:Oracle.oracle.pages[0].description_prefix
    Require-Labels $reset.Nodes @('Realize Elements')
    Require-SameColors $initial $reset
    Set-Assertion 'basic_navigation_reset' 'pass' 'Navigating back creates a fresh, unrealized Basic page'

    $script:CurrentAssertion = 'basic_navigation_realize'
    Invoke-Label $reset.Nodes 'Realize Elements'
    $state = Capture-State 'basic-navigation-realized'
    Require-Realized $reset $state
    Set-Assertion 'basic_navigation_realize' 'pass' 'Realization still works after navigating away and back'

    $script:CurrentAssertion = 'template_repeat'
    Invoke-Label $state.Nodes 'Control Template Deferral'
    $state = Capture-State 'template-repeated' -Photographs
    Require-Template $state
    Set-Assertion 'template_repeat' 'pass' 'Repeated template navigation still renders both photographs and one header'

    $script:CurrentAssertion = 'screenshots'
    Assert-Owned
    Set-Assertion 'screenshots' 'pass' 'Every observed UI state has decoded PNG and owned-window UIA evidence'
} catch {
    Set-Assertion $script:CurrentAssertion 'fail' $_.Exception.Message
} finally {
    if ($null -ne $script:OwnedProcess) {
        try {
            $script:OwnedProcess.Refresh()
            if (-not $script:OwnedProcess.HasExited) {
                Assert-Owned
                # Process.Kill uses the retained run-owned handle, not a process name.
                $script:OwnedProcess.Kill()
                Require ($script:OwnedProcess.WaitForExit(10000)) 'Run-owned process did not exit during cleanup'
            }
            Save-Json 'cleanup.json' @{
                pid = $script:Ownership.pid; creation_time = $script:Ownership.creation_time
                executable = $script:Ownership.executable; exited = $true
                package_unregistered = $false; cleanup_scope = 'retained verified process handle only'
            }
            Set-Assertion 'cleanup' 'pass' 'Only the retained verified process handle was terminated; package registration untouched'
        } catch { Set-Assertion 'cleanup' 'fail' $_.Exception.Message }
        finally { $script:OwnedProcess.Dispose() }
    }
    Save-Json 'results.json' @{
        schema_version = 1; assertions = @($script:Assertions.Values); owned_process = $script:Ownership
        oracle_status = $script:Oracle.source.oracle_status
    }
}
if (@($script:Assertions.Values | Where-Object { $_.status -ne 'pass' }).Count) { exit 1 }
exit 0
