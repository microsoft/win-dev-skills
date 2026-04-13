# WinUI3 Agent Benchmark: Token & Quality Evolution

## Executive Summary

Across four benchmark runs (48 total trials), WinUI3 agent performance has improved dramatically:

- **Base condition tokens dropped 69%** (4.3M → 1.3M) and now uses **fewer tokens than SwiftUI** (1.3M vs 1.8M)
- **Full condition tokens dropped 69%** (14.3M → 4.4M) while scores jumped from **33 → 89**
- **100% build+run success rate** in recent runs (18/18) vs old WinUI's frequent failures
- **Score variance nearly eliminated** — run23 ranges 72–90 vs old WinUI's 0–90

The remaining token gap vs SwiftUI is concentrated entirely in the verification/ui-test condition, where screenshot-based UI automation adds ~3M tokens of overhead.

---

## 1. Runs Overview

| Run | Date | Platform | Conditions | Model | Trials |
|-----|------|----------|-----------|-------|--------|
| old-WinUI | Apr 8 | WinUI3 | bare, base-only, base-D, base-DA, base-DAMV | claude-opus-4.6 | 15 |
| SwiftUI | Apr 8 | SwiftUI/macOS | bare, base, D, DA, DAV | claude-opus-4.6 | 15 |
| run20 | Apr 10 | WinUI3 | winui3-base, winui3+design, winui3+design+arch+verify | claude-opus-4.6 | 9 |
| run23 | Apr 11 | WinUI3 | winui3-base, winui3+design, winui3+design+arch+ui-test | claude-opus-4.6 | 9 |

**Scenario**: Markdown Editor — tabs, split editor/preview, find bar, status bar, settings, platform integration (identical requirements adapted per platform).

**Condition mapping** (approximate equivalents across runs):

| Tier | run23 | run20 | old-WinUI | SwiftUI |
|------|-------|-------|-----------|---------|
| Base | winui3-base | winui3-base | base-only | swiftui-base |
| + Design | winui3+design | winui3+design | base-D | swiftui-D |
| + Full | winui3+design+arch+ui-test | winui3+design+arch+verify | base-DAMV | swiftui-DAV |

---

## 2. Input Token Comparison

### Averages (3 trials each)

| Condition | run23 | run20 | Old WinUI | SwiftUI | run23 vs old | run23 vs Swift |
|-----------|------:|------:|----------:|--------:|-------------:|---------------:|
| **Base** | **1.3M** | 2.2M | 4.3M | 1.8M | **−69%** | **0.7×** |
| **Design** | **1.8M** | 3.1M | 3.4M | 1.6M | **−48%** | 1.1× |
| **Full** | **4.4M** | 6.6M | 14.3M | 3.2M | **−69%** | 1.4× |

### Per-Trial Token Detail

**run23 (latest WinUI3):**

| Condition | Trial | Input | Output | Score | Time |
|-----------|-------|------:|-------:|------:|------|
| winui3-base | i1 | 1.6M | 82.3k | 84 | 25m 36s |
| winui3-base | i2 | 1.1M | 38.6k | 86 | 14m 2s |
| winui3-base | i3 | 1.3M | 58.1k | 72 | 17m 20s |
| winui3+design | i1 | 2.2M | 50.3k | 86 | 16m 27s |
| winui3+design | i2 | 1.4M | 79.0k | 75 | 24m 14s |
| winui3+design | i3 | 1.7M | 77.2k | 78 | 22m 49s |
| winui3+design+arch+ui-test | i1 | 4.1M | 109.0k | 90 | 44m 45s |
| winui3+design+arch+ui-test | i2 | 2.8M | 91.7k | 88 | 33m 50s |
| winui3+design+arch+ui-test | i3 | 6.3M | 58.9k | 88 | 28m 37s |

**run20 (previous WinUI3):**

| Condition | Trial | Input | Output | Score | Time |
|-----------|-------|------:|-------:|------:|------|
| winui3-base | i1 | 1.6M | 51.5k | 86 | 15m 42s |
| winui3-base | i2 | 2.2M | 57.1k | 90 | 19m 37s |
| winui3-base | i3 | 2.9M | 68.5k | 77 | 23m 24s |
| winui3+design | i1 | 2.0M | 54.3k | 86 | 16m 47s |
| winui3+design | i2 | 2.2M | 52.4k | 81 | 17m 4s |
| winui3+design | i3 | 5.2M | 74.6k | 87 | 28m 9s |
| winui3+design+arch+verify | i1 | 8.3M | 62.3k | 85 | 31m 34s |
| winui3+design+arch+verify | i2 | 11.6M | 89.7k | 89 | 49m 55s |
| winui3+design+arch+verify | i3 | — | 83.7k | 82 | 45m 52s |

**Old WinUI (baseline):**

| Condition | Trial | Input | Output | Score | Time |
|-----------|-------|------:|-------:|------:|------|
| bare | i1 | 463K | 127K | 0 | 55m 24s |
| bare | i2 | 1.2M | 2.7k | 0 | 42m 6s |
| bare | i3 | 5.1M | 63k | 87 | 22m 37s |
| base-only | i1 | 374K | 6.3k | 88 | 29m 34s |
| base-only | i2 | 7.7M | 75k | 88 | 32m 20s |
| base-only | i3 | 4.9M | 98k | 86 | 30m 18s |
| base-D | i1 | 7.2M | 71k | 86 | 30m 21s |
| base-D | i2 | — | 34k | 16 | 8m 58s |
| base-D | i3 | 3.0M | 70k | 84 | 26m 30s |
| base-DA | i1 | 7.4M | 66k | 89 | 29m 22s |
| base-DA | i2 | 9.3M | 82k | 82 | 44m 37s |
| base-DA | i3 | 10.2M | 79k | 90 | 34m 44s |
| base-DAMV | i1 | 11.7M | 85k | 10 | 41m 23s |
| base-DAMV | i2 | 12.2M | 90k | 0 | 47m 12s |
| base-DAMV | i3 | 18.9M | 123k | 88 | 53m 20s |

**SwiftUI:**

| Condition | Trial | Input | Output | Score | Time |
|-----------|-------|------:|-------:|------:|------|
| swiftui-bare | i1 | 1.4M | 49k | 0 | 12m 49s |
| swiftui-bare | i2 | 2.0M | 53k | 0 | 13m 31s |
| swiftui-bare | i3 | 2.0M | 25k | 0 | 7m 57s |
| swiftui-base | i1 | 2.4M | 58k | 86 | 14m 20s |
| swiftui-base | i2 | 1.3M | 52k | 83 | 13m 48s |
| swiftui-base | i3 | 1.8M | 52k | 69 | 18m 26s |
| swiftui-D | i1 | 1.8M | 36k | 10 | 11m 53s |
| swiftui-D | i2 | 1.3M | 48k | 10 | 12m 33s |
| swiftui-D | i3 | 1.6M | 53k | 82 | 13m 37s |
| swiftui-DA | i1 | 1.5M | 51k | 76 | 13m 25s |
| swiftui-DA | i2 | 1.8M | 51k | 68 | 13m 45s |
| swiftui-DA | i3 | 2.3M | 55k | 79 | 14m 34s |
| swiftui-DAV | i1 | 3.4M | 63k | 10 | 26m 2s |
| swiftui-DAV | i2 | 3.2M | 63k | 83 | 21m 17s |
| swiftui-DAV | i3 | 3.1M | 60k | 68 | 23m 40s |

---

## 3. Score Comparison

### Averages

| Condition | run23 | run20 | Old WinUI | SwiftUI |
|-----------|------:|------:|----------:|--------:|
| **Base** | 81 | 84 | 87 | 79 |
| **Design** | 80 | 85 | 62 | 34 |
| **Full** | **89** | 85 | 33 | 54 |

### Score Distribution

| Run | Min | Max | Range | Std Dev (approx) |
|-----|----:|----:|------:|------------------:|
| run23 | 72 | 90 | 18 | ~6 |
| run20 | 77 | 90 | 13 | ~4 |
| old-WinUI | 0 | 90 | 90 | ~32 |
| SwiftUI | 0 | 86 | 86 | ~30 |

run20 and run23 have **dramatically lower variance** than both old WinUI and SwiftUI. No catastrophic failures (score 0 or 10).

---

## 4. Session Time

### Averages (minutes)

| Condition | run23 | run20 | Old WinUI | SwiftUI |
|-----------|------:|------:|----------:|--------:|
| Base | 19m | 20m | 31m | 16m |
| Design | 21m | 21m | 22m | 13m |
| Full | 36m | 42m | 47m | 24m |

Base and Design conditions are approaching SwiftUI session times. The Full condition's extra time comes from the UI verification loop.

---

## 5. UI Automation & Screenshots

### Averages per trial

| Condition | run23 Shots | run20 Shots | Old Shots | run23 Winapp | run20 Winapp | Old Winapp |
|-----------|------------:|------------:|----------:|-------------:|-------------:|-----------:|
| Base | 0 | 0 | 25 | 1 | 1 | 26 |
| Design | 0 | 0 | 8 | 1 | 1 | 7 |
| Full | 20 | 39 | 32 | 219 | 69 | 63 |

**Key observations:**
- Base and Design conditions eliminated screenshots entirely (was 25 and 8 avg in old WinUI)
- run23 Full uses **fewer screenshots** than run20 (20 vs 39) but **more winapp ops** (219 vs 69) — the "ui-test" approach does more programmatic interaction and less visual checking
- SwiftUI uses 0 screenshots except in the DAV condition (5 avg)

---

## 6. Build-Fix Cycles

### Averages

| Condition | run23 | run20 | Old WinUI | SwiftUI |
|-----------|------:|------:|----------:|--------:|
| Base | 2.3 | 2.0 | 2.7 | 1.7 |
| Design | 3.0 | 2.3 | 1.7 | 2.0 |
| Full | 1.3 | 2.3 | 7.3 | 6.0 |

The Full condition improved from 7.3 build-fix cycles (old) to 1.3 (run23) — a **5.5× reduction**. This suggests the agent is writing cleaner code on the first pass.

---

## 7. Build & Run Success Rate

| Run | Total Trials | Build Success | Run Success | Score > 0 |
|-----|-------------:|--------------:|------------:|----------:|
| run23 | 9 | 9/9 (100%) | 9/9 (100%) | 9/9 (100%) |
| run20 | 9 | 9/9 (100%) | 9/9 (100%) | 9/9 (100%) |
| old-WinUI | 15 | 15/15 (100%) | 12/15 (80%) | 12/15 (80%) |
| SwiftUI | 15 | 12/15 (80%) | 12/15 (80%) | 10/15 (67%) |

run20 and run23 have **perfect reliability** — every trial builds, runs, and scores above zero.

---

## 8. Progress Over Time

### Token trajectory for equivalent conditions

```
Base condition input tokens:
  old-WinUI (Apr 8):   ████████████████████████████████████████████  4.3M
  run20 (Apr 10):      ██████████████████████                        2.2M
  run23 (Apr 11):      █████████████                                 1.3M  ← beats SwiftUI (1.8M)
  SwiftUI:             ██████████████████                            1.8M

Full condition input tokens:
  old-WinUI (Apr 8):   ██████████████████████████████████████████████████████████████████████████████████  14.3M
  run20 (Apr 10):      █████████████████████████████████████                                               6.6M
  run23 (Apr 11):      █████████████████████████                                                           4.4M
  SwiftUI:             █████████████████                                                                   3.2M
```

### Score trajectory for full condition

```
Full condition scores:
  old-WinUI (Apr 8):   [10, 0, 88]   avg: 33  ← catastrophic variance
  SwiftUI:             [10, 83, 68]   avg: 54
  run20 (Apr 10):      [85, 89, 82]   avg: 85
  run23 (Apr 11):      [90, 88, 88]   avg: 89  ← highest and most consistent
```

---

## 9. Where the Remaining Gap Is

run23 Base already **beats SwiftUI** on tokens (1.3M vs 1.8M). The gap in the Full condition (4.4M vs 3.2M = 1.4×) comes from one thing:

**UI verification/testing loop**: 20 screenshots and 219 winapp ops per trial in the Full condition. SwiftUI's equivalent (DAV) uses unit tests instead of visual UI automation — text-based test output is dramatically cheaper than screenshot image data in the conversation context.

| Metric | run23 Full | SwiftUI DAV | Gap source |
|--------|----------:|------------:|-----------|
| Input tokens | 4.4M | 3.2M | Screenshots + winapp context |
| Screenshots | 20 | 5 | Visual vs programmatic verification |
| Winapp/UI ops | 219 | 0 | Windows UI automation overhead |
| Session time | 36m | 24m | Time in verification loop |
| Score | 89 | 54 | WinUI3 Full scores better despite higher cost |

The verification loop is expensive but produces **better results** (89 avg vs SwiftUI DAV's 54). The question is whether the same quality can be achieved with lighter-weight verification.

---

## 10. Key Takeaways

1. **WinUI3 Base is at or below SwiftUI token parity** — the platform-level token gap has been closed for non-verification conditions.

2. **Scores improved while tokens dropped** — this isn't a quality/cost trade-off. Better instructions → fewer errors → less rework → fewer tokens AND higher scores.

3. **Verification is the last frontier** — it accounts for ~3M of the remaining 4.4M tokens in the Full condition. Replacing screenshots with lighter-weight checks (programmatic assertions, Roslyn analyzer warnings, `winapp ui inspect` text output) would close the gap.

4. **Reliability is solved** — 100% build+run success across 18 trials. The old failure modes (TabView layout trap, WebView2 silent failures, catastrophic score variance) appear to be eliminated.

5. **run23's "ui-test" approach trades more ops for fewer screenshots** — 219 winapp ops vs run20's 69, but 20 screenshots vs 39. This is a better trade-off since programmatic interaction is cheaper than image data.
