# Window Sizing — Worked Examples

This file holds concrete, end-to-end applications of the sizing rubric in `SKILL.md` Step 4. The rubric itself is the authoritative algorithm; the examples here are illustrations — **derive your own numbers from your own layout, don't copy these verbatim**. Each example follows the same structure: list rows → derive width → derive height → state result.

## Example 1: Focus-timer utility (single-purpose)

A simple Pomodoro-style timer with mode switcher, hero ring, action buttons, and an optional settings expander.

**Layout (rows top to bottom):**
- Title bar (~32 tall)
- Mode `RadioButtons` row: Focus / Short Break / Long Break (~380 wide, ~48 tall)
- 320px-diameter timer ring (320 wide, 320 tall)
- Pause / Reset button row (~260 wide, ~48 tall)
- `Expander` "Customize durations" containing three labeled `NumberBox`es side-by-side (~380 wide, ~240 tall when expanded)
- "Auto-start next session" toggle row (~320 wide, ~48 tall)
- Status text row (~32 tall)

**Width derivation:**
- Widest row = mode selector at ~380
- + 48 padding (24 each side) → ~430
- Round up to nearest 20 → **460 wide**

**Height derivation:**
- Titlebar 32 + mode row 48 + ring 320 + buttons 48 + expander 240 + toggle 48 + status 32 = 768
- + 48 padding (24 top + 24 bottom) + ~40 cumulative spacing between rows = 856
- Round up to nearest 20 → **860 tall**

**Result: `460 × 860`** (DIPs — multiply by `RasterizationScale` before passing to `AppWindow.Resize`, per the Step 4 snippet).

If post-build validation shows the mode labels clipping (`"Long Break"` cut off), bump to `500 × 860` and rebuild.

### Anti-pattern for the same app

Sizing the focus-timer at **440 × 720** because "utilities are small" — this clips `"Long Break"` in the mode selector, crops the timer digits at the top and bottom of the ring, truncates the auto-start toggle label, and overlaps the status footer with the toggle row. The rubric forces 460 × 860; cutting to 440 × 720 reintroduces every symptom the rubric is designed to prevent. Compactness is good; clipping is a bug.

---

## Adding more examples

Add a new `## Example N: <app-kind>` section using the same structure (layout → width → height → result → anti-pattern). Good candidates if you find yourself sizing one of these from scratch:

- A settings dialog (form-shaped, single column of labeled inputs)
- A multi-pane app (left nav + content)
- A canvas/media editor (wide-format with a toolbar)
- A login / first-run window (small, centered, tight)

Each new example reinforces that the rubric generalises across app shapes — the more concrete examples on file, the less an agent has to extrapolate from the focus-timer in isolation.
