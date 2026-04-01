# WinUI 3 Agent Benchmark Report — Runs 1–27

> **176 benchmark runs · 27 batches · 5 scenarios · 14 agent variants · Claude Sonnet 4.5**

---

## 1. Executive Summary

We built an automated benchmark framework to measure how well AI agents build production-quality WinUI 3 desktop applications from natural-language prompts. Over 27 run batches and 176 individual runs, we tested 14 agent variants ranging from zero-guidance baselines to fully-orchestrated multi-tool agents, all using Claude Sonnet 4.5.

### Key Findings

1. **Targeted design guidance gives the best score-per-token efficiency.** The `base-DA` variant (base + design + architecture) scored 73.8 avg with only 1.4M tokens — 2.6× the bare baseline score at 74% of the token cost. Adding more layers beyond this yields diminishing or negative returns per token.

2. **Verification (UI automation) is critical for reliability.** The `base-DARMV` variant (which includes `winapp ui` verification) achieved the highest average score of 83.2 with 100% run reliability. Agents that can see and test their own UI catch mistakes that compile-and-pray workflows miss.

3. **Research without verification hurts more than it helps.** Adding MCP documentation research (`base-DAR`) *decreased* scores by 21 points compared to `base-DA`. Outdated UWP-era code samples from Microsoft Learn actively confused the model. The research layer only becomes net-positive when paired with verification to catch the resulting errors.

4. **The WinMD metadata tool was broken during most test runs.** A JSON serialization bug introduced during the native AOT build meant all "winmd-first" and metadata-equipped runs were operating with a non-functional tool. The tool was fixed at the end of this test cycle, so clean data is pending.

5. **At least 5 iterations per variant are needed for statistical validity.** Run 21 (2 iterations) ranked mcp-first as the best agent at 87.5 avg. Run 23 (5 iterations) revealed the true ranking: winmd-first (89.6) > single-agent (63.6) > mcp-first (32.6). Two-iteration data was misleading.

---

## 2. Methodology

### 2.1 Benchmark Flow

Each benchmark run executes the following pipeline:

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────┐
│  1. Scaffold  │ ──▶ │  2. Copilot Build │ ──▶ │  3. MSBuild   │ ──▶ │  4. Launch    │ ──▶ │  5. Validate  │ ──▶ │ 6. Score│
│  (dotnet new) │     │  (autopilot mode) │     │  (verify)     │     │  (winapp run) │     │  (UI inspect) │     │ (0-100) │
└──────────────┘     └──────────────────┘     └───────────────┘     └──────────────┘     └──────────────┘     └─────────┘
```

1. **Scaffold** — `dotnet new winui` creates a starter WinUI 3 project (for starter/candidate conditions)
2. **Copilot Build** — GitHub Copilot CLI runs in autopilot mode with the scenario prompt and agent instructions. The agent writes code, installs packages, and iterates on build errors.
3. **MSBuild Verify** — The harness independently rebuilds the project with MSBuild to confirm the code compiles. This uses `build.ps1` (MSBuild.exe, DLL XAML compiler path) as the primary build command.
4. **Launch** — `winapp run` launches the packaged app and waits for a window to appear.
5. **Validate** — An AI validator inspects the running app via `winapp ui inspect` and `winapp ui screenshot`, checking each requirement against the actual UI.
6. **Score** — A composite 0–100 score is computed from build success, quality assessments, and requirements coverage.

### 2.2 Scoring System (0–100)

The final score is the sum of three components:

| Component | Points | Source |
|-----------|--------|--------|
| **Base** (app runs) | 10 | Binary: app window detected = 10, otherwise 0 |
| **Quality** (4 categories) | 0–40 | AI validator scores: project structure (0–10), UI layout (0–10), visual design (0–10), functionality (0–10) |
| **Requirements** (pass ratio) | 0–50 | `round(50 × passed / total)` — each scenario defines a requirements list |

**Total** = Base (10) + Quality (0–40) + Requirements (0–50) = **0–100**

- Build failure → score **0**
- Build succeeds, app crashes → score **10** (base points only, no UI to validate)
- Build succeeds, app runs, all requirements met → up to **100**

### 2.3 Scenarios

| Scenario | What It Tests | Complexity |
|----------|--------------|------------|
| **file-explorer-shell** | Full file explorer: tabs, TreeView, navigation, breadcrumbs, sortable columns, context menus, search, Share contract, JumpList, status bar | High — 15+ distinct requirements |
| **file-explorer-shell-minimal** | Same app, shorter prompt — tests how well agents infer requirements | High (same app, less guidance) |
| **local-llm-chat** | Local LLM chat app with ONNX runtime, streaming, conversation management | High — ML integration + UI |
| **local-llm-chat-minimal** | Same app, shorter prompt | High (same app, less guidance) |
| **imageresizer-wpf-to-winui** | Port an existing WPF ImageResizer to WinUI 3 | Medium — migration + API translation |

All scenarios require Fluent Design (Mica backdrop, custom title bar, modern WinUI 3 desktop look), correct builds, and a running application.

### 2.4 Conditions

| Condition | What the Agent Gets | Purpose |
|-----------|-------------------|---------|
| **bare** | Nothing — raw Copilot with no agent instructions, skills, or scaffolding | Lower bound baseline |
| **starter** | Template-provided instructions (AGENTS.md from `dotnet new winui`) | Measures template quality |
| **candidate** | Pre-scaffolded project + custom agent instructions + skills + MCP servers | Tests agent variant effectiveness |

The **candidate** condition strips the template's default instructions and replaces them with the candidate agent's configuration (agent markdown, skills, MCP servers). This isolates the effect of the agent variant from the template.

---

## 3. Agent Variants Tested

### 3.1 Composable Agent System

Rather than monolithic agent files, we built a composable system where agents are assembled from mix-and-match sections injected into a base template:

```
base (build/run essentials — MSBuild commands, project structure, error handling)
  + D: Design (control selection tables, Fluent Design guidance, layout patterns)
    + A: Architecture (MVVM, data binding, project structure, CommunityToolkit patterns)
      + R: Research (Microsoft Learn MCP server for API documentation lookups)
        + M: Metadata (WinMD tool for real API signatures from installed packages)
          + V: Verify (winapp ui — screenshot, inspect, invoke for UI automation testing)
            + C: Checklist (requirement verification loop before declaring done)
```

Each section brings its own skill and MCP server dependencies automatically. Skills are inlined into the agent file because **agents never read separate SKILL.md files** — this was confirmed across 100% of runs.

### 3.2 Agent Variant Table

| Variant | Type | Sections | Skills | MCP | Inline Skills |
|---------|------|----------|--------|-----|---------------|
| **base-only** | Composable | `base` | — | — | `winui3-design` |
| **base-D** | Composable | `base`, `design` | `winui3-dev-workflow`, `winapp-cli` | — | `winui3-design`, `winui3-best-practices` |
| **base-DA** | Composable | `base`, `design`, `architecture` | `winui3-dev-workflow`, `winapp-cli` | — | `winui3-design`, `winui3-best-practices`, `winui3-architecture` |
| **base-DAR** | Composable | `base`, `design`, `architecture`, `research` | `winui3-dev-workflow`, `winapp-cli` | `mslearn` | `winui3-design`, `winui3-best-practices`, `winui3-architecture` |
| **base-DARM** | Composable | `base`, `design`, `architecture`, `research`, `metadata` | `winui3-dev-workflow`, `winapp-cli`, `winmd-api-search` | `mslearn` | (same as DAR) |
| **base-DARMV** | Composable | `base`, `design`, `architecture`, `research`, `metadata`, `verify` | `winui3-dev-workflow`, `winapp-cli`, `winmd-api-search`, `ui-automation` | `mslearn` | (same as DAR) |
| **base-DARMVC** | Composable | `base`, `design`, `architecture`, `research`, `metadata`, `verify`, `checklist` | (same as DARMV) | `mslearn` | (same as DAR) |
| **mcp-first** | Legacy | — | `winui3-dev-workflow`, `templates`, `ui-automation`, `ui-controls`, `winapp-cli`, `winmd-api-search` | `mslearn` | — |
| **winmd-first** | Legacy | — | (same as mcp-first) | `mslearn` | — |
| **single-agent** | Legacy | — | `architecture`, `winui3-dev-workflow`, `quality`, `templates`, `ui-automation`, `ui-controls`, `visual-design`, `winapp-cli`, `windowing`, `winmd-api-search` | `mslearn` | — |
| **minimal** | Legacy | — | `winui3-dev-workflow`, `identity-and-setup`, `packaging-and-signing`, `templates`, `ui-automation`, `ui-controls`, `windows-platform-apis` | `mslearn` | — |
| **lite-orchestrator** | Legacy | — | `winui3-architecture`, `winui3-dev-workflow`, `identity-and-setup`, `packaging-and-signing`, `quality`, `templates`, `ui-automation`, `ui-controls`, `visual-design`, `windowing`, `windows-platform-apis` | `mslearn` | — |
| **orchestrator** | Legacy | — | 22 skills (full suite) | `mslearn` | — |
| **(bare/starter)** | Baseline | — | — | — | — |

> **Note:** `mcp-first` and `winmd-first` share the same skill set but differ in their agent instruction emphasis — `winmd-first` prioritizes metadata lookups before MCP doc searches, while `mcp-first` leads with documentation research.

---

## 4. Results Summary

### 4.1 Master Results Table

| Condition | Runs | Avg Score | Build Rate | Run Rate | Avg Tokens |
|-----------|------|-----------|------------|----------|------------|
| bare | 18 | 20.7 | 94% | 33% | 1.9M |
| starter | 29 | 42.5 | 86% | 76% | 2.5M |
| candidate-base-only | 2 | 69.0 | 100% | 100% | 2.0M |
| candidate-base-D | 9 | 57.9 | 100% | 78% | 2.1M |
| candidate-base-DA | 5 | 73.8 | 100% | 100% | 1.4M |
| candidate-base-DAR | 5 | 52.8 | 100% | 60% | 3.8M |
| candidate-base-DARMV | 5 | 83.2 | 100% | 100% | 3.6M |
| candidate-base-DARMVC | 11 | 59.1 | 100% | 82% | 4.8M |
| candidate-mcp-first | 31 | 45.2 | 94% | 71% | 4.0M |
| candidate-winmd-first | 22 | 54.6 | 100% | 82% | 3.8M |
| candidate-single-agent | 27 | 50.4 | 100% | 85% | 4.5M |
| candidate-minimal | 5 | 48.6 | 100% | 80% | 4.2M |
| candidate-lite-orchestrator | 5 | 33.2 | 100% | 100% | 0.2M |

### 4.2 Key Takeaways from the Table

- **Build rate**: All candidate agents achieve 94–100% build rates. The `bare` condition (no agent) surprisingly also builds 94% of the time, but most of those apps crash at runtime (only 33% run rate).
- **Run rate**: The gap between "it builds" and "it runs" is where agent quality matters. `base-DA` and `base-DARMV` achieve 100% run rates; `mcp-first` manages only 71%.
- **Token efficiency**: `base-DA` achieves the highest score (73.8) with the *lowest* token usage (1.4M) of any candidate variant. `lite-orchestrator` uses only 0.2M tokens but scores just 33.2.
- **Score ceiling**: `base-DARMV` at 83.2 avg represents the highest observed score, but with only 5 runs, confidence intervals are wide.

---

## 5. Detailed Analysis

### 5.1 Composable Agent Layer Analysis (Run 27)

The composable system lets us measure the **marginal value of each layer** by comparing adjacent variants:

```
base-only ──(+D)──▶ base-D ──(+A)──▶ base-DA ──(+R)──▶ base-DAR ──(+MV)──▶ base-DARMV ──(+C)──▶ base-DARMVC
   69.0                57.9              73.8              52.8                83.2                  59.1
```

| Transition | Score Delta | Interpretation |
|-----------|------------|----------------|
| base-only → base-D | −11.1* | Design guidance alone didn't help in this small sample |
| base-D → base-DA | +15.9 | Architecture layer (MVVM patterns, project structure) provides substantial lift |
| base-DA → base-DAR | **−21.0** | **Research HURTS.** MCP docs return outdated UWP patterns that cause build errors and runtime crashes |
| base-DAR → base-DARMV | **+30.4** | **Verification recovers.** UI automation lets agents catch and fix research-induced mistakes |
| base-DARMV → base-DARMVC | −24.1 | Checklist overhead doesn't pay off — may cause agents to over-iterate |

**⚠️ Data limitations:** `base-only` has only 2 runs, making that data point unreliable. The base-only → base-D comparison is particularly noisy. With 5+ runs per variant, we expect the trend to show design guidance as beneficial (matching legacy agent data where design-heavy variants consistently outperformed).

**The core insight is robust:** research without verification is net-negative, and verification is the most impactful single layer when combined with earlier layers.

### 5.2 Efficiency Analysis — Score per Million Tokens

| Variant | Avg Score | Avg Tokens | Score/M Tokens | Efficiency Rank |
|---------|-----------|------------|----------------|-----------------|
| lite-orchestrator | 33.2 | 0.2M | 166.0 | 1 (but low score) |
| **base-DA** | **73.8** | **1.4M** | **52.7** | **2 (sweet spot)** |
| base-only | 69.0 | 2.0M | 34.5 | 3 |
| base-D | 57.9 | 2.1M | 27.6 | 4 |
| base-DARMV | 83.2 | 3.6M | 23.1 | 5 |
| starter | 42.5 | 2.5M | 17.0 | 6 |
| winmd-first | 54.6 | 3.8M | 14.4 | 7 |
| base-DAR | 52.8 | 3.8M | 13.9 | 8 |
| base-DARMVC | 59.1 | 4.8M | 12.3 | 9 |
| minimal | 48.6 | 4.2M | 11.6 | 10 |
| single-agent | 50.4 | 4.5M | 11.2 | 11 |
| mcp-first | 45.2 | 4.0M | 11.3 | 12 |
| bare | 20.7 | 1.9M | 10.9 | 13 |

`lite-orchestrator` has the highest tokens-to-score ratio but scores too low to be useful. **`base-DA` is the efficiency sweet spot** — it scores 73.8 at only 1.4M tokens, delivering 52.7 points per million tokens. This is 4.7× more efficient than `mcp-first` and 2.3× more efficient than `base-DARMV`.

When absolute quality matters more than efficiency, `base-DARMV` at 83.2 avg is the clear winner — but it costs 2.6× the tokens.

### 5.3 What Agents Spend Time On

Build-fix iteration patterns vary dramatically by variant (from run 27 data):

| Variant | Typical Build Attempts | Typical UI Verifications | Time Spent |
|---------|----------------------|-------------------------|------------|
| bare | 7–20 | 0 | Mostly fighting build errors |
| starter | 3–10 | 0 | Mix of coding and fixing |
| base-DA | 1–5 | 0 | Mostly coding, few fix loops |
| base-DARMV | 3–8 | 8–21 | Coding + extensive UI testing |
| mcp-first | 5–15 | 0–3 | Heavy MCP queries + fix loops |

**Insight:** `base-DA` achieves low token usage because its design/architecture guidance prevents errors upfront — the agent writes code that compiles on the first or second try. `base-DARMV` uses more tokens but spends them productively on verification rather than unproductive build-fix loops.

### 5.4 Legacy Agent Comparison (Runs 21–23)

The three legacy agents were tested most extensively:

#### Run 23 Results (5 iterations, file-explorer-shell scenario)

| Agent | Avg Score | Range | Reliability | Token Usage |
|-------|-----------|-------|-------------|-------------|
| **winmd-first** | **89.6** | 71–100 | 100% build, 100% run | 3.8M |
| single-agent | 63.6 | 10–86 | 100% build, 80% run | 4.5M |
| mcp-first | 32.6 | 0–77 | 94% build, 40% run | 4.0M |

#### Run 23 Results (5 iterations, file-explorer-shell-minimal scenario)

| Agent | Avg Score | Range | Reliability |
|-------|-----------|-------|-------------|
| single-agent | 46.8 | 38–58 | 100% run |
| winmd-first | 43.4 | 37–47 | 100% run |
| mcp-first | 34.8 | 10–63 | 80% run |

**winmd-first dominated the complex scenario** (89.6 vs 63.6 vs 32.6) but all agents converged on the minimal scenario (43–47 avg). The differentiation only appears on complex multi-feature prompts where build reliability and API correctness matter most.

#### Run-to-Run Variance Warning

With 2 iterations (run 21), the ranking was: mcp-first (87.5) > winmd-first (82) > single-agent (70.5).
With 5 iterations (run 23), the ranking flipped: winmd-first (89.6) > single-agent (63.6) > mcp-first (32.6).

**The 2-iteration data was misleading.** Run 21's mcp-first score of 95 was an outlier. The true distribution shows a 40% failure rate. Minimum 5 iterations per configuration are needed to separate signal from noise.

---

## 6. Failure Analysis

### 6.1 Build Failures

| Error | Occurrences | Root Cause | Category |
|-------|-------------|------------|----------|
| **MSB3073** — XamlCompiler.exe crash | 12 | Invalid XAML causes silent `XamlCompiler.exe` exit code 1 with no diagnostic message. This occurs on the EXE code path (`dotnet build`) but may succeed on the DLL path (MSBuild.exe). | XAML fragility |
| **CS0104** — namespace ambiguity | 6 | `DispatcherQueue` ambiguous between `Microsoft.UI.Dispatching` and `Windows.System`. `FileAttributes` ambiguous between `System.IO` and `Windows.Storage`. Agent imports both namespaces without qualification. | Namespace collision |
| **CS0103 / CS0234** — WPF patterns | 4 | Agent uses `Application.Current.Window`, `Window.Resources`, `Window.DataContext`, `Window.KeyboardAccelerators` — none exist in WinUI 3. Model's training data on WPF/UWP bleeds through. | API hallucination |
| **CS9248** — partial property version mismatch | 2+ | Agent installs `CommunityToolkit.Mvvm 8.3.2` (from training data) which doesn't support partial property syntax. Version 8.4.0+ is required. | Outdated packages |
| **TextBox.Icon**, other invented properties | 2 | Agent fabricates API members that don't exist on any WinUI control. | API hallucination |

#### MSBuild vs dotnet build: The XAML Compiler Paths

A critical infrastructure finding: `dotnet build` and `MSBuild.exe` invoke different XAML compiler code paths:

| Build Tool | XAML Compiler | Code Path | Error Quality |
|-----------|---------------|-----------|--------------|
| `dotnet build` | `XamlCompiler.exe` (EXE) | JSON serialization → external process → deserialize | Often no diagnostic — just `MSB3073 exit code 1` |
| `MSBuild.exe` (build.ps1) | `CompileXaml` (DLL) | In-process MSBuild task | Actual XAML error messages with line numbers |

The harness was switched to use MSBuild.exe (via `build.ps1`) starting in run 24 to match the agent's build path and get better diagnostics. Prior runs used `dotnet build` for harness verification, which occasionally produced different results than the agent's own builds.

### 6.2 Runtime Crashes

| Crash Type | Occurrences | Root Cause |
|-----------|-------------|------------|
| **Generic startup crash** (app exits immediately) | 14 | Various unhandled exceptions during initialization — no stack trace available without `--debug-output` |
| **x:Bind null property** crash | 4 | `{x:Bind ViewModel.SelectedTab.CanGoBack}` compiles fine but crashes at startup when `SelectedTab` is null. The XAML compiler generates code that dereferences the chain without null checks. |
| **XAML parsing error** | 1 | Invalid XAML that passes C# compilation but fails at runtime XAML load |
| **Stale instance collision** | 1 | Second app instance conflicts with a still-running previous instance |
| **Async init on wrong thread** | 1 | JumpList/Share initialization runs before `Window.Activate()` or on a background thread |
| **TabView content wiring** | 1 | `TabViewItem.Content` set to ViewModel object instead of UIElement — renders `ToString()` |

**Diagnostic gap:** No agent ever used `winapp run --debug-output` to capture first-chance exceptions, despite this flag being available. This would have helped diagnose 14 of the 21 runtime crashes.

### 6.3 Feature Gaps

Features most commonly missing from otherwise-functional apps:

| Feature | Times Missing | Why Agents Skip It |
|---------|--------------|-------------------|
| **Wrong ONNX package** (chat scenarios) | 10 | Agent installs generic `Microsoft.ML.OnnxRuntime` instead of `Microsoft.ML.OnnxRuntimeGenAI` or gets the architecture wrong |
| **Search/filter box** | 8 | Not perceived as "core" functionality; agent prioritizes navigation over discovery |
| **Clear/reset button** | 6 | Low-priority UI element, skipped to "save" iteration budget |
| **Status bar with counts** | 4 | Low visual priority, not part of agent's mental model of "done" |
| **Back/forward navigation** | 3 | Agent implements "Up" but forgets history stack pattern |
| **TreeView sidebar** | 2 | Complex to implement correctly with WinUI 3 TreeView control |
| **Column header sorting** | 2 | WinUI ListView lacks built-in sortable headers — requires custom implementation |

### 6.4 Agent Behavior Issues

| Issue | Frequency | Description |
|-------|-----------|-------------|
| **False completion** | ~15% of runs | Agent declares "done" and writes a success summary despite known missing features. Definition of "done" is based on "builds and runs" not "meets all requirements." |
| **Never reads SKILL.md files** | 100% of runs | Despite agent instructions referencing skill files, no agent ever opened or read a `.github/skills/*.md` file. All guidance must be inlined into the agent file or it's invisible. |
| **Pins old package versions** | ~10% of runs | Agent specifies `--version 8.3.2` for CommunityToolkit.Mvvm (from training data). This version doesn't support the partial property syntax the agent then uses. |
| **Build-fix loops on unfamiliar APIs** | ~8% of runs | Agent gets stuck in 5+ iteration loops trying to fix WinRT interop patterns it doesn't know (Share contract, JumpList, file pickers). Each fix introduces new errors. |
| **Redundant MCP queries** | >50% of MCP runs | BreadcrumbBar queried 9×, TreeView 8×, TabView 7× across runs. Results don't change — this is pure token waste. |
| **Never stops at max-continues** | 100% of runs | No agent hit the 50-turn autopilot limit. All stops were self-determined — agents decide they're done, not that they ran out of budget. |

---

## 7. Infrastructure & Tooling

### 7.1 WinMD API Search Tool

**What it is:** A native AOT CLI tool (`winmd.exe`, 7.4MB, ~1,935 lines C#) that indexes WinRT metadata (`.winmd`) and managed .NET DLLs from NuGet packages, Windows SDK, and WinAppSDK. It provides commands: `search`, `members`, `types`, `enums`, `namespaces`, and `check-property`.

**Origin:** Built from the PowerToys `winmd-api-search` skill, extended to:
- Index managed .NET DLLs (not just WinRT metadata)
- Parse XML documentation files for IntelliSense-quality descriptions
- Auto-index packages on first use with global cache
- Provide `check-property` validation with fuzzy suggestions

**Impact on benchmarks:** The `winmd-first` agent achieved 100% build reliability across all runs (0 build failures in 10 iterations in runs 21+23), compared to 94% for `mcp-first`. Access to ground-truth API signatures prevents hallucinated properties and method signatures.

**Critical issue:** A JSON serialization bug introduced during the native AOT build was discovered and fixed at the end of this test cycle. **All prior runs with "winmd" agents were operating with a non-functional metadata tool.** The winmd-first agent's superior performance was actually driven by its instruction emphasis on metadata-first thinking, not the tool itself. Clean benchmark data with the fixed tool is pending.

#### Proposed WinMD Improvements (Spec Written)

| Enhancement | Mechanism | Expected Impact |
|-------------|-----------|----------------|
| XML doc descriptions in `members` | Parse `.xml` files shipped alongside `.winmd` in NuGet packages | Eliminates MCP round-trips for API understanding; ~50K tokens saved per avoided query |
| Namespace disambiguation in `search` | Query-time detection when same type name appears in multiple namespaces | Prevents CS0104 ambiguity build errors |
| `check-property` validation | Property existence check + inheritance walk + fuzzy suggestions | Prevents hallucinated property build errors |
| `[Deprecated]` attribute warnings | Extract deprecation metadata from custom attributes | Prevents use of obsolete APIs |
| `GetForCurrentView()` detection | Method name pattern match → desktop interop warning | Prevents UWP-era runtime errors |
| Attached property recognition | Detect `GetXxx`/`SetXxx` static method patterns | Correct validation of `Grid.Row`, `Canvas.Left`, etc. |
| Inheritance resolution | Walk base type chains for member lookup | Complete property validation across type hierarchies |

### 7.2 MSBuild vs dotnet build

A critical infrastructure discovery: the two build tools invoke different XAML compiler code paths.

```
dotnet build  →  MSBuildRuntimeType == 'Core'  →  XamlCompiler.exe (EXE path)
                                                    ↳ JSON serialize → exec → deserialize
                                                    ↳ Silent exit code 1, no diagnostics

MSBuild.exe   →  MSBuildRuntimeType != 'Core'  →  CompileXaml (DLL path)
                                                    ↳ In-process MSBuild task
                                                    ↳ Actual XAML error messages with line numbers
```

**Action taken:** Starting in run 24, the benchmark harness uses `build.ps1` (MSBuild.exe) instead of `dotnet build` for verification builds. This matches the agent's own build path and produces actionable error messages instead of opaque `MSB3073` failures.

### 7.3 MCP Server Configuration

**Problem:** 263 MCP calls in run 23, with **54% truncated** ("Output too large to read at once — 25KB+"). Truncated results force second round-trips and lose context.

**Fix deployed:** `maxTokenBudget=4000` added to the MCP endpoint configuration. This instructs the Microsoft Learn MCP server to return smaller, focused results instead of full page content.

**Remaining issue:** Even with smaller results, MCP documentation frequently returns UWP-era code samples that don't work in WinUI 3 desktop apps. This is the root cause of the research layer's negative impact (§5.1).

### 7.4 Template Code Improvements (Proposed)

A PR spec has been written for changes to the `dotnet new winui` template that would prevent ~30% of observed build failures:

| Change | What It Prevents | Error Frequency |
|--------|-----------------|-----------------|
| `App.Window` as static property | `Application.Current.Window` / `Window.Current` errors | ~15% of runs |
| Pre-installed `CommunityToolkit.Mvvm 8.4.2` | Version mismatch with partial property syntax | ~10% of runs |
| `App.DispatcherQueue` (fully qualified `Microsoft.UI.Dispatching`) | CS0104 `DispatcherQueue` ambiguity | ~8% of runs |
| `App.WindowHandle` (nint via `WindowNative`) | File picker / Share contract HWND crashes | ~5% of runs |
| Sample ViewModel with partial property syntax | Incorrect `[ObservableProperty] private string _field` usage | ~10% of runs |

**Expected combined impact:** These changes would prevent 100% of `Application.Current.Window` errors, 100% of toolkit version mismatches, 100% of `DispatcherQueue` ambiguity errors, and 100% of HWND interop errors — addressing approximately 30% of all build failures observed across 100+ runs.

#### Proposed PR Additions

Beyond template code, two additional improvements have been spec'd:

1. **`xaml-safety.instructions.md`** — A `.github/instructions/` file covering `x:Bind` null crash prevention, `OneTime` vs `OneWay` mode defaults, `Window` not being a `UIElement`, and `ContentDialog.XamlRoot` requirements. Targets the ~15% of runtime crashes caused by unsafe XAML patterns.

2. **Safe ViewModel pattern** — Template sample showing null-safe computed properties for `x:Bind` (e.g., `SelectedItemName => SelectedItem?.Name ?? ""` with `OnPropertyChanged` notification).

---

## 8. What's Next

### 8.1 Immediate (Next Sprint)

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| **P0** | Run benchmarks with the **fixed WinMD tool** | First clean data on metadata-first development. Could significantly improve all metadata-equipped variants. |
| **P0** | Test composable variants with **5+ iterations each** | Current data has 2–5 runs per variant — need statistical validity before making agent design decisions. |
| **P1** | Implement and test **template code changes** (App.Window, DispatcherQueue, HWND, toolkit) | Expected to prevent ~30% of build failures across all variants. |
| **P1** | Run with **Opus model** | Understand the quality ceiling and whether guidance that helps Sonnet also helps Opus. |

### 8.2 Medium Term

| Action | Rationale |
|--------|-----------|
| **Evaluate intermediate file strategy** | Have agents write design/architecture to a file before coding (structured thinking). May improve plan quality without inline token cost. |
| **Test sub-agent orchestration** | Planner → Builder → Verifier pipeline. May improve on single-agent approaches for complex scenarios. |
| **Progressive build strategy** | Build after each feature instead of writing all code first. Catches XAML compiler issues early before they compound. |
| **`winapp run --debug-output` integration** | Zero agents used this flag despite it being available. Adding explicit guidance may help diagnose the 14 generic startup crashes. |

### 8.3 Open Questions

1. **Is the research layer recoverable?** With fixed WinMD + better MCP token limits, does `base-DAR` outperform `base-DA`? Or is MCP documentation fundamentally too noisy for WinUI 3?

2. **What's the ceiling?** `base-DARMV` scored 83.2 with a broken WinMD tool. With a working tool, can we consistently hit 90+?

3. **Does the checklist layer help with more data?** `base-DARMVC` scored lower than `base-DARMV`, but with only 11 vs 5 runs and potentially different scenario mixes. Controlled comparison needed.

4. **Are composable agents better than legacy agents?** `base-DARMV` (83.2) outperformed `winmd-first` (54.6) in aggregate, but they were tested on different run batches with different scenario distributions. Head-to-head comparison needed.

5. **How much of winmd-first's success was the tool vs the instructions?** Since the WinMD tool was broken, `winmd-first`'s 89.6 on file-explorer-shell came entirely from instruction quality. Will a working tool push it even higher?

---

## Appendix A: Limitations and Caveats

- **Composable agent data is preliminary.** Most composable variants have 2–9 runs. Statistical significance requires 5+ iterations per scenario per variant (≥25 total runs per variant across 5 scenarios).

- **WinMD tool was broken during most runs.** A JSON serialization bug in the native AOT build meant all runs labeling agents as "winmd-equipped" were operating without a functional metadata tool. Results for these variants reflect instruction quality, not tool effectiveness.

- **Scenario mix varies across run batches.** Not all variants were tested on all scenarios. Score comparisons across variants tested in different batches should be interpreted cautiously.

- **Single model tested.** All runs used Claude Sonnet 4.5. Results may not generalize to other models (GPT-4, Opus, Haiku).

- **Scoring uses AI validation.** The 0–10 quality scores and requirements pass/fail assessments are produced by an AI validator, which may have its own biases and inconsistencies.

- **No agent hit external limits.** All agents stopped because they decided they were done, not because they ran out of budget. The 50-turn max-autopilot-continues limit was never reached. This means scores reflect agent self-assessment quality as much as coding ability.

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Condition** | The setup given to the agent: bare (nothing), starter (template instructions), candidate (custom agent) |
| **Build Rate** | Percentage of runs where MSBuild compilation succeeded |
| **Run Rate** | Percentage of runs where the app launched and a window was detected |
| **Tokens** | Total input + output tokens consumed by the Copilot CLI session |
| **Score/M Tokens** | Average score divided by average token usage in millions — measures efficiency |
| **DARMVC** | Acronym for the composable layers: Design, Architecture, Research, Metadata, Verify, Checklist |
| **WinMD** | Windows Metadata — binary files (`.winmd`) containing type information for WinRT APIs |
| **MCP** | Model Context Protocol — used to connect to the Microsoft Learn documentation server |
| **x:Bind** | WinUI 3's compiled data binding syntax; defaults to `OneTime` mode unlike WPF's `Binding` |
| **MSB3073** | MSBuild error code indicating a tool (typically XamlCompiler.exe) returned a non-zero exit code |
