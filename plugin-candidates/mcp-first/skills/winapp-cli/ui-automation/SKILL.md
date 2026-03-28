---
name: ui-automation
description: 'Inspect and interact with running Windows app UIs from the command line using winapp ui commands. Use when verifying UI state, finding controls, clicking buttons, reading or setting text, taking screenshots, scrolling, or debugging any Windows app UI (WinUI 3, WPF, WinForms, Win32, Electron). Works via UI Automation (UIA) — no setup needed.'
---

## Quick Reference

- **Semantic slugs:** `inspect` and `search` output shell-safe slugs like `btn-minimize-d1a0`. Use these to target elements precisely — no quoting needed.
- **Plain text search:** `search Save` and `invoke Submit` accept plain text — finds elements by name/AutomationId (substring, case-insensitive).
- **`--interactive`:** Use `winapp ui inspect -a myapp --interactive` as your first command — shows only clickable/interactive elements at depth 8.
- **`;` chaining:** Chain commands with `;` (not `&&`) to reduce round-trips: `winapp ui invoke btn-save-a1b2 -a myapp; winapp ui screenshot -a myapp`
- **`-a` vs `-w`:** `-a` finds by name/title/PID. `-w <HWND>` for stable targeting (from `list-windows` output).

---

# UI Automation

## Common Patterns

### Discover and interact
```powershell
# See what's clickable, then screenshot
winapp ui inspect -a myapp --interactive; winapp ui screenshot -a myapp

# Click and verify the page changed
winapp ui invoke btn-settings-a1b2 -a myapp; winapp ui wait-for pn-settingspage-c3d4 -a myapp --timeout 3000; winapp ui screenshot -a myapp

# Fill a form and submit
winapp ui set-value txt-searchbox-e5f6 --text "hello" -a myapp; winapp ui invoke btn-submit-7a90 -a myapp; winapp ui screenshot -a myapp
```

### Find visible text and click it
```powershell
# Search by text — output shows invokable ancestor if element isn't clickable
winapp ui search "Save changes" -a myapp

# Invoke by text — auto-walks to parent Button
winapp ui invoke "Save changes" -a myapp
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

## Key Concepts

- **Semantic slugs**: Format `prefix-name-hash` (e.g., `btn-minimize-d1a0`). Shell-safe, hash-validated.
- **Element markers**: `[on]`/`[off]` for toggles, `[collapsed]`/`[expanded]`, `[scroll:v]`/`[scroll:h]`, `[offscreen]`, `[disabled]`, `value="..."`
- **Invokable ancestor surfacing**: When a search result isn't invokable, the nearest invokable parent is shown with its slug
- **Use `;` not `&&`**: PowerShell `&&` can deadlock with native CLI stderr — `;` runs unconditionally and is better for agents (screenshot runs even if invoke fails)

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
