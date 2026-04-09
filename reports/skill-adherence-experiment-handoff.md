# Session Handoff: Skill Adherence Experiment

## Context

We're investigating why agents ignore skills in the win-dev-skills plugin. A conversation with Gemini suggested skills written as "knowledge" (nouns) get ignored and should be rewritten as "runbooks" (verbs). We built a tracer system to objectively measure whether agents read skill content, and ran initial experiments.

## What We Built

### Tracer System
8 "canary rules" — arbitrary conventions no LLM would generate from training data. If they appear in the built app, the agent provably read the skill.

**Tracers by skill:**
- `winui3-design`: T-DESIGN-1 (XML comment `<!-- WDS:PageLayout -->`), T-DESIGN-2 (NavigationView `Tag="wds-nav"`), T-DESIGN-3 (comment `<!-- DesignSkill:Applied -->` in MainWindow.xaml)
- `winui3-architecture`: T-ARCH-1 (create `WdsMetadata.cs` with `"wds-arch-1"`), T-ARCH-2 (comment `// Generated with WDS architecture skill` on ViewModel classes), T-ARCH-3 (comment `// WDS-DI-Setup` in App.xaml.cs)
- `winui3-best-practices`: T-BP-1 (`AutomationProperties.AutomationId="wds-"` prefix on Buttons/TextBoxes), T-BP-2 (`// WDS-Quality-Check` as last comment in every .cs file)

**Files:**
- `agent-benchmark/common/tracers.json` — tracer definitions with detection patterns
- `agent-benchmark/common/Detect-Tracers.ps1` — standalone PowerShell detector
- `agent-benchmark/dashboard/src/runner/benchmark.ts` — integrated into benchmark pipeline (auto-runs after each trial, saves `tracer-report.json` and `skill_adherence` in `results.json`)

### Detection Bug Fix
The TypeScript `findFilesRecursive` function had a bug with multi-wildcard patterns like `*ViewModel*.cs` — the `startsWith("*")` branch caught it before the multi-asterisk branch. Fixed by checking asterisk count first. The PowerShell `Detect-Tracers.ps1` script doesn't have this bug, so use it for post-hoc analysis if the TypeScript results look off.

### Agent Variants Created

**Skill variants (in `src/skills/`):**
- `winui3-design-tracers/` — knowledge format + tracer markers
- `winui3-architecture-tracers/` — knowledge format + tracer markers
- `winui3-best-practices-tracers/` — knowledge format + tracer markers
- `winui3-design-runbook/` — runbook format (Gemini style), no tracers
- `winui3-architecture-runbook/` — runbook format, no tracers
- `winui3-design-runbook-tracers/` — runbook format + tracer markers
- `winui3-architecture-runbook-tracers/` — runbook format + tracer markers

**Section variants (in `src/agents/_sections/`):**
- `*-tracers.md` — inline tracer skills
- `*-runbook.md` — inline runbook skills
- `*-tracers-noninlined.md` — reference tracer skills via `skills:` (not `inline_skills:`)
- `*-runbook-tracers-noninlined.md` — reference runbook+tracer skills via `skills:`

**Agent configs (in `src/agents/`):**

| Config | Format | Delivery | Tracers |
|--------|--------|----------|---------|
| `base-DARMV-tracers` | Knowledge | Inlined | Yes |
| `base-DARMV-runbook` | Runbook | Inlined | No |
| `base-DARMV-runbook-tracers` | Runbook | Inlined | Yes |
| `base-DARMV-tracers-noninlined` | Knowledge | Non-inlined | Yes |
| `base-DARMV-runbook-tracers-noninlined` | Runbook | Non-inlined | Yes |

## Run6 Results (Completed)

**Setup**: markdown-editor-winui scenario, claude-opus-4.6, 2 iterations per condition.

### Tracer Adherence

| Condition | i1 | i2 | Applicable Rate |
|-----------|----|----|-----------------|
| `base-DARMV-tracers` (inlined, knowledge) | 7/8 (88%) | 7/8 (88%) | **7/7 = 100%** |
| `base-DARMV-runbook` (inlined, runbook, no tracers) | 0/8 | 0/8 | Control — confirms detection works |

T-DESIGN-2 was N/A in both trials — the markdown editor uses TabView, not NavigationView. So effective adherence was 7/7 = 100%.

### Scores
All 4 trials scored 88-89. No quality difference between knowledge and runbook format.

### Token Analysis
- Tracer condition: avg 6.6M input tokens, ~80 turns
- Runbook condition: avg 4.85M input tokens, ~74 turns
- The delta is driven by **more turns** (agent spends extra turns writing tracer artifacts), not by prompt size difference
- Per-turn cost is nearly identical (~72K tokens/turn)
- 87% of input tokens are cache hits

### Session Token Breakdown (from `events.jsonl` shutdown events)
- `systemTokens`: ~9,370 (identical for both conditions — agent.md is NOT in system prompt)
- `toolDefinitionsTokens`: 13,163 (identical)
- `conversationTokens`: 50K-60K (agent.md + skills + chat history)
- Two trials had zero tokens in `results.json` because the Copilot CLI didn't print its usage footer. Recovered data from `~/.copilot/session-state/<session-id>/events.jsonl`.

### Turn Analysis (averaged across 4 trials)
| Phase | Avg Tool Calls | % of Session |
|-------|---------------|-------------|
| Verification/Testing | 37 | 41% |
| Code writing/editing | 19 | 21% |
| Reading files | 15 | 17% |
| Overhead | 15 | 17% |
| Build/Install | 4 | 4% |

Verification is 41% of tool calls — and this is the BUILD agent's self-verification, separate from the benchmark's grading validation stage (which runs as its own ~106-call session in `validation-log.txt`).

## Current Experiment: The 2×2 Matrix (Running Now)

| | Knowledge + Tracers | Runbook + Tracers |
|---|---|---|
| **Inlined** | `base-DARMV-tracers` ✅ 100% | `base-DARMV-runbook-tracers` ⏳ |
| **Non-inlined** | `base-DARMV-tracers-noninlined` ⏳ | `base-DARMV-runbook-tracers-noninlined` ⏳ |

**What to look for in results:**
1. Do non-inlined conditions show >0% tracer adherence? If 0%, the agent isn't reading plugin skill files.
2. Does runbook format help in non-inlined mode? Compare knowledge vs runbook in the non-inlined row.
3. Does runbook format help in inlined mode? Compare the two inlined conditions.

### How to Analyze

For each trial directory:
1. Check `tracer-report.json` for automated detection (note: may undercount T-ARCH-2 due to the TypeScript bug)
2. Run `agent-benchmark/common/Detect-Tracers.ps1 -AppDir <trial>/app` for accurate detection
3. Compare `results.json` → `skill_adherence` across conditions
4. Check `results.json` → `metrics.score` to see if quality differs

**Quick analysis command:**
```powershell
Get-ChildItem "agent-benchmark/results/run7/*/tracer-report.json" | ForEach-Object {
    $r = Get-Content $_.FullName -Raw | ConvertFrom-Json
    $dir = Split-Path (Split-Path $_.FullName) -Leaf
    Write-Host "$dir : $($r.total_hits)/$($r.total_tracers) ($([math]::Round($r.adherence_rate * 100))%)"
}
```

**For accurate results (runs the PowerShell detector, not the TypeScript one):**
```powershell
Get-ChildItem "agent-benchmark/results/run7" -Directory | Where-Object { $_.Name -match '_i\d+$' } | ForEach-Object {
    $appDir = Join-Path $_.FullName "app"
    if (Test-Path $appDir) {
        $json = & "agent-benchmark/common/Detect-Tracers.ps1" -AppDir $appDir 2>&1 | ConvertFrom-Json
        Write-Host "$($_.Name): $($json.total_hits)/$($json.total_tracers) ($([math]::Round($json.adherence_rate * 100))%)"
    }
}
```

## Key Conclusions So Far

1. **Inlined skills work** — 100% tracer adherence when skill content is pasted into agent.md
2. **Skill format doesn't matter for quality** — knowledge vs runbook scored identically (88 vs 88.5)
3. **Gemini's core claim is wrong for inlined skills** — the LLM doesn't "think it knows better" and skip knowledge-format skills
4. **The real question is non-inlined delivery** — does the Copilot CLI plugin system actually load skill files as context? That's what the current experiment tests.

## Other Documents in This Repo

- `TURN-REDUCTION-STRATEGIES.md` — analysis of where turns are spent and strategies to reduce token usage by ~60%
- `reports/flyout-menu-interaction-failure.md` — detailed breakdown of a specific 10-turn failure where the agent couldn't interact with MenuBar flyout popups
