# UI Automation Command Reference

Full command details for `winapp ui`. Run `winapp ui <command> --help` for the latest options.

## `winapp ui status`
Connect to a target app and display connection info.

| Option | Description |
|--------|-------------|
| `--app` / `-a` | Target app (process name, window title, or PID) |
| `--window` / `-w` | Target window by HWND (takes precedence over --app) |
| `--json` | JSON output |

## `winapp ui inspect [selector]`
View the UI element tree with semantic slugs, types, names, and bounds.

| Option | Description | Default |
|--------|-------------|---------|
| `--app` / `-a` | Target app | — |
| `--interactive` | Show only interactive/invokable elements, depth 8 | — |
| `--depth` | Tree depth | `3` |
| `--ancestors` | Walk up from element to root | — |
| `--hide-disabled` | Hide disabled elements | — |
| `--hide-offscreen` | Hide offscreen elements | — |
| `--window` / `-w` | Target by HWND | — |
| `--json` | JSON output | — |

## `winapp ui search <selector>`
Search element tree by text (substring, case-insensitive on Name and AutomationId).

| Option | Description | Default |
|--------|-------------|---------|
| `--app` / `-a` | Target app | — |
| `--max` | Maximum results | `50` |
| `--window` / `-w` | Target by HWND | — |
| `--json` | JSON output | — |

## `winapp ui invoke <selector>`
Activate an element. Tries InvokePattern → TogglePattern → SelectionItemPattern → ExpandCollapsePattern.

| Option | Description |
|--------|-------------|
| `--app` / `-a` | Target app |
| `--window` / `-w` | Target by HWND |
| `--json` | JSON output |

## `winapp ui set-value <selector>`
Set text on an editable element (TextBox, ComboBox, etc.) via ValuePattern.

| Option | Description |
|--------|-------------|
| `--text` | Text value to set |
| `--app` / `-a` | Target app |
| `--window` / `-w` | Target by HWND |

## `winapp ui screenshot [selector]`
Capture window or element as PNG. Optional element crop.

| Option | Description |
|--------|-------------|
| `--output` | Save to file path |
| `--capture-screen` | Capture from screen (includes popups/overlays) |
| `--app` / `-a` | Target app |
| `--window` / `-w` | Target by HWND |
| `--json` | JSON output (returns path + dimensions) |

## `winapp ui scroll <selector>`
Scroll a container using ScrollPattern.

| Option | Description |
|--------|-------------|
| `--direction` | `up`, `down`, `left`, `right` |
| `--to` | `top`, `bottom` |
| `--app` / `-a` | Target app |
| `--window` / `-w` | Target by HWND |

## `winapp ui wait-for <selector>`
Wait for element to appear, disappear, or reach a property value. Polls at 100ms.

| Option | Description | Default |
|--------|-------------|---------|
| `--timeout` | Timeout in ms | `5000` |
| `--gone` | Wait for disappearance | — |
| `--property` | Property to watch | — |
| `--value` | Target value (with --property) | — |
| `--app` / `-a` | Target app | — |
| `--window` / `-w` | Target by HWND | — |

## `winapp ui focus <selector>`
Move keyboard focus to element via SetFocus.

## `winapp ui scroll-into-view <selector>`
Scroll element into visible area via ScrollItemPattern.

## `winapp ui get-property <selector>`
Read UIA properties. Use `--property` for specific property or omit for all.

| Option | Description |
|--------|-------------|
| `--property` | Property name to read |
| `--app` / `-a` | Target app |

## `winapp ui get-focused`
Show the element with current keyboard focus.

## `winapp ui list-windows`
List all visible windows with HWND, title, process, size. Use `-a` to filter.
