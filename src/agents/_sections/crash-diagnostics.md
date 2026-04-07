---
---

### Run & Crash Diagnostics

```powershell
.\.github\skills\winui3-dev-workflow\run-app.ps1 bin\x64\Debug\<tfm>\win-x64\ -DebugOutput
```
NEVER run the exe directly. This script wraps `winapp run` with automatic crash diagnostics — if the app crashes, it captures a dump and prints the exact crashing control (e.g., `BreadcrumbBar.MeasureOverride`).

**If the script reports a CRASH ANALYSIS, read the SYMBOL_NAME and STACK to identify which control/code caused it, then fix it. Do NOT guess — use the analysis output.**

**If the app crashes later during testing** (e.g., clicking a button causes a crash), check for a dump file and analyze it:
```powershell
if (Test-Path crash.dmp) {
    $cdb = (Get-AppxPackage -Name "*WinDbg*" | ForEach-Object { Join-Path $_.InstallLocation "amd64\cdb.exe" } | Where-Object { Test-Path $_ } | Select-Object -First 1)
    & $cdb -z crash.dmp -c "!sym quiet; !analyze -v; q" -logo crash-analysis.log
    Get-Content crash-analysis.log | Select-String "SYMBOL_NAME|STACK_TEXT|FAILURE_BUCKET" | Select-Object -First 10
    Remove-Item crash.dmp, crash-analysis.log -Force
}
```

**A crashing app scores 0. Fix the crash first, everything else comes after.**
