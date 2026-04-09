<#
.SYNOPSIS
    preToolUse hook that blocks redundant reads of template files.

.DESCRIPTION
    When the agent tries to read a known template file (App.xaml, MainWindow.xaml, etc.)
    before it has started coding, this hook returns a deny decision with a message
    pointing the agent to the inlined template-summary skill.

    Once the agent makes its first create or edit call, a marker file is created
    and all subsequent reads are allowed (the files may have been modified).

    Reads stdin as JSON with: { toolName, toolArgs: { path } }
    Outputs JSON with: { decision: "allow" } or { decision: "deny", reason: "..." }
#>

$ErrorActionPreference = 'SilentlyContinue'

try {
    $json = [Console]::In.ReadToEnd()
    if (-not $json) { exit 0 }
    
    $event = $json | ConvertFrom-Json
    $toolName = $event.toolName
    $toolArgs = $event.toolArgs

    # Template files that are already inlined in the agent prompt
    $templateFiles = @(
        'App.xaml',
        'App.xaml.cs',
        'MainWindow.xaml',
        'MainWindow.xaml.cs',
        'MainPage.xaml',
        'MainPage.xaml.cs',
        'MainPageViewModel.cs',
        'Package.appxmanifest'
    )

    # Marker file location — use the cwd from the event or fallback
    $cwd = if ($event.cwd) { $event.cwd } else { Get-Location }
    $markerFile = Join-Path $cwd '.template-reads-done'

    # If marker exists, coding has started — allow everything
    if (Test-Path $markerFile) {
        Write-Output '{"decision":"allow"}'
        exit 0
    }

    # If this is a create or edit call, set the marker and allow
    if ($toolName -in @('create', 'edit')) {
        New-Item -ItemType File -Path $markerFile -Force | Out-Null
        Write-Output '{"decision":"allow"}'
        exit 0
    }

    # If this is a view/read call, check if it's a template file
    if ($toolName -eq 'view') {
        $path = $toolArgs.path
        if ($path) {
            $fileName = Split-Path $path -Leaf
            if ($fileName -in $templateFiles) {
                $reason = "BLOCKED: $fileName content is already in your agent prompt via the template-summary skill. Use that instead of reading the file. Start creating your app files — the template content is already available to you."
                Write-Output "{`"decision`":`"deny`",`"reason`":`"$reason`"}"
                exit 0
            }
        }
    }

    # Allow everything else
    Write-Output '{"decision":"allow"}'
    
} catch {
    # On any error, allow the action (fail-open)
    Write-Output '{"decision":"allow"}'
}
