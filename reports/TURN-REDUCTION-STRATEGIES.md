# Turn Reduction Strategies for Agent Token Optimization

Based on analysis of run6 benchmark data (markdown-editor-winui scenario, claude-opus-4.6, 4 trials).

---

## Findings

### Token Economics

Each agent turn re-sends the **full conversation context** to the model. Per the session-state `events.jsonl` data:

| Component | Tokens | % of Context | Notes |
|-----------|--------|-------------|-------|
| System prompt | 9,370 | 12% | Copilot CLI system prompt (fixed) |
| Tool definitions | 13,163 | 17% | Tool schemas (fixed) |
| Conversation | 50,000–60,000 | 71% | agent.md + skills + chat history (grows) |
| **Total per turn** | **~77,000** | **100%** | Sent every single turn |

87% of input tokens are **cache hits** (re-read, not reprocessed), so the actual compute cost is ~13% of the raw token count. But cached tokens still count toward billing and rate limits.

### Where Turns Go (averaged across 4 trials)

| Phase | Avg Tool Calls | % of Session | What It Does |
|-------|---------------|-------------|-------------|
| **Verification/Testing** | **37** | **41%** | Screenshots, UI inspection, clicking menus, navigating pages |
| Code writing/editing | 19 | 21% | Creating and editing .cs/.xaml files |
| Reading files | 15 | 17% | Reading project files, reading back screenshots |
| Overhead | 15 | 17% | git commits, todo tracking, intent reporting |
| Build/Install | 4 | 4% | dotnet build, NuGet package install |

### Per-Trial Breakdown

| Trial | Score | Requests | Tool Calls | Verify | Code | Build | Read | Overhead | Input Tokens |
|-------|-------|----------|-----------|--------|------|-------|------|----------|-------------|
| tracers i1 | 88 | 85 | 116 | 41 (35%) | 26 (22%) | 4 (3%) | 26 (22%) | 19 (16%) | 6.1M |
| tracers i2 | 88 | 74 | 74 | 31 (42%) | 12 (16%) | 2 (3%) | 15 (20%) | 14 (19%) | 7.1M |
| runbook i1 | 89 | 80 | 80 | 31 (39%) | 17 (21%) | 4 (5%) | 10 (12%) | 18 (22%) | 4.9M |
| runbook i2 | 88 | 67 | 89 | 44 (49%) | 21 (24%) | 5 (6%) | 10 (11%) | 9 (10%) | 4.8M |
| **Average** | **88** | **76** | **90** | **37 (41%)** | **19 (21%)** | **4 (4%)** | **15 (17%)** | **15 (17%)** | **5.7M** |

### Key Observations

1. **Verification dominates** — 41% of all tool calls are the build agent testing its own work. This is SEPARATE from the benchmark's grading validation stage, which runs as its own session (106 additional tool calls). The build agent is duplicating effort.
2. **Menu interaction is the worst offender** — one trial spent 10 consecutive turns trying to click a single menu item in a flyout popup
3. **Screenshot reads are wasteful** — the agent takes screenshots then reads them back, but can't meaningfully analyze images
4. **Low parallelism** — the agent averages only 1.2 tool calls per turn (90 calls / 76 requests), despite many operations being independent
5. **Reading files it just wrote** — the agent frequently re-reads files immediately after creating/editing them

> **Note**: All numbers in this document refer to the **build agent session only** (session-log.txt). The benchmark's grading/validation stage runs as a separate Copilot session (validation-log.txt, ~106 tool calls) and is NOT included in these counts or token figures.

### Token Cost Per Extra Turn

Each additional turn costs **~72K input tokens** (the full context window). With 87% caching, the fresh compute per turn is ~9K tokens. But the cumulative total grows linearly:

- 76 turns × 72K avg = **5.5M input tokens** (matches observed 5.7M)
- Reducing to 30 turns × 72K avg = **2.2M input tokens** (projected)
- **Potential savings: ~60%**

---

## Strategy 1: Fix Menu Interaction (saves ~15 turns)

**Problem**: The agent spent **10 turns** trying to click "Split View" in a flyout menu, and **7 turns** trying to open Find. It repeatedly fails to interact with popup/flyout windows.

**Fix**: Add to agent instructions (base section or verify section):

```markdown
### UI Verification Rules
- ALWAYS use keyboard shortcuts first: Ctrl+F (Find), Ctrl+N (New), Ctrl+O (Open), 
  Ctrl+S (Save), Ctrl+1/2/3 (view modes), etc.
- NEVER try to click items inside flyout/popup menus via UI automation — they are 
  unreliable. Use `winapp ui invoke` on the menu BUTTON, not items inside the popup.
- If a shortcut isn't available, use `winapp ui invoke` with the element's slug or text, 
  not positional clicking.
- If UI interaction fails twice, skip it and note it as untested. Do NOT retry more 
  than twice.
```

**Expected impact**: ~17 menu interaction turns → ~2 turns.

---

## Strategy 2: Chain Verification Commands (saves ~8 turns)

**Problem**: The agent runs screenshot → read → inspect → screenshot as separate turns, each costing a full context re-send.

**Fix**: Add to agent instructions:

```markdown
### Efficient Verification
- Chain up to 3 `winapp ui` commands per shell call using `;` (not `&&`):
  ```
  winapp ui invoke btn-edit -a App; winapp ui screenshot -a App --output edit.png
  ```
- Batch action + screenshot into one shell call whenever possible.
- When inspecting multiple pages, chain: navigate + wait + screenshot in one call.
```

**Expected impact**: ~12 verification turns → ~4 turns.

---

## Strategy 3: Skip Screenshot Reading (saves ~8 turns)

**Problem**: The agent takes screenshots then reads them back (8 separate `Read screenshot.png` calls). In the benchmark, the validation agent handles UI verification separately — the build agent doesn't need to self-verify via screenshots.

**Fix**: Add to agent instructions:

```markdown
### Screenshot Policy
- After build succeeds and the app launches, take ONE overview screenshot for the record.
- Do NOT read screenshots back into the conversation — they consume tokens and you 
  cannot meaningfully analyze images in this context.
- Use `winapp ui inspect --interactive` for structural verification instead of screenshots.
- Detailed visual/functional testing is handled by the validation step, not the build step.
```

**Expected impact**: ~8 screenshot read turns → 0 turns.

---

## Strategy 4: Batch File Creation (saves ~5 turns)

**Problem**: The agent creates 9 files one by one (DocumentTab.cs, ViewMode.cs, MarkdownService.cs, etc.), each as a separate tool call in separate turns.

**Fix options**:

### Option A: Agent instruction to parallelize
```markdown
### File Creation
- When creating multiple independent files (models, services, converters), batch them 
  into a single turn using parallel tool calls.
- Create all model files in one turn, all service files in the next.
- Target: never create fewer than 3 files per turn when scaffolding a new app.
```

### Option B: Enhanced scaffold template
Create a richer `dotnet new` template that includes MVVM folder structure with stub files:
```
dotnet new winui-mvvm -n AppName
```
This would create Models/, ViewModels/, Views/, Services/, Converters/ with placeholder files.

### Option C: Scaffold script in the skill
Add a PowerShell script to the dev-workflow skill that creates the standard folder structure:
```powershell
# One shell call instead of 9 create-file calls
param($ProjectDir)
$folders = @("Models", "ViewModels", "Views", "Services", "Converters", "Helpers")
foreach ($f in $folders) { New-Item -Path "$ProjectDir\$f" -ItemType Directory -Force }
```

**Expected impact**: ~9 file creation turns → ~2-4 turns.

---

## Strategy 5: Parallel Tool Calls (saves ~4 turns)

**Problem**: The agent averages **1.3 tool calls per turn** but could batch many more. At session start, it reads 6 project files sequentially (App.xaml, App.xaml.cs, MainWindow.xaml, etc.).

**Fix**: Add to agent instructions:

```markdown
### Tool Call Efficiency
- When reading multiple files, make ALL read calls in a single turn (parallel tool calls).
- When creating independent files, batch them into one turn.
- Target minimum 3 tool calls per turn for file operations.
- Read the .csproj, App.xaml, MainWindow.xaml, and Package.appxmanifest in ONE turn.
```

**Expected impact**: ~6 serial read turns → ~2 turns.

---

## Strategy 6: Reduce Overhead Calls (saves ~5 turns)

**Problem**: 19 calls are overhead — git operations, todo tracking, intent reporting. Some are unavoidable but some can be consolidated.

**Fix**: 
- Commit once at the end, not incrementally
- Report intent less frequently (only on phase changes)
- Skip todo tracking for simple build tasks

**Expected impact**: ~19 overhead turns → ~14 turns.

---

## Combined Projection

| Strategy | Current (avg) | After (est) | Turns Saved | Token Savings |
|----------|--------------|-------------|-------------|---------------|
| Menu keyboard shortcuts | ~15 failed menu turns | ~2 | ~13 | ~940K |
| Chain verification commands | ~22 verify turns | ~8 | ~14 | ~1.0M |
| Skip screenshot reads | ~10 reads | ~0 | ~10 | ~720K |
| Batch file creation | ~10 creates | ~4 | ~6 | ~430K |
| Parallel tool calls | ~8 serial reads | ~2 | ~6 | ~430K |
| Reduce overhead | ~15 overhead | ~10 | ~5 | ~360K |
| **Total** | **~76 requests** | **~30 requests** | **~46** | **~3.3M** |

**Projected token reduction**: ~5.7M → ~2.2M input tokens (**~60% reduction**)

**Projected time reduction**: ~30min → ~12min session time (proportional to turn count)

**Projected score impact**: None — these changes don't affect code quality, only efficiency. Score should remain 88-89.

Most of these are achievable through **agent instruction changes only** — no infrastructure work needed. Strategies 1-3 (menu shortcuts, command chaining, skip screenshot reads) are the highest-impact and easiest to implement.

---

## How to Test

Run the benchmark with a modified agent that includes these instruction changes, using the same scenario (markdown-editor-winui) and model (claude-opus-4.6). Compare:

- Total turns/requests
- Total input tokens  
- Session time
- Score (should remain 88-89 — these changes don't affect code quality)

Use the tracer system from run6 to verify that code quality tracers still pass (ensuring the verification reduction doesn't cause the agent to skip important quality rules).

---

*Generated from run6 analysis (2026-04-09). Based on runbook_i2 trial: 67 requests, 4.76M input tokens, 89 tool calls, score 88.*
