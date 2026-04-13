# WinUI3 vs SwiftUI: Agent Token Consumption Analysis

## Executive Summary

WinUI3 agent sessions consume **3.18× more tokens** than equivalent SwiftUI sessions on average (6.71M vs 2.11M). The gap widens dramatically with richer skill conditions—from **1.26×** in bare conditions to **4.71×** in DA conditions. The root cause is **not build errors or compilation complexity**, but rather three compounding factors:

1. **UI automation overhead** (winapp ui) — WinUI3 sessions spend 30-50% of tokens on screenshot-inspect-invoke-fix loops that SwiftUI doesn't need
2. **Layout debugging loops** — WinUI3's TabView content sizing behavior is a consistent trap, causing full layout redesigns mid-session
3. **Session duration** — WinUI3 sessions average 35.6 minutes vs SwiftUI's 15.1 minutes; each extra minute compounds input tokens via context accumulation

---

## 1. Token Usage Comparison

### Per-Condition Averages (3 trials each)

| Condition     | WinUI3 Avg Tokens | SwiftUI Avg Tokens | Ratio | WinUI3 BFC | SwiftUI BFC |
|---------------|------------------:|-------------------:|------:|-----------:|------------:|
| bare          |         2,318,600 |          1,841,967 |  1.26 |        3.7 |         2.7 |
| base/base-only|         4,384,533 |          1,887,267 |  2.32 |        2.7 |         1.7 |
| D/base-D      |         3,458,033 |          1,612,400 |  2.14 |        1.7 |         2.0 |
| DA/base-DA    |         9,042,367 |          1,918,733 |  4.71 |        6.0 |         2.0 |
| DAMV/DAV      |        14,366,000 |          3,295,400 |  4.36 |        7.3 |         6.0 |

### Platform-Wide Averages

| Metric          | WinUI3      | SwiftUI     | Ratio |
|-----------------|------------:|------------:|------:|
| Avg Total Tokens|   6,713,907 |   2,111,153 |  3.18 |
| Avg Input       |   6,642,473 |   2,060,000 |  3.23 |
| Avg Output      |      71,433 |      51,153 |  1.40 |
| Avg BFC         |         4.3 |         2.9 |  1.48 |
| Avg Score       |        59.6 |        48.3 |  1.23 |
| Avg Session Time|      35.6m  |       15.1m |  2.36 |

**Key observation**: The input token ratio (3.23×) is much larger than the output token ratio (1.40×). This means WinUI3 sessions aren't generating dramatically more code—they're **re-reading more context** across more turns.

---

## 2. Build Error & Fix Cycle Analysis

### Session Log Metrics

| Platform | Avg Session Lines | Avg Build Cmds | Avg UI Auto Cmds | Avg Validation Log Lines |
|----------|------------------:|---------------:|-----------------:|-------------------------:|
| WinUI3   |               497 |            4.7 |             25.4 |                      396 |
| SwiftUI  |               222 |            5.3 |              1.5 |                      853 |

**Surprising finding**: SwiftUI sessions actually run *more* build commands on average (5.3 vs 4.7), mostly because they include test builds. But WinUI3 sessions have **17× more UI automation commands** in the build session itself.

### Error Types Encountered

**WinUI3 common errors:**
- Missing `using` directives (System, System.IO, CommunityToolkit namespaces)
- Cascading XAML errors from C# compilation failures
- TabView content area sizing (StackPanel-like internal layout)
- WindowsAppRuntime registration version mismatches
- WebView2 `CoreWebView2` not initialized (NavigateToString silently fails)
- TextChanged event firing asynchronously (dirty flag race conditions)
- CS0252 warnings (reference comparison on TabViewItem)

**SwiftUI common errors:**
- Test target missing `GENERATE_INFOPLIST_FILE: true` in project.yml
- XCUITest accessibility identifier mismatches
- XCUITest dylib/coverage instrumentation failures
- Minor Swift type errors (usually 1-2 per session)

**WinUI3 errors are more systemic** — a single layout issue (TabView stretching) cascades into 3-4 build/run/inspect cycles, while SwiftUI errors are typically isolated config fixes.

---

## 3. Root Cause Analysis: Where Do the Extra Tokens Go?

### Cause 1: UI Automation Overhead (estimated 35-45% of excess tokens)

WinUI3's `winapp ui` tool requires an iterative probe-act-verify workflow:

```
inspect → find element slugs → invoke/set-value → screenshot → read screenshot → 
discover stale slugs → re-inspect → retry → ...
```

The highest-token session (base-DAMV i3, 19M tokens) ran **72 winapp ui commands** and took **47 screenshots** just in the build session—plus another 81 winapp commands in the validation log. Each screenshot is a base64-encoded image consuming thousands of input tokens when re-read.

SwiftUI sessions have **zero UI automation** in 13/15 cases. When they do validate, it's via `open` command + `screencapture` (2 commands total).

**Specific wasteful patterns observed:**
- `winapp ui invoke` on flyout menu items fails because popup windows have different HWNDs — requires list-windows → find popup → re-inspect → retry (4-6 extra commands per menu interaction)
- Runtime IDs/slugs change on every app restart, requiring full re-inspection
- SendKeys doesn't reliably reach WinUI apps, requiring P/Invoke workarounds (SetForegroundWindow, AttachThreadInput)
- TextBox set-value often fails on first attempt, requiring focus → retry → verify

### Cause 2: Layout Debugging Loops (estimated 20-30% of excess tokens)

The #1 recurring WinUI3 issue across 9/15 sessions: **TabView content doesn't stretch child controls vertically**. This manifests as:

1. Agent builds app → runs → takes screenshot → TextBox is 50px tall
2. Tries `VerticalAlignment="Stretch"` → rebuild → still doesn't stretch
3. Tries wrapping in Grid → rebuild → partial fix
4. Eventually redesigns entire layout (shared TextBox outside TabView, or ContentHost pattern)

This single issue consumed **2-4 build/run/fix cycles per session** (estimated 1-3M tokens each time in the DA/DAMV conditions).

SwiftUI has no equivalent trap — its layout system (VStack/HSplitView) stretches content by default.

### Cause 3: Session Duration & Context Accumulation (estimated 20-25% of excess tokens)

WinUI3 sessions average **35.6 minutes** vs SwiftUI's **15.1 minutes**. Because LLM input tokens grow with context:
- Turn 1: ~50K input tokens
- Turn 10: ~200K input tokens  
- Turn 30: ~500K+ input tokens (with screenshots)
- Turn 50: ~1M+ input tokens

The longer a session runs, the more each subsequent turn costs in input tokens. WinUI3's fix loops keep the session alive longer, compounding the problem.

### Cause 4: Sub-Agent Orchestration (bare condition only, ~10% of excess)

In the `bare` condition, WinUI3 uses a multi-agent orchestration pipeline (Designer → Architect → Builder) while SwiftUI works single-threaded. The `bare_i1` session spent **27 read_agent polls** (15+ minutes blocking) waiting for the orchestrator, plus the orchestrator's own 35+ minutes of internal work.

---

## 4. Retrospective Insights

### Confidence Scores
- **WinUI3 avg**: 6.27/10
- **SwiftUI avg**: 7.87/10

### Skills Usage Pattern
- **SwiftUI** consistently reads 4-5 skill reference docs upfront and avoids errors
- **WinUI3** mostly uses only `dev-workflow` skill; frequently ignores `search-docs`, `templates`, `windowing`, `quality` skills that could prevent errors

### Failed API Count
- **WinUI3 avg**: 4.13 failed APIs per session (often training-data-based guesses)
- **SwiftUI avg**: 1.80 failed APIs per session (mostly XcodeGen config issues)

---

## 5. Condition Escalation Analysis

The token gap **widens superlinearly** with more skills/validation enabled:

| Condition | Adds              | WinUI3 Token Δ | SwiftUI Token Δ | Notes |
|-----------|-------------------|---------------:|----------------:|-------|
| bare→base | Base skill docs   |    +2.07M (+89%) |  +0.05M (+2%)  | WinUI skills trigger orchestration |
| base→D    | Design docs       |    -0.93M (-21%) |  -0.27M (-14%) | Design docs help both platforms |
| D→DA      | Arch docs         |    +5.58M (+161%)|  +0.31M (+19%) | WinUI: more features → more fix loops |
| DA→DAMV   | Manual validation |    +5.32M (+59%) |  +1.38M (+72%) | Both increase; WinUI has UIA overhead |

The DA→DAMV jump confirms that **manual validation (V) is expensive for both platforms**, but WinUI3 pays a much higher absolute cost because its UI automation tooling is more error-prone.

---

## 6. Actionable Recommendations

### High Impact (would reduce tokens 40-60%)

1. **Fix the TabView stretch issue at the skill/template level**
   - Include a pre-built XAML template that uses the "shared editor outside TabView" pattern
   - Document that TabView's internal ContentPresenter doesn't propagate `VerticalAlignment="Stretch"` to content
   - This single fix would eliminate the #1 time sink across 9/15 sessions

2. **Reduce UI automation round-trips**
   - Cache and reuse element slugs within a single app session
   - Add a `winapp ui batch` command that combines inspect + set-value + screenshot in one call
   - Auto-retry with re-inspection on stale element errors instead of failing
   - Consider a higher-level `winapp ui test-scenario` that runs a predefined sequence

3. **Screenshot token optimization**
   - Reduce screenshot resolution for verification purposes
   - Use element-level screenshots instead of full-window captures
   - Consider text-based UI tree dumps instead of screenshots for initial verification

### Medium Impact (would reduce tokens 15-25%)

4. **Enforce skill doc reading order**
   - WinUI3 sessions that read more skill docs had fewer errors
   - Auto-inject `templates` and `windowing` skills when building apps with TabView/WebView2

5. **Add build error prevention to templates**
   - Include all standard `using` directives in code templates
   - Pre-configure WebView2 initialization with `EnsureCoreWebView2Async` pattern
   - Include WindowsAppRuntime version pinning in project templates

6. **Session time budget**
   - Implement a token budget alarm at 5M tokens that triggers strategy change
   - If build/fix loop exceeds 3 cycles on the same issue, pivot to a known-good template

### Lower Impact (quality improvements)

7. **Menu/flyout interaction pattern**
   - Document the popup-window-HWND pattern for WinUI3 flyout menus
   - Include a helper function in the skill for menu interaction
   
8. **TextChanged event guard pattern**
   - Include a standard `_isUpdating` guard pattern in templates
   - Document the async TextChanged behavior

---

## Appendix: Raw Data

### Individual Trial Data

| Trial | Platform | Tokens | BFC | Score | UIAuto | Session | SessionTime |
|-------|----------|-------:|----:|------:|-------:|--------:|-------------|
| bare i1 | WinUI3 | 590K | 9 | 0 | 0 | 465 | 55m 24s |
| bare i2 | WinUI3 | 1.2M | 0 | 0 | 0 | 342 | 42m 6s |
| bare i3 | WinUI3 | 5.2M | 2 | 87 | 19 | 346 | 22m 37s |
| base-only i1 | WinUI3 | 380K | 0 | 88 | 26 | 402 | 29m 34s |
| base-only i2 | WinUI3 | 7.8M | 4 | 88 | 16 | 377 | 32m 20s |
| base-only i3 | WinUI3 | 5.0M | 4 | 86 | 27 | 379 | 30m 18s |
| base-D i1 | WinUI3 | 7.3M | 3 | 86 | 7 | 397 | 30m 21s |
| base-D i2 | WinUI3 | 34K | 0 | 16 | 0 | 24 | 8m 58s |
| base-D i3 | WinUI3 | 3.1M | 2 | 84 | 8 | 202 | 26m 30s |
| base-DA i1 | WinUI3 | 7.5M | 5 | 89 | 11 | 538 | 29m 22s |
| base-DA i2 | WinUI3 | 9.4M | 7 | 82 | 33 | 660 | 44m 37s |
| base-DA i3 | WinUI3 | 10.3M | 6 | 90 | 34 | 684 | 34m 44s |
| base-DAMV i1 | WinUI3 | 11.8M | 5 | 10 | 40 | 761 | 41m 23s |
| base-DAMV i2 | WinUI3 | 12.3M | 6 | 0 | 60 | 850 | 47m 12s |
| base-DAMV i3 | WinUI3 | 19.0M | 11 | 88 | 81 | 1029 | 53m 20s |
| bare i1 | SwiftUI | 1.4M | 1 | 0 | 0 | 193 | 12m 49s |
| bare i2 | SwiftUI | 2.1M | 2 | 0 | 0 | 193 | 13m 31s |
| bare i3 | SwiftUI | 2.0M | 5 | 0 | 0 | 237 | 7m 57s |
| base i1 | SwiftUI | 2.5M | 3 | 86 | 0 | 236 | 14m 20s |
| base i2 | SwiftUI | 1.4M | 1 | 83 | 0 | 170 | 13m 48s |
| base i3 | SwiftUI | 1.9M | 1 | 69 | 0 | 196 | 18m 26s |
| D i1 | SwiftUI | 1.8M | 4 | 10 | 0 | 224 | 11m 53s |
| D i2 | SwiftUI | 1.3M | 1 | 10 | 0 | 187 | 12m 33s |
| D i3 | SwiftUI | 1.7M | 1 | 82 | 0 | 190 | 13m 37s |
| DA i1 | SwiftUI | 1.6M | 3 | 76 | 0 | 176 | 13m 25s |
| DA i2 | SwiftUI | 1.9M | 1 | 68 | 0 | 202 | 13m 45s |
| DA i3 | SwiftUI | 2.4M | 2 | 79 | 0 | 236 | 14m 34s |
| DAV i1 | SwiftUI | 3.5M | 6 | 10 | 0 | 301 | 26m 2s |
| DAV i2 | SwiftUI | 3.3M | 5 | 83 | 0 | 305 | 21m 17s |
| DAV i3 | SwiftUI | 3.2M | 7 | 68 | 0 | 288 | 23m 40s |

### Top WinUI3 Time Sinks (aggregated from retrospectives)

1. **UI automation stale elements / syntax trial-and-error** — 11/15 sessions
2. **TabView content sizing** — 9/15 sessions  
3. **WindowsAppRuntime registration** — 4/15 sessions
4. **WebView2 initialization** — 4/15 sessions
5. **Sub-agent orchestration polling** — 3/15 sessions
6. **Dirty indicator race condition** — 3/15 sessions

### Top SwiftUI Time Sinks (aggregated from retrospectives)

1. **Reading skill reference docs** — 10/15 sessions (but valuable)
2. **XCUITest iteration** — 5/15 sessions (DAV condition only)
3. **Build output verbosity** — 3/15 sessions
4. **Custom MarkdownParser** — 2/15 sessions
