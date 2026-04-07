---
name: ui-automation
description: 'Inspect and interact with running Windows app UIs from the command line using winapp ui commands. Use when verifying UI state, finding controls, clicking buttons, reading or setting text, taking screenshots, scrolling, or debugging any Windows app UI (WinUI 3, WPF, WinForms, Win32, Electron). Works via UI Automation (UIA) — no setup needed.'
---

## Quick Reference

- **Semantic slugs:** `inspect` and `search` output shell-safe slugs like `btn-minimize-d1a0`. Use these to target elements precisely — no quoting needed.
- **Plain text search:** `search Save` and `invoke Submit` accept plain text — finds elements by name/AutomationId (substring, case-insensitive).
- **`--interactive`:** Use `winapp ui inspect -a <PID> --interactive` as your first command — shows only clickable/interactive elements at depth 8.
- **`;` chaining:** Chain commands with `;` (not `&&`) to reduce round-trips: `winapp ui invoke btn-save-a1b2 -a <PID>; winapp ui screenshot -a <PID>`
- **`-a` vs `-w`:** `-a` finds by name/title/PID. **Prefer PID** when available (from `winapp run` output) — avoids conflicts when multiple instances of the same app are running. `-w <HWND>` for stable window targeting (from `list-windows` output).

---

# UI Automation

## Targeting Best Practices

**Always prefer PID over app name** for `-a` targeting. When you launch an app with `winapp run`, it outputs the PID — capture it and use it for all subsequent `winapp ui` commands:

```powershell
# winapp run outputs the PID — use it for all UI commands
winapp run bin\x64\Debug\<tfm>\win-x64\
# Output includes: PID: 12345

# Use PID instead of app name — avoids collisions with other instances
winapp ui inspect -a 12345 --interactive
winapp ui screenshot -a 12345
winapp ui invoke BtnSave -a 12345
```

If PID is not available, fall back to app name: `winapp ui inspect -a MyApp --interactive`

## Common Patterns

### Discover and interact
```powershell
# See what's clickable, then screenshot (use PID from winapp run)
winapp ui inspect -a <PID> --interactive; winapp ui screenshot -a <PID>

# Click and verify the page changed
winapp ui invoke btn-settings-a1b2 -a <PID>; winapp ui wait-for pn-settingspage-c3d4 -a <PID> --timeout 3000; winapp ui screenshot -a <PID>

# Fill a form and submit
winapp ui set-value txt-searchbox-e5f6 --text "hello" -a <PID>; winapp ui invoke btn-submit-7a90 -a <PID>; winapp ui screenshot -a <PID>
```

### Find visible text and click it
```powershell
# Search by text — output shows invokable ancestor if element isn't clickable
winapp ui search "Save changes" -a <PID>

# Invoke by text — auto-walks to parent Button
winapp ui invoke "Save changes" -a <PID>
```

### Disambiguate duplicate elements
```powershell
# When text matches multiple elements, error shows slugs for each — pick the right one
winapp ui invoke Submit -a myapp
# → Selector matched 3 elements:
#   [0] Button "Submit Order" → btn-submitorder-a1b2
#   [1] Button "Submit" → btn-submit-c3d4
# Use the slug: winapp ui invoke btn-submit-c3d4 -a myapp
```

### Scroll containers
```powershell
# Find scrollable containers (marked [scroll:v], [scroll:h], [scroll:vh])
winapp ui search scroll -a myapp

# Scroll vertically, or jump to top/bottom
winapp ui scroll pn-scrollview-bfef --direction down -a myapp
winapp ui scroll pn-scrollview-bfef --to bottom -a myapp
```

### File dialog interaction
```powershell
# Trigger dialog, find its HWND, type path, confirm
winapp ui invoke btn-open-a2b3 -a myapp
winapp ui list-windows -a myapp                    # find dialog HWND
winapp ui set-value txt-1148-c4d5 --text "C:\path\to\file.png" -w <dialog-hwnd>
winapp ui invoke btn-open-e6f7 -w <dialog-hwnd>
```

### Mouse click (fallback when invoke fails)
```powershell
# Click at element coordinates — works on ANY element, even without UIA invoke patterns
winapp ui click <slug> -a <PID>

# Double-click (open files, navigate into folders)
winapp ui click <slug> -a <PID> --double

# Right-click (trigger context menus)
winapp ui click <slug> -a <PID> --right
```
When `invoke` fails with "does not support any invoke pattern", use `click` instead — it simulates a real mouse click at the element's coordinates.

## Key Concepts

- **Semantic slugs**: Format `prefix-name-hash` (e.g., `btn-minimize-d1a0`). Shell-safe, hash-validated. Slugs can change when the UI re-renders — prefer targeting by AutomationId when available.
- **AutomationId targeting (preferred)**: If XAML controls have `AutomationProperties.AutomationId` set, use that value directly with `invoke`, `search`, `set-value`, etc. AutomationIds are stable across re-renders unlike slugs. Example: `winapp ui invoke "BtnSave" -a myapp`
- **Element markers**: `[on]`/`[off]` for toggles, `[collapsed]`/`[expanded]`, `[scroll:v]`/`[scroll:h]`, `[offscreen]`, `[disabled]`, `value="..."`
- **Invokable ancestor surfacing**: When a search result isn't invokable, the nearest invokable parent is shown with its slug
- **Use `;` not `&&`**: PowerShell `&&` can deadlock with native CLI stderr — `;` runs unconditionally and is better for agents (screenshot runs even if invoke fails)

## Writing Automation-Friendly XAML

When generating XAML, **always set `AutomationProperties.AutomationId`** on interactive controls. This makes UI verification reliable — AutomationIds are stable identifiers that don't change when the UI re-renders, unlike slugs which are hash-based and can invalidate.

```xml
<!-- GOOD: every interactive control has a unique AutomationId -->
<Button AutomationProperties.AutomationId="BtnSave" Content="Save" />
<TextBox AutomationProperties.AutomationId="TxtSearch" PlaceholderText="Search..." />
<ComboBox AutomationProperties.AutomationId="CmbSize" />
<CheckBox AutomationProperties.AutomationId="ChkShrinkOnly" Content="Shrink only" />
<NavigationViewItem AutomationProperties.AutomationId="NavHome" Content="Home" />

<!-- BAD: no AutomationId — forces reliance on unstable slugs -->
<Button Content="Save" />
<TextBox PlaceholderText="Search..." />
```

**Naming convention**: Use PascalCase prefixed with control type abbreviation: `BtnSave`, `TxtSearch`, `CmbSize`, `ChkOption`, `NavHome`, `LstFiles`.

## Troubleshooting

| Error | Solution |
|---|---|
| "No running app found" | Try process name, window title, or PID |
| "Multiple windows match" | Use `-w <HWND>` from `list-windows` |
| "Selector matched N elements" | Use a slug from the suggestions shown in the error |
| "Element may have changed" | Re-run `inspect` to get fresh slugs |
| "does not support any invoke pattern" | Error shows invokable ancestor slug — use that |
| Popup not in screenshot | Use `--capture-screen` flag |

## Reference Docs

For full command options and arguments, see [UI Automation Command Reference](./references/command-reference.md) or run `winapp ui <command> --help`.

## Related Skills

`dev-workflow` for build/run workflow · `identity-and-setup` for app targeting
