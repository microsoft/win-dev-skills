# Agent Benchmark Report — WinUI 3 | markdown-editor | opus4.6 | 4-8-2026

> **15 trials · 1 scenario · 5 agent variants · 1 model · Windows / WinUI 3**
>
> Run date: 2026-04-08 · Concurrency: 3 · Max build time: 60 min · Iterations: 3

---

## 1. Executive Summary

Run 1 is a **focused ablation study** testing all five WinUI 3 agent variants on a single complex scenario (markdown editor) using a single model (Claude Opus 4.6). The goal: isolate the contribution of each composable prompt section — Design (D), Architecture (A), Metadata (M), and Verify (V) — to final app quality.

### Key Findings

1. **`base-only` and `base-DA` are statistically tied at ~87 avg.** Both achieve excellent scores with 100% build and run rates. `base-only` is the most consistent (σ=0.9) while `base-DA` achieves the highest single-trial score (90).

2. **`base-only` is the most consistent performer.** Scores of 88, 88, 86 — just a 2-point spread, the tightest of any variant. Minimal instructions let the agent focus entirely on implementation.

3. **Design-only (`base-D`) is unreliable.** Average of 62.0 with scores of 86, 16, 84 — massive variance (σ=32.5). Trial 2 completed in just 9 minutes with a score of 16, suggesting the agent sometimes interprets design instructions as license to shortcut implementation.

4. **The full stack (`base-DAMV`) actively harms performance.** Average 32.7 with scores of 10, 0, 88 — the worst base variant. At 47.3 minutes average, it's also the slowest. Instruction overload appears to confuse the agent, and verification loops can introduce regressions.

5. **`bare` demonstrates strong baseline knowledge but unreliable execution.** One trial scored 87 while two scored 0. The agent always builds successfully (100%) but only runs 33% of the time — without scaffolding guidance, runtime configuration is a coin flip.

---

## 2. Methodology

### 2.1 Benchmark Flow

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  1. Scaffold  │ ──▶ │  2. Copilot Build │ ──▶ │  3. dotnet    │ ──▶ │  4. Launch    │ ──▶ │  5. Validate  │ ──▶ │ 6. Score│
│  (dotnet new) │     │  (autopilot mode) │     │  build verify │     │  (run .exe)   │     │  (AI inspect) │     │ (0-100) │
└──────────────┘     └──────────────────┘     └───────────────┘     └──────────────┘     └──────────────┘     └─────────┘
```

1. **Scaffold** — Empty directory; agent uses `dotnet new` to create a WinUI 3 project
2. **Copilot Build** — GitHub Copilot CLI runs in autopilot mode with the scenario prompt and agent instructions
3. **dotnet build Verify** — The harness independently rebuilds with `dotnet build` to confirm compilation
4. **Launch** — The built executable is launched and the harness waits for a window
5. **Validate** — An AI validator inspects the running app via UI Automation, checking each requirement against the actual UI
6. **Score** — A composite 0–100 score is computed from build success, quality assessments, and requirements coverage

### 2.2 Scoring System (0–100)

| Component | Points | Source |
|-----------|--------|--------|
| **Base** (app runs) | 10 | Binary: app window detected = 10, otherwise 0 |
| **Quality** (4 categories) | 0–40 | AI validator scores: project structure (0–10), UI layout (0–10), visual design (0–10), functionality (0–10) |
| **Requirements** (pass ratio) | 0–50 | `round(50 × passed / total)` — each scenario defines a requirements list |

**Total** = Base (10) + Quality (0–40) + Requirements (0–50) = **0–100**

### 2.3 Scenario

| Scenario | ID | What It Tests | Requirements | Complexity |
|----------|-----|--------------|-------------|------------|
| **Markdown Editor** | `mew58` | Full tabbed markdown editor: TabView, open/save/save-as, unsaved-changes prompt, split editor+WebView2 live preview, find with highlight, view modes, status bar, JumpList, undo/redo, Settings | 14 | High |

### 2.4 Model Tested

| Model | Short ID | Notes |
|-------|----------|-------|
| **Claude Opus 4.6** | `o46` | Premium tier, highest reasoning capability |

---

## 3. Agent Variants Tested

### 3.1 Composable Agent System

Agents are assembled from mix-and-match sections, following the composable pattern used across WinUI 3 and SwiftUI benchmarks:

```
bare      (no sections — raw copilot + prompt only)
base-only (dotnet new workflow, WinUI 3 best practices, build/run commands)
  + D: Design (Fluent Design System, WinUI 3 design patterns, layout guidance)
    + A: Architecture (MVVM with CommunityToolkit.Mvvm, DI, project structure)
      + M: Metadata (winmd API search — verifying Windows API surface before calling)
        + V: Verify (UI Automation — build/run/screenshot/inspect verification workflow)
```

### 3.2 Agent Variant Table

| Variant | Sections | Description |
|---------|----------|-------------|
| **bare** | _(none)_ | No scaffolding, no agent — just copilot + prompt |
| **base-only** | `base` | Base only — dotnet new workflow, WinUI 3 patterns, build/run |
| **base-D** | `base`, `design` | Base + Fluent Design guidance |
| **base-DA** | `base`, `design`, `architecture` | Base + design + MVVM architecture patterns |
| **base-DAMV** | `base`, `design`, `architecture`, `metadata`, `verify` | Base + design + architecture + API metadata + UI Automation verification |

---

## 4. Results Summary

### 4.1 Overall Rankings

| Rank | Agent | Avg Score | Min | Max | Spread | Build Rate | Run Rate | Avg Time |
|------|-------|-----------|-----|-----|--------|------------|----------|----------|
| 1 | **base-only** | **87.3** | 86 | 88 | 2 | 100% | 100% | 30.7m |
| 2 | **base-DA** | **87.0** | 82 | 90 | 8 | 100% | 100% | 36.2m |
| 3 | **base-D** | 62.0 | 16 | 86 | 70 | 100% | 100% | 21.9m |
| 4 | **base-DAMV** | 32.7 | 0 | 88 | 88 | 100% | 67% | 47.3m |
| 5 | **bare** | 29.0 | 0 | 87 | 87 | 100% | 33% | 40.0m |

### 4.2 Per-Trial Detail

#### base-only (Avg: 87.3)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | **88** | ✅ | ✅ | 29m 34s |
| 2 | **88** | ✅ | ✅ | 32m 20s |
| 3 | 86 | ✅ | ✅ | 30m 18s |

#### base-DA (Avg: 87.0)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | 89 | ✅ | ✅ | 29m 22s |
| 2 | 82 | ✅ | ✅ | 44m 37s |
| 3 | **90** | ✅ | ✅ | 34m 44s |

#### base-D (Avg: 62.0)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | 86 | ✅ | ✅ | 30m 21s |
| 2 | ⚠️ 16 | ✅ | ✅ | 8m 58s |
| 3 | 84 | ✅ | ✅ | 26m 30s |

#### base-DAMV (Avg: 32.7)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | ⚠️ 10 | ✅ | ✅ | 41m 23s |
| 2 | ❌ 0 | ✅ | ❌ | 47m 12s |
| 3 | **88** | ✅ | ✅ | 53m 20s |

#### bare (Avg: 29.0)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | ❌ 0 | ✅ | ❌ | 55m 24s |
| 2 | ❌ 0 | ✅ | ❌ | 42m 6s |
| 3 | **87** | ✅ | ✅ | 22m 37s |

---

## 5. Detailed Analysis

### 5.1 Composable Agent Layer Analysis

```
bare ──(+base)──▶ base-only ──(+D)──▶ base-D ──(+A)──▶ base-DA ──(+M+V)──▶ base-DAMV
 29.0                 87.3               62.0              87.0                  32.7
```

| Transition | Score Delta | Interpretation |
|-----------|------------|----------------|
| bare → base | **+58.3** | **Base scaffolding is transformative.** Without `dotnet new` workflow guidance and WinUI 3 patterns, the agent builds successfully but can't reliably make the app run. |
| base → base+D | **−25.3** | **Design-only guidance is destabilizing.** The design section without architecture creates an unstable middle ground — one trial completed in 9 minutes with a score of 16. |
| base+D → base+DA | **+25.0** | **Architecture rescues design.** Adding MVVM/DI guidance to design restores quality to base-only levels. Architecture grounds the agent's focus back on functional structure. |
| base+DA → base+DAMV | **−54.3** | **Instruction overload is catastrophic.** Adding metadata + verify sections drops the score by 54 points. The heaviest variant performs worse than bare on average. |

**Key insight:** For WinUI 3 apps with Opus 4.6, **minimal, well-structured guidance dramatically outperforms both no guidance and excessive guidance.** The base section alone provides sufficient implicit knowledge. Adding more prompt sections produces diminishing and eventually negative returns.

### 5.2 Why Design-Only Fails

The `base-D` variant scored 16/100 in trial 2 despite building and running successfully. Analysis:

- Trial 2 completed in just **8m 58s** — less than a third of the average for other conditions
- **Hypothesis:** The design section emphasizes Fluent Design patterns (typography, spacing, materials, controls), causing the agent to interpret design completion as sufficient and skip deep implementation of the 14 required features
- **Evidence:** Trials 1 and 3 scored 86 and 84 when the agent took 26–30 minutes, showing the design section *can* work when the agent doesn't shortcut
- **Pattern match:** This mirrors the SwiftUI-D result (avg 34.0 with bimodal scores) — design-only instructions create instability across both platforms

### 5.3 Why the Full Stack Hurts

The `base-DAMV` variant includes the most instructions but produced the worst base-variant results. Analysis:

- **Time cost:** Average 47.3m vs 30.7m for base-only — a 54% time premium
- **Run failure:** Trial 2 built successfully but failed to launch (score 0), the only base variant with a run failure
- **Regression risk:** Trial 1 scored only 10 — the app ran but core features were missing, suggesting the verification loop consumed the agent's time budget without productive implementation
- **When it works:** Trial 3 scored 88, matching base-only's best — but 2/3 trials failed, making this a high-risk configuration
- **Interpretation:** The M (metadata) and V (verify) sections likely cause the agent to spend time on API verification and UI testing loops rather than productive implementation, creating conflicting priorities

### 5.4 The Build vs Run Gap

A distinctive feature of WinUI 3 benchmarking: **all conditions achieve 100% build success**, but run rates vary dramatically:

| Condition | Build Rate | Run Rate | Gap |
|-----------|-----------|----------|-----|
| base-only | 100% | 100% | 0% |
| base-DA | 100% | 100% | 0% |
| base-D | 100% | 100% | 0% |
| base-DAMV | 100% | 67% | 33% |
| bare | 100% | 33% | 67% |

The build pipeline (dotnet build) is robust, but runtime configuration — app manifests, XAML initialization, window activation — is the bottleneck. This suggests agents need guidance on runtime setup, not just compilation.

### 5.5 Comparison with SwiftUI Run 9

Both studies used the same methodology (markdown editor, Opus 4.6, 3 iterations) on their respective platforms:

| Metric | SwiftUI (Run 9) | WinUI 3 (Run 1) |
|--------|-----------------|------------------|
| Best variant | swiftui-base (79.3) | **base-only (87.3)** |
| Best single trial | 86 | **90** |
| D effectiveness | −45.3 (harmful) | −25.3 (harmful) |
| DA effectiveness | +40.3 from D | +25.0 from D |
| Full stack (V) effectiveness | −20.6 from DA | **−54.3 from DA** |
| bare builds | 0% | **100%** |
| bare runs | 0% | 33% |
| Build tool | XcodeGen + xcodebuild | dotnet new + dotnet build |

**Platform differences:**
- WinUI 3 achieves higher absolute scores (87.3 vs 79.3) — Opus 4.6 appears to have stronger WinUI 3 / C# knowledge than SwiftUI/macOS
- WinUI 3 `bare` always builds (100%) while SwiftUI `bare` never does (0%) — `dotnet new` creates a valid project template more reliably than XcodeGen without guidance
- The instruction overload effect is **more severe on WinUI 3** (−54.3 vs −20.6) — possibly because WinUI 3 has more configuration surface area (XAML, manifests, packaging) for the agent to get confused by

---

## 6. Score Distribution

### 6.1 Score Histogram

```
90-100: ■          (1 trial — DA i3: 90)
80-89:  ■■■■■■     (6 trials — base i1:88, base i2:88, DA i1:89, D i1:86, D i3:84, bare i3:87)
                          (+ base i3:86, DA i2:82, DAMV i3:88 — 9 total in 80-89)
70-79:              (0 trials)
60-69:              (0 trials)
50-59:              (0 trials)
40-49:              (0 trials)
30-39:              (0 trials)
20-29:              (0 trials)
10-19:  ■■         (2 trials — D i2:16, DAMV i1:10)
 0-9:   ■■■        (3 trials — bare i1:0, bare i2:0, DAMV i2:0)
```

**Bimodal distribution:** Results cluster around 82-90 (successful) or 0-16 (failed). There is no middle ground — agents either build a good app or produce essentially nothing useful. The gap between the lowest success (82) and highest failure (16) spans 66 points.

### 6.2 Corrected Score Histogram

```
90-100: ■          (1)
80-89:  ■■■■■■■■■  (9)
70-79:              (0)
60-69:              (0)
50-59:              (0)
40-49:              (0)
30-39:              (0)
20-29:              (0)
10-19:  ■■         (2)
 0-9:   ■■■        (3)
```

9 of 15 trials (60%) scored 82+. The remaining 5 (33%) scored ≤16. This stark bimodality means **when agents succeed, they succeed well — and when they fail, they fail completely.**

---

## 7. Time Efficiency

### 7.1 Time vs Score

| Agent | Avg Time | Avg Score | Score/Minute |
|-------|----------|-----------|--------------|
| **base-D** | 21.9m | 62.0 | **2.83** |
| **base-only** | 30.7m | 87.3 | **2.84** |
| **base-DA** | 36.2m | 87.0 | **2.40** |
| **bare** | 40.0m | 29.0 | 0.73 |
| **base-DAMV** | 47.3m | 32.7 | 0.69 |

**base-only has the best score-per-minute ratio** (2.84 pts/min), narrowly beating base-D (2.83). However, base-D's high variance makes it unreliable despite its speed. base-only delivers **both** the best efficiency and the best reliability.

### 7.2 Time vs Reliability

An inverse correlation emerges: the more time agents spend, the less reliable they become (outside the base-only sweet spot):

```
Time ──────────────────────────────────────────▶
21.9m         30.7m         36.2m         40.0m         47.3m
base-D        base-only     base-DA       bare          base-DAMV
62.0 avg      87.3 avg      87.0 avg      29.0 avg      32.7 avg
σ=32.5        σ=0.9         σ=3.6         σ=41.2        σ=40.1
```

The fastest (base-D) and slowest (bare, base-DAMV) conditions show the highest variance. The middle ground (base-only at 30.7m, base-DA at 36.2m) is the reliability sweet spot.

---

## 8. Common Issues

1. **Run failures are the critical bottleneck** — all 5 conditions achieve 100% build success, but scores of 0 always correlate with `Runs: false`. Runtime configuration (XAML, manifests, window activation) is harder than compilation.
2. **Instruction overload degrades performance** — base-DAMV (most instructions) scores worse than bare (no instructions) on average. More guidance ≠ better outcomes.
3. **Design section without architecture creates instability** — base-D's bimodal distribution (86/16/84) shows the design section can cause premature completion or shallow implementation.
4. **Premature termination pattern** — base-D trial 2 finished in 9 minutes (vs 22-30m for others) with a score of 16. The agent interpreted partial instructions as sufficient.
5. **Verification loops cause regressions** — base-DAMV trial 1 scored 10 despite 41 minutes of work, suggesting the verify cycle undid working features while fixing others.

---

## 9. Recommendations

### 9.1 Immediate Actions

1. **Use `base-only` as the default** for Opus 4.6 — highest average score (87.3), best consistency (σ=0.9), best time efficiency (2.84 pts/min), and 100% reliability
2. **Use `base-DA` when task complexity demands architectural guidance** — achieves the highest single score (90) with strong consistency (σ=3.6), accepting an 18% time premium
3. **Eliminate `base-D`** — design-only is unreliable (σ=32.5) and strictly dominated by both base-only and base-DA

### 9.2 Improvements Needed

4. **Redesign the M and V sections** — the metadata + verify combination causes a −54.3 point drop from base-DA; consider lighter verification that prevents undoing working features
5. **Investigate the premature termination pattern** — understand why base-D trial 2 completed in 9 minutes and implement guardrails against early stopping
6. **Improve runtime reliability for bare** — the agent has strong WinUI 3 knowledge (87 when it works) but needs minimal guidance on runtime configuration (manifests, XAML initialization)

### 9.3 Future Experiments

7. **Test with Claude Sonnet 4.6 and GPT-5.4** — determine whether the instruction-overload sensitivity is model-dependent
8. **Test `base-A` (architecture-only)** — isolate architecture's independent contribution without the design section
9. **Test on simpler scenarios (counter)** — validate whether base-only's advantage holds on simple apps or is specific to complex scenarios
10. **Increase trial count to 5+** — better distinguish base-only vs base-DA statistical significance (currently tied at ~87)
11. **Consider model-adaptive agent selection** — use base-only for Opus, potentially DA or DAMV for weaker models that benefit from more structure

---

## 10. Conclusion

Run 1 reveals that **minimal, well-structured guidance dramatically outperforms both no guidance and excessive guidance** for Claude Opus 4.6 on WinUI 3 tasks. The `base-only` variant — with just dotnet new workflow commands and WinUI 3 best practices — achieves the highest average score (87.3), tightest consistency (σ=0.9), and best time efficiency (2.84 pts/min).

This parallels the SwiftUI Run 9 finding where `swiftui-base` also won. The pattern is clear: **Opus 4.6 has sufficient implicit knowledge of both platforms that explicit design and architecture guidance adds noise rather than signal.** The verify/metadata layers are actively counterproductive, adding 54% more time while dropping scores by 54 points.

The composable agent system works, but the optimal configuration for Opus 4.6 is the simplest one. The path forward is **model-adaptive agent selection**: minimal prompts for capable models, richer prompts for models that need more scaffolding.

**Bottom line:** `base-only` at 87.3 avg with Opus 4.6, `base-DA` at 87.0 for highest ceiling (90). Simpler prompts win.
