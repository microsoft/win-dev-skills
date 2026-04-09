---
skills: [ui-automation]
---

### Verify

Once you are done building the application, verify it works by writing and running a **PowerShell verification script**. Do NOT run individual `winapp ui` commands one at a time — that wastes turns.

#### Step 1: Write a Verification Script

Create a file `verify-app.ps1` in the project root. The script should:
1. Use `AutomationProperties.AutomationId` values you assigned during coding — NOT slugs from inspect (slugs change between runs)
2. Use `winapp ui wait-for` for assertions instead of `Start-Sleep` + inspect
3. Take screenshots at key points for the record
4. Produce a clear PASS/FAIL summary at the end

Use this pattern (adapted from [winappCli e2e tests](https://github.com/microsoft/winappCli/blob/main/scripts/test-e2e-winui-ui.ps1)):

```powershell
param([string]$AppPid, [string]$ScreenshotDir = ".")

$ErrorActionPreference = 'Continue'
$passed = 0; $failed = 0; $results = @()

function Test-Pass($Name, $Detail = "") {
    $script:passed++; $script:results += "$Name : PASS $Detail"
    Write-Host "PASS  $Name $Detail" -ForegroundColor Green
}
function Test-Fail($Name, $Detail = "") {
    $script:failed++; $script:results += "$Name : FAIL $Detail"
    Write-Host "FAIL  $Name $Detail" -ForegroundColor Red
}
function Invoke-UI([string[]]$Args) {
    $out = & winapp ui @Args 2>&1; return @{ Output = ($out -join "`n"); Exit = $LASTEXITCODE }
}

# --- Initial screenshot ---
Invoke-UI screenshot -a $AppPid -o "$ScreenshotDir/01-initial.png"

# --- Test: Main page loads ---
$r = Invoke-UI wait-for "YourAutomationId" -a $AppPid -t 5000
if ($r.Exit -eq 0) { Test-Pass "Main page loads" } else { Test-Fail "Main page loads" }

# --- Test: Button click works ---
$r = Invoke-UI invoke "YourButtonId" -a $AppPid
if ($r.Exit -eq 0) { Test-Pass "Button click" } else { Test-Fail "Button click" }

# --- Test: Value updates after action ---
$r = Invoke-UI wait-for "YourDisplayId" -a $AppPid --property Name --value "Expected Text" -t 5000
if ($r.Exit -eq 0) { Test-Pass "Display updated" } else { Test-Fail "Display updated" $r.Output }

# --- Test: Text input ---
Invoke-UI set-value "YourTextBoxId" "test input" -a $AppPid
$r = Invoke-UI wait-for "YourTextBoxId" -a $AppPid --property Value --value "test input" -t 3000
if ($r.Exit -eq 0) { Test-Pass "Text input" } else { Test-Fail "Text input" }

# --- Final screenshot ---
Invoke-UI screenshot -a $AppPid -o "$ScreenshotDir/02-final.png"

# --- Summary ---
Write-Host "`n=== RESULTS: $passed passed, $failed failed ==="
$results | ForEach-Object { Write-Host "  $_" }
if ($failed -gt 0) { exit 1 } else { exit 0 }
```

Customize the script for YOUR app's specific AutomationIds and features. Test every requirement from the original prompt.

#### Step 2: Run the Script

```powershell
.\verify-app.ps1 -AppPid <PID> -ScreenshotDir <dir>
```

Read the output. If tests pass, you're done. If tests fail, fix the issues and re-run (max 2 fix cycles).

#### Important Rules
- **Use AutomationIds, not slugs** — you assigned these during coding, so you know them
- **Use `wait-for` instead of Sleep** — it's faster and more reliable
- **Don't read screenshots** — they're saved to disk for reference, don't load them into the conversation
- **If `winapp ui` can't interact with a menu flyout**, invoke the menu's AutomationId directly or note the feature as untested. Do NOT spend more than 2 attempts on any single interaction.
- If the app crashes on startup, the `--debug-output` flag (already in the run command) shows exceptions — read those to diagnose.
