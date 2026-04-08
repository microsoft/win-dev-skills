# Cross-Platform Benchmark Comparison — WinUI 3 vs SwiftUI | markdown-editor | opus4.6 | 4-8-2026

> **30 trials · 2 platforms · 10 agent variants · 1 model · 1 scenario**
>
> Run date: 2026-04-08 · Claude Opus 4.6 · 3 iterations per variant

---

## Part 1: Benchmark Results Comparison

### 1.1 Executive Summary

Two parallel ablation studies tested composable agent configurations on the **same task** (markdown editor) with the **same model** (Claude Opus 4.6) across two native desktop platforms: WinUI 3 on Windows and SwiftUI on macOS. This comparison reveals how platform characteristics affect AI code generation quality and which agent configurations transfer well across platforms.

**Headline finding:** WinUI 3 achieves higher absolute scores (87.3 vs 79.3 best avg) but is more sensitive to instruction overload. Both platforms agree that **minimal prompts beat maximal prompts** for Opus 4.6, and both show the same Design-section instability. The composable agent pattern produces remarkably consistent cross-platform insights.

---

### 1.2 Side-by-Side Rankings

| Rank | WinUI 3 Variant | WinUI Avg | WinUI σ | | SwiftUI Variant | SwiftUI Avg | SwiftUI σ |
|------|----------------|-----------|---------|---|-----------------|-------------|-----------|
| 1 | **base-only** | **87.3** | 0.9 | | **swiftui-base** | **79.3** | 7.7 |
| 2 | **base-DA** | **87.0** | 3.6 | | **swiftui-DA** | **74.3** | 4.6 |
| 3 | **base-D** | 62.0 | 32.5 | | **swiftui-DAV** | 53.7 | 32.6 |
| 4 | **base-DAMV** | 32.7 | 40.1 | | **swiftui-D** | 34.0 | 33.9 |
| 5 | **bare** | 29.0 | 41.2 | | **swiftui-bare** | 0.0 | 0.0 |

### 1.3 Score Comparison Chart

```
100 ┬─────────────────────────────────────────────────────
    │
 90 ┤  ██ ██                                    WinUI 3
    │  ██ ██                                    SwiftUI
 80 ┤  ██ ██  ▓▓ ▓▓
    │  ██ ██  ▓▓ ▓▓
 70 ┤  ██ ██  ▓▓ ▓▓
    │  ██ ██  ▓▓ ▓▓
 60 ┤  ██ ██  ▓▓ ▓▓  ██
    │  ██ ██  ▓▓ ▓▓  ██
 50 ┤  ██ ██  ▓▓ ▓▓  ██ ▓▓
    │  ██ ██  ▓▓ ▓▓  ██ ▓▓
 40 ┤  ██ ██  ▓▓ ▓▓  ██ ▓▓
    │  ██ ██  ▓▓ ▓▓  ██ ▓▓  ▓▓
 30 ┤  ██ ██  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██
    │  ██ ▓▓  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██
 20 ┤  ██ ▓▓  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██
    │  ██ ▓▓  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██
 10 ┤  ██ ▓▓  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██
    │  ██ ▓▓  ▓▓ ▓▓  ██ ▓▓  ▓▓  ██ ▓▓
  0 ┴──██─▓▓──▓▓─▓▓──██─▓▓──▓▓──██─▓▓─────────────────
      base    DA     D    D-full  bare
              (best) (only) (DAMV/ (no
                           DAV)   instr)

  ██ = WinUI 3    ▓▓ = SwiftUI
```

### 1.4 Per-Trial Score Comparison

#### Base-only / swiftui-base

| | Trial 1 | Trial 2 | Trial 3 | Avg | σ | Spread |
|---|---------|---------|---------|-----|---|--------|
| **WinUI 3** | 88 | 88 | 86 | **87.3** | 0.9 | 2 |
| **SwiftUI** | 86 | 83 | 69 | **79.3** | 7.7 | 17 |

#### DA / swiftui-DA

| | Trial 1 | Trial 2 | Trial 3 | Avg | σ | Spread |
|---|---------|---------|---------|-----|---|--------|
| **WinUI 3** | 89 | 82 | 90 | **87.0** | 3.6 | 8 |
| **SwiftUI** | 76 | 68 | 79 | **74.3** | 4.6 | 11 |

#### D-only

| | Trial 1 | Trial 2 | Trial 3 | Avg | σ | Spread |
|---|---------|---------|---------|-----|---|--------|
| **WinUI 3** | 86 | ⚠️ 16 | 84 | **62.0** | 32.5 | 70 |
| **SwiftUI** | ⚠️ 10 | ⚠️ 10 | 82 | **34.0** | 33.9 | 72 |

#### Full stack (DAMV / DAV)

| | Trial 1 | Trial 2 | Trial 3 | Avg | σ | Spread |
|---|---------|---------|---------|-----|---|--------|
| **WinUI 3 (DAMV)** | ⚠️ 10 | ❌ 0 | 88 | **32.7** | 40.1 | 88 |
| **SwiftUI (DAV)** | ⚠️ 10 | 83 | 68 | **53.7** | 32.6 | 73 |

#### Bare

| | Trial 1 | Trial 2 | Trial 3 | Avg | σ | Spread |
|---|---------|---------|---------|-----|---|--------|
| **WinUI 3** | ❌ 0 | ❌ 0 | 87 | **29.0** | 41.2 | 87 |
| **SwiftUI** | ❌ 0 | ❌ 0 | ❌ 0 | **0.0** | 0.0 | 0 |

---

### 1.5 Build & Run Reliability

| Metric | WinUI 3 | SwiftUI |
|--------|---------|---------|
| **Overall build rate** | **100%** (15/15) | 80% (12/15) |
| **Overall run rate** | 73% (11/15) | 80% (12/15) |
| **Best variant build** | 100% (all variants) | 100% (all except bare) |
| **Best variant run** | 100% (base-only, DA, D) | 100% (all except bare) |
| **Bare build rate** | **100%** | **0%** |
| **Bare run rate** | 33% | 0% |
| **Failure mode** | Builds ✅ but fails to run | Fails to build entirely |

**Key platform difference:** WinUI 3's `dotnet new winui` always creates a valid project skeleton — even the bare agent (no instructions) produces a compilable project 100% of the time. SwiftUI's XcodeGen workflow requires explicit scaffolding guidance; without it, the bare agent cannot produce a buildable project at all.

However, WinUI 3's build-to-run gap is wider — the app compiles but runtime configuration (XAML initialization, manifests, window activation) can fail silently. SwiftUI apps that build almost always run.

---

### 1.6 Composable Layer Analysis

```
WinUI 3:    bare ──(+base)──▶ base-only ──(+D)──▶ base-D ──(+A)──▶ base-DA ──(+M+V)──▶ base-DAMV
             29.0    +58.3       87.3      -25.3     62.0    +25.0    87.0      -54.3       32.7

SwiftUI:    bare ──(+base)──▶ swiftui-base ──(+D)──▶ swiftui-D ──(+A)──▶ swiftui-DA ──(+V)──▶ swiftui-DAV
             0.0     +79.3       79.3         -45.3     34.0       +40.3     74.3        -20.6      53.7
```

| Layer Transition | WinUI 3 Δ | SwiftUI Δ | Agrees? | Interpretation |
|-----------------|-----------|-----------|---------|----------------|
| bare → base | +58.3 | +79.3 | ✅ Yes | **Base scaffolding is essential on both platforms.** The delta is larger on SwiftUI because bare=0 (can't even build). |
| base → base+D | **−25.3** | **−45.3** | ✅ Yes | **Design-only guidance is harmful on both platforms.** The destabilizing effect is even stronger on SwiftUI. |
| base+D → base+DA | +25.0 | +40.3 | ✅ Yes | **Architecture rescues design on both platforms.** Restores quality to near base-only levels. |
| base+DA → full stack | **−54.3** | **−20.6** | ✅ Yes | **Verification hurts on both platforms.** But the effect is far more severe on WinUI 3 (−54.3 vs −20.6). |

**All four transitions agree in direction.** The composable system produces consistent insights across platforms, validating the methodology.

---

### 1.7 Time Efficiency

| Variant | WinUI Time | WinUI Score/Min | | SwiftUI Time | SwiftUI Score/Min |
|---------|-----------|-----------------|---|-------------|-------------------|
| **base-only / base** | 30.7m | 2.84 | | 15.5m | 5.12 |
| **DA** | 36.2m | 2.40 | | 13.9m | 5.34 |
| **D-only** | 21.9m | 2.83 | | 12.7m | 2.68 |
| **Full stack** | 47.3m | 0.69 | | 23.7m | 2.27 |
| **bare** | 40.0m | 0.73 | | 11.4m | 0.00 |

**SwiftUI is ~2× faster per trial** across all variants. This likely reflects:
- `xcodebuild` compiles Swift faster than `dotnet build` compiles C# + XAML for a single project
- XcodeGen scaffolding is lighter than `dotnet new` + NuGet restore
- SwiftUI has less configuration surface area (no manifests, no packaging, no XAML)

**SwiftUI has better score-per-minute** on successful variants (5.3 vs 2.8), but WinUI 3 achieves higher absolute scores.

---

### 1.8 Score Distribution

```
              WinUI 3 (15 trials)        SwiftUI (15 trials)
 90-100:  ■          (1)            ■          (0)
 80-89:   ■■■■■■■■■  (9)            ■■■■       (4)
 70-79:               (0)            ■■         (2)
 60-69:               (0)            ■■■        (3)
 50-59:               (0)                       (0)
 40-49:               (0)                       (0)
 30-39:               (0)                       (0)
 20-29:               (0)                       (0)
 10-19:   ■■         (2)            ■■■        (3)
  0-9:    ■■■        (3)            ■■■        (3)
```

Both platforms show **strong bimodality**: trials either score 68+ or ≤16. There is no middle ground. The "gap" between success and failure is 66 points on WinUI 3 (82 to 16) and 58 points on SwiftUI (68 to 10).

WinUI 3's successful trials cluster higher (82–90) than SwiftUI's (68–86), explaining the overall score advantage.

---

### 1.9 Platform-Specific Observations

| Dimension | WinUI 3 | SwiftUI |
|-----------|---------|---------|
| **Language** | C# + XAML | Swift |
| **UI framework** | WinUI 3 / Windows App SDK | SwiftUI |
| **Build tool** | dotnet build | xcodebuild |
| **Scaffolding** | `dotnet new winui` | XcodeGen + `project.yml` |
| **Preview rendering** | WebView2 | WebKit (WKWebView) |
| **OS integration tested** | JumpList | Services menu |
| **Project config files** | `.csproj`, `Package.appxmanifest` | `project.yml`, `Info.plist`, `.entitlements` |
| **Opus 4.6 proficiency** | Higher (87.3 best) | Lower (79.3 best) |
| **Build reliability** | 100% always | 80% (bare fails) |
| **Run reliability** | 73% | 80% |
| **Failure mode** | Builds but doesn't run | Doesn't build at all |
| **Time per trial** | ~31m (best variant) | ~15m (best variant) |

---

## Part 2: Agent Comparison

### 2.1 Agent Architecture Overview

Both platforms use the **same composable prompt-section architecture**: agents are assembled from mix-and-match markdown sections that are concatenated to form the final system prompt. This enables controlled ablation studies where each section's contribution can be isolated.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Composable Agent System                       │
│                                                                  │
│  ┌──────┐   ┌──────┐   ┌────────────────┐   ┌────────┐         │
│  │ bare │   │ base │ + │ design (D)     │ + │ arch   │ + ...   │
│  │      │   │      │   │                │   │  (A)   │         │
│  └──────┘   └──────┘   └────────────────┘   └────────┘         │
│  no prompt   scaffold   UI/design patterns   code structure     │
│              + basics   + control selection   + MVVM/DI         │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Section-by-Section Comparison

#### Base Section

| Aspect | WinUI 3 (`base.md`) | SwiftUI (`swiftui-base.md`) |
|--------|--------------------|-----------------------------|
| **Scaffolding** | `dotnet new winui -n <AppName>` | XcodeGen `project.yml` + `xcodegen generate` |
| **Build command** | `build.ps1 <csproj> /p:Platform=x64` | `xcodebuild -project -scheme -derivedDataPath build` |
| **Run command** | `winapp run bin\x64\Debug\...\ --debug-output` | `open ./build/.../Debug/App.app` |
| **State management** | `ObservableObject` + `[ObservableProperty]` partial props | `@Observable` class (macOS 14+) |
| **Binding** | `x:Bind Mode=OneWay` + `{ThemeResource}` | SwiftUI declarative bindings + `@Bindable` |
| **Null safety** | Flat ViewModel properties, `FallbackValue` in XAML | N/A (Swift optionals handled by compiler) |
| **Anti-patterns** | UWP namespaces, AnyCPU, `{Binding}`, old MVVM syntax | `ObservableObject`+`@Published`, `NavigationView`, iOS patterns |
| **Collections** | Never replace `ObservableCollection<T>` — use `.Clear()` + re-add | N/A (SwiftUI re-renders on `@Observable` changes) |
| **Accessibility** | `AutomationProperties.AutomationId` on interactive controls | `.accessibilityIdentifier()` on interactive controls |
| **Lines** | ~123 lines | ~215 lines |

**Key differences:** WinUI 3 base has more defensive guidance (null safety warnings, collection pitfalls, namespace confusion) reflecting C#/XAML's larger API surface and historical baggage from UWP. SwiftUI base is longer due to embedded XcodeGen template and more code examples.

#### Design Section

| Aspect | WinUI 3 (`design.md`) | SwiftUI (`swiftui-design.md`) |
|--------|----------------------|-------------------------------|
| **Design system** | Fluent Design System | macOS HIG / native patterns |
| **Critical rule** | Never translate web layouts → XAML | Never translate iOS/web layouts → SwiftUI |
| **Navigation** | `NavigationView` + `Frame` | `NavigationSplitView` (2–3 columns) |
| **Tabs** | `TabView` (content = UIElement) | N/A (use `TabView` in Settings scene only) |
| **Lists** | `ListView` (virtualized, never wrap in ScrollViewer) | `List` with selection binding |
| **Search** | `AutoSuggestBox` | `.searchable(text:)` modifier |
| **Dialogs** | `ContentDialog` (set XamlRoot, decisions only) | `.confirmationDialog` or `.sheet` |
| **Typography** | Named styles: `TitleTextBlockStyle`, `BodyTextBlockStyle` | System-scaled: `.font(.title)`, `.font(.body)` |
| **Spacing** | 4px grid (4, 8, 12, 16, 24) | Token scale (2, 4, 8, 12, 16, 24, 32, 48) |
| **Colors** | `{ThemeResource}` brushes | Semantic `NSColor` wrappers / `.accentColor` |
| **Icons** | `SymbolIcon` / `FontIcon` | `Image(systemName:)` (SF Symbols) |
| **Backdrop** | `MicaBackdrop` | `.ultraThinMaterial` |
| **Settings** | Settings page (NavigationView) | `Settings` scene (⌘,) |
| **Lines** | ~43 lines | ~45 lines |

**Key similarity:** Both sections share the same structure — pick controls, plan layout, apply design system, critical rules. The content is platform-native but the pedagogical approach is identical. Both emphasize "start from native patterns, never translate from web/mobile."

#### Architecture Section

| Aspect | WinUI 3 (`architecture.md`) | SwiftUI (`swiftui-architecture.md`) |
|--------|----------------------------|-------------------------------------|
| **MVVM pattern** | `ObservableObject` + `[ObservableProperty]` + `[RelayCommand]` | `@Observable` + `@Environment` DI |
| **Folder structure** | `Models/`, `ViewModels/`, `Views/`, `Services/` | `App/`, `Models/`, `Views/`, `Services/` |
| **DI approach** | Static services (no DI framework unless needed) | `.environment()` injection at app level |
| **Binding safety** | Never use nested `x:Bind` — expose flat properties | N/A (SwiftUI handles this naturally) |
| **State pattern** | Enums (`PageState.Loading/Ready/Error`) | Enums (`ViewState.loading/ready/error`) |
| **Navigation** | Single page = `MainWindow`; multi = `NavigationView` + `Frame.Navigate()` | Single page = `WindowGroup`; multi = `NavigationSplitView` |
| **Async** | Document threading considerations | `.task { }` modifier, `@MainActor`, actors |
| **Project template** | N/A (dotnet new handles this) | Full XcodeGen `project.yml` template (~70 lines) |
| **Lines** | ~21 lines | ~101 lines |

**Key difference:** SwiftUI architecture section is 5× longer due to the embedded XcodeGen project template. WinUI 3 relies on `dotnet new` for project scaffolding, making the architecture section more focused on code patterns.

#### Metadata / Research (WinUI 3 only)

| Aspect | WinUI 3 (`metadata.md`) | SwiftUI equivalent |
|--------|------------------------|--------------------|
| **Purpose** | Verify Windows API surface before coding | _(none)_ |
| **Tool** | `winmd.exe search/members/check-property` | _(none)_ |
| **Usage** | Run before writing any unfamiliar API call | _(none)_ |
| **Impact on scores** | Part of DAMV — contributed to −54.3 drop | N/A |

The metadata section is unique to WinUI 3 and reflects the Windows API surface complexity — Windows App SDK + Windows SDK have thousands of types across multiple namespaces that can conflict. SwiftUI's smaller API surface doesn't need this pre-verification step.

#### Verify Section

| Aspect | WinUI 3 (`verify.md`) | SwiftUI (`swiftui-verify.md`) |
|--------|----------------------|-------------------------------|
| **UI inspection** | `winapp ui inspect -a <PID> --interactive` | XCUITest with accessibility identifiers |
| **Screenshots** | `winapp ui screenshot -a <PID>` | `screencapture` + `XCTAttachment` |
| **Interaction** | `winapp ui invoke/set-value <automationId>` | `app.buttons["id"].click()`, `typeText()` |
| **Crash diagnostics** | `--debug-output` flag shows exceptions | `~/Library/Logs/DiagnosticReports/` + terminal output |
| **Test framework** | Ad-hoc CLI commands | Formal XCUITest framework |
| **Iteration loop** | "Go back to Code and Build phase" | "Go back to Code and Build phase" |
| **Lines** | ~25 lines | ~155 lines |

**Key difference:** SwiftUI's verify section is 6× longer because it includes a full XCUITest framework setup with code examples. WinUI 3's verify relies on the `winapp ui` CLI tool — more concise but less structured. Both share the same re-iteration instruction that contributes to regression risk.

---

### 2.3 Prompt Complexity Budget

| Variant | WinUI 3 Sections | WinUI Est. Lines | | SwiftUI Sections | SwiftUI Est. Lines |
|---------|-----------------|------------------|---|-----------------|-------------------|
| **bare** | _(none)_ | 0 | | _(none)_ | 0 |
| **base-only / base** | base | ~123 | | swiftui-base | ~215 |
| **D** | base + design | ~166 | | base + design | ~260 |
| **DA** | base + design + arch | ~187 | | base + design + arch | ~361 |
| **Full stack** | base + D + A + M + V | ~212 | | base + D + A + V | ~516 |

SwiftUI agents carry ~2× the prompt volume due to embedded templates and XCUITest examples. Despite this, both platforms show the same pattern: more instructions → worse results with Opus 4.6.

WinUI 3's full stack (DAMV) has an additional section (Metadata) that SwiftUI lacks, but at only ~212 estimated lines total it's still lighter than SwiftUI-DA (361 lines). The catastrophic DAMV failure (−54.3 from DA) may be driven more by the verify iteration loop than by raw prompt volume.

---

### 2.4 Effectiveness Matrix

How effective is each composable section across platforms?

| Section | WinUI 3 Impact | SwiftUI Impact | Cross-Platform Verdict |
|---------|---------------|----------------|----------------------|
| **Base** | **+58.3** (essential) | **+79.3** (essential) | ✅ **Must-have.** Without it, agents can't reliably produce working apps. |
| **Design (D)** | **−25.3** (harmful alone) | **−45.3** (harmful alone) | ⚠️ **Harmful in isolation.** Creates bimodal scores — either works well or catastrophically distracts. |
| **Architecture (A)** | **+25.0** (rescues D) | **+40.3** (rescues D) | ✅ **Essential companion to D.** Restores focus to functional requirements. Never use D without A. |
| **Metadata (M)** | Part of −54.3 | _(N/A)_ | ❓ **Untested in isolation.** Cannot separate M's contribution from V's in current data. |
| **Verify (V)** | Part of −54.3 | **−20.6** | ❌ **Net negative.** Adds time, introduces regressions. Current implementation needs redesign. |

### 2.5 Why Design-Only Fails on Both Platforms

The Design section creates a consistent failure pattern on both platforms:

| Metric | WinUI 3 (base-D) | SwiftUI (swiftui-D) |
|--------|------------------|---------------------|
| Failure rate | 1/3 trials (score 16) | 2/3 trials (score 10) |
| Failure pattern | 9-minute premature exit | Full-length but empty apps |
| Success score | 84–86 | 82 |
| σ | 32.5 | 33.9 |

**Root cause hypothesis:** Design sections emphasize visual patterns (Fluent Design / macOS HIG) and control selection. Without architecture to anchor functional requirements, the agent allocates its reasoning budget to layout and visual polish rather than implementing the 14 required features. The result is bimodal: sometimes the agent naturally balances design + implementation (scores 82+), sometimes it doesn't (scores 10–16).

### 2.6 Why Verify Fails on Both Platforms

| Metric | WinUI 3 (DAMV) | SwiftUI (DAV) |
|--------|----------------|---------------|
| Time premium | +54% (47.3m vs 30.7m) | +70% (23.7m vs 13.9m) |
| Score penalty | −54.3 from DA | −20.6 from DA |
| Regression example | Trial 1: 10/100 after 41m | Trial 1: 10/100 after 26m |
| Best case | 88 (matches base-only) | 83 (matches DA) |

Both platforms include the instruction: *"If something is not completed... go back to the Code and Build phase to resolve issues and then revalidate/reverify again."* This creates a **regression loop**: the agent fixes one issue, breaks another, re-verifies, finds the new break, attempts to fix it, and so on. The time budget is consumed by iteration rather than net-new implementation.

---

### 2.7 Agent Recommendation Summary

| Use Case | WinUI 3 | SwiftUI | Rationale |
|----------|---------|---------|-----------|
| **Default (best avg)** | `base-only` (87.3) | `swiftui-base` (79.3) | Minimal prompts win for Opus 4.6 |
| **Highest ceiling** | `base-DA` (90 peak) | `swiftui-base` (86 peak) | DA provides marginal ceiling lift on WinUI 3 |
| **Best consistency** | `base-only` (σ=0.9) | `swiftui-DA` (σ=4.6) | Different optimal variants for consistency |
| **Best efficiency** | `base-only` (2.84/min) | `swiftui-DA` (5.34/min) | SwiftUI is 2× faster per minute |
| **Avoid** | `base-D`, `base-DAMV` | `swiftui-D`, `swiftui-bare` | Design-alone and max-instruction variants |

---

## Part 3: Key Takeaways

### 3.1 Universal Findings (Both Platforms)

1. **Minimal prompts beat maximal prompts for Opus 4.6.** The simplest base section alone is optimal — Opus has sufficient implicit knowledge of both WinUI 3 and SwiftUI.

2. **Design guidance without architecture is harmful.** Consistent across both platforms with similar magnitude (−25 to −45 points). Never use D without A.

3. **Verification loops cause regressions.** Both platforms show the same pattern: verify adds 50–70% more time while reducing scores. The iteration instruction needs redesign.

4. **Bimodal score distributions are systemic.** Agents either succeed well (68–90) or fail completely (0–16). There is no "mediocre" result — the agent either has a productive session or gets stuck.

5. **Base scaffolding is the single most impactful section.** +58 to +79 points — without it, agents can't reliably produce working apps on either platform.

### 3.2 Platform-Specific Findings

6. **WinUI 3 scores higher but takes longer.** 87.3 avg / 30.7m vs 79.3 avg / 15.5m. Opus 4.6 appears more proficient with C#/XAML than Swift/SwiftUI, but the larger API surface requires more implementation time.

7. **WinUI 3 always builds; SwiftUI sometimes doesn't.** 100% vs 80% build rate. `dotnet new` is more forgiving than XcodeGen. But WinUI 3 has a wider build-to-run gap (apps compile but fail at runtime).

8. **Instruction overload is more severe on WinUI 3.** The full-stack penalty is −54.3 (WinUI) vs −20.6 (SwiftUI). WinUI 3's larger configuration surface (XAML, manifests, packaging) gives the agent more ways to get confused when over-instructed.

9. **SwiftUI bare is completely non-functional; WinUI 3 bare occasionally works.** This reflects Opus 4.6's stronger training data for .NET/WinUI project setup vs XcodeGen/SwiftUI scaffolding.

### 3.3 Recommendations for Future Work

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| **P0** | Use `base-only` / `swiftui-base` as default for Opus 4.6 | Immediate: best avg scores on both platforms |
| **P1** | Redesign verify sections — prevent iteration loops, add guardrails against undoing working features | Unlock potential of DAMV/DAV without regressions |
| **P2** | Test with Sonnet 4.6 and GPT-5.4 — design guidance may help weaker models | Model-adaptive agent selection |
| **P3** | Isolate metadata (M) contribution — test `base-DAM` without V | Determine if metadata adds value independently |
| **P4** | Test `base-A` on both platforms — architecture without design | May reveal architecture is the only valuable addition |
| **P5** | Cross-scenario validation — test on counter (simple) and file-explorer (complex) scenarios | Confirm findings generalize beyond markdown editor |
