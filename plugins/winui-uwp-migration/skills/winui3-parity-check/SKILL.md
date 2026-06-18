---
name: winui3-parity-check
description: "Verify that a migrated **WinUI 3** app faithfully replicates the **original UWP** app, scenario by scenario, with screenshots and a structural control-coverage gate. Run as the final step of a UWP→WinUI 3 migration (after the build is clean and the app launches). Produces a behavioral baseline from the UWP source, drives the running WinUI 3 app, and reports per-feature PASS/PARTIAL/FAIL so gaps can be fixed before declaring done."
---

## What this skill does

A clean build and a process that stays alive prove almost nothing about *fidelity*.
A page can compile, launch, and survive 10 seconds while every button is dead or an
entire scenario is missing. This skill closes that gap: it turns the **original UWP
app** into a per-scenario **feature checklist + screenshots**, then drives the
**migrated WinUI 3 app** through the same scenarios and grades each one.

It is the verification counterpart to `winui-uwp-migration` (which does the
transformation). Run it **last**, after `Validate-UwpMigration.ps1` reports PASS.

Three scripts do the mechanical work; your judgement fills the gaps the structural
gate can't see (visual layout, exact behaviour).

| Script | Role |
|---|---|
| `scripts/Extract-UwpFeatureChecklist.ps1` | Parse the UWP **source** → `checklist.json` + `info.md`. The ground-truth feature list. No UWP build needed. |
| `scripts/Capture-AppScenarios.ps1` | Drive a **running** app scenario-by-scenario (title-driven nav) → per-scenario screenshot + UIA tree. Works on the UWP app *and* the WinUI 3 app. |
| `scripts/Compare-Parity.ps1` | Grade the WinUI 3 capture against the checklist → `PARITY-REPORT.md` + PASS/FAIL exit code. |

## Prerequisites

- The WinUI 3 migration is built and launches (`winui-uwp-migration` Step 4 PASS).
- `winapp` CLI on PATH (drives + screenshots any packaged app via UI Automation).
- The original UWP **source** is available (the migration skill preserves it; the
  benchmark scenarios point at `...\Samples\<Name>\cs\` + sibling `shared\`).

## Process

### Step 1 — Extract the feature checklist (always)

Derive the ground-truth list of scenarios + controls from the **UWP source**. This
never builds or runs anything, so it always works.

```powershell
& "<skill-root>/scripts/Extract-UwpFeatureChecklist.ps1" `
    -Source "<uwp-cs-source-folder>" `
    -OutDir "<winui3-project-root>/parity/baseline"
```

It writes `parity/baseline/checklist.json` (machine-readable) and
`parity/baseline/info.md` (the same `## Scenario N - <title>` + UI-elements format
the benchmark judge consumes). Read the printed summary — it lists every scenario
and its control count. **That count is your target.**

### Step 2 — Capture the UWP golden screenshots (best-effort, cached)

Screenshots of the *original* UWP app are valuable: they reveal things that reading
the source misses — hidden/disabled controls, default selections, dialog layout, real
text. So capture them when you can. But **running a legacy UWP app is the flaky part**
of this whole process, so this step is best-effort and must degrade gracefully.

**First, reuse any cached goldens.** If `parity/baseline/screenshots/` already exists
(from a prior run or committed into the baseline), do **not** rebuild the UWP app — use
the cached images. The original app is static; capture once, reuse forever.

**Otherwise, try to launch it via the `uwp-app-runner` skill.** It builds, installs
dependencies, registers, and launches the UWP app, returning a structured result:

```powershell
$r = & "<uwp-app-runner-skill>/scripts/Invoke-UwpApp.ps1" `
        -Source "<original-uwp-cs-source-folder>" -Json | ConvertFrom-Json

if ($r.ok) {
    & "<skill-root>/scripts/Capture-AppScenarios.ps1" `
        -App $r.pid `
        -OutDir "<winui3-project-root>/parity/baseline" `
        -Checklist "<winui3-project-root>/parity/baseline/checklist.json"
    # parity/baseline/screenshots/ now holds the golden images — cache them.
} else {
    # Expected for many legacy samples (e.g. crash 0xc000027b / 0xe0434352 at startup).
    Write-Host "UWP golden capture skipped ($($r.stage)): $($r.detail)"
    # Proceed with the source-derived checklist from Step 1 as the baseline.
}
```

> **Do not block on this step.** A live UWP app gives a richer visual reference, but the
> Step 1 checklist (derived from source, always available) is the dependable baseline.
> If the runner reports a `launch` crash, that is a property of the legacy app on this
> OS — not a migration defect — so continue to Step 3.

### Step 3 — Run the WinUI 3 app and capture its scenarios

Launch the migrated app with `winapp run` and capture the **PID** from its output.
Then drive it through the same scenarios:

```powershell
winapp run "<winui3-build-output-folder>"      # note the PID it prints
& "<skill-root>/scripts/Capture-AppScenarios.ps1" `
    -App <winui3-pid> `
    -OutDir "<winui3-project-root>/parity/winui3" `
    -Checklist "<winui3-project-root>/parity/baseline/checklist.json"
```

Navigation is **title-driven** (`winapp ui invoke "<scenario title>"`), so it works
whether your shell is a `NavigationView`, `ListView`, `TabView`, or the UWP-style
`ListBox`. For this to be reliable, the migrated app's nav items must carry the
**same titles** as the source scenarios — keep them verbatim (the migration skill's
navigation invariants already require this).

### Step 4 — Grade parity and fix gaps (mandatory gate)

🛑 **You are not done until `Compare-Parity.ps1` exits 0 (PASS).**

```powershell
& "<skill-root>/scripts/Compare-Parity.ps1" `
    -Checklist "<winui3-project-root>/parity/baseline/checklist.json" `
    -Candidate "<winui3-project-root>/parity/winui3"
```

It writes `parity/winui3/PARITY-REPORT.md` and grades each scenario:

- **pass** — reachable (non-blank screenshot) and ≥80% of the baseline controls
  appear in the captured UIA tree.
- **partial** — reachable and ≥40% coverage. Recognizable but missing controls.
- **fail** — blank/unreachable, or <40% coverage. A dropped or broken scenario.

**For every `partial` / `fail` row:**

1. Open `PARITY-REPORT.md` → read the "Controls not found" list for that scenario.
2. Navigate the running app to that scenario and inspect:
   ```powershell
   winapp ui invoke "<scenario title>" -a <pid>; winapp ui inspect -a <pid> --interactive
   ```
3. Compare `parity/winui3/screenshots/NN_<slug>.png` against the baseline screenshot
   (and the UWP source page) using your own vision — confirm the **visual layout**
   and that each control **does what the UWP handler did**, not just that it exists.
4. Add the missing control / wire up the dead handler in the WinUI 3 page. If a
   control is genuinely unsupported on WinUI 3 desktop, it must already be recorded
   in `MIGRATION-DEFERRED.md` — a deferred scenario is expected to drop, not a defect.
5. Rebuild, re-run Step 3 (re-capture), re-run Step 4. Repeat until PASS.

After PASS, the parity is verified. `parity/baseline/info.md` + screenshots also
double as a reusable behavioral baseline for future regression checks.

## Why structural coverage is necessary but not sufficient

The gate matches a control as "present" when its `AutomationProperties.AutomationId`,
name, or label text appears in the captured UIA tree. That catches the dominant
migration failure — **silently dropped scenarios and controls** — deterministically.
It cannot, by itself, prove a button's *click handler* produces the right result or
that the layout looks right. Those you confirm with the screenshots and the source.
**Set `AutomationProperties.AutomationId` on every interactive control** so the match
is reliable (it also helps the benchmark's own UI checks).

### Controls that don't expose AutomationId through their automation peer

Some WinUI 3 controls silently swallow `AutomationProperties.AutomationId` — it won't
appear in the UIA tree even when set directly on the element. **Wrap these in a
`<Grid>` or `<Border>` and set the `AutomationId` on the wrapper:**

- `MediaPlayerElement`
- `SwapChainPanel`

This is a WinUI 3 automation-peer limitation, not a migration defect. If the parity
checker reports a `MediaPlayerElement` as "not found", add the wrapper — do not waste
time debugging the automation peer or trying alternative property approaches.

## Critical rules

- **Run after the migration build is clean.** Parity on a broken build is noise.
- **Do not rephrase scenario titles.** Title-driven nav and the checklist both key on
  the verbatim source titles. Trivial capitalization/punctuation cleanup only.
- **Do not delete or renumber checklist scenarios** to make the gate pass. A missing
  scenario is a `fail` to fix, not a row to remove. Deferred scenarios belong in
  `MIGRATION-DEFERRED.md`, not deleted from the checklist.
- **Blank screenshot = fail.** A scenario that renders an empty page is
  indistinguishable from a crash. Device-dependent pages must show a visible fallback
  (see `winui-uwp-migration` "Defensive UI") so they capture a non-blank frame.
- **Don't fake coverage with placeholder controls.** A control must be the real,
  wired-up equivalent of the source control, not an empty look-alike.
