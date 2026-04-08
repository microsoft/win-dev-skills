# SwiftUI Agent Benchmark Report — Run 8

> **56 trials · 2 scenarios · 5 agent variants · 3 models · macOS / SwiftUI**
>
> Run date: 2026-04-07 · Concurrency: 3 · Max build time: 60 min · Iterations target: 3

---

## 1. Executive Summary

Run 8 is the first **multi-model SwiftUI benchmark** — testing composable agent variants across **Claude Opus 4.6**, **Claude Sonnet 4.6**, and **GPT-5.4** on two macOS app scenarios. Over 56 trials (53 completed, 3 partial), we measured how well AI agents build native SwiftUI desktop applications from natural-language prompts.

### Key Findings

1. **`swiftui-D` (base + design) is the top performer.** Average score of 78.5 across all models — the highest of any agent variant. On the markdown editor scenario, it averaged 81.7 with a peak score of 90. Adding more layers (architecture, verification) did not improve scores.

2. **Claude Sonnet 4.6 leads across all agents.** Overall average of 70.5 vs Opus 60.2 vs GPT-5.4 53.3. Sonnet was faster (avg 8.9m session time for swiftui-D) and more consistent. GPT-5.4 suffered disproportionately from score-10 validation anomalies.

3. **`swiftui-base` fails on complex scenarios.** The base-only agent averaged 42.3 on the counter app and just 6.7 on the markdown editor. Without design guidance, agents produce apps that build and run but fail validation — especially on the harder scenario.

4. **10 trials (19%) hit a score-10 anomaly.** These apps built and ran successfully but received only 10 points (base score), suggesting the validator failed to evaluate requirements. This disproportionately affected GPT-5.4 (6/10 anomalies) and `swiftui-base` (5/10).

5. **Two requirements were universally failed.** Keyboard shortcuts (⌘↑/⌘↓/⌘R) had 0% pass rate on the counter app — every agent chose different key bindings. Services menu integration had 0% pass rate on the markdown editor — no agent knew how to register `NSServices`.

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
5. **Validate** — An AI validator inspects the running app, checking each requirement against the actual UI
6. **Score** — A composite 0–100 score is computed from build success, quality assessments, and requirements coverage

### 2.2 Scoring System (0–100)

| Component | Points | Source |
|-----------|--------|--------|
| **Base** (app runs) | 10 | Binary: app window detected = 10, otherwise 0 |
| **Quality** (4 categories) | 0–40 | AI validator scores: project structure (0–10), UI layout (0–10), visual design (0–10), functionality (0–10) |
| **Requirements** (pass ratio) | 0–50 | `round(50 × passed / total)` — each scenario defines a requirements list |

**Total** = Base (10) + Quality (0–40) + Requirements (0–50) = **0–100**

- Build failure → score **0**
- Build succeeds, app crashes → score **0** (no window = no base points)
- Build succeeds, app runs, validator fails → score **10** (base points only)
- Build succeeds, app runs, all requirements met → up to **100**

### 2.3 Scenarios

| Scenario | ID | What It Tests | Requirements | Complexity |
|----------|-----|--------------|-------------|------------|
| **Counter App** | `mc42` | Simple native macOS counter: centered value, +/−/reset, keyboard shortcuts, history sidebar, persistence, Settings for step size | 8 | Low–Medium |
| **Markdown Editor** | `mme11` | Full tabbed markdown editor: tabs, open/save/save-as, unsaved-changes prompt, split editor+live preview, find with highlight, view modes, status bar, Services menu, undo/redo, Settings | 14 | High |

### 2.4 Models Tested

| Model | Short ID | Premium Requests/Trial | Notes |
|-------|----------|----------------------|-------|
| **Claude Opus 4.6** | `o46` | 3 | Premium tier, highest reasoning capability |
| **Claude Sonnet 4.6** | `s46` | 1 | Standard tier, fast and efficient |
| **GPT-5.4** | `gpt-54` | 1 | OpenAI latest, first cross-vendor benchmark |

---

## 3. Agent Variants Tested

### 3.1 Composable Agent System

Agents are assembled from mix-and-match sections, following the same composable pattern used for WinUI 3 agents in runs 1–27:

```
swiftui-base (XcodeGen workflow, @Observable patterns, accessibility IDs, anti-patterns)
  + D: Design (macOS-native design: sidebar/toolbars, Settings scene, no iOS/web layouts)
    + A: Architecture (DI, state layout, XcodeGen project.yml template, @Observable)
      + V: Verify (build/run/screenshot/log/XCUITest verification workflow)
```

### 3.2 Agent Variant Table

| Variant | Sections | Description |
|---------|----------|-------------|
| **swiftui-base** | `swiftui-base` | Base only — XcodeGen workflow, core SwiftUI patterns |
| **swiftui-D** | `swiftui-base`, `swiftui-design` | Base + macOS design guidance |
| **swiftui-DA** | `swiftui-base`, `swiftui-design`, `swiftui-architecture` | Base + design + architecture patterns |
| **swiftui-DAV** | `swiftui-base`, `swiftui-design`, `swiftui-architecture`, `swiftui-verify` | Base + design + architecture + verification workflow |
| **swiftui** | `swiftui-base`, `swiftui-design`, `swiftui-architecture`, `swiftui-verify` | Full agent (identical sections to DAV) |

> **Note:** `swiftui` and `swiftui-DAV` include the same sections. `swiftui` is described as the "Full SwiftUI macOS agent" while `swiftui-DAV` uses the composable naming. Performance differences between them reflect run-to-run variance, not configuration differences.

---

## 4. Results Summary

### 4.1 Overall Results by Agent Variant

| Agent | Trials | Avg Score | Build Rate | Run Rate | Score Range | Avg Session Time | Avg Build Cycles |
|-------|--------|-----------|------------|----------|-------------|-----------------|-----------------|
| **swiftui-D** | 12 | **78.5** | 100% | 100% | 67–90 | 8.9m | 3.2 |
| **swiftui-DA** | 11 | 70.1 | 100% | 100% | 10–85 | 9.4m | 2.7 |
| **swiftui-DAV** | 9 | 61.2 | 100% | 100% | 10–82 | 18.1m | 5.0 |
| **swiftui** | 12 | 59.5 | 92% | 83% | 0–84 | 21.1m | 6.3 |
| **swiftui-base** | 9 | 30.4 | 100% | 89% | 0–78 | 6.4m | 2.9 |

### 4.2 Overall Results by Model

| Model | Trials | Avg Score | Score Range | Score-10 Anomalies |
|-------|--------|-----------|-------------|-------------------|
| **Claude Sonnet 4.6** | 18 | **70.5** | 0–90 | 1 (6%) |
| **Claude Opus 4.6** | 17 | 60.2 | 10–86 | 3 (18%) |
| **GPT-5.4** | 18 | 53.3 | 10–82 | 6 (33%) |

### 4.3 Agent × Model Matrix (Average Scores)

| Agent | Opus 4.6 | Sonnet 4.6 | GPT-5.4 | All Models |
|-------|----------|------------|---------|------------|
| **swiftui-D** | 77.0 | **81.8** | 76.8 | **78.5** |
| **swiftui-DA** | 49.3 | **79.8** | 76.0 | 70.1 |
| **swiftui-DAV** | 75.3 | 78.7 | 29.7 | 61.2 |
| **swiftui** | 61.5 | 59.8 | 57.2 | 59.5 |
| **swiftui-base** | 32.0 | 49.3 | 10.0 | 30.4 |
| **All Agents** | 60.2 | **70.5** | 53.3 | **61.4** |

### 4.4 Agent × Scenario Breakdown

#### Counter App (`mc42`) — 30 trials

| Agent | Opus 4.6 | Sonnet 4.6 | GPT-5.4 | All Models |
|-------|----------|------------|---------|------------|
| **swiftui-D** | 76.5 | **78.0** | 71.5 | 75.3 |
| **swiftui-DA** | 43.0 | **77.5** | 75.5 | 65.3 |
| **swiftui-DAV** | 76.0 | 77.0 | 39.5 | 64.2 |
| **swiftui** | 76.0 | **77.5** | 38.0 | 63.8 |
| **swiftui-base** | 43.0 | **74.0** | 10.0 | 42.3 |

#### Markdown Editor (`mme11`) — 23 trials

| Agent | Opus 4.6 | Sonnet 4.6 | GPT-5.4 | All Models |
|-------|----------|------------|---------|------------|
| **swiftui-D** | 77.5 | **85.5** | 82.0 | **81.7** |
| **swiftui-DA** | 62.0 | **82.0** | 76.5 | 75.8 |
| **swiftui-DAV** | 74.0 | 82.0 | 10.0 | 55.3 |
| **swiftui** | 47.0 | 42.0 | **76.5** | 55.2 |
| **swiftui-base** | 10.0 | 0.0 | 10.0 | 6.7 |

---

## 5. Detailed Analysis

### 5.1 Composable Agent Layer Analysis

```
swiftui-base ──(+D)──▶ swiftui-D ──(+A)──▶ swiftui-DA ──(+V)──▶ swiftui-DAV
    30.4                  78.5                 70.1                  61.2
```

| Transition | Score Delta | Interpretation |
|-----------|------------|----------------|
| base → base-D | **+48.1** | **Design guidance is transformative.** The single largest lift of any layer. Without it, agents build apps that run but score poorly on validation. |
| base-D → base-DA | −8.4 | Architecture guidance didn't help — and may have added unnecessary complexity for these scenarios. |
| base-DA → base-DAV | −8.9 | Verification added overhead (avg 18.1m vs 9.4m session time) without improving scores. XCUITest debugging was the #1 time sink. |

**Key insight:** For SwiftUI macOS apps, **design guidance alone provides the most value.** Unlike the WinUI 3 benchmarks where architecture and verification were critical, SwiftUI's more cohesive API surface means agents need less structural guidance — but do need to know macOS-native patterns (sidebars, toolbars, Settings scenes).

### 5.2 Model Comparison

| Metric | Opus 4.6 | Sonnet 4.6 | GPT-5.4 |
|--------|----------|------------|---------|
| Avg Score | 60.2 | **70.5** | 53.3 |
| Avg Score (excl. anomalies) | 72.7 | **75.0** | 72.2 |
| Score-10 Anomaly Rate | 18% | 6% | **33%** |
| Premium Requests/Trial | 3 | 1 | 1 |
| Best Single Score | 86 | **90** | 82 |
| Consistency (StdDev) | 24.8 | 23.4 | **29.7** |

**Sonnet dominates on raw score** and is 3× cheaper (1 premium request vs 3). When excluding score-10 anomalies, all three models converge around 72–75 avg, suggesting similar underlying capability — but GPT-5.4 triggers validator failures far more often.

**Opus shows surprising inconsistency.** Its 18% anomaly rate and wide score range (10–86) suggest that spending more tokens doesn't guarantee better results. Opus also had the most build-fix cycles on some trials.

### 5.3 Session Time and Efficiency

| Agent | Avg Session Time | Avg Build Cycles | Avg Confidence |
|-------|-----------------|-----------------|----------------|
| swiftui-base | **6.4m** | 2.9 | 8.4 |
| swiftui-D | **8.9m** | 3.2 | 8.1 |
| swiftui-DA | 9.4m | **2.7** | 8.2 |
| swiftui-DAV | 18.1m | 5.0 | 8.1 |
| swiftui | 21.1m | 6.3 | 7.6 |

**`swiftui-D` delivers the best efficiency: 78.5 avg score in 8.9 minutes** with only 3.2 build cycles. The verification layer (`swiftui-DAV`) doubles session time to 18.1m while *decreasing* scores, because agents burn time debugging XCUITest failures in the headless environment.

**`swiftui-DA` has the fewest build cycles (2.7)** — architecture guidance helps agents write code that compiles on the first try. But the score advantage doesn't follow, suggesting the bottleneck is feature coverage rather than build reliability.

### 5.4 Score-10 Anomaly Analysis

10 of 53 trials (19%) received exactly 10 points despite the app building and running successfully. These represent **validator failures, not app failures**.

| Agent | Anomaly Count | Anomaly Rate | Affected Models |
|-------|--------------|-------------|-----------------|
| swiftui-base | 5 | 56% | gpt54 ×3, opus ×2 |
| swiftui | 2 | 17% | gpt54 ×1, opus ×1 |
| swiftui-DAV | 2 | 22% | gpt54 ×2 |
| swiftui-DA | 1 | 9% | opus ×1 |
| swiftui-D | 0 | 0% | — |

Root causes identified from validation logs:
- **Transient API errors** (1 trial): Validator API call failed mid-evaluation
- **Bash process spawn failures** (1 trial): Validator couldn't start shell
- **App crash during validation** (2 trials): App crashed before requirements could be checked
- **Unknown** (6 trials): Validator completed but returned no requirements — likely a harness issue with simple/unconventional app structures

**`swiftui-D` had zero anomalies** — its apps were consistently structured in a way the validator could evaluate.

---

## 6. Requirements Analysis

### 6.1 Counter App Requirements (8 total)

| # | Requirement | Pass Rate | Notes |
|---|------------|-----------|-------|
| 1 | Large centered counter starting at 0 | **100%** | Universal success |
| 2 | Increment button (+) | **100%** | Universal success |
| 3 | Decrement button (−) | **100%** | Universal success |
| 4 | Reset button | **100%** | Universal success |
| 5 | Keyboard shortcuts ⌘↑/⌘↓/⌘R | **0%** | Every agent chose different bindings (⌘+/⌘−/⌘0) |
| 6 | History sidebar with timestamps | **96%** | 1 failure: relative timestamps instead of absolute |
| 7 | Persist count across launches | **88%** | 3 failures: persistence present but not UserDefaults/SwiftData |
| 8 | Settings window for step size (1/5/10) | **0%** | Settings window existed but lacked step size picker |

**Counter app ceiling: 75% (6/8 requirements).** Two requirements — keyboard shortcuts and step size settings — were universally missed. The max achievable score given quality subscores is ~78, which is exactly what top trials achieved.

### 6.2 Markdown Editor Requirements (14 total)

| # | Requirement | Pass Rate | Notes |
|---|------------|-----------|-------|
| 1 | Multi-tab editor (⌘N/⌘W) | 82% | Common issue: ⌘T instead of ⌘N |
| 2 | Tab name + unsaved marker | **100%** | |
| 3 | Open .md/.txt in new tab | **100%** | |
| 4 | Save with Save panel | **100%** | |
| 5 | Save As always prompts | **100%** | |
| 6 | Unsaved close confirmation | 82% | Dialog labels didn't match spec |
| 7 | Split editor + live preview | 88% | Some implementations crash during editing |
| 8 | Live preview with markdown features | 88% | Preview crashes or doesn't update live |
| 9 | Find bar (⌘F) with highlighting | 82% | 1 trial: ⌘F causes EXC_BAD_ACCESS crash |
| 10 | Toggle editor/preview/split modes | 94% | 1 trial: Preview Only mode crashes |
| 11 | Status bar (line/col/word/char) | **41%** | Most common gap: character count missing |
| 12 | Services menu integration | **0%** | No agent knew NSServices/NSServicesProvider |
| 13 | Undo/redo per tab | 82% | Some undo implementations were broken |
| 14 | Settings window (font size + theme) | **100%** | |

**Markdown editor ceiling: ~86% (12/14 requirements).** Services menu (0%) is an obscure macOS API. Status bar (41%) is partially implemented — agents include line/column/word counts but forget character count.

### 6.3 Hardest Requirements Across Both Scenarios

| Requirement | Pass Rate | Why Agents Fail |
|-------------|-----------|----------------|
| Services menu integration | 0% (0/17) | NSServices is an obscure AppKit API requiring Info.plist keys + NSServicesProvider. No model has this in training data. |
| Keyboard shortcuts ⌘↑/⌘↓/⌘R | 0% (0/24) | Agents choose intuitive-but-wrong shortcuts (⌘+/⌘−/⌘0). Arrow key modifiers are uncommon in macOS apps. |
| Settings step size picker | 0% (0/24) | Agents build Settings windows but only for simple preferences (timestamps). The step-size feature requires linking Settings state to counter logic. |
| Status bar completeness | 41% (7/17) | Agents implement 3 of 4 required stats; character count is consistently forgotten. |

---

## 7. Failure Analysis

### 7.1 Build & Runtime Failures

| Trial | Failure Type | Root Cause |
|-------|-------------|------------|
| `mme11_swiftui_s46_i2` | **Build timeout** | Session timed out (60m limit). Score: 0. |
| `mme11_swiftui-base_s46_i1` | **Runtime crash** | App built successfully but crashed on launch. Score: 0. |
| `mme11_swiftui-DAV_gpt-54_i2` | **Incomplete** | Trial directory has only `build-prompt.txt` — harness failure |
| `mme11_swiftui-DAV_o46_i2` | **Incomplete** | Trial directory has only `build-prompt.txt` — harness failure |
| `mme11_swiftui-DA_o46_i2` | **Incomplete** | Has session/build logs but no `results.json` — validation didn't run |

**Build reliability is excellent:** 52/53 completed trials built successfully (98%). Only 1 timed out. Run rate is 96% (51/53 ran). The 3 incomplete trials are harness-level failures, not agent failures.

### 7.2 Top Failed APIs (from Retrospectives)

| API/Pattern | Count | Issue |
|-------------|-------|-------|
| `GENERATE_INFOPLIST_FILE` missing in test targets | 9 | XcodeGen project.yml doesn't include this setting for test targets |
| `.foregroundStyle(.accent)` / `.foregroundStyle(.accentColor)` | 8 | SwiftUI color type mismatch — `.accentColor` isn't a `ShapeStyle` |
| `UTType.markdown` | 4 | Not available on all macOS versions; needs `UniformTypeIdentifiers` import |
| `app.lists` (XCUITest) | 2 | Non-existent XCUIApplication property |
| `CommandGroupPlacement.find` | 2 | Wrong enum case for menu command placement |
| `NSRange.zero` | 2 | Doesn't exist; should use `NSRange(location: 0, length: 0)` |

### 7.3 Top Time Sinks (from Retrospectives)

| Time Sink | Occurrences | Avg Time Wasted |
|-----------|-------------|-----------------|
| **XCUITest debugging** | 25/53 (47%) | 3–5 min per trial |
| **Info.plist configuration** | 13/53 (25%) | 1–3 min per trial |
| **Parsing xcodebuild output** | 4/53 (8%) | 1–2 min per trial |

**XCUITest is the dominant time sink.** Nearly half of all trials spent significant time debugging UI tests that cannot work in the headless/terminal test runner environment. The verification layer (`swiftui-DAV`) amplifies this problem by explicitly instructing agents to write and run UI tests.

### 7.4 Agent Behavior Observations

| Observation | Details |
|-------------|---------|
| **Skill doc reading varies** | Some agents read skill reference files upfront (3–6 files, ~15s–3min). Others relied entirely on training data. |
| **Agents consistently overestimate confidence** | Average self-reported confidence: 8.0/10. But 19% of trials got score ≤ 10. Confidence doesn't correlate with actual score. |
| **XCUITest environment blindness** | Agents don't detect that the terminal environment cannot create windows for UI tests, leading to repeated debugging cycles. |
| **Keyboard shortcut convention mismatch** | Agents default to common macOS patterns (⌘+/⌘−) instead of scenario-specified unusual shortcuts (⌘↑/⌘↓). |

---

## 8. Comparison with WinUI 3 Benchmarks (Runs 1–27)

| Dimension | WinUI 3 (Runs 1–27) | SwiftUI (Run 8) |
|-----------|---------------------|-----------------|
| **Platform** | Windows / WinUI 3 / C# / MSBuild | macOS / SwiftUI / Swift / XcodeGen+xcodebuild |
| **Models tested** | Claude Sonnet 4.5 only | Claude Opus 4.6, Sonnet 4.6, GPT-5.4 |
| **Build rate** | 94–100% | 98% |
| **Best agent** | `base-DARMV` (83.2 avg) | `swiftui-D` (78.5 avg) |
| **Most efficient** | `base-DA` (73.8 avg, 1.4M tokens) | `swiftui-D` (78.5 avg, ~8.9m) |
| **Design layer impact** | Mixed (−11.1 with small sample) | **+48.1** — transformative |
| **Verification impact** | **+30.4** (critical for catching research errors) | **−8.9** (XCUITest overhead hurts more than helps) |
| **Key bottleneck** | Build failures (XAML compiler), API hallucination | Validator anomalies, obscure macOS APIs (NSServices) |

**The key structural difference:** WinUI 3 agents benefit from verification because `winapp ui` provides reliable UI inspection. SwiftUI agents are hurt by verification because XCUITest doesn't work in headless environments, creating unproductive debugging loops.

---

## 9. What's Next

### 9.1 Immediate

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| **P0** | **Fix score-10 validator anomalies** | 19% of trials are noise. Fixing the validator could shift all averages significantly, especially for GPT-5.4 and swiftui-base. |
| **P0** | **Run 3rd iterations** | 3 trials are incomplete. Several agent×model cells have only 1–2 data points. Need ≥3 per cell for reliability. |
| **P1** | **Disable XCUITest in verification layer** | XCUITest doesn't work headless. Replace with `osascript`-based UI inspection or screenshot comparison. |
| **P1** | **Add keyboard shortcut examples to design section** | 0% pass rate on ⌘↑/⌘↓ shortcuts suggests agents need explicit examples of uncommon key bindings. |

### 9.2 Medium Term

| Action | Rationale |
|--------|-----------|
| **Test `swiftui-DV` variant** (skip architecture) | Since `swiftui-D` outperforms `swiftui-DA`, test design + verification without architecture overhead. |
| **Add NSServices to design section** | 0% pass rate on Services menu. A code template could make this achievable. |
| **Run with Claude Haiku** | Understand the quality floor and whether cheap models + good guidance can compete with expensive models. |
| **Increase iteration count to 5** | Run 8 has mostly 2 data points per cell. Need 5+ for statistical validity (lesson from WinUI 3 runs). |
| **Test more complex scenarios** | The counter app may be too easy (all non-base agents score 65–78). Add scenarios that differentiate agents better. |

### 9.3 Open Questions

1. **Why does adding architecture hurt?** `swiftui-DA` scores lower than `swiftui-D`. Is the architecture section adding complexity that these scenarios don't need? Or is the sample size too small (2 data points per cell)?

2. **What's driving the GPT-5.4 validator anomalies?** 33% of GPT trials get score-10 despite building and running. Is GPT producing unconventional app structures that confuse the validator?

3. **Would `swiftui-D` maintain its lead on harder scenarios?** The markdown editor (14 requirements) already shows differentiation. Would a 20+ requirement scenario reveal architecture benefits?

4. **Is Opus worth 3× the cost?** Opus scores 60.2 avg vs Sonnet's 70.5 at 3× the premium request cost. Even excluding anomalies, Opus (72.7) barely matches Sonnet (75.0). Is there a scenario where Opus's extra reasoning justifies the cost?

5. **Can XCUITest work with a virtual display?** If we can make UI tests work, the verification layer might become beneficial (as it was for WinUI 3).

---

## Appendix A: Full Trial Results

### Counter App (`mc42`) — 30 Trials

| Trial | Agent | Model | Score | Build | Run | Reqs (Pass/Total) | Session Time | Build Cycles |
|-------|-------|-------|-------|-------|-----|-------------------|-------------|-------------|
| mc42_swiftui-D_s46_i1 | swiftui-D | Sonnet | **79** | ✅ | ✅ | 6/8 | 3m 25s | 1 |
| mc42_swiftui-D_s46_i2 | swiftui-D | Sonnet | 77 | ✅ | ✅ | 6/8 | 4m 44s | 4 |
| mc42_swiftui-D_o46_i1 | swiftui-D | Opus | 77 | ✅ | ✅ | 6/8 | 5m 32s | 3 |
| mc42_swiftui-D_o46_i2 | swiftui-D | Opus | 76 | ✅ | ✅ | 6/8 | 4m 39s | 2 |
| mc42_swiftui-D_gpt-54_i1 | swiftui-D | GPT-5.4 | 67 | ✅ | ✅ | 5/8 | 4m 50s | 0 |
| mc42_swiftui-D_gpt-54_i2 | swiftui-D | GPT-5.4 | 76 | ✅ | ✅ | 6/8 | 6m 5s | 2 |
| mc42_swiftui-DA_s46_i1 | swiftui-DA | Sonnet | **78** | ✅ | ✅ | 6/8 | 4m 26s | 2 |
| mc42_swiftui-DA_s46_i2 | swiftui-DA | Sonnet | 77 | ✅ | ✅ | 6/8 | 5m 48s | 1 |
| mc42_swiftui-DA_o46_i1 | swiftui-DA | Opus | 76 | ✅ | ✅ | 6/8 | 3m 8s | 1 |
| mc42_swiftui-DA_o46_i2 | swiftui-DA | Opus | ⚠️ 10 | ✅ | ✅ | 0/0 | 3m 13s | 2 |
| mc42_swiftui-DA_gpt-54_i1 | swiftui-DA | GPT-5.4 | 76 | ✅ | ✅ | 6/8 | 9m 2s | 3 |
| mc42_swiftui-DA_gpt-54_i2 | swiftui-DA | GPT-5.4 | 75 | ✅ | ✅ | 6/8 | 10m 52s | 2 |
| mc42_swiftui-DAV_s46_i1 | swiftui-DAV | Sonnet | 76 | ✅ | ✅ | 6/8 | 15m 45s | 6 |
| mc42_swiftui-DAV_s46_i2 | swiftui-DAV | Sonnet | **78** | ✅ | ✅ | 6/8 | 7m 1s | 2 |
| mc42_swiftui-DAV_o46_i1 | swiftui-DAV | Opus | 76 | ✅ | ✅ | 6/8 | 7m 43s | 5 |
| mc42_swiftui-DAV_o46_i2 | swiftui-DAV | Opus | 76 | ✅ | ✅ | 6/8 | 8m 22s | 4 |
| mc42_swiftui-DAV_gpt-54_i1 | swiftui-DAV | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 19m 59s | 8 |
| mc42_swiftui-DAV_gpt-54_i2 | swiftui-DAV | GPT-5.4 | 69 | ✅ | ✅ | 5/8 | 15m 59s | 5 |
| mc42_swiftui_s46_i1 | swiftui | Sonnet | **78** | ✅ | ✅ | 6/8 | 4m 8s | 3 |
| mc42_swiftui_s46_i2 | swiftui | Sonnet | 77 | ✅ | ✅ | 6/8 | 5m 27s | 3 |
| mc42_swiftui_o46_i1 | swiftui | Opus | 77 | ✅ | ✅ | 6/8 | 10m 43s | 5 |
| mc42_swiftui_o46_i2 | swiftui | Opus | 75 | ✅ | ✅ | 6/8 | 11m 41s | 8 |
| mc42_swiftui_gpt-54_i1 | swiftui | GPT-5.4 | 66 | ✅ | ✅ | 5/8 | 24m 49s | 13 |
| mc42_swiftui_gpt-54_i2 | swiftui | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 13m 55s | 4 |
| mc42_swiftui-base_s46_i1 | swiftui-base | Sonnet | **78** | ✅ | ✅ | 6/8 | 2m 52s | 1 |
| mc42_swiftui-base_s46_i2 | swiftui-base | Sonnet | 70 | ✅ | ✅ | 5/8 | 6m 16s | 2 |
| mc42_swiftui-base_o46_i1 | swiftui-base | Opus | ⚠️ 10 | ✅ | ✅ | 0/0 | 3m 38s | 3 |
| mc42_swiftui-base_o46_i2 | swiftui-base | Opus | 76 | ✅ | ✅ | 6/8 | 3m 49s | 2 |
| mc42_swiftui-base_gpt-54_i1 | swiftui-base | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 5m 49s | 2 |
| mc42_swiftui-base_gpt-54_i2 | swiftui-base | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 4m 59s | 2 |

### Markdown Editor (`mme11`) — 23 Trials

| Trial | Agent | Model | Score | Build | Run | Reqs (Pass/Total) | Session Time | Build Cycles |
|-------|-------|-------|-------|-------|-----|-------------------|-------------|-------------|
| mme11_swiftui-D_s46_i2 | swiftui-D | Sonnet | **90** | ✅ | ✅ | 13/14 | 16m 13s | 5 |
| mme11_swiftui-D_o46_i2 | swiftui-D | Opus | 86 | ✅ | ✅ | 13/14 | 9m 7s | 4 |
| mme11_swiftui-DA_s46_i2 | swiftui-DA | Sonnet | 85 | ✅ | ✅ | 12/14 | 11m 40s | 2 |
| mme11_swiftui_s46_i1 | swiftui | Sonnet | 84 | ✅ | ✅ | 12/14 | 46m 19s | 9 |
| mme11_swiftui_o46_i2 | swiftui | Opus | 84 | ✅ | ✅ | 12/14 | 25m 4s | 6 |
| mme11_swiftui-D_gpt-54_i1 | swiftui-D | GPT-5.4 | 82 | ✅ | ✅ | 12/14 | 12m 50s | 8 |
| mme11_swiftui-D_gpt-54_i2 | swiftui-D | GPT-5.4 | 82 | ✅ | ✅ | 12/14 | 12m 35s | 5 |
| mme11_swiftui-DAV_s46_i1 | swiftui-DAV | Sonnet | 82 | ✅ | ✅ | 12/14 | 41m 50s | 4 |
| mme11_swiftui-D_s46_i1 | swiftui-D | Sonnet | 81 | ✅ | ✅ | 11/14 | 13m 58s | 2 |
| mme11_swiftui_gpt-54_i1 | swiftui | GPT-5.4 | 80 | ✅ | ✅ | 12/14 | 20m 14s | 9 |
| mme11_swiftui-DA_s46_i1 | swiftui-DA | Sonnet | 79 | ✅ | ✅ | 11/14 | 14m 52s | 1 |
| mme11_swiftui-DA_gpt-54_i1 | swiftui-DA | GPT-5.4 | 78 | ✅ | ✅ | 11/14 | 12m 9s | 9 |
| mme11_swiftui-DA_gpt-54_i2 | swiftui-DA | GPT-5.4 | 75 | ✅ | ✅ | 12/14 | 15m 19s | 5 |
| mme11_swiftui-DAV_o46_i1 | swiftui-DAV | Opus | 74 | ✅ | ✅ | 11/14 | 28m 54s | 6 |
| mme11_swiftui_gpt-54_i2 | swiftui | GPT-5.4 | 73 | ✅ | ✅ | 10/14 | 20m 54s | 11 |
| mme11_swiftui-D_o46_i1 | swiftui-D | Opus | 69 | ✅ | ✅ | 10/14 | 13m 18s | 3 |
| mme11_swiftui-DA_o46_i1 | swiftui-DA | Opus | 62 | ✅ | ✅ | 8/14 | 13m 10s | 1 |
| mme11_swiftui_o46_i1 | swiftui | Opus | ⚠️ 10 | ✅ | ✅ | 0/0 | 48m 26s | 5 |
| mme11_swiftui-base_gpt-54_i1 | swiftui-base | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 11m 11s | 9 |
| mme11_swiftui-base_o46_i1 | swiftui-base | Opus | ⚠️ 10 | ✅ | ✅ | 0/0 | 8m 57s | 3 |
| mme11_swiftui-DAV_gpt-54_i1 | swiftui-DAV | GPT-5.4 | ⚠️ 10 | ✅ | ✅ | 0/0 | 17m 23s | 5 |
| mme11_swiftui-base_s46_i1 | swiftui-base | Sonnet | 0 | ✅ | ❌ | 0/0 | 9m 44s | 2 |
| mme11_swiftui_s46_i2 | swiftui | Sonnet | 0 | ❌ | ❌ | 0/0 | — | — |

### Incomplete Trials (no results.json)

| Trial | Files Present | Likely Cause |
|-------|--------------|-------------|
| mme11_swiftui-DAV_gpt-54_i2 | `build-prompt.txt` only | Harness failed to start build |
| mme11_swiftui-DAV_o46_i2 | `build-prompt.txt` only | Harness failed to start build |
| mme11_swiftui-DA_o46_i2 | `build-output.txt`, `session-log.txt`, `validation-log.txt` | Build ran but validation didn't complete |

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Condition** | The agent variant used for the trial |
| **Build Rate** | Percentage of trials where xcodebuild compilation succeeded |
| **Run Rate** | Percentage of trials where the app launched and a window was detected |
| **Score-10 Anomaly** | Trial where app builds and runs but validator returns no requirements — score stuck at 10 |
| **Build Cycles** | Number of build-fix iterations before the agent declared done (from retrospective) |
| **Confidence** | Agent's self-reported confidence score (1–10) from retrospective |
| **DAVS** | Acronym for composable layers: Design, Architecture, Verify (SwiftUI equivalents of WinUI's DARMVC) |
| **XcodeGen** | CLI tool that generates Xcode projects from a `project.yml` file |
| **Premium Requests** | Number of premium API requests consumed per trial (varies by model tier) |
