# Dashboard Test Plan

## Test Harness

The harness (`harness.ts`) spawns the dashboard as a child process and interacts via stdin/stdout:
- **`test-entry.tsx`** — Patched entry point that fakes a TTY on stdin so Ink's `useInput` doesn't crash
- **`harness.ts`** — `Dashboard` class: `start()`, `press(key)`, `type(text)`, `hasText()`, `hasRecentText()`, `waitForText()`, `waitForExit()`, `stop()`
- **`smoke-test.ts`** — Automated smoke test that exercises all views

### Running

```powershell
cd agent-benchmark/dashboard
npx tsx auto-test/smoke-test.ts [runName]       # smoke test (loads existing run)
npx tsx auto-test/lifecycle-test.ts             # full lifecycle (start → crash → reload → rerun → crash → recover)
```

### Known Limitations

- **No PTY**: Without a real pseudo-TTY, Ink's cursor repositioning (used for in-place re-rendering) is captured as escape sequences rather than stable screen frames. The harness works around this by accumulating all output and searching the full buffer.

---

## Test Coverage

### Setup View

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 1 | Render setup wizard | Launch dashboard | Shows "🏁 Benchmark Dashboard" with menu items | ✅ Automated |
| 2 | New benchmark option | Visible on load | "▶ New benchmark run" is listed | ✅ Automated |
| 3 | Load run option | Visible when runs exist | "📂 Benchmark run status (N available)" is listed | ✅ Automated |
| 4 | Navigate to load run | ↓ to select, Enter | Shows "Select a run to load:" with run list | ✅ Automated |
| 5 | Select a run | Enter on a run | Loads run and switches to Results view | ✅ Automated |
| 6 | Navigate to new benchmark | Enter on "New benchmark" | Shows scenario selection (multi-select) | ✅ lifecycle-test |
| 7 | Scenario multi-select | Space to toggle, A for all, D for done | Toggles ✓/○ markers, advances to agents step | ✅ lifecycle-test |
| 8 | Agent multi-select | Space/A/D | Same toggle behavior, advances to models | ✅ lifecycle-test |
| 9 | Model multi-select | Space/A/D | Same, advances to concurrency | ✅ lifecycle-test |
| 10 | Concurrency selection | ↑↓ + Enter | Selects 1-5 parallel runs | ✅ lifecycle-test |
| 11 | Iterations selection | ↑↓ + Enter | Selects 1-5 iterations | ✅ lifecycle-test |
| 12 | Timeout selection | ↑↓ + Enter | Selects 30-120 minute timeout | ✅ lifecycle-test |
| 13 | Confirm and start | Enter on "▶ Start benchmark" | Creates run directory, starts queue, switches to Live view | ✅ lifecycle-test |
| 14 | Rerun previous matrix | ↓↓ + Enter on "🔁 Rerun" | Loads matrix from run-meta.json, shows confirm screen | Manual only |
| 15 | Load from JSON file | Select "📄 Load from JSON" | Shows text input for file path | Manual only |
| 16 | Back navigation | Select "← Back" | Returns to previous step | Manual only |

### View Switching

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 17 | Switch to Live | Press `1` | Shows Live view with run output/status | ✅ Automated |
| 18 | Switch to Progress | Press `2` | Shows Progress view with entry list | ✅ Automated |
| 19 | Switch to Results | Press `3` | Shows Results comparison table | ✅ Automated |
| 20 | Switch to Charts | Press `4` | Shows scatter plots (or "No completed results") | ✅ Automated |
| 21 | Switch to Summary | Press `5` | Shows summary stats (or "No completed results") | ✅ Automated |
| 22 | Tab cycling | Press `Tab` | Cycles through views in order | ✅ Automated |
| 23 | Back to setup | Press `B` | Returns to setup wizard | Manual only |
| 24 | Quit | Press `Q` | Exits the dashboard | ✅ Automated |

### StatusBar

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 25 | StatusBar renders | Any non-setup view | Shows run name, progress count, elapsed time, and view tabs | ✅ Automated |
| 26 | Active view highlight | Switch views | Active view tab shows in green, others in gray | Manual only |
| 27 | Progress counter | During/after run | Shows [completed/total] count | ✅ Automated |

### Live View [1]

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 28 | Show run output | Select Live view | Displays copilot output for selected run | Manual only |
| 29 | Switch runs | ←/→ arrows | Changes selected run, resets scroll | Manual only |
| 30 | Scroll output | ↑/↓ arrows | Scrolls the log panel up/down | Manual only |
| 31 | Page scroll | PgUp/PgDn or `[`/`]` | Scrolls one page at a time | Manual only |
| 32 | Jump to top | `h` | Scrolls to top of log | Manual only |
| 33 | Jump to bottom | `e` | Scrolls to bottom of log | Manual only |
| 34 | Follow active run | `F` | Selects currently active run and follows | Manual only |
| 35 | Open trial folder | `O` | Opens trial folder in Explorer | Manual only |

### Progress View [2]

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 36 | Guide text visible | View loads when idle | Shows keyboard shortcuts help text | ✅ Automated |
| 37 | Cursor ↓ navigation | Press ↓ | Cursor moves down one row | ✅ Automated |
| 38 | Cursor ↑ navigation | Press ↑ | Cursor moves up one row | ✅ Automated |
| 39 | Cursor highlight | Navigate to any row | Row shows inverse (white on dark) + bold | ✅ Automated |
| 40 | Single select | Press Space | Toggles ✓ on current row, "Selected: 1" | ✅ Automated |
| 41 | Single deselect | Press Space again | Removes ✓, "Selected: 0" | ✅ Automated |
| 42 | Select all | Press `A` | All entries selected, count shows total | ✅ Automated |
| 43 | Deselect all | Press `A` again | All deselected, "Selected: 0" | ✅ Automated |
| 44 | Jump to bottom | Press `e` | Cursor jumps to last entry, shows "↑ N more above" | ✅ Automated |
| 45 | Jump to top | Press `h` | Cursor jumps to first entry, shows "↓ N more below" | ✅ Automated |
| 46 | Page down | PgDn or `]` | Cursor jumps by one page | ✅ lifecycle-test |
| 47 | Page up | PgUp or `[` | Cursor jumps by one page | ✅ lifecycle-test |
| 48 | Virtual scroll | Navigate past visible area | View auto-scrolls, shows scroll indicators | ✅ Automated (via e/h) |
| 49 | R with no selection | Press `R` without selecting | Nothing happens (no rerun started) | ✅ Automated |
| 50 | R with selection | Select entries + Press `R` | Starts rerun for selected entries | ✅ lifecycle-test |
| 51 | V with selection | Select entries + Press `V` | Starts revalidation for selected entries | Manual only |
| 52 | Disabled during run | Active queue running | ↑↓/Space/A/R/V disabled, guide text hidden | Manual only |

### Results View [3]

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 53 | Results table renders | View loads | Shows scenario, condition, model, grade, score, time, tokens, price, build/run rates | ✅ Automated |
| 54 | Cursor navigation | ↑/↓ arrows | Cursor (▶) moves between rows | ✅ Automated |
| 55 | Open folder | Press `O` | Opens selected scenario's trial folder | Manual only |
| 56 | Summary section | After summary analysis | Shows rankings and recommendations below table | Manual only |

### Charts View [4]

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 57 | Charts render | View loads with results | Shows TOKEN USAGE vs SCORE scatter plots | ✅ Automated |
| 58 | Per-scenario charts | Multiple scenarios | One chart per scenario | Manual only |
| 59 | Empty state | No completed results | Shows "No completed results to chart yet." | ✅ Automated |

### Summary View [5]

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 60 | Quick stats | View loads | Shows conditions tested, scenarios, models, run counts | ✅ Automated |
| 61 | Rankings | With completed results | Shows conditions ranked by average score | Manual only |
| 62 | AI analysis | After summary analysis runs | Shows overall summary, condition analysis, recommendations | Manual only |
| 63 | Empty state | No completed results | Shows "No completed results yet." | ✅ Automated |

### Cross-View

| # | Function | Trigger | Expected Behavior | Status |
|---|----------|---------|-------------------|--------|
| 64 | H for HTML report | Press `H` (non-progress view) | Generates HTML report and opens in browser | Manual only |
| 65 | O for open folder | Press `O` | Opens run/trial folder in Explorer | Manual only |
| 66 | Setup keys isolated | ↑↓ during setup wizard | No scroll offset accumulation; StatusBar visible after setup | ✅ Automated (via StatusBar check) |
| 67 | Progress keys isolated | h/e/PgUp/PgDn in progress | No app-level scrollOffset modification | ✅ Automated |
| 68 | Stale cursor clamping | Entries change after rerun | Cursor stays within bounds | Manual only |
| 69 | Stale selection pruning | Entries change after rerun | Selected set only contains valid IDs | Manual only |
| 70 | Concurrency from run-meta | Load previous run + rerun | Uses concurrency from run-meta.json, not hardcoded | Manual only |

---

## Summary

- **Total functions**: 70
- **Automated**: 40 (smoke-test: 27, lifecycle-test: 27, with overlap)
- **Manual only**: 30 (require real terminal, OS interaction, or active copilot CLI)
- **[BROKEN]**: 0
