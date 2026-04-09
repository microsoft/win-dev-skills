@echo off
echo.
echo ================================================
echo  Windows Development Skills - Installation
echo ================================================
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Installation completed successfully!
    echo Open a NEW terminal for PATH changes to take effect.
) else (
    echo.
    echo Installation encountered an error.
)
echo.
pause