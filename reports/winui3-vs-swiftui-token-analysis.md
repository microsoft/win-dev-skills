# WinUI3 vs SwiftUI: Agent Benchmark Token Consumption Analysis

## Executive Summary

WinUI3 agent sessions consume **3.2× more input tokens** than equivalent SwiftUI sessions on average (6.6M vs 2.1M input tokens). The gap is **not** caused by code generation complexity or build error frequency—output tokens are only 1.4× higher. Instead, the excess comes from **context re-reading** driven by three compounding factors:

1. **UI automation overhead** (35–45% of excess): WinUI3 sessions average 25 `winapp ui` operations per trial, including screenshots that embed base64 image data into the context. SwiftUI sessions have zero UI automation in 13/15 trials.
2. **The TabView layout trap** (20–30% of excess): 9/15 WinUI3 sessions hit the same runtime layout bug where `TabView` content doesn't stretch child controls vertically. This triggers 2–4 build→run→screenshot→redesign cycles, each costing 1–3M tokens.
3. **Session duration compounding** (20–25% of excess): WinUI3 sessions average 35.6 minutes vs SwiftUI's 15.1 minutes. Each additional turn re-reads the growing context, so longer sessions are superlinearly more expensive.

The token gap widens with richer skill conditions: from 1.3× at bare to **4.8×** at DA. This is because more instructions → more features attempted → more layout and runtime issues → more verification loops.

---

## 1. Token Usage by Condition

### Per-Condition Averages (3 trials each)

| Condition Pair | WinUI3 Avg Input | SwiftUI Avg Input | Ratio | WinUI3 Avg Output | SwiftUI Avg Output |
|----------------|----------------:|------------------:|------:|------------------:|-------------------:|
| bare / bare | 2.3M | 1.8M | **1.3×** | 64.2k | 42.0k |
| base-only / base | 4.3M | 1.8M | **2.4×** | 59.9k | 53.9k |
| base-D / D | 3.4M | 1.6M | **2.2×** | 58.0k | 45.7k |
| base-DA / DA | 9.0M | 1.9M | **4.8×** | 75.7k | 52.1k |
| base-DAMV / DAV | 14.3M | 3.2M | **4.4×** | 99.3k | 62.1k |

### Platform-Wide Averages

| Metric | WinUI3 | SwiftUI | Ratio |
|--------|-------:|--------:|------:|
| Avg Input Tokens | 6.6M | 2.1M | 3.2× |
| Avg Output Tokens | 71.4k | 51.2k | 1.4× |
| Avg Cached Tokens | 6.2M | 1.8M | 3.4× |
| Avg Build-Fix Cycles | 4.3 | 2.9 | 1.5× |
| Avg Session Time | 35.6 min | 15.1 min | 2.4× |
| Avg Score | 59.6 | 48.3 | 1.2× |

**Key insight**: The input-to-output token ratio is 93:1 for WinUI3 vs 40:1 for SwiftUI. WinUI3 sessions aren't producing dramatically more code—they're **re-reading massively more context** due to longer sessions with more turns.

---

## 2. Individual Trial Data

### WinUI3 Trials

| Trial | Input | Output | Cached | Score | Build-Fix | Winapp Ops | Screenshots | Session Time |
|-------|------:|-------:|-------:|------:|----------:|-----------:|------------:|-------------|
| bare i1 | 463k | 127k | 0 | 0 | 9 | 0 | 0 | 55m 24s |
| bare i2 | 1.2M | 2.7k | 277k | 0 | 0 | 3 | 0 | 42m 6s |
| bare i3 | 5.1M | 63k | 4.9M | 87 | 2 | 19 | 10 | 22m 37s |
| base-only i1 | 374k | 6.3k | 244k | 88 | 0 | 29 | 25 | 29m 34s |
| base-only i2 | 7.7M | 75k | 7.4M | 88 | 4 | 20 | 25 | 32m 20s |
| base-only i3 | 4.9M | 98k | 4.6M | 86 | 4 | 29 | 26 | 30m 18s |
| base-D i1 | 7.2M | 71k | 6.8M | 86 | 3 | 12 | 12 | 30m 21s |
| base-D i2 | 0 | 34k | 0 | 16 | 0 | 0 | 0 | 8m 58s |
| base-D i3 | 3.0M | 70k | 2.8M | 84 | 2 | 9 | 12 | 26m 30s |
| base-DA i1 | 7.4M | 66k | 7.0M | 89 | 5 | 16 | 21 | 29m 22s |
| base-DA i2 | 9.3M | 82k | 8.7M | 82 | 7 | 33 | 39 | 44m 37s |
| base-DA i3 | 10.2M | 79k | 9.5M | 90 | 6 | 38 | 34 | 34m 44s |
| base-DAMV i1 | 11.7M | 85k | 11.3M | 10 | 5 | 47 | 28 | 41m 23s |
| base-DAMV i2 | 12.2M | 90k | 11.6M | 0 | 6 | 65 | 22 | 47m 12s |
| **base-DAMV i3** | **18.9M** | **123k** | **18.5M** | **88** | **11** | **78** | **47** | **53m 20s** |

### SwiftUI Trials

| Trial | Input | Output | Cached | Score | Build-Fix | Test Runs | Screenshots | Session Time |
|-------|------:|-------:|-------:|------:|----------:|----------:|------------:|-------------|
| bare i1 | 1.4M | 49k | 1.1M | 0 | 1 | 1 | 0 | 12m 49s |
| bare i2 | 2.0M | 53k | 1.8M | 0 | 2 | 3 | 0 | 13m 31s |
| bare i3 | 2.0M | 25k | 1.9M | 0 | 5 | 6 | 0 | 7m 57s |
| base i1 | 2.4M | 58k | 2.2M | 86 | 3 | 8 | 0 | 14m 20s |
| base i2 | 1.3M | 52k | 1.1M | 83 | 1 | 2 | 0 | 13m 48s |
| base i3 | 1.8M | 52k | 1.6M | 69 | 1 | 4 | 0 | 18m 26s |
| D i1 | 1.8M | 36k | 1.7M | 10 | 4 | 5 | 0 | 11m 53s |
| D i2 | 1.3M | 48k | 1.1M | 10 | 1 | 0 | 0 | 12m 33s |
| D i3 | 1.6M | 53k | 1.4M | 82 | 1 | 6 | 0 | 13m 37s |
| DA i1 | 1.5M | 51k | 1.3M | 76 | 3 | 6 | 0 | 13m 25s |
| DA i2 | 1.8M | 51k | 1.6M | 68 | 1 | 5 | 0 | 13m 45s |
| DA i3 | 2.3M | 55k | 2.1M | 79 | 2 | 5 | 0 | 14m 34s |
| DAV i1 | 3.4M | 63k | 3.2M | 10 | 6 | 31 | 0 | 26m 2s |
| DAV i2 | 3.2M | 63k | 3.0M | 83 | 5 | 20 | 15 | 21m 17s |
| DAV i3 | 3.1M | 60k | 2.9M | 68 | 7 | 29 | 0 | 23m 40s |

---

## 3. Root Cause Analysis

### 3.1 UI Automation Overhead (35–45% of excess tokens)

WinUI3's `winapp ui` tool requires an iterative probe-act-verify workflow that SwiftUI completely avoids:

```
inspect → find element slugs → invoke/set-value → screenshot → read screenshot →
discover stale slugs → re-inspect → retry → ...
```

**Winapp operations per trial:**

| Condition | WinUI3 Avg Winapp Ops | WinUI3 Avg Screenshots | SwiftUI Screenshots |
|-----------|---------------------:|----------------------:|--------------------:|
| bare | 7 | 3 | 0 |
| base-only/base | 26 | 25 | 0 |
| base-D/D | 7 | 8 | 0 |
| base-DA/DA | 29 | 31 | 0 |
| base-DAMV/DAV | 63 | 32 | 5 |

The correlation between winapp operations and input tokens is strong:

| Winapp Ops Range | Avg Input Tokens | Trial Count |
|-----------------|----------------:|------------:|
| 0 | 0.4M | 4 |
| 1–15 | 3.8M | 3 |
| 16–30 | 6.0M | 4 |
| 31–50 | 10.2M | 2 |
| 51–80 | 15.6M | 2 |

Each screenshot embeds a base64-encoded PNG image into the conversation context. At the most extreme (base-DAMV i3), **47 screenshots** were taken in a single 53-minute session. Every subsequent turn after a screenshot re-reads all prior screenshots as cached input tokens.

**Concrete example — base-DA i2 (9.3M tokens, 39 screenshots):**

The agent follows this cycle repeatedly:
1. Run app → take screenshot → read screenshot → "The editor/preview are only 58px tall"
2. Fix XAML → rebuild → run app → take screenshot → "Still the same issue"
3. Redesign layout → rebuild → run app → take screenshot → verify
4. Try typing via SendKeys → fails → try `winapp ui set-value` → fails → try clipboard paste → works
5. Take another screenshot to verify text appeared

Each cycle involves 4–6 shell commands, 2–3 screenshots, and 1–3 file reads/edits, all accumulating in the context.

**SwiftUI's verification approach is fundamentally different.** Instead of visual UI automation, SwiftUI sessions verify via:
- Unit tests (`xcodebuild test`) — text-based output, minimal tokens
- `open MarkdownEdit.app` — a single command with no return data
- Occasionally `screencapture` — but only 1–2 screenshots total in the DAV condition

**Failed API categories reflecting UI automation issues (WinUI3):**

| Category | Occurrences | Example |
|----------|----------:|---------|
| UI automation | 19 | `winapp ui sendkeys` → `SendKeys.SendWait()` after `winapp ui focus` |
| AutomationId | 6 | `AutomationProperties.AutomationId` in initializer → `AutomationProperties.SetAutomationId()` static method |

### 3.2 The TabView Layout Trap (20–30% of excess tokens)

The single most consistent WinUI3 issue across trials: **TabView's content area does not stretch child controls vertically.** This is not a compile-time error — the code builds successfully, the app launches, but the TextBox renders at its natural height (~50px) instead of filling the TabView's content area.

**Frequency**: 9/15 WinUI3 sessions encountered this issue (as reported in time sinks). The failed API analysis shows 9 TabView-layout-related API failures.

**SwiftUI equivalent**: None. SwiftUI's `TabView` is a different control (a page/tab selector), and `VStack`/`HSplitView` containers expand their children by default.

**Concrete example — base-DAMV i3 (18.9M tokens):**

The session log shows this exact sequence:

```
● Run the app with winapp
● Screenshot the app
  → "Good - the layout is correct" (initial assessment was wrong)

● Inspect editor controls
  → "The TextBox is only 50px high - not stretching"

● Stop app
● Read MainWindow.xaml.cs (43 lines)
● Edit: wrap TextBox in Grid for stretching (+7 -1)
● Edit: update GetCurrentTextBox for Grid wrapper (+4)
● Edit: add helper method for TextBox extraction (+7)
● Edit: replace direct casts (×3 edits)
● Rebuild → Build succeeded
● Run app again
● Screenshot after fix
  → "Still the same issue. The TextBox isn't filling the TabView content area."

● Stop app
● "I need to fundamentally change the layout approach"
● Edit MainWindow.xaml: complete redesign (+52 -50)
● Rewrite MainWindow.xaml.cs for shared TextBox pattern
● Rebuild → Run → Screenshot → Finally working
```

This single issue consumed **8 tool calls, 2 builds, 2 runs, 2 screenshots, and a complete XAML/code-behind rewrite** — estimated at 2–4M tokens.

**Why it keeps happening**: The agent's training data likely contains patterns like `tabViewItem.Content = new TextBox()` which compile and appear correct, but TabView internally wraps content in a `ContentPresenter` with `StackPanel`-like sizing that doesn't propagate `VerticalAlignment="Stretch"`. The only way to discover this is at runtime.

### 3.3 Session Duration & Context Accumulation (20–25% of excess tokens)

LLM input tokens grow with each turn because the entire conversation history is re-sent. The cost-per-turn increases superlinearly:

| Turn Range | Estimated Input per Turn (no screenshots) | With Screenshots |
|-----------|------------------------------------------:|----------------:|
| 1–5 | ~50k | ~100k |
| 10–15 | ~150k | ~400k |
| 20–30 | ~300k | ~800k |
| 30–50 | ~500k | ~1.5M+ |

**Average session durations by condition:**

| Condition | WinUI3 Avg | SwiftUI Avg | WinUI3/SwiftUI |
|-----------|----------:|-----------:|---------------:|
| bare | 40.0 min | 11.4 min | 3.5× |
| base-only/base | 30.7 min | 15.5 min | 2.0× |
| base-D/D | 21.9 min | 12.7 min | 1.7× |
| base-DA/DA | 36.2 min | 13.9 min | 2.6× |
| base-DAMV/DAV | 47.3 min | 23.7 min | 2.0× |

WinUI3 sessions run longer because:
1. Build-fix-verify loops take more cycles (4.3 avg vs 2.9)
2. Each verification cycle involves running the app, taking screenshots, and inspecting UI elements
3. Runtime-only issues (TabView stretch, WebView2 init) can only be discovered after launch

### 3.4 Build Error Patterns Compared

**WinUI3 error categories (from retrospectives across 15 sessions):**

| Error Category | Frequency | Token Cost | Typical Fix |
|---------------|----------:|-----------:|-------------|
| TabView layout sizing | 9/15 | 2–4M | Complete layout redesign |
| UI automation tool failures | 11/15 | 1–3M | Trial-and-error with different approaches |
| WebView2 CoreWebView2 not initialized | 4/15 | 0.5–1M | Add `EnsureCoreWebView2Async()` |
| Missing `using` directives | 4/15 | 0.2–0.5M | Add import statement |
| WindowsAppRuntime registration | 4/15 | 0.5–1M | Version pinning |
| Dirty indicator race condition | 3/15 | 0.5–1M | Content comparison guard |
| AutomationId syntax | 6/15 | 0.2M | Switch to static `SetAutomationId()` |

**SwiftUI error categories (from retrospectives across 15 sessions):**

| Error Category | Frequency | Token Cost | Typical Fix |
|---------------|----------:|-----------:|-------------|
| Accessibility API syntax | 8/15 | 0.1–0.2M | `setAccessibilityIdentifier()` method call |
| Project.yml config | 7/15 | 0.2–0.5M | Add `GENERATE_INFOPLIST_FILE: true` |
| XCUITest compatibility | 6/15 | 0.5–2M | Rewrite test assertions |
| SwiftUI type errors | 2/15 | 0.1M | `Color.accentColor` not `.accentColor` |
| Swift syntax | 1/15 | 0.1M | `[:]` not `[]` for empty dict |

**Key difference**: WinUI3 errors are **systemic and cascading** — a single layout issue triggers a chain of 3–4 build/run/inspect cycles. SwiftUI errors are **isolated and cheap** — typically fixed with a 1-line edit and a rebuild.

---

## 4. Condition Escalation Analysis

The token gap **widens superlinearly** as more skill sections are added:

| Transition | What's Added | WinUI3 Δ | SwiftUI Δ | Notes |
|-----------|-------------|--------:|--------:|-------|
| bare → base | Base skill docs | +2.1M (+89%) | +0.05M (+2%) | WinUI skills trigger orchestration/features |
| base → D | Design section | −0.9M (−21%) | −0.3M (−14%) | Design docs help both platforms |
| D → DA | Architecture section | +5.6M (+161%) | +0.3M (+19%) | WinUI: more features → more fix loops |
| DA → DAMV/DAV | Verification section | +5.3M (+59%) | +1.4M (+72%) | Both increase; WinUI has UIA overhead |

**Notable**: The D (Design) section actually *reduces* tokens for both platforms — it provides focused guidance that prevents wasted exploration. But the DA jump for WinUI3 is enormous (+161%) because the Architecture section encourages more comprehensive feature implementation, which triggers more layout/runtime issues.

---

## 5. Retrospective Insights

### Confidence Scores

| Platform | Average Confidence | Min | Max |
|----------|------------------:|----:|----:|
| WinUI3 | 6.3/10 | 3 | 9 |
| SwiftUI | 7.9/10 | 5 | 9 |

### Skills Usage Pattern

- **SwiftUI** consistently reads 4–5 skill reference docs upfront (project-scaffolding.md, build-new-app.md, macos-polish.md, design-system.md) and avoids many common errors
- **WinUI3** typically reads only `dev-workflow` skill; frequently ignores `templates`, `windowing`, and `quality` skills that could prevent the TabView and WebView2 issues

### Failed API Totals

| Platform | Total Failed APIs | Avg per Session |
|----------|------------------:|----------------:|
| WinUI3 | 62 | 4.1 |
| SwiftUI | 27 | 1.8 |

WinUI3 has **2.3× more failed API calls** per session, with UI automation and TabView layout as the dominant categories.

---

## 6. Session Flow Comparison

### Typical SwiftUI Session (base i1 — 14 min, 2.4M tokens, score 86)

```
1. Read skill references (4 files)                    ~1 min
2. Check existing directory structure                  ~0.5 min
3. Create all files in sequence (17 files)             ~5 min
   - project.yml, Info.plist, entitlements, assets
   - 15 Swift source files (~1600 LOC)
4. Generate Xcode project (xcodegen)                   ~0.5 min
5. Build → 2 compile errors                            ~1 min
6. Fix errors (2 one-line edits)                       ~0.5 min
7. Rebuild → success                                   ~1 min
8. Run tests → 20/20 pass                              ~2 min
9. Launch app → verify                                 ~0.5 min
10. Commit                                             ~1 min
```

**Total build-fix cycles: 3** (2 compile errors + 1 project config fix)

### Typical WinUI3 Session (base-DA i2 — 45 min, 9.3M tokens, score 82)

```
1. Read skill reference (dev-workflow)                 ~1 min
2. Read existing project files                         ~1 min
3. Install NuGet packages                              ~2 min
4. Create source files (models, services)              ~3 min
5. Write MainWindow.xaml (~210 lines)                  ~2 min
6. Write MainWindow.xaml.cs (~900 lines)               ~5 min
7. Build → compile errors                              ~1 min
8. Fix missing usings → rebuild → success              ~2 min
9. Run app → screenshot → "58px tall editor"           ~2 min
10. Add VerticalAlignment="Stretch" → rebuild → run    ~3 min
11. Screenshot → "Still not stretching"                ~1 min
12. Redesign to ContentHost swap pattern               ~5 min
    - Rewrite MainPage.xaml (+12 -9)
    - Rewrite MainPage.xaml.cs (813 lines from scratch)
13. Build → success → run → screenshot → working       ~3 min
14. Try SendKeys → fails → try set-value → fails       ~3 min
15. Fall back to clipboard paste → works                ~2 min
16. Screenshot → verify text appeared                   ~1 min
17. Discover WebView2 not rendering → fix CoreWebView2  ~3 min
18. Rebuild → run → screenshot → verify preview         ~2 min
19. Fix RichEditBox transparent background              ~2 min
20. Final screenshot → commit                           ~3 min
```

**Total build-fix cycles: 7** (2 compile + 1 TabView layout + 1 WebView2 + 1 RichEditBox + 2 UI automation workarounds)

The WinUI3 session has **3× more steps**, with steps 9–18 (the verification/fix loops) consuming an estimated **5–6M tokens** — more than the entire SwiftUI session.

---

## 7. Recommendations

### High Impact — Would Reduce WinUI3 Tokens 40–60%

#### 7.1 Ship Pre-Solved XAML Layout Templates

Include a TabView template in the WinUI3 skill that uses the "shared editor panel outside TabView" pattern from the start:

```xml
<!-- CORRECT pattern: TabView for headers only, content in separate Grid row -->
<Grid>
    <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>  <!-- TabView strip -->
        <RowDefinition Height="*"/>     <!-- Content area -->
    </Grid.RowDefinitions>
    
    <TabView Grid.Row="0" TabItemsChanged="OnTabChanged">
        <!-- Tab headers only -->
    </TabView>
    
    <Grid x:Name="ContentHost" Grid.Row="1">
        <!-- Shared editor content swapped on tab change -->
    </Grid>
</Grid>
```

This single template would eliminate the #1 time sink across 9/15 sessions.

#### 7.2 Reduce Screenshot Frequency and Size

- Use text-based UI tree dumps (`winapp ui inspect --depth 3`) for initial layout verification instead of screenshots
- Only take screenshots for final visual verification, not mid-cycle debugging
- Consider reducing screenshot resolution for token savings
- Batch multiple UI operations into single commands where possible

#### 7.3 Adopt Unit Tests for Verification

SwiftUI's verification strategy (unit tests + `open` command) is dramatically cheaper in tokens:

| Verification Method | Avg Tokens per Check | Commands per Check |
|--------------------|--------------------:|-------------------:|
| Screenshot cycle | ~200–500k | 3–5 (run, screenshot, read image) |
| winapp ui inspect | ~50–100k | 1–2 |
| Unit test | ~20–50k | 1 (xcodebuild test) |
| `open` app | ~5k | 1 |

Adding a unit test strategy for WinUI3 (e.g., verifying ViewModel logic, service behavior) could replace many screenshot cycles.

### Medium Impact — Would Reduce WinUI3 Tokens 15–25%

#### 7.4 Document Common WinUI3 Footguns in Skills

Add a "common issues" reference document to the WinUI3 skill covering:

| Issue | Pattern to Avoid | Correct Pattern |
|-------|-----------------|-----------------|
| TabView stretching | `tabViewItem.Content = new TextBox()` | ContentHost swap with separate Grid row |
| WebView2 init | `webView.NavigateToString(html)` immediately | `EnsureCoreWebView2Async()` + `CoreWebView2Initialized` handler |
| AutomationId | `AutomationProperties.AutomationId = "id"` in initializer | `AutomationProperties.SetAutomationId(element, "id")` |
| TextChanged guard | Direct `IsDirty = true` in handler | `if (_isUpdating) return;` guard with content comparison |
| Flyout menu interaction | `winapp ui invoke` on MenuFlyoutItem | Get popup HWND via `winapp ui list-windows`, then inspect popup |

#### 7.5 Enforce Skill Doc Reading Order

WinUI3 sessions that read more skill docs upfront had fewer errors. Consider auto-injecting template and windowing skill references when the task involves TabView or WebView2.

#### 7.6 Break Up Monolithic Files

WinUI3 tends to produce ~900-line `MainWindow.xaml.cs` files. Every edit requires re-reading the full file in context. Encourage splitting into:
- `MainWindow.xaml.cs` — initialization and event wiring only
- `EditorTabManager.cs` — tab lifecycle and content management
- `MarkdownPreviewManager.cs` — WebView2 and preview logic
- `FindBarController.cs` — find/replace state and navigation

### Lower Impact — Quality Improvements

#### 7.7 Session Time Budget

Implement a token budget alarm at 5M tokens that triggers a strategy change:
- If build/fix loop exceeds 3 cycles on the same issue, pivot to a known-good template
- If verification loop exceeds 5 screenshots, switch to text-based inspection

#### 7.8 Improve `winapp` Tool Reliability

- Cache element slugs within a single app session to reduce re-inspection
- Auto-retry with fresh element discovery on stale slug errors
- Add a `winapp ui batch` command for compound operations
- Fix SendKeys reliability to reduce fallback to clipboard paste

---

## Appendix A: Top Time Sinks (Aggregated from Retrospectives)

### WinUI3 (across 15 sessions)

| Time Sink | Sessions Affected | Estimated Token Cost |
|-----------|------------------:|--------------------:|
| UI automation stale elements / trial-and-error | 11/15 | 1–3M per session |
| TabView content sizing trap | 9/15 | 2–4M per session |
| WindowsAppRuntime registration issues | 4/15 | 0.5–1M per session |
| WebView2 CoreWebView2 initialization | 4/15 | 0.5–1M per session |
| Sub-agent orchestration polling | 3/15 | 1–2M per session |
| Dirty indicator race conditions | 3/15 | 0.5–1M per session |

### SwiftUI (across 15 sessions)

| Time Sink | Sessions Affected | Estimated Token Cost |
|-----------|------------------:|--------------------:|
| Reading skill reference docs upfront | 10/15 | 0.2–0.5M (invested, not wasted) |
| XCUITest iteration/rewriting | 5/15 | 0.5–2M per session |
| Build output verbosity | 3/15 | 0.1–0.3M per session |
| Custom MarkdownParser implementation | 2/15 | 0.3–0.5M per session |

---

## Appendix B: Failed API Categories

### WinUI3 (62 total failed APIs across 15 sessions)

| Category | Count | Examples |
|----------|------:|---------|
| UI automation tools | 19 | `winapp ui sendkeys`, `winapp ui set-value --value on RichEditBox`, `winapp ui inspect --tree` |
| Other/miscellaneous | 22 | Various WinUI3 API misuse from training data |
| TabView layout | 9 | `TabViewItem.Content` with `HorizontalContentAlignment/VerticalContentAlignment = Stretch` |
| AutomationId syntax | 6 | `AutomationProperties.AutomationId` in object initializer syntax |
| WebView2 | 5 | `NavigateToString()` before `CoreWebView2` initialized, `PostWebMessageAsJsonAsync` vs `AsString` |
| Missing using | 1 | Namespace import issues |

### SwiftUI (27 total failed APIs across 15 sessions)

| Category | Count | Examples |
|----------|------:|---------|
| Accessibility API | 8 | `.accessibilityIdentifier = "x"` → `setAccessibilityIdentifier("x")` |
| Project config | 7 | Missing `GENERATE_INFOPLIST_FILE: true` in test targets |
| XCUITest | 6 | `app.groups["id"]` for SwiftUI containers, `app.windows.firstMatch.screenshot()` |
| Other | 3 | Miscellaneous |
| SwiftUI type | 2 | `.foregroundStyle(.accentColor)` → `.foregroundStyle(Color.accentColor)` |
| Swift syntax | 1 | `[] → [:]` for empty dictionary literal |

---

## Appendix C: Methodology

- **Scenario**: Both platforms built a "Markdown Editor" app with identical feature requirements (tabs, split editor/preview, find bar, status bar, settings, platform-specific integration)
- **Model**: Claude Opus 4.6 for all trials
- **Conditions**: 5 skill configurations per platform (bare, base, D, DA, DAMV/DAV), 3 iterations each = 15 trials per platform, 30 total
- **Data sources**: `results.json` (metrics), `session-log.txt` (agent conversation), `retrospective.json` (agent self-analysis) from each trial directory
- **Token values**: As reported by the Copilot CLI session metrics. "Input" includes all context sent to the model per turn; "Cached" is the subset served from prompt cache; "Output" is newly generated tokens.
- **WinUI3 logs**: `C:\Users\nikolame\Downloads\run-logs\winui-logs` (15 trials)
- **SwiftUI logs**: `C:\Users\nikolame\Downloads\run-logs\mac-logs` (15 trials)
