<#
  WinUI Template Studio — floating in-app toolbar ("the VS pill").

  A borderless, topmost WPF window that docks to the top-center of a target
  window (by HWND), follows it as it moves, hides when the app is minimized or
  in the background, and closes when the app exits. Its buttons POST a small
  JSON command back to the extension's loopback server, which drives the
  Inspect tab (Live Visual Tree) / captures a screenshot.

  Launched by overlay.mjs as:
    powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File overlay.ps1
      -Hwnd <n> -Base http://127.0.0.1:PORT/ -Token <hex> -Instance <id> -Label <text>
#>
param(
    [Parameter(Mandatory = $true)][string]$Hwnd,
    [Parameter(Mandatory = $true)][string]$Base,
    [Parameter(Mandatory = $true)][string]$Token,
    [Parameter(Mandatory = $true)][string]$Instance,
    [string]$Label = "App"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Net.Http

# --- Win32 interop: window rect / state / foreground / ex-style -------------
Add-Type @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public struct POINT { public int X; public int Y; }
public static class OverlayWin {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
'@

# --- shared HTTP client (fire-and-forget POSTs) ----------------------------
$script:http = New-Object System.Net.Http.HttpClient
$script:http.Timeout = [TimeSpan]::FromSeconds(5)
$script:endpoint = ($Base.TrimEnd('/') + "/overlay/action")

function Send-Cmd([string]$cmd, [string]$selector) {
    try {
        $body = @{ token = $Token; instanceId = $Instance; cmd = $cmd; hwnd = [int64]$Hwnd }
        if ($selector) { $body.selector = $selector }
        $payload = $body | ConvertTo-Json -Compress
        $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
        [void]$script:http.PostAsync($script:endpoint, $content)   # fire-and-forget; UI stays responsive
    } catch { }
}

# Inline prompt hand-off: element identity + the user's natural-language change.
function Send-Prompt([string]$selector, [string]$instruction, [string]$elType, [string]$elName, [string]$autoId) {
    try {
        $body = @{ token = $Token; instanceId = $Instance; cmd = "prompt"; hwnd = [int64]$Hwnd; selector = $selector; instruction = $instruction }
        if ($elType) { $body.elType = $elType }
        if ($elName) { $body.elName = $elName }
        if ($autoId) { $body.automationId = $autoId }
        $payload = $body | ConvertTo-Json -Compress
        $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
        [void]$script:http.PostAsync($script:endpoint, $content)
    } catch { }
}

# --- build the pill from XAML ----------------------------------------------
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize"
        SizeToContent="WidthAndHeight" WindowStartupLocation="Manual"
        Left="-4000" Top="-4000">
  <Border x:Name="Root" CornerRadius="9" Background="#F01E1E1E" BorderBrush="#40FFFFFF" BorderThickness="1" Padding="3">
    <Border.Effect><DropShadowEffect BlurRadius="18" ShadowDepth="0" Opacity="0.55" Color="#000000"/></Border.Effect>
    <Border.Resources>
      <Style TargetType="Button">
        <Setter Property="FontFamily" Value="Segoe Fluent Icons"/>
        <Setter Property="FontSize" Value="15"/>
        <Setter Property="Foreground" Value="#F0F0F0"/>
        <Setter Property="Width" Value="34"/>
        <Setter Property="Height" Value="30"/>
        <Setter Property="Cursor" Value="Hand"/>
        <Setter Property="SnapsToDevicePixels" Value="True"/>
        <Setter Property="Template">
          <Setter.Value>
            <ControlTemplate TargetType="Button">
              <Border x:Name="bd" CornerRadius="6" Background="Transparent">
                <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
              <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="bd" Property="Background" Value="#25FFFFFF"/></Trigger>
                <Trigger Property="IsPressed" Value="True"><Setter TargetName="bd" Property="Background" Value="#38FFFFFF"/></Trigger>
              </ControlTemplate.Triggers>
            </ControlTemplate>
          </Setter.Value>
        </Setter>
      </Style>
    </Border.Resources>
    <StackPanel Orientation="Horizontal">
      <Border x:Name="Grip" Cursor="SizeAll" Padding="7,0,5,0" Background="Transparent" ToolTip="Drag to move &#183; double-click to re-dock">
        <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
          <TextBlock FontFamily="Segoe Fluent Icons" FontSize="15" Foreground="#8A9096" Text="&#xE784;" VerticalAlignment="Center" Margin="0,0,7,0"/>
          <TextBlock x:Name="Lbl" Foreground="#C8CCD0" FontSize="12" FontFamily="Segoe UI" MaxWidth="150" TextTrimming="CharacterEllipsis" VerticalAlignment="Center"/>
        </StackPanel>
      </Border>
      <Button x:Name="BtnPick" Content="&#xE7C9;" ToolTip="Pick element &#183; click a control in the app (Esc to cancel)"/>
      <Button x:Name="BtnTree" Content="&#xEC7A;" ToolTip="Live Visual Tree"/>
      <Button x:Name="BtnShot" Content="&#xE722;" ToolTip="Screenshot"/>
      <Border Width="1" Margin="4,5" Background="#33FFFFFF"/>
      <Button x:Name="BtnClose" Content="&#xE711;" ToolTip="Close toolbar" Foreground="#FF9A9A"/>
    </StackPanel>
  </Border>
</Window>
'@

$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [System.Windows.Markup.XamlReader]::Load($reader)

$lbl      = $window.FindName("Lbl")
$grip     = $window.FindName("Grip")
$btnPick  = $window.FindName("BtnPick")
$btnTree  = $window.FindName("BtnTree")
$btnShot  = $window.FindName("BtnShot")
$btnClose = $window.FindName("BtnClose")
$lbl.Text = $Label

# --- state -----------------------------------------------------------------
$script:sx = 1.0            # device-px -> DIP scale (X)
$script:sy = 1.0            # device-px -> DIP scale (Y)
$script:pinned = $false     # user dragged it -> stop following
$script:picking = $false    # element-picker mode active
$script:pickNodes = @()     # flattened [selector,type,name,bounds] snapshot
$script:pickHit = $null     # node currently under the cursor
$script:pickWin = $null; $script:pickTimer = $null
$script:pickRect = $null; $script:pickLabel = $null
$script:pickRectPx = New-Object RECT
$script:promptWin = $null    # inline on-app "ask the agent" input window
$script:targetI64 = [int64]$Hwnd
$script:overlayI64 = 0
$targetPtr = [IntPtr]$script:targetI64

# --- reposition / lifecycle tick -------------------------------------------
function Update-Overlay {
    if ($script:picking) { return }   # pill stays hidden while the picker is active
    if (-not [OverlayWin]::IsWindow($targetPtr)) {
        $script:timer.Stop()
        Send-Cmd "gone"
        $window.Close()
        return
    }
    $fg = [OverlayWin]::GetForegroundWindow()
    $fgI = $fg.ToInt64()
    $active = ($fgI -eq $script:targetI64) -or ($script:overlayI64 -ne 0 -and $fgI -eq $script:overlayI64)
    if ([OverlayWin]::IsIconic($targetPtr) -or -not $active) {
        if ($window.IsVisible) { $window.Hide() }
        return
    }
    if (-not $script:pinned) {
        $r = New-Object RECT
        if ([OverlayWin]::GetWindowRect($targetPtr, [ref]$r)) {
            $wpxDip = ($r.Right - $r.Left) * $script:sx
            $leftDip = $r.Left * $script:sx
            $topDip  = $r.Top  * $script:sy
            $window.Left = $leftDip + (($wpxDip - $window.ActualWidth) / 2.0)
            $window.Top  = $topDip + 8
        }
    }
    if (-not $window.IsVisible) { $window.Show() }
}

# --- element picker (VS "Select Element") ----------------------------------
# Fetches the live tree (bounds + winapp selectors), lays a transparent capture
# window over the target, hit-tests the cursor against element bounds, highlights
# the deepest match, and on click POSTs `pick <selector>` so the panel selects it.
function Flatten-Nodes($node, [System.Collections.ArrayList]$acc) {
    if ($null -eq $node) { return }
    $w = [double]$node.width; $h = [double]$node.height
    if ($node.selector -and $w -gt 0 -and $h -gt 0) {
        [void]$acc.Add([pscustomobject]@{
            selector = [string]$node.selector
            type = [string]$node.type; name = [string]$node.name
            automationId = [string]$node.automationId
            x = [double]$node.x; y = [double]$node.y; w = $w; h = $h; area = ($w * $h)
        })
    }
    if ($node.children) { foreach ($c in $node.children) { Flatten-Nodes $c $acc } }
}

function Hit-Test([int]$px, [int]$py) {
    $best = $null; $bestArea = [double]::MaxValue
    foreach ($n in $script:pickNodes) {
        if ($px -ge $n.x -and $px -lt ($n.x + $n.w) -and $py -ge $n.y -and $py -lt ($n.y + $n.h) -and $n.area -lt $bestArea) {
            $bestArea = $n.area; $best = $n
        }
    }
    return $best
}

function Update-Pick {
    if (-not $script:picking -or $null -eq $script:pickWin) { return }
    $pt = New-Object POINT
    [void][OverlayWin]::GetCursorPos([ref]$pt)
    $n = Hit-Test $pt.X $pt.Y
    if ($null -eq $n) {
        $script:pickHit = $null
        $script:pickRect.Visibility = [System.Windows.Visibility]::Collapsed
        $script:pickLabel.Visibility = [System.Windows.Visibility]::Collapsed
        return
    }
    $script:pickHit = $n
    $lx = ($n.x - $script:pickRectPx.Left) * $script:sx
    $ly = ($n.y - $script:pickRectPx.Top)  * $script:sy
    [System.Windows.Controls.Canvas]::SetLeft($script:pickRect, $lx)
    [System.Windows.Controls.Canvas]::SetTop($script:pickRect, $ly)
    $script:pickRect.Width  = [Math]::Max(1, $n.w * $script:sx)
    $script:pickRect.Height = [Math]::Max(1, $n.h * $script:sy)
    $script:pickRect.Visibility = [System.Windows.Visibility]::Visible

    $cap = (@($n.type, $n.name) | Where-Object { $_ }) -join "  "
    if (-not $cap) { $cap = $n.selector }
    $script:pickLabel.Text = $cap
    $cx = ($pt.X - $script:pickRectPx.Left) * $script:sx
    $cy = ($pt.Y - $script:pickRectPx.Top)  * $script:sy
    [System.Windows.Controls.Canvas]::SetLeft($script:pickLabel, [Math]::Max(0, $cx + 12))
    [System.Windows.Controls.Canvas]::SetTop($script:pickLabel,  [Math]::Max(0, $cy + 18))
    $script:pickLabel.Visibility = [System.Windows.Visibility]::Visible
}

function Commit-Pick {
    if (-not $script:picking) { return }
    $n = $script:pickHit
    End-Pick $false                              # tear down the capture layer, keep the pill hidden
    if ($n -and $n.selector) {
        Send-Cmd "pick" $n.selector              # sync the side panel selection too
        Open-Prompt $n                           # ...and pop the inline input right on the app
    } else {
        try { $window.Show() } catch { }
        Update-Overlay
    }
}

function End-Pick([bool]$reshow = $true) {
    if (-not $script:picking) { return }
    $script:picking = $false
    try { if ($script:pickTimer) { $script:pickTimer.Stop() } } catch { }
    $script:pickTimer = $null
    try { if ($script:pickWin) { $script:pickWin.Close() } } catch { }
    $script:pickWin = $null; $script:pickHit = $null
    if ($reshow) {
        try { $window.Show() } catch { }
        Update-Overlay
    }
}

# --- inline on-app "Ask the agent" input -----------------------------------
# A small activatable input window anchored under the picked element. Typing
# needs keyboard focus, so (unlike the pill) this window is NOT no-activate.
function Submit-Prompt {
    if ($null -eq $script:promptWin) { return }
    $txt = ""
    try { $txt = $script:promptBox.Text.Trim() } catch { }
    if (-not $txt) { try { $script:promptBox.Focus() } catch { }; return }
    Send-Prompt $script:promptSel $txt $script:promptType $script:promptName $script:promptAuto
    try {
        $script:promptHint.Text = "Sent  " + [char]0x2713 + "  the agent is on it"
        $script:promptBox.IsEnabled = $false
        $script:promptSend.IsEnabled = $false
    } catch { }
    $script:promptCloseTimer = New-Object System.Windows.Threading.DispatcherTimer
    $script:promptCloseTimer.Interval = [TimeSpan]::FromMilliseconds(750)
    $script:promptCloseTimer.add_Tick({ Close-Prompt })
    $script:promptCloseTimer.Start()
}

function Close-Prompt {
    try { if ($script:promptCloseTimer) { $script:promptCloseTimer.Stop() } } catch { }
    $script:promptCloseTimer = $null
    try { if ($script:promptWin) { $script:promptWin.Close() } } catch { }
    $script:promptWin = $null
    try { $window.Show() } catch { }
    Update-Overlay
}

function Open-Prompt($n) {
    Close-Prompt
    $script:promptSel  = [string]$n.selector
    $script:promptType = [string]$n.type
    $script:promptName = [string]$n.name
    $script:promptAuto = [string]$n.automationId

    [xml]$px = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize"
        SizeToContent="Height" Width="380" WindowStartupLocation="Manual" Left="-4000" Top="-4000">
  <Border CornerRadius="10" Background="#F21E1E1E" BorderBrush="#50FFFFFF" BorderThickness="1" Padding="11">
    <Border.Effect><DropShadowEffect BlurRadius="22" ShadowDepth="0" Opacity="0.6" Color="#000000"/></Border.Effect>
    <StackPanel>
      <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
        <Ellipse Width="8" Height="8" Fill="#2E9BFF" VerticalAlignment="Center" Margin="1,0,8,0"/>
        <TextBlock Text="Ask the agent" Foreground="#F0F0F0" FontFamily="Segoe UI" FontSize="12.5" FontWeight="SemiBold" VerticalAlignment="Center"/>
        <TextBlock x:Name="Ctx" Foreground="#8A9096" FontFamily="Segoe UI" FontSize="12" Margin="8,0,0,0" VerticalAlignment="Center" TextTrimming="CharacterEllipsis" MaxWidth="250"/>
      </StackPanel>
      <TextBox x:Name="Box" MinHeight="58" MaxHeight="150" Background="#14FFFFFF" Foreground="#F5F5F5"
               CaretBrush="#F5F5F5" BorderBrush="#3C3C3C" BorderThickness="1" Padding="8"
               FontFamily="Segoe UI" FontSize="13" AcceptsReturn="True" TextWrapping="Wrap"
               VerticalScrollBarVisibility="Auto"/>
      <Grid Margin="0,9,0,0">
        <TextBlock x:Name="Hint" Text="Enter to send &#183; Shift+Enter = newline &#183; Esc to cancel" Foreground="#787E86" FontFamily="Segoe UI" FontSize="11" VerticalAlignment="Center" HorizontalAlignment="Left"/>
        <Button x:Name="Send" Content="Send to agent  &#x25B8;" HorizontalAlignment="Right" Foreground="White" Background="#2E9BFF" BorderThickness="0" Padding="12,6" Cursor="Hand" FontFamily="Segoe UI" FontSize="12">
          <Button.Template>
            <ControlTemplate TargetType="Button">
              <Border x:Name="sb" CornerRadius="6" Background="{TemplateBinding Background}" Padding="{TemplateBinding Padding}">
                <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
              </Border>
              <ControlTemplate.Triggers>
                <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="sb" Property="Background" Value="#4AA8FF"/></Trigger>
                <Trigger Property="IsPressed" Value="True"><Setter TargetName="sb" Property="Background" Value="#1E7FD8"/></Trigger>
              </ControlTemplate.Triggers>
            </ControlTemplate>
          </Button.Template>
        </Button>
      </Grid>
    </StackPanel>
  </Border>
</Window>
'@
    $pr = New-Object System.Xml.XmlNodeReader $px
    $pw = [System.Windows.Markup.XamlReader]::Load($pr)
    $script:promptBox  = $pw.FindName("Box")
    $script:promptSend = $pw.FindName("Send")
    $script:promptHint = $pw.FindName("Hint")
    $ctx = $pw.FindName("Ctx")
    $sep = "  " + [char]0x00B7 + "  "
    $ctxText = (@($script:promptType, $script:promptName) | Where-Object { $_ }) -join $sep
    if (-not $ctxText) { $ctxText = $script:promptSel }
    $ctx.Text = $ctxText

    # Anchor below the element (screen px -> DIP), clamped to the virtual screen.
    $leftDip = $n.x * $script:sx
    $topDip  = ($n.y + $n.h) * $script:sy + 6
    $vsL = [System.Windows.SystemParameters]::VirtualScreenLeft
    $vsT = [System.Windows.SystemParameters]::VirtualScreenTop
    $vsW = [System.Windows.SystemParameters]::VirtualScreenWidth
    $vsH = [System.Windows.SystemParameters]::VirtualScreenHeight
    $wEst = 380.0; $hEst = 150.0
    if ($leftDip + $wEst -gt $vsL + $vsW) { $leftDip = $vsL + $vsW - $wEst - 8 }
    if ($leftDip -lt $vsL) { $leftDip = $vsL + 8 }
    if ($topDip + $hEst -gt $vsT + $vsH) { $topDip = ($n.y * $script:sy) - $hEst - 6 }   # flip above
    if ($topDip -lt $vsT) { $topDip = $vsT + 8 }
    $pw.Left = $leftDip; $pw.Top = $topDip

    $script:promptSend.add_Click({ Submit-Prompt })
    $script:promptBox.add_PreviewKeyDown({
        param($s, $e)
        $shift = ([System.Windows.Input.Keyboard]::Modifiers -band [System.Windows.Input.ModifierKeys]::Shift)
        if ($e.Key -eq [System.Windows.Input.Key]::Enter -and -not $shift) { $e.Handled = $true; Submit-Prompt }
        elseif ($e.Key -eq [System.Windows.Input.Key]::Escape) { $e.Handled = $true; Close-Prompt }
    })

    $script:promptWin = $pw
    [void]$pw.Show()
    try { $pw.Activate() } catch { }
    try { $script:promptBox.Focus(); [void][System.Windows.Input.Keyboard]::Focus($script:promptBox) } catch { }
}

function Start-Pick {
    if ($script:picking) { return }
    $nodes = New-Object System.Collections.ArrayList
    try {
        $url = ($Base.TrimEnd('/') + "/api/inspect?hwnd=" + $Hwnd + "&depth=12")
        $json = $script:http.GetStringAsync($url).GetAwaiter().GetResult()
        foreach ($rootEl in @(($json | ConvertFrom-Json).elements)) { Flatten-Nodes $rootEl $nodes }
    } catch { }
    if ($nodes.Count -eq 0) { return }
    $script:pickNodes = $nodes
    $script:picking = $true
    if ($window.IsVisible) { $window.Hide() }   # move the pill out of the way

    $r = New-Object RECT
    [void][OverlayWin]::GetWindowRect($targetPtr, [ref]$r)
    $script:pickRectPx = $r

    $cap = New-Object System.Windows.Window
    $cap.WindowStyle = [System.Windows.WindowStyle]::None
    $cap.AllowsTransparency = $true
    $cap.Background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(1, 0, 0, 0))
    $cap.Topmost = $true; $cap.ShowInTaskbar = $false; $cap.ShowActivated = $false
    $cap.ResizeMode = [System.Windows.ResizeMode]::NoResize
    $cap.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
    $cap.Left = $r.Left * $script:sx; $cap.Top = $r.Top * $script:sy
    $cap.Width = ($r.Right - $r.Left) * $script:sx; $cap.Height = ($r.Bottom - $r.Top) * $script:sy
    $cap.Cursor = [System.Windows.Input.Cursors]::Cross

    $canvas = New-Object System.Windows.Controls.Canvas
    $rect = New-Object System.Windows.Shapes.Rectangle
    $rect.Stroke = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromRgb(0x2E, 0x9B, 0xFF))
    $rect.StrokeThickness = 2
    $rect.Fill = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(0x33, 0x2E, 0x9B, 0xFF))
    $rect.IsHitTestVisible = $false
    $rect.Visibility = [System.Windows.Visibility]::Collapsed
    [void]$canvas.Children.Add($rect)

    $tb = New-Object System.Windows.Controls.TextBlock
    $tb.Foreground = [System.Windows.Media.Brushes]::White
    $tb.Background = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromArgb(0xD8, 0x1E, 0x1E, 0x1E))
    $tb.Padding = New-Object System.Windows.Thickness(5, 2, 5, 2)
    $tb.FontFamily = New-Object System.Windows.Media.FontFamily("Segoe UI")
    $tb.FontSize = 11
    $tb.IsHitTestVisible = $false
    $tb.Visibility = [System.Windows.Visibility]::Collapsed
    [void]$canvas.Children.Add($tb)

    $cap.Content = $canvas
    $script:pickWin = $cap; $script:pickRect = $rect; $script:pickLabel = $tb

    $cap.add_SourceInitialized({
        $h2 = (New-Object System.Windows.Interop.WindowInteropHelper($cap)).Handle
        $GWL_EXSTYLE = -20; $WS_EX_NOACTIVATE = 0x08000000; $WS_EX_TOOLWINDOW = 0x00000080
        $ex = [OverlayWin]::GetWindowLong($h2, $GWL_EXSTYLE)
        [void][OverlayWin]::SetWindowLong($h2, $GWL_EXSTYLE, ($ex -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW))
    })
    $cap.add_MouseMove({ Update-Pick })
    $cap.add_MouseLeftButtonDown({ Commit-Pick })
    $cap.add_MouseRightButtonDown({ End-Pick })

    # NOACTIVATE windows don't get key focus, so poll Esc (VK_ESCAPE = 0x1B) and
    # keep the highlight live even if MouseMove events are sparse.
    $script:pickTimer = New-Object System.Windows.Threading.DispatcherTimer
    $script:pickTimer.Interval = [TimeSpan]::FromMilliseconds(60)
    $script:pickTimer.add_Tick({
        if (([OverlayWin]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0) { End-Pick; return }
        if (-not [OverlayWin]::IsWindow($targetPtr)) { End-Pick; return }
        Update-Pick
    })
    $script:pickTimer.Start()
    $cap.Show()
    Update-Pick
}

# --- events ----------------------------------------------------------------
$window.add_SourceInitialized({
    $helper = New-Object System.Windows.Interop.WindowInteropHelper($window)
    $oh = $helper.Handle
    $script:overlayI64 = $oh.ToInt64()

    # No-activate + tool-window: clicking the pill never steals focus from the
    # app, and it stays out of Alt-Tab.
    $GWL_EXSTYLE = -20
    $WS_EX_NOACTIVATE = 0x08000000
    $WS_EX_TOOLWINDOW = 0x00000080
    $ex = [OverlayWin]::GetWindowLong($oh, $GWL_EXSTYLE)
    [void][OverlayWin]::SetWindowLong($oh, $GWL_EXSTYLE, ($ex -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW))

    $src = [System.Windows.PresentationSource]::FromVisual($window)
    if ($src -and $src.CompositionTarget) {
        $m = $src.CompositionTarget.TransformFromDevice
        if ($m.M11 -gt 0) { $script:sx = $m.M11 }
        if ($m.M22 -gt 0) { $script:sy = $m.M22 }
    }

    $script:timer = New-Object System.Windows.Threading.DispatcherTimer
    $script:timer.Interval = [TimeSpan]::FromMilliseconds(180)
    $script:timer.add_Tick({ Update-Overlay })
    $script:timer.Start()
    Update-Overlay
})

$grip.add_MouseLeftButtonDown({
    param($s, $e)
    if ($e.ButtonState -eq [System.Windows.Input.MouseButtonState]::Pressed) {
        $script:pinned = $true
        try { $window.DragMove() } catch { }
    }
})
$grip.add_MouseRightButtonUp({ $script:pinned = $false; Update-Overlay })   # right-click re-docks

$btnPick.add_Click({ Start-Pick })
$btnTree.add_Click({ Send-Cmd "tree" })
$btnShot.add_Click({ Send-Cmd "shot" })
$btnClose.add_Click({ Send-Cmd "close"; $window.Close() })

$window.add_Closed({
    try { if ($script:timer) { $script:timer.Stop() } } catch { }
    try { if ($script:pickTimer) { $script:pickTimer.Stop() } } catch { }
    try { if ($script:pickWin) { $script:pickWin.Close() } } catch { }
    try { if ($script:promptCloseTimer) { $script:promptCloseTimer.Stop() } } catch { }
    try { if ($script:promptWin) { $script:promptWin.Close() } } catch { }
    try { $script:http.Dispose() } catch { }
})

# --- run -------------------------------------------------------------------
$app = New-Object System.Windows.Application
$app.ShutdownMode = [System.Windows.ShutdownMode]::OnLastWindowClose
[void]$app.Run($window)
