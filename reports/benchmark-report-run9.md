# Agent Benchmark Report — SwiftUI | markdown-editor | opus4.6 | 4-8-2026

> **15 trials · 1 scenario · 5 agent variants · 1 model · macOS / SwiftUI**
>
> Run date: 2026-04-08 · Concurrency: 3 · Max build time: 60 min · Iterations: 3

---

## 1. Executive Summary

Run 9 is a **focused ablation study** testing all five SwiftUI agent variants on a single complex scenario (markdown editor) using a single model (Claude Opus 4.6). The goal: isolate the contribution of each composable prompt section — Design (D), Architecture (A), and Verify (V) — to final app quality.

### Key Findings

1. **`swiftui-base` is the top performer.** Average score of 79.3 — the highest of any variant. The base prompt alone provides sufficient guidance for Opus 4.6 to build a high-quality markdown editor without additional prompt sections.

2. **`swiftui-DA` is the most consistent.** Scores of 76, 68, 79 — just an 11-point spread, the tightest of all variants. The Design + Architecture combination stabilizes output quality even if it doesn't raise the ceiling.

3. **Design-only (`swiftui-D`) is actively harmful.** Average of 34.0 with scores of 10, 10, 82. Two out of three trials produced apps that built and ran but scored only 10 — the design section appears to distract the agent from functional requirements.

4. **The Verify loop doubles time without reliable benefit.** `swiftui-DAV` averaged 23.7 minutes vs 13.9m for DA — nearly 2× the session time — while scoring lower (53.7 vs 74.3). The verification/iteration loop can cause regressions.

5. **`swiftui-bare` is non-functional.** All 3 trials failed validation (score 0) with "No csproj" errors. Without any project scaffolding guidance, the agent cannot produce a buildable SwiftUI project.

---

## 2. Methodology

### 2.1 Benchmark Flow

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  1. Scaffold  │ ──▶ │  2. Copilot Build │ ──▶ │  3. xcodebuild│ ──▶ │  4. Launch    │ ──▶ │  5. Validate  │ ──▶ │ 6. Score│
│  (XcodeGen)   │     │  (autopilot mode) │     │  (verify)     │     │  (open app)   │     │  (AI inspect) │     │ (0-100) │
└──────────────┘     └──────────────────┘     └───────────────┘     └──────────────┘     └──────────────┘     └─────────┘
```

1. **Scaffold** — Empty directory; agent uses XcodeGen + `project.yml` to create the Xcode project
2. **Copilot Build** — GitHub Copilot CLI runs in autopilot mode with the scenario prompt and agent instructions
3. **xcodebuild Verify** — The harness independently rebuilds with `xcodebuild` to confirm compilation
4. **Launch** — The built `.app` bundle is launched and the harness waits for a window
5. **Validate** — An AI validator inspects the running app via AppleScript, checking each requirement against the actual UI
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
| **Markdown Editor** | `mes45` | Full tabbed markdown editor: tabs, open/save/save-as, unsaved-changes prompt, split editor+live preview, find with highlight, view modes, status bar, Services menu, undo/redo, Settings | 14 | High |

### 2.4 Model Tested

| Model | Short ID | Notes |
|-------|----------|-------|
| **Claude Opus 4.6** | `o46` | Premium tier, highest reasoning capability |

---

## 3. Agent Variants Tested

### 3.1 Composable Agent System

Agents are assembled from mix-and-match sections, following the composable pattern used across WinUI 3 and SwiftUI benchmarks:

```
swiftui-bare  (no sections — raw copilot + prompt only)
swiftui-base  (XcodeGen workflow, @Observable patterns, accessibility IDs, anti-patterns)
  + D: Design (macOS-native design: sidebar/toolbars, Settings scene, no iOS/web layouts)
    + A: Architecture (DI, state layout, XcodeGen project.yml template, @Observable)
      + V: Verify (build/run/screenshot/log/XCUITest verification workflow)
```

### 3.2 Agent Variant Table

| Variant | Sections | Description |
|---------|----------|-------------|
| **swiftui-bare** | _(none)_ | No scaffolding, no agent — just copilot + prompt |
| **swiftui-base** | `swiftui-base` | Base only — XcodeGen workflow, core SwiftUI patterns |
| **swiftui-D** | `swiftui-base`, `swiftui-design` | Base + macOS design guidance |
| **swiftui-DA** | `swiftui-base`, `swiftui-design`, `swiftui-architecture` | Base + design + architecture patterns |
| **swiftui-DAV** | `swiftui-base`, `swiftui-design`, `swiftui-architecture`, `swiftui-verify` | Base + design + architecture + verification workflow |

---

## 4. Results Summary

### 4.1 Overall Rankings

| Rank | Agent | Avg Score | Min | Max | Spread | Build Rate | Run Rate | Avg Time |
|------|-------|-----------|-----|-----|--------|------------|----------|----------|
| 1 | **swiftui-base** | **79.3** | 69 | 86 | 17 | 100% | 100% | 15.5m |
| 2 | **swiftui-DA** | **74.3** | 68 | 79 | 11 | 100% | 100% | 13.9m |
| 3 | **swiftui-DAV** | 53.7 | 10 | 83 | 73 | 100% | 100% | 23.7m |
| 4 | **swiftui-D** | 34.0 | 10 | 82 | 72 | 100% | 100% | 12.7m |
| 5 | **swiftui-bare** | 0.0 | 0 | 0 | 0 | 0% | 0% | 11.4m |

### 4.2 Per-Trial Detail

#### swiftui-base (Avg: 79.3)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | **86** | ✅ | ✅ | 14m 20s |
| 2 | 83 | ✅ | ✅ | 13m 48s |
| 3 | 69 | ✅ | ✅ | 18m 26s |

#### swiftui-DA (Avg: 74.3)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | 76 | ✅ | ✅ | 13m 25s |
| 2 | 68 | ✅ | ✅ | 13m 45s |
| 3 | **79** | ✅ | ✅ | 14m 34s |

#### swiftui-DAV (Avg: 53.7)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | ⚠️ 10 | ✅ | ✅ | 26m 2s |
| 2 | **83** | ✅ | ✅ | 21m 17s |
| 3 | 68 | ✅ | ✅ | 23m 40s |

#### swiftui-D (Avg: 34.0)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | ⚠️ 10 | ✅ | ✅ | 11m 53s |
| 2 | ⚠️ 10 | ✅ | ✅ | 12m 33s |
| 3 | **82** | ✅ | ✅ | 13m 37s |

#### swiftui-bare (Avg: 0.0)

| Trial | Score | Build | Run | Session Time |
|-------|-------|-------|-----|-------------|
| 1 | ❌ 0 | ❌ | ❌ | ~11m |
| 2 | ❌ 0 | ❌ | ❌ | ~11m |
| 3 | ❌ 0 | ❌ | ❌ | ~12m |

---

## 5. Detailed Analysis

### 5.1 Composable Agent Layer Analysis

```
swiftui-bare ──(+base)──▶ swiftui-base ──(+D)──▶ swiftui-D ──(+A)──▶ swiftui-DA ──(+V)──▶ swiftui-DAV
     0.0                       79.3                  34.0                 74.3                  53.7
```

| Transition | Score Delta | Interpretation |
|-----------|------------|----------------|
| bare → base | **+79.3** | **Project scaffolding is essential.** Without XcodeGen workflow guidance, the agent cannot produce a buildable project at all. |
| base → base+D | **−45.3** | **Design-only guidance is actively harmful.** The design section alone distracts the agent from functional requirements, causing 2/3 trials to produce apps that run but lack core features. |
| base+D → base+DA | **+40.3** | **Architecture rescues design.** Adding architecture guidance to design produces a consistent, high-quality result. Architecture grounds the agent's focus back on functional structure. |
| base+DA → base+DAV | **−20.6** | **Verification adds cost without benefit.** The verify loop nearly doubles session time (23.7m vs 13.9m) and introduces regressions. Score drops by 20+ points on average. |

**Key insight:** For SwiftUI macOS apps with Opus 4.6, **the base prompt alone is optimal.** Unlike Run 8 (multi-model) where Design guidance was the key differentiator, when using Opus alone the base section provides sufficient implicit design knowledge. Adding more prompt sections either hurts (D alone) or doesn't help enough to justify the added complexity (DA) or time cost (DAV).

### 5.2 Why Design-Only Fails

The `swiftui-D` variant scored 10/100 in 2 out of 3 trials despite building and running successfully. Analysis:

- Apps launched with a visible window → earned 10 base points
- But scored 0 on quality and 0 on requirements → core features were missing
- **Hypothesis:** The design section emphasizes macOS-native visual patterns (sidebars, toolbars, Settings scene), causing the agent to spend its budget on layout and visual polish rather than implementing the 14 required features (tabs, file I/O, markdown preview, find, etc.)
- **Evidence:** Trial 3 scored 82, showing the agent *can* succeed — the design section creates a bimodal distribution, not a consistently low one

### 5.3 Why Verification Hurts

The `swiftui-DAV` verify section instructs the agent to build, run, screenshot, inspect logs, and iterate. In theory this should improve quality. In practice:

- **Time cost:** Average 23.7m vs 13.9m for DA — the verify loop adds ~10 minutes per trial
- **Regression risk:** Trial 1 scored only 10 despite the extra verification time — the iteration loop can undo working features while fixing others
- **Diminishing returns:** When it works (trial 2: 83), it matches DA's best (79) but doesn't meaningfully exceed it

### 5.4 Comparison with Run 8

| Metric | Run 8 (multi-model) | Run 9 (Opus-only) |
|--------|--------------------|--------------------|
| Best variant | swiftui-D (78.5) | **swiftui-base (79.3)** |
| D effectiveness | Transformative (+48.1) | **Harmful (−45.3)** |
| DA effectiveness | −8.4 from D | **+40.3 from D** |
| Verify effectiveness | −8.9 from DA | −20.6 from DA |
| Model sensitivity | High (Sonnet > Opus > GPT) | N/A (single model) |

The reversal of D's effectiveness between runs is notable. In Run 8, Design guidance was the #1 contributor across 3 models. In Run 9 (Opus-only), it's the #1 detractor. This suggests **Design guidance helps weaker/faster models more than it helps Opus** — Opus already has strong implicit design knowledge and the explicit guidance interferes.

---

## 6. Score Distribution

### 6.1 Score Histogram

```
90-100: ■          (1 trial — base i1: 86)
80-89:  ■■■■       (4 trials — base i2:83, D i3:82, DAV i2:83, DA i3:79)
70-79:  ■■         (2 trials — DA i1:76, DAV i3:68... → actually 68 is 60s)
60-69:  ■■■        (3 trials — base i3:69, DA i2:68, DAV i3:68)
50-59:              (0 trials)
40-49:              (0 trials)
30-39:              (0 trials)
20-29:              (0 trials)
10-19:  ■■■        (3 trials — D i1:10, D i2:10, DAV i1:10)
 0-9:   ■■■        (3 trials — bare i1-3: 0)
```

**Bimodal distribution:** Results cluster around 68-86 (successful) or 0-10 (failed). There is no middle ground — agents either build a good app or produce essentially nothing useful.

### 6.2 Score-10 Anomaly

Three trials (D i1, D i2, DAV i1) scored exactly 10 — the app built, ran, and showed a window (earning 10 base points) but received 0 for quality and 0 for requirements. This suggests these apps launched but lacked core markdown editor features. All three involved the Design section without Architecture to ground functional requirements.

---

## 7. Time Efficiency

### 7.1 Time vs Score

| Agent | Avg Time | Avg Score | Score/Minute |
|-------|----------|-----------|--------------|
| **swiftui-DA** | 13.9m | 74.3 | **5.3** |
| **swiftui-base** | 15.5m | 79.3 | **5.1** |
| **swiftui-D** | 12.7m | 34.0 | 2.7 |
| **swiftui-DAV** | 23.7m | 53.7 | 2.3 |
| **swiftui-bare** | 11.4m | 0.0 | 0.0 |

**DA has the best score-per-minute ratio** (5.3 pts/min), narrowly beating base (5.1). Despite base having a higher absolute score, DA achieves nearly the same quality 1.6 minutes faster on average.

---

## 8. Common Issues

1. **Design section destabilizes agent performance** — causes focus on visual design over functional requirements, producing bimodal score distributions (10 or 80+)
2. **Verify/iteration loops add ~10 minutes and introduce regressions** — the agent sometimes undoes working features while fixing cosmetic issues
3. **Bare config fails entirely** — "No csproj" error in all 3 trials indicates the agent cannot infer XcodeGen/xcodebuild workflow without explicit guidance
4. **Score-10 anomaly** — apps that build and run but score 10/100 suggest the agent produced a minimal window without implementing required features
5. **High variance remains a systemic concern** — even the best configs show 17-point spreads; only DA achieved an 11-point spread

---

## 9. Recommendations

### 9.1 Immediate Actions

1. **Use `swiftui-base` as the default** for Opus 4.6 — highest average score (79.3) with strong consistency
2. **Use `swiftui-DA` when consistency matters** — tightest score spread (11 points) and best time efficiency (5.3 pts/min)
3. **Eliminate `swiftui-D`** — design-only is unreliable (34.0 avg) and strictly dominated by both base and DA

### 9.2 Improvements Needed

4. **Redesign the verify section** — current version causes regressions and doubles session time; consider lighter verification that prevents undoing working features
5. **Fix bare config or validator** — either add minimal scaffolding guidance to bare, or update the validation pipeline to recognize SwiftUI project structure
6. **Investigate score-10 anomaly** — determine whether these are validator failures or genuinely empty apps; may need rubric calibration

### 9.3 Future Experiments

7. **Test with Claude Sonnet 4.6 and GPT-5.4** — Run 8 showed Design guidance helps other models; the optimal variant may be model-dependent
8. **Test `swiftui-A` (architecture-only)** — isolate architecture's independent contribution without the design section
9. **Test on the counter scenario** — validate whether base's advantage holds on simpler apps or is specific to complex scenarios
10. **Consider model-adaptive agent selection** — use base for Opus, D for Sonnet/GPT based on Runs 8 and 9

---

## 10. Conclusion

Run 9 reveals that **prompt section effectiveness is model-dependent**. For Claude Opus 4.6, the base section alone is optimal — Opus has sufficient implicit knowledge of macOS design patterns that explicit design guidance is more distracting than helpful. This contrasts with Run 8's multi-model finding where Design guidance was transformative.

The composable agent system works, but the optimal configuration varies by model. The path forward is **model-adaptive agent selection**: matching the right prompt sections to each model's strengths and weaknesses rather than assuming one configuration fits all.

**Bottom line:** `swiftui-base` at 79.3 avg with Opus 4.6, `swiftui-DA` at 74.3 for maximum consistency. Simpler prompts win.
