# action.ps1 — Load dotnet new WinUI 3 Blank App template into the trial app directory
# Copies the pre-built `dotnet new winui` template into $env:BENCH_APP_DIR
# and renames "BlankApp" references to match $env:BENCH_APP_NAME.
param()
$ErrorActionPreference = 'Stop'

$templateDir = Join-Path $PSScriptRoot "template\BlankApp"
$appDir      = $env:BENCH_APP_DIR
$appName     = $env:BENCH_APP_NAME

if (-not $appDir) { Write-Error "BENCH_APP_DIR not set"; exit 1 }
if (-not $appName) { Write-Error "BENCH_APP_NAME not set"; exit 1 }
if (-not (Test-Path $templateDir)) { Write-Error "Template not found: $templateDir"; exit 1 }

Write-Host "Copying dotnet new WinUI template to $appDir ..."
Copy-Item -Path "$templateDir\*" -Destination $appDir -Recurse -Force

# Rename csproj file
$oldCsproj = Join-Path $appDir "BlankApp.csproj"
$newCsproj = Join-Path $appDir "$appName.csproj"
if (Test-Path $oldCsproj) {
    Rename-Item $oldCsproj $newCsproj
    Write-Host "  Renamed csproj -> $appName.csproj"
}

# Replace "BlankApp" with app name in all text files
$extensions = @("*.csproj", "*.cs", "*.xaml", "*.appxmanifest", "*.json", "*.pubxml")
foreach ($ext in $extensions) {
    Get-ChildItem -Path $appDir -Recurse -Filter $ext -File | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        if ($content -match 'BlankApp') {
            $content = $content -replace 'BlankApp', $appName
            Set-Content $_.FullName $content -NoNewline
        }
    }
}

$fileCount = (Get-ChildItem $appDir -Recurse -File | Measure-Object).Count
Write-Host "Done. $fileCount files in app directory (template: dotnet new winui)."
