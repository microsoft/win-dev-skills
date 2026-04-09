---
name: winui3-verify
description: "Verify and test running WinUI 3 apps using winapp ui commands — inspect controls, take screenshots, invoke buttons, set text values, check accessibility. Use after building to validate functionality, layout, accessibility, MVVM compliance, and x:Bind correctness."
---

### Verification Workflow

#### Step 1: Launch the App
```powershell
.\build.ps1
# Or manually:
winapp run <build-output-dir> --debug-output
```
Capture the PID from output — use it for all `winapp ui` commands.

#### Step 2: Inspect the UI
```powershell
# See all interactive controls (buttons, textboxes, etc.) at depth 8
winapp ui inspect -a <PID> --interactive

# Take a screenshot to see current visual state
winapp ui screenshot -a <PID>
```
`inspect --interactive` shows only clickable/editable elements with semantic slugs (`btn-save-a1b2`). Use these slugs to target elements.

#### Step 3: Test Interactions
```powershell
# Click a button
winapp ui invoke BtnSave -a <PID>

# Type into a text field
winapp ui set-value TxtSearch --text "hello world" -a <PID>

# Chain: click + wait + screenshot
winapp ui invoke btn-settings-a1b2 -a <PID>; winapp ui screenshot -a <PID>
```
Use `;` not `&&` to chain commands — prevents PowerShell deadlock with stderr.

#### Step 4: Navigate and Verify Pages
```powershell
# Click navigation items and verify each page loads
winapp ui invoke NavHome -a <PID>; winapp ui screenshot -a <PID>
winapp ui invoke NavSettings -a <PID>; winapp ui screenshot -a <PID>
```

#### Step 5: Check Accessibility
```powershell
# Full tree shows AutomationProperties
winapp ui inspect -a <PID> --depth 10
```
Verify: every interactive control has `AutomationProperties.AutomationId`. Icon-only buttons have `AutomationProperties.Name`.

### Targeting Tips

- **Prefer PID** over app name — avoids collisions with multiple instances
- **AutomationId targeting** (stable): `winapp ui invoke "BtnSave" -a <PID>`
- **Slug targeting** (dynamic): `winapp ui invoke btn-save-a1b2 -a <PID>`
- **Text search**: `winapp ui search "Save changes" -a <PID>` — finds by name/AutomationId substring
- **Disambiguation**: When multiple elements match, the error shows slugs for each — pick the right one

### Quality Checklist

#### MVVM Compliance
- [ ] ViewModels extend `ObservableObject`, use `[ObservableProperty]` partial properties
- [ ] Commands use `[RelayCommand]`, not `ICommand` implementations
- [ ] No UI types (`SolidColorBrush`, `Visibility`) in ViewModels
- [ ] No business logic in code-behind — only navigation and dialog coordination

#### x:Bind and Data Binding
- [ ] All bindings use `{x:Bind}`, not `{Binding}`
- [ ] `Mode=OneWay` or `TwoWay` set explicitly (no OneTime for dynamic data)
- [ ] `x:DataType` set on every `DataTemplate`
- [ ] No nested nullable binding paths without `FallbackValue`

#### Accessibility
- [ ] `AutomationProperties.AutomationId` on every interactive control
- [ ] `AutomationProperties.Name` on icon-only buttons
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] No information conveyed by color alone

#### Theming
- [ ] All colors use `{ThemeResource}` brushes — no hardcoded values
- [ ] Typography uses built-in styles (`SubtitleTextBlockStyle`, etc.)
- [ ] Spacing uses 4px grid multiples

#### Security
- [ ] No secrets/API keys in source code
- [ ] No `Process.Start` with unsanitized input
- [ ] External input validated and sanitized

#### Performance
- [ ] Long lists use `ListView` (virtualized), not `StackPanel`
- [ ] `x:Load` for conditional content
- [ ] Heavy work off UI thread via `Task.Run` or `async/await`
- [ ] No `.Result` / `.GetAwaiter().GetResult()`

### Verification Report

After testing, summarize:
1. **Passed:** List what works correctly
2. **Failed:** List issues with specific details (control name, expected vs actual)
3. **Screenshots:** Reference captured screenshots as evidence
4. **Recommendations:** Suggest fixes for any failures

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "No running app found" | Try PID, process name, or window title |
| "Multiple windows match" | Use `-w <HWND>` from `winapp ui list-windows` |
| "Element may have changed" | Re-run `inspect` — slugs regenerate on UI change |
| Popup not in screenshot | Use `--capture-screen` flag |
| App crashes on interact | Check `--debug-output` for first-chance exceptions |

### References

For detailed checklists, see `references/` directory.