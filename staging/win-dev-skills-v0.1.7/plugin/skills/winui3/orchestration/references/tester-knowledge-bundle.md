# Tester Knowledge Bundle

Reference material for the Tester agent. Used to validate a built WinUI 3 app against its design specification using `winapp ui` commands for screenshots, inspection, and interaction.

---

## 1. Testing Workflow

### Step 1: Preparation
1. Read `design-spec.md` — understand expected pages, navigation, controls, layout
2. Read `design-review.md` — know what design issues were flagged/approved
3. Verify the app is built and registered (Builder should have done this)

### Step 2: Visual Validation (per page)
For each page defined in the design spec:
1. Navigate to the page
2. Take a screenshot: `winapp ui screenshot -a <appname>`
3. Inspect the element tree: `winapp ui inspect -a <appname> --interactive`
4. Verify:
   - [ ] All expected controls exist in the visual tree
   - [ ] Control types match the design spec (e.g., spec says ComboBox, is it actually ComboBox?)
   - [ ] Content fills the window (no large empty margins around centered content)
   - [ ] Navigation pattern matches (NavigationView present with correct mode?)
   - [ ] No clipped text or overlapping elements (compare element bounds to window size)

### Step 3: Functional Testing
For each interactive feature:
1. Identify the control's automation ID via `winapp ui inspect`
2. Interact with it:
   - Click buttons: `winapp ui invoke <automationId> -a <appname>`
   - Set text: `winapp ui set-text <automationId> -a <appname> --value "test"`
   - Read values: `winapp ui get-property <automationId> -a <appname> --property Value`
   - Toggle: `winapp ui invoke <automationId> -a <appname>` (for ToggleSwitch, CheckBox)
3. Take a screenshot after the action to verify the result
4. Verify:
   - [ ] Action produced expected visual change
   - [ ] Data flow works (input in one control affects display in another)
   - [ ] Error states are handled (empty inputs, invalid data)

### Step 4: Navigation Testing
1. Click each NavigationView item or tab
2. Verify the correct page loads
3. Verify the selected item is highlighted
4. Take screenshots of each page

### Step 5: Accessibility Spot-Check
1. Inspect interactive controls: `winapp ui inspect -a <appname> --interactive`
2. Verify each interactive control has a non-empty `Name` property (from AutomationProperties)
3. Note any controls missing accessibility names

---

## 2. winapp ui Command Reference

### Screenshots
```powershell
# Take screenshot of the whole app window
winapp ui screenshot -a <appname>

# Take screenshot and save to specific path
winapp ui screenshot -a <appname> -o <path>

# Take screenshot by window handle (for Electron or other frameworks)
winapp ui screenshot -w <HWND>
```

### Inspection
```powershell
# Inspect full visual tree
winapp ui inspect -a <appname>

# Inspect only interactive elements (buttons, text boxes, etc.)
winapp ui inspect -a <appname> --interactive

# Find a specific element
winapp ui find <automationId> -a <appname>
```

### Interaction
```powershell
# Click/invoke a button
winapp ui invoke <automationId> -a <appname>

# Set text in a TextBox
winapp ui set-text <automationId> -a <appname> --value "hello"

# Read a property
winapp ui get-property <automationId> -a <appname> --property Value
winapp ui get-property <automationId> -a <appname> --property ToggleState
winapp ui get-property <automationId> -a <appname> --property IsSelected

# Select a ComboBox item
winapp ui select <automationId> -a <appname> --value "Option 1"

# Scroll
winapp ui scroll <automationId> -a <appname> --direction down --amount 3
```

---

## 3. Common Visual Issues to Check

| Issue | How to Detect | Severity |
|-------|--------------|----------|
| Content doesn't fill window | Screenshot shows large empty areas around centered content | Blocker |
| Controls missing from page | `winapp ui inspect` doesn't find expected controls | Blocker |
| Text clipped/truncated | Screenshot shows "..." or cut-off text at boundaries | Major |
| Wrong control type used | `inspect` shows different control type than design spec | Major |
| NavigationView missing or wrong mode | `inspect` tree doesn't show NavigationView | Major |
| Elements overlapping | Visual inspection of screenshot | Major |
| Wrong spacing (not 4px grid) | Visual inspection — gaps too large or too small | Minor |
| Missing icons | Screenshot shows empty icon spaces | Minor |
| Theme not applied | Colors look wrong, no Mica backdrop | Minor |

---

## 4. Test Report Structure

```markdown
# Test Report: <App Name>

## Verdict: [PASS | FAIL]

## Screenshots
| # | Page/State | Screenshot Path | Status |
|---|-----------|----------------|--------|
| 1 | Main page - Monitor tab | .winui-orchestration/screenshots/1-monitor.png | ✅ |
| 2 | Main page - Flash tab | .winui-orchestration/screenshots/2-flash.png | ✅ |
| 3 | Settings page | .winui-orchestration/screenshots/3-settings.png | ✅ |
| 4 | After clicking Connect | .winui-orchestration/screenshots/4-connected.png | ❌ |

## Visual Validation
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Content fills window | ✅ | Full-width layout confirmed |
| 2 | NavigationView present (Left mode) | ✅ | 3 items: Monitor, Flash, Settings |
| 3 | Controls match design spec | ✅ | ComboBox, NumberBox, Button all correct |
| 4 | No clipped text | ❌ | Log panel text truncated at right edge |

## Functional Tests
| # | Test | Steps | Expected | Actual | Status |
|---|------|-------|----------|--------|--------|
| 1 | Navigate to Flash | Click "Flash" nav item | Flash page loads | Flash page loads | ✅ |
| 2 | Set baud rate | Select "115200" in ComboBox | Value changes | Value changes | ✅ |
| 3 | Click Connect | Invoke Connect button | Status shows "Connected" | Button doesn't respond | ❌ |

## Accessibility Spot-Check
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | AutomationProperties on buttons | ✅ | All 12 buttons have Name |
| 2 | AutomationProperties on ComboBox | ❌ | Device selector missing Name |
| 3 | Tab navigation | ✅ | All controls reachable via Tab |

## Blockers
1. **[BLOCKER]**: Connect button not responding (no command bound?)
   - **Fix**: Check ConnectCommand binding in ViewModel

## Major Issues
1. **[MAJOR]**: Log panel text clipped at right edge
   - **Fix**: Ensure TextBlock has TextWrapping or ScrollViewer has horizontal scroll

## Minor Issues
1. **[MINOR]**: Device selector ComboBox missing AutomationProperties.Name
   - **Fix**: Add AutomationProperties.Name="Select device"
```

---

## 5. Verdict Criteria

### PASS — all of these:
- No blockers
- All pages from design spec are present and navigable
- Content fills the window (no web-like centered patterns)
- Navigation matches design spec
- Core functional tests pass (buttons work, inputs accept data)
- No more than 2 major issues

### FAIL — any of these:
- Any blocker issue
- Missing pages from design spec
- Content doesn't fill window (web-like layout)
- Navigation doesn't match design spec
- Core buttons/inputs don't work
- 3+ major issues
