# action.ps1 — Scaffold a WinUI 3 project using dotnet new
# Uses BENCH_APP_NAME and BENCH_APP_DIR environment variables set by the benchmark runner.
param()
$ErrorActionPreference = 'Stop'

$appName = $env:BENCH_APP_NAME
$appDir  = $env:BENCH_APP_DIR

if (-not $appName) { Write-Error "BENCH_APP_NAME not set"; exit 1 }
if (-not $appDir)  { Write-Error "BENCH_APP_DIR not set";  exit 1 }

Write-Host "Scaffolding WinUI 3 project: $appName"
dotnet new winui -n $appName --output "$appDir"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Strip template-generated agent instructions (benchmark installs its own)
$agentsMd = Join-Path $appDir "AGENTS.md"
$ghDir    = Join-Path $appDir ".github"
if (Test-Path $agentsMd) { Remove-Item $agentsMd -Force }
if (Test-Path $ghDir)    { Remove-Item $ghDir -Recurse -Force }

Write-Host "Done. Project scaffolded at $appDir"
