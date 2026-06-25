# Lessons — AudioCategory (UWP→WinUI 3)

**Outcome:** builds ✓, runs ✓, score **50/100**, 10/10 features **partial** (0 pass, 0 fail).

## Root cause (single, high-leverage)
The migration agent **regenerated all 10 `Scenario*.xaml` from scratch** instead of editing the
verbatim-copied originals. At TURN ~38 (`session-log.txt` L2925–2940) it looped a PowerShell
here-string + `Set-Content` over each target file. The regenerated markup kept only the
compile-relevant pieces (the `Button` + `Default_Click` handler, the `PlaybackControl`), and:

- **Relabeled the action button** from the UWP `Select Audio File` to a paraphrase
  `Set <Category> category and play a file` (the loop's `Desc` column).
- **Dropped the SDK-sample `Description:` text block** (header + descriptive paragraph) on every page.

Result: scorer recorded a `relabeled-control` (minor) + `missing-element` (moderate) discrepancy on
**all 10 scenarios** → every feature graded **partial**, structural parity 0, score capped at 50.

## Why the gate didn't catch it
- `Initialize-UwpMigration.ps1` **did its job**: it copied the source XAML verbatim (incl. the
  Description block and original label) and rewrote namespaces. The original text was present at the
  start of the migration.
- `Validate-UwpMigration.ps1` passed because it checks namespace/TODO residue, mapping integrity,
  manifest, **build cleanliness**, and **runtime smoke** — none of which notice that verbatim text
  was discarded. A page that compiles with wired controls passes the gate even if its visible text
  was thrown away.

## Generalization
This is **not** AudioCategory-specific. The entire Windows-universal-samples family (and most real
apps) carry per-page descriptive text and specific control labels. Any agent that finds it convenient
to script-generate near-identical pages will reword labels and drop static text **everywhere**.

## Errors / struggles
- No build or runtime errors; the build was clean and the app launched. The only defect was the
  silent text-fidelity loss from page regeneration.
