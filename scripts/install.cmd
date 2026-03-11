@echo off
REM Installer for Windows Development Skills toolkit.
REM No admin privileges required.
REM
REM Usage:
REM   install.cmd              Install everything
REM   install.cmd --uninstall  Remove everything

echo.

REM Check for --uninstall flag
set "UNINSTALL_FLAG="
if "%~1"=="--uninstall" set "UNINSTALL_FLAG=-Uninstall"
if "%~1"=="-uninstall" set "UNINSTALL_FLAG=-Uninstall"

if defined UNINSTALL_FLAG (
    echo ================================================
    echo  Windows Development Skills - Uninstall
    echo ================================================
) else (
    echo ================================================
    echo  Windows Development Skills - Installation
    echo ================================================
)
echo.

REM Run PowerShell with bypass execution policy
powershell.exe -ExecutionPolicy Bypass -File "%~dp0install.ps1" %UNINSTALL_FLAG%

if %ERRORLEVEL% EQU 0 (
    echo.
    if defined UNINSTALL_FLAG (
        echo Uninstall completed successfully!
    ) else (
        echo Installation completed successfully!
    )
    echo Open a NEW terminal for PATH changes to take effect.
) else (
    echo.
    echo Operation encountered an error.
    echo Please check the output above for details.
)

echo.
pause