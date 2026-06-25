# Discrepancies — AudioCategory (UWP vs WinUI 3)

**Score 50/100** — builds ✓, runs ✓, 10/10 features **partial** (0 pass, 0 fail).

Every scenario shows the same two fidelity gaps, both from the agent regenerating the scenario pages:

| # | Scenario | Status | Discrepancy |
|---|----------|--------|-------------|
| 1 | Movie | partial | button relabeled `Select Audio File`→`Set Movie category and play a file`; `Description:` block dropped |
| 2 | Media | partial | same pattern |
| 3 | Game Chat | partial | same pattern |
| 4 | Speech | partial | same pattern |
| 5 | Communications | partial | same pattern |
| 6 | Alerts | partial | same pattern |
| 7 | Sound Effects | partial | same pattern |
| 8 | Game Effects | partial | same pattern |
| 9 | Game Media | partial | same pattern |
| 10 | Other | partial | same pattern |

## Visual discrepancies
- **Action button label (all):** UWP `Select Audio File` → WinUI `Set <Category> category and play a file`.
- **Scenario Description block (all):** UWP `Description:` header + paragraph → omitted in WinUI.

## Missing features
- Per-scenario `Description:` text block (header + paragraph).

## Summary
Build/runtime clean; only loss is **text fidelity** from page regeneration. Root cause = coverage gap
in the verbatim-XAML rule (compile-centric rationale) + no validator guard for dropped visible text.
Both addressed (SKILL.md wording + bootstrap snapshot/validator WARN).
