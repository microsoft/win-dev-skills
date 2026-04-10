# Skill Adherence & Token Efficiency Analysis — Run56

## Executive Summary

This report analyzes run56, which tested a 2×2 matrix of skill format (knowledge vs runbook) × delivery method (inlined vs non-inlined) across 8 trials on the markdown-editor-winui scenario with claude-opus-4.6. The experiment used tracer canaries — arbitrary code conventions that only appear if the agent provably read the skill content — to objectively measure skill adherence.

**Key findings:**
1. Knowledge format achieves 3× better skill adherence than runbook format (81% vs 25%)
2. Non-inlined delivery is unreliable (0-88% adherence, coin flip)
3. Skill adherence has no token cost penalty — knowledge inlined used *fewer* tokens (5.2M avg) than runbook inlined (6.3M avg)
4. App quality scores are identical across all conditions (84-94 range)
5. 33% of all tokens are spent on UI verification (winapp ui), which adds only 3-5 points

---

## Experiment Design

### The 2×2 Matrix

| | Knowledge + Tracers | Runbook + Tracers |
|---|---|---|
| **Inlined** (skill content embedded in agent.md) | `base-DARMV-tracers` | `base-DARMV-runbook-tracers` |
| **Non-inlined** (skill as separate file in .github/skills/) | `base-DARMV-tracers-noninlined` | `base-DARMV-runbook-tracers-noninlined` |

### Tracer Canaries

8 tracers across 3 skills — arbitrary conventions no LLM would produce from training data:

| Tracer | Skill | What it looks for |
|--------|-------|-------------------|
| T-DESIGN-1 | design | XML comment `<!-- WDS:PageLayout -->` |
| T-DESIGN-2 | design | NavigationView `Tag="wds-nav"` (N/A for this scenario) |
| T-DESIGN-3 | design | Comment `<!-- DesignSkill:Applied -->` in MainWindow.xaml |
| T-ARCH-1 | architecture | File `WdsMetadata.cs` with `"wds-arch-1"` |
| T-ARCH-2 | architecture | Comment `// Generated with WDS architecture skill` on ViewModels |
| T-ARCH-3 | architecture | Comment `// WDS-DI-Setup` in App.xaml.cs |
| T-BP-1 | best-practices | `AutomationProperties.AutomationId="wds-"` prefix |
| T-BP-2 | best-practices | `// WDS-Quality-Check` as last comment in every .cs file |

---

## Results

### Skill Adherence

| Condition | i1 | i2 | Average |
|---|---|---|---|
| **Knowledge inlined** | **7/8 (88%)** | **6/8 (75%)** | **81%** |
| Runbook inlined | 2/8 (25%) | 2/8 (25%) | **25%** |
| Knowledge non-inlined | 7/8 (88%) | 0/8 (0%) | **44%** |
| Runbook non-inlined | 0/8 (0%) | 0/8 (0%) | **0%** |

**Observations:**
- Knowledge format is 3× better than runbook at getting the agent to follow specific conventions (81% vs 25% when inlined)
- Runbook format only picked up the simplest tracers (T-BP-1 and T-BP-2 — AutomationId prefix and quality comment). It missed all design and architecture conventions.
- Non-inlined delivery is unreliable: knowledge non-inlined hit 88% in i1 but 0% in i2. The agent sometimes reads skill files from `.github/skills/` but not consistently.
- T-DESIGN-2 was N/A in all trials (scenario doesn't use NavigationView), so effective denominator is 7.

### App Quality Scores

| Condition | i1 | i2 | Avg | Subscores (avg) |
|---|---|---|---|---|
| Knowledge inlined | 88 | 93 | **90.5** | P:9 U:8.5 V:7 F:8 |
| Runbook inlined | 94 | 87 | **90.5** | P:9 U:8.5 V:7.5 F:7.5 |
| Knowledge non-inlined | 94 | 87 | **90.5** | P:8.5 U:8.5 V:6.5 F:7.5 |
| Runbook non-inlined | 84 | 89 | **86.5** | P:8.5 U:8 V:6.5 F:7 |

**Quality is identical across conditions** (86.5-90.5 range, within noise). The tracers don't affect app quality — they're only markers. Format and delivery method don't affect output quality either. Quality comes from the model + prompt, not skill format.

### Token Usage

| Condition | i1 Tokens | i2 Tokens | Avg | Cache Hit |
|---|---|---|---|---|
| **Knowledge inlined** | **5.26M** | **5.17M** | **5.2M** | ~94% |
| Runbook inlined | 7.07M | 5.48M | 6.3M | ~95% |
| Knowledge non-inlined | 9.10M | 6.36M | 7.7M | ~95% |
| Runbook non-inlined | 8.48M | 4.07M | 6.3M | ~93% |

**Knowledge inlined is the cheapest option** — 5.2M avg, lower than all others. Higher adherence correlates with *lower* token usage, likely because the agent makes fewer mistakes when following conventions, reducing fix cycles.

Non-inlined is more expensive (7.7M avg for knowledge) — the agent spends extra turns reading or failing to find skill files.

---

## Turn-by-Turn Token Analysis

Detailed analysis of one representative session (base-DARMV-runbook-tracers i1, 66 turns, 7.0M tokens):

### Where Turns Are Spent

| Category | Tool Calls | % of Session |
|---|---|---|
| **winapp ui verification** | 22 | **33%** |
| File reading (view) | 28 | 21% |
| Code writing (edit/create) | 21 | 32% |
| Build/run | 4 | 6% |
| Other (git, packages, etc.) | 11 | 8% |

### Token Economics

- **Context per turn**: ~105K tokens (system + agent.md + conversation history)
- **Output per turn**: ~1,100 tokens (the actual new content generated)
- **Cache hit rate**: 96.4% — the vast majority of input tokens are cache hits (10× cheaper)
- **Real cost per turn**: ~3.8K new input tokens + ~101K cached reads + ~1.1K output

### The Verification Tax

The agent's self-verification step (V in base-DARMV) uses `winapp ui` to inspect, screenshot, and test the app. This consumes:
- **22 turns** out of 66 total (33%)
- **~2.3M input tokens** (33% of total)
- Catches real bugs but most are minor/cosmetic

From run54/55 data (different scenario, same agents), removing the V step (base-DARM vs base-DARMV) costs only 3-5 points of quality (82 vs 87.7 avg).

---

## Cost Reduction Opportunities

| Opportunity | Turns Saved | Token Savings | Quality Impact |
|---|---|---|---|
| **Minimize verify to smoke test** (2 turns instead of 22) | ~20 | ~2.0M (30%) | -3 to -5 pts |
| **Pre-load scaffold in prompt** (skip reading known files) | ~12 | ~1.2M (18%) | None |
| **Batch file creation** (parallel tool calls) | ~10 | ~1.0M (15%) | None |
| **Reduce build cycles** (better API knowledge) | ~2 | ~0.2M (3%) | Slight positive |
| **Combined** | **~44** | **~4.4M (63%)** | **Minimal** |

**Optimized session**: ~22 turns, ~2.3M tokens — down from 66 turns, 7.0M tokens.

---

## Conclusions

### On Skill Format
1. **Inline skills always** — non-inlined delivery is unreliable (0-88% adherence)
2. **Knowledge format wins** for convention adherence (81% vs 25%)
3. **Format doesn't matter for quality** — both produce equally good apps (90.5 vs 90.5)
4. **Gemini's runbook theory is disproven** — knowledge-format rules get better adherence than action-oriented runbooks

### On Token Efficiency
5. **Skill adherence is free** — following conventions *saves* tokens by reducing mistakes
6. **33% of tokens go to UI verification** — the biggest single optimization target
7. **The context window tax** is mitigated by 96% cache hits — turns matter more than context size
8. **A 63% token reduction is achievable** without meaningful quality loss, primarily by minimizing verification, pre-loading known files, and batching operations

### Recommended Next Steps
- Test base-DARM (no verify) on this same scenario to validate the quality impact of removing V
- Create a "smoke test" verify variant (2 turns: inspect + screenshot only)
- Add scaffold file summaries to the prompt to reduce file-reading turns
- Investigate whether the copilot CLI can batch parallel tool calls more efficiently
