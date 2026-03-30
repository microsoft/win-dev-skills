<#
.SYNOPSIS
Locates and executes the latest installed MSBuild.exe for building WinUI 3 / .NET projects.

.DESCRIPTION
This script automatically finds MSBuild.exe using vswhere.exe, eliminating the need to
run inside a Developer Command Prompt. All arguments passed to this script are
forwarded directly to MSBuild. 

By default, it runs MSBuild with minimal verbosity and no logo to keep terminal output clean.
You can override the verbosity by passing your own /v: flag (e.g., /v:diag).

*** IMPORTANT USAGE INSTRUCTIONS FOR AUTOMATED AGENTS ***
When passing properties to MSBuild via this PowerShell script, DO NOT use the hyphen syntax 
(e.g., -p:Platform=x64) without quotes. PowerShell will incorrectly parse the hyphen and colon, 
inserting a space that causes an MSB1005 error ("Specify a property and its value").

To successfully invoke this script, use one of the following safe syntaxes:

1. (Preferred) Use forward slashes instead of hyphens:
   .\build.ps1 .\Path\To\YourApp.csproj /p:Platform=x64 /p:Configuration=Debug

2. Wrap the entire property flag in double quotes:
   .\build.ps1 .\Path\To\YourApp.csproj "-p:Platform=x64" "-p:Configuration=Debug"

3. Use the PowerShell stop-parsing token (--%):
   .\build.ps1 .\Path\To\YourApp.csproj --% -p:Platform=x64 -p:Configuration=Debug

To restore packages before building, use:
   .\build.ps1 .\Path\To\YourApp.csproj /t:restore
#>

# 1. Locate vswhere.exe (it's always installed here alongside Visual Studio)
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"

if (-Not (Test-Path $vswhere)) {
    Write-Error "vswhere.exe not found. Is Visual Studio installed?"
    exit 1
}

# 2. Use vswhere to find the latest VS installation that includes the MSBuild component
$vsPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -property installationPath

if (-Not $vsPath) {
    Write-Error "Could not find a Visual Studio installation with MSBuild."
    exit 1
}

# 3. Construct the exact path to MSBuild.exe
$msbuild = Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"

if (-Not (Test-Path $msbuild)) {
    Write-Error "MSBuild.exe not found at $msbuild"
    exit 1
}

Write-Host "--> Using MSBuild: $msbuild" -ForegroundColor Cyan

# 4. Define default noise-reduction arguments
# /nologo : Hides the copyright and version banner
$defaultArgs = @("/nologo")

# Check if the user explicitly requested a specific verbosity level in the arguments
# This regex matches common variations like /v:diag, -v:detailed, /verbosity:quiet
$hasVerbosity = $args | Where-Object { $_ -match "^[/|-]v(erbosity)?:" }

if (-not $hasVerbosity) {
    # Apply minimal verbosity by default if none was provided
    $defaultArgs += "/v:m"
}

# Combine defaults with any arguments passed to the script
$allArgs = $defaultArgs + $args

# 5. Execute MSBuild
& $msbuild $allArgs