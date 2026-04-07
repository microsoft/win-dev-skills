$ErrorActionPreference = 'SilentlyContinue'
$raw = [Console]::In.ReadToEnd()
$hookInput = $raw | ConvertFrom-Json

# Logging
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($scriptDir) { $scriptDir = (Resolve-Path $scriptDir -ErrorAction SilentlyContinue).Path }
if (-not $scriptDir) { $scriptDir = $hookInput.cwd }
$logFile = Join-Path $scriptDir "hook-log.txt"

function Log($msg) {
    $ts = Get-Date -Format "HH:mm:ss.fff"
    "[$ts] $msg" | Out-File $logFile -Append -Encoding utf8
}

$toolName = $hookInput.toolName
Log "PreToolUse: toolName=$toolName"

# Only check create and edit of .xaml and .cs files
if ($toolName -notin @("create", "edit")) {
    Log "  SKIP (not create/edit)"
    echo '{}'
    exit 0
}

# Parse toolArgs (JSON string)
$toolArgs = $null
try { $toolArgs = $hookInput.toolArgs | ConvertFrom-Json } catch {}
if (-not $toolArgs) {
    Log "  SKIP (no args)"
    echo '{}'
    exit 0
}

$filePath = $toolArgs.path
$fileContent = if ($toolName -eq "create") { $toolArgs.file_text } else { $toolArgs.new_str }

if (-not $filePath -or -not $fileContent) {
    Log "  SKIP (no path or content)"
    echo '{}'
    exit 0
}

$fileName = $filePath -replace '.*[\\/]', ''
$issues = @()

# -- XAML checks (.xaml files) --
if ($filePath -match '\.xaml$') {
    $nestedBinds = [regex]::Matches($fileContent, '\{x:Bind\s+(\w+\.\w+\.\w+[^}]*)\}')
    foreach ($match in $nestedBinds) {
        $bindExpr = $match.Groups[1].Value
        if ($bindExpr -notmatch 'FallbackValue') {
            $issues += "Nested x:Bind '$bindExpr' will CRASH if any segment is null at startup. Fix: use a flat ViewModel property, or add FallbackValue={x:Null}."
        }
    }
}

# -- C# checks (.cs files) --
if ($filePath -match '\.cs$') {
    # GetForCurrentView() is UWP-only, but ConnectedAnimationService.GetForCurrentView() still works in WinUI 3 Pages
    $gfcvMatches = [regex]::Matches($fileContent, '(\w+)\.GetForCurrentView\s*\(')
    foreach ($gfcvMatch in $gfcvMatches) {
        $caller = $gfcvMatch.Groups[1].Value
        if ($caller -eq 'ConnectedAnimationService') { continue }
        $msg = "GetForCurrentView() is a UWP-only pattern that will crash in desktop WinUI 3. Desktop apps must use HWND-based interop instead."
        if ($caller -eq 'DataTransferManager' -or $fileContent -match 'DataTransferManager') {
            $msg += " For Share contract: declare IDataTransferManagerInterop COM interface ([ComImport, Guid(""3A3DCD6C-3EAB-43DC-BCDE-45671CE800C8"")]) and use DataTransferManager.As<IDataTransferManagerInterop>() with ShowShareUIForWindow(hwnd). See: https://learn.microsoft.com/windows/apps/develop/ui-input/display-ui-objects"
        } else {
            $msg += " Check https://learn.microsoft.com/windows/apps/desktop/modernize/winrt-com-interop-csharp for the correct HWND-based interop pattern for this API."
        }
        $issues += $msg
        break
    }
    if ($fileContent -match 'Window\.Current' -or $fileContent -match 'Application\.Current\.Window') {
        $issues += "Window.Current / Application.Current.Window does not exist in WinUI 3. Store window ref: public static Window MainWindow { get; private set; } in App.xaml.cs."
    }
    if ($fileContent -match '[^/]CoreDispatcher') {
        $issues += "CoreDispatcher is UWP-only. Use DispatcherQueue instead in WinUI 3."
    }
    if ($fileContent -match 'using Windows\.UI\.Xaml') {
        $issues += "Windows.UI.Xaml is UWP. Use Microsoft.UI.Xaml for WinUI 3."
    }
    if ($fileContent -match '\[ObservableProperty\]\s*(private|protected)\s+\w+\s+_\w+') {
        $issues += "[ObservableProperty] with private field (_name) is the old CommunityToolkit.Mvvm 8.2 syntax. Use: [ObservableProperty] public partial string Name { get; set; }"
    }
}

# -- Return result --
if ($issues.Count -eq 0) {
    Log "  ALLOW $fileName (no issues)"
    echo '{}'
    exit 0
}

$reason = "Issues in " + $fileName + " that will cause runtime crashes:`n" + (($issues | ForEach-Object { "- $_" }) -join "`n") + "`nFix these issues and try again."
Log "  DENY $fileName ($($issues.Count) issues): $($issues -join '; ')"

# Log matched code snippets
$patterns = @('GetForCurrentView\s*\(', 'Window\.Current', 'Application\.Current\.Window', 'CoreDispatcher', 'using Windows\.UI\.Xaml', '\[ObservableProperty\]\s*(private|protected)\s+\w+\s+_\w+')
foreach ($pat in $patterns) {
    $m = [regex]::Match($fileContent, ".{0,50}$pat.{0,50}")
    if ($m.Success) {
        $snippet = $m.Value -replace "`r`n|`n", " "
        Log "    CODE: ...$snippet..."
    }
}
$bindMatches = [regex]::Matches($fileContent, '\{x:Bind\s+\w+\.\w+\.\w+[^}]*\}')
foreach ($bm in $bindMatches) {
    Log "    XAML: $($bm.Value)"
}

$json = @{
    permissionDecision = "deny"
    permissionDecisionReason = $reason
} | ConvertTo-Json -Compress

echo $json
exit 0