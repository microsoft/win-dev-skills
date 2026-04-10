# Agent Optimization Report: Markdown Editor Benchmark

## Summary

Over 20 benchmark runs, we evolved from a v1 section-composed agent architecture to a v2 lean agent + opt-in skills model. Token efficiency improved by **60%** (5.5M → 2.2M) while maintaining scores within 3-4 points. The best single trial achieved v1-quality at **1/4 the token cost**.

## Results Timeline

| Run | Condition | Score | Tokens | Turns | Time | Era |
|-----|-----------|-------|--------|-------|------|-----|
| run6 | base-DARMV-tracers i1 | 88 | 7.1M | 116 | 37m | v1 |
| run6 | base-DARMV-tracers i2 | 88 | 5.0M | 74 | 28m | v1 |
| run6 | base-DARMV-runbook i1 | 89 | 4.9M | 80 | 28m | v1 |
| run6 | base-DARMV-runbook i2 | 88 | 5.0M | 89 | 35m | v1 |
| run10 | base-DARMV-turnopt | 85 | 3.3M | 53 | 48m | v1-turnopt |
| run19 | winui3+design | **89** | **1.6M** | 40 | 13m | **v2 (best)** |
| run20 | winui3-base i1 | 86 | 1.6M | 35 | 15m | v2 |
| run20 | winui3-base i2 | 90 | 2.2M | 50 | 19m | v2 |
| run20 | winui3-base i3 | 77 | 2.9M | 46 | 23m | v2 |
| run20 | winui3+design i1 | 86 | 2.0M | 42 | 16m | v2 |
| run20 | winui3+design i2 | 81 | 2.2M | 37 | 17m | v2 |
| run20 | winui3+design i3 | 87 | 5.2M | 72 | 28m | v2 (outlier) |
| run20 | winui3+d+a+v i1 | 85 | 8.3M | 102 | 31m | v2-full |
| run20 | winui3+d+a+v i2 | 89 | 11.6M | 159 | 49m | v2-full |
| run20 | winui3+d+a+v i3 | 82 | 9.9M | 109 | 45m | v2-full |

## Aggregated Comparison

| Configuration | Avg Score | Avg Tokens | Avg Turns | Avg Time | Token Efficiency |
|---------------|-----------|------------|-----------|----------|-----------------|
| v1 (run6, section composition) | **88.3** | 5.5M | 90 | ~32m | baseline |
| v2 base (run20, no skills prompted) | 84.3 | **2.2M** | 44 | ~19m | **-60%** |
| v2 +design (run20) | 84.7 | 3.1M | 50 | ~20m | -44% |
| v2 +design+arch+verify (run20) | 85.3 | 10.0M | 123 | ~42m | +82% (worse) |
| v2 +design (run19, best single) | **89** | **1.6M** | 40 | 13m | **-71%** |

## Score vs Token Efficiency

```
Score ▲
  90 ─ ■(v2 base)──────────────────────────────────────────────
  89 ─ ■(v2 best)──────────────■(v1)────────────────────────────
  88 ─ ─────────────────────────────■(v1)───────■(v1)───────────
  87 ─ ─────────────────────────────────────────────────────────
  86 ─ ■■(v2)──────────────────────────────────────────────────
  85 ─ ──────────■(turnopt)─────────────────────────■(v2 full)─
  84 ─ ─────────────────────────────────────────────────────────
     └──┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬───►
       1M     2M     3M     4M     5M     6M     7M     8M+
                           Tokens
```

The ideal operating point is **top-left**: high score, low tokens. v2 base/design clusters at 84-90 score with 1.6-3M tokens. v1 clusters at 88-89 score with 5-7M tokens. v2-full is bottom-right — worst efficiency.

## Where Turns Are Spent

| Phase | v2 base (44 turns) | v2 +design (50 turns) | v2 +d+a+v (123 turns) | v1 (90 turns) |
|-------|-------------------|----------------------|----------------------|--------------|
| Skill reads | 1 (2%) | 2 (4%) | 4 (3%) | 0 |
| File reads | 15 (34%) | 19 (38%) | 20 (16%) | ~15 (17%) |
| Code create/edit | 17 (39%) | 15 (30%) | 25 (20%) | ~20 (22%) |
| Build/Run | 6 (14%) | 7 (14%) | 11 (9%) | ~6 (7%) |
| Verify | 0 (0%) | 0 (0%) | **35 (28%)** | **~35 (39%)** |
| Other | 4 (9%) | 7 (14%) | 28 (23%) | ~14 (16%) |

**Key finding**: The verify skill adds ~60 turns (35 verify + 25 interaction testing) for only +1 point of score. This is the single biggest token sink.

## Outlier Analysis

Two patterns cause outlier trials (2-3x normal tokens):

### 1. Code Analyzer Loop (~20 extra turns, ~1.6M tokens)
The `check.ps1` script in the dev-workflow skill gets discovered and run autonomously. The agent re-reads source files repeatedly to fix analyzer warnings, often for marginal quality improvement.

*Example: run20 winui3+design i3 — 72 turns (vs 37-42 normal) due to 20-turn analyzer loop.*

### 2. BuildAndRun.ps1 Confusion (~4-6 extra turns, ~400K tokens)
Agents read the script 2-3 times trying to understand parameters, struggle with `-Detach`, and fall back to raw `winapp run`.

*Example: run20 winui3-base i3 — 46 turns (vs 35 normal) due to script confusion + Markdig version issue.*

## Key Findings

### 1. Inlined skills work, non-inlined don't (unless prompted)
- **Tracer experiment (run6)**: 100% adherence when skill content is in the agent prompt
- **User-prompted skills work**: Agent reads skill when user says "please use the X skill"
- **Auto-discovery fails**: Agents ignore installed skills they weren't told to use

### 2. More skills ≠ better quality
- Adding design skill: +0.4 score, +40% tokens
- Adding architecture: no score improvement, +60% more build cycles
- Adding verify: +1 score, +350% tokens (60 extra turns)

### 3. The base agent is surprisingly effective
- v2 base scores 84-90 with zero skills prompted
- The model already knows WinUI 3 from training data
- The agent prompt's compact rules (MVVM, x:Bind, anti-patterns) are sufficient for most tasks

### 4. Token cost is driven by turns, not prompt size
- v1 prompt: ~3,700 tokens/turn (20KB agent)
- v2 prompt: ~1,800 tokens/turn (10KB agent)
- Prompt size difference: only 6% of total token gap
- Turn count difference: 93% of total token gap

## Architecture Evolution

### v1: Section Composition
- 23 agent configs combining sections (base, design, architecture, research, metadata, verify)
- Each section inlined into the agent prompt
- Skills also inlined via `inline_skills: true`
- **Pro**: High quality (88-89), comprehensive
- **Con**: 5-7M tokens, 30+ minutes, complex configuration

### v2: Lean Agent + Opt-in Skills
- 1 base agent (~10KB, ~1,800 tokens)
- 12 skills as separate plugin files
- User activates skills by mentioning them in their prompt
- **Pro**: 2.2M tokens, ~19 minutes, simple configuration
- **Con**: 3-4 points lower average score (84 vs 88)

## Recommendations

1. **Ship v2 base as the default agent** — 84+ scores at 2M tokens is excellent value
2. **Recommend design skill for new UI tasks** — marginal score improvement at reasonable token cost
3. **Don't prompt verify by default** — 60 extra turns for +1 point is poor ROI
4. **Let users opt-in to skills** — they can say "use the design skill" when they want deeper guidance
5. **Address outlier causes** — the code analyzer and BuildAndRun.ps1 confusion are fixable
6. **Run more trials** — n=3 per condition has high variance; n=5+ would give more confidence

## Data Sources

- Benchmark runs: run6 through run20 in `agent-benchmark/results/`
- Tracer system: `agent-benchmark/common/tracers.json` + `Detect-Tracers.ps1`
- Token recovery: from `~/.copilot/session-state/*/events.jsonl` for trials with missing CLI output
- All analysis performed with claude-opus-4.6 on markdown-editor-winui scenario
