# Skill-coverage-gaps — AudioCategory

## 1. Verbatim-XAML rule is compile-centric → agent regenerated pages and lost visible text
- **Problem:** Agent rebuilt all 10 `Scenario*.xaml` via a scripted `Set-Content` loop, relabeling the
  action button (`Select Audio File` → `Set <Category> category and play a file`) and dropping the
  `Description:` text block on every page. 10/10 partial, score 50/100.
- **Evidence:** `session-log.txt` L2925–2940 (bulk loop authoring Scenario1..10 with `Content="$desc"`,
  no Description block); `migration-score.json` (all partial); `discrepancies.json` (relabeled-control +
  missing-element ×10).
- **Covered at:** SKILL.md → Critical Rules → Fidelity: *"Do not regenerate XAML from scratch. Copy each
  `*.xaml` verbatim, then transform — controls, names, and event handlers must be preserved so the
  code-behind continues to compile."*
- **Why missed:** under-emphasized/ambiguous — the rationale is compile-centric and lists only
  controls/names/handlers. Preserving exactly those while regenerating the file *satisfies the literal
  rule* yet still rewords labels and drops static text (which don't affect compilation). Nothing forbids
  whole-file `Set-Content` overwrites.
- **Proposed improvement:** make verbatim preservation explicitly cover ALL user-visible/static text
  (Content/Text/Header/Title + descriptive paragraphs), and explicitly forbid regenerating/overwriting
  whole XAML files — edit the verbatim copy in place. Reinforce via a new validator fidelity WARN.
- **Generalizes:** every UWP app / SDK sample carries descriptive text and specific labels; the loss
  recurs on every page of every scenario.
