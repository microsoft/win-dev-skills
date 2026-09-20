$ErrorActionPreference = 'Stop'

$validator = (Resolve-Path (Join-Path $PSScriptRoot '..\Validate-UwpMigration.ps1')).Path
$work = Join-Path $PSScriptRoot ".validator-regression-work-$PID-$([guid]::NewGuid().ToString('N'))"
$tools = Join-Path $work 'tools'
$originalPath = $env:PATH
$originalLog = $env:VALIDATOR_WINAPP_LOG
$originalSkip = $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH
$failures = New-Object System.Collections.Generic.List[string]

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) { [void]$failures.Add($message) }
}

function New-Fixture([string]$name) {
    $root = Join-Path $work $name
    New-Item -ItemType Directory -Path $root -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $root 'App.csproj') -Value '<Project Sdk="Microsoft.NET.Sdk" />'
    Set-Content -LiteralPath (Join-Path $root 'Page.xaml') -Value '<Page />'
    Set-Content -LiteralPath (Join-Path $root 'Deferred.xaml') -Value '<Page />'
    Set-Content -LiteralPath (Join-Path $root 'MIGRATION-MAPPING.md') -Value @'
| Source file | Target file | Triage label | Status |
|---|---|---|---|
| Page.xaml | Page.xaml | migrate-as-is | done |
| Deferred.xaml | Deferred.xaml | defer | deferred |
'@
    Set-Content -LiteralPath (Join-Path $root 'MIGRATION-DEFERRED.md') -Value @'
| File | Anchors |
|---|---|
| Deferred.xaml | unsupported |
'@
    @{
        version = 4
        schema = @{ name = 'winui-uwp-migration-bootstrap'; version = 4 }
        bootstrapComplete = $true
        unresolvedProjectItems = @()
        startupAdaptationRequired = @()
        seededRowCount = 2
        baseline = @{
            kind = 'immutable-bootstrap-input'
            mappingRows = @(
                @{ sourceFile = 'Page.xaml'; targetFile = 'Page.xaml'; initialTriageLabel = 'migrate-as-is'; originalSha256 = 'a'.PadRight(64, 'a'); importOrigin = 'primary' }
                @{ sourceFile = 'Deferred.xaml'; targetFile = 'Deferred.xaml'; initialTriageLabel = 'defer'; originalSha256 = 'b'.PadRight(64, 'b'); importOrigin = 'primary' }
            )
        }
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root '.bootstrap-meta.json')
    return $root
}

function Invoke-Validator([string]$target) {
    $preference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -Target $target 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        [PSCustomObject]@{ ExitCode = $exitCode; Output = $output }
    } finally {
        $ErrorActionPreference = $preference
    }
}

try {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $env:VALIDATOR_WINAPP_LOG = Join-Path $work 'winapp.log'
    Set-Content -LiteralPath (Join-Path $tools 'winapp.ps1') -Encoding Ascii -Value @'
Add-Content -LiteralPath $env:VALIDATOR_WINAPP_LOG -Value ($args -join ' ')
if ($args[0] -eq '--version') {
    Write-Output '0.6.0'
    exit 0
}
if ($args -contains '--detach') {
    Write-Output 'Developer Mode is disabled'
    exit 1
}
exit 0
'@
    $env:PATH = "$tools;$originalPath"

    $valid = New-Fixture 'valid'
    $result = Invoke-Validator $valid
    Assert-True ($result.ExitCode -eq 0) "valid fixture should pass; output: $($result.Output)"
    $winappCalls = if (Test-Path -LiteralPath $env:VALIDATOR_WINAPP_LOG) {
        Get-Content -LiteralPath $env:VALIDATOR_WINAPP_LOG -Raw
    } else { '' }
    Assert-True ($winappCalls -match 'run .*App\.csproj --no-launch --arch (x64|ARM64) -c Debug') "build must use supported BuildAndRun forwarding; output: $($result.Output)"
    Assert-True ($winappCalls -notmatch 'unregister') 'validator must not perform destructive unregister cleanup'

    $missingTarget = New-Fixture 'missing-target'
    Remove-Item -LiteralPath (Join-Path $missingTarget 'Page.xaml')
    $result = Invoke-Validator $missingTarget
    Assert-True ($result.ExitCode -eq 1 -and $result.Output -match 'nondeferred target is missing') 'missing mapped targets must fail'

    $badMapping = New-Fixture 'bad-mapping'
    Add-Content -LiteralPath (Join-Path $badMapping 'MIGRATION-MAPPING.md') -Value '| Page.xaml | Other.xaml | migrate-as-is | invented |'
    $result = Invoke-Validator $badMapping
    Assert-True ($result.ExitCode -eq 1 -and $result.Output -match 'duplicate source identity' -and $result.Output -match 'unknown or incomplete status') 'duplicates and unknown statuses must fail'

    $setMismatch = New-Fixture 'deferred-set'
    (Get-Content -LiteralPath (Join-Path $setMismatch 'MIGRATION-DEFERRED.md') -Raw).Replace('Deferred.xaml', 'Page.xaml') |
        Set-Content -LiteralPath (Join-Path $setMismatch 'MIGRATION-DEFERRED.md')
    $result = Invoke-Validator $setMismatch
    Assert-True ($result.ExitCode -eq 1 -and $result.Output -match 'identity set mismatch') "equal-sized but different deferred sets must fail; output: $($result.Output)"

    $nullMetadata = New-Fixture 'null-metadata'
    Set-Content -LiteralPath (Join-Path $nullMetadata '.bootstrap-meta.json') -Value '[]'
    $result = Invoke-Validator $nullMetadata
    Assert-True ($result.ExitCode -eq 1 -and $result.Output -match 'malformed') 'array metadata roots must fail'

    $noProject = New-Fixture 'no-project'
    Remove-Item -LiteralPath (Join-Path $noProject 'App.csproj')
    $result = Invoke-Validator $noProject
    Assert-True ($result.ExitCode -eq 1 -and $result.Output -match 'build validation is required') 'missing projects must fail the build gate'

    $xmlManifest = New-Fixture 'xml-manifest'
    New-Item -ItemType Directory -Path (Join-Path $xmlManifest 'Assets') | Out-Null
    Set-Content -LiteralPath (Join-Path $xmlManifest 'Assets\Logo.png') -Value ''
    Set-Content -LiteralPath (Join-Path $xmlManifest 'Package.appxmanifest') -Value @'
<Package IgnorableNamespaces="uap rc" xmlns:rc="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Properties><Logo>Assets/Logo.png</Logo></Properties>
  <Dependencies><TargetDeviceFamily MaxVersionTested="10.0.0.0" MinVersion="10.0.0.0" Name="Windows.Desktop" /></Dependencies>
  <Capabilities><rc:Capability Name="runFullTrust"></rc:Capability></Capabilities>
</Package>
'@
    $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH = '1'
    $result = Invoke-Validator $xmlManifest
    Assert-True ($result.Output -match '\[PASS\] Package\.appxmanifest - Windows\.Desktop target') 'manifest validation must be XML namespace-aware and attribute-order independent'
    Assert-True ($result.ExitCode -eq 2 -and $result.Output -match 'UNVERIFIED') 'an explicitly unavailable launch gate must never report PASS'

    Remove-Item Env:\UWP_MIGRATION_SKIP_SMOKE_LAUNCH
    $result = Invoke-Validator $xmlManifest
    $winappCalls = if (Test-Path -LiteralPath $env:VALIDATOR_WINAPP_LOG) {
        Get-Content -LiteralPath $env:VALIDATOR_WINAPP_LOG -Raw
    } else { '' }
    $escapedProject = [regex]::Escape((Join-Path $xmlManifest 'App.csproj'))
    Assert-True ($winappCalls -match "run $escapedProject --detach --json") "applicable smoke launch must invoke winapp in project mode; output: $($result.Output)"
    Assert-True ($result.ExitCode -eq 2 -and $result.Output -match '\[BLOCKED\]' -and $result.Output -notmatch 'Validate-UwpMigration: PASS') 'recognized nonzero/no-PID launch failures must be UNVERIFIED, never PASS'
}
finally {
    $env:PATH = $originalPath
    $env:VALIDATOR_WINAPP_LOG = $originalLog
    $env:UWP_MIGRATION_SKIP_SMOKE_LAUNCH = $originalSkip
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}
Write-Host 'Validate-UwpMigration regression tests passed.'
