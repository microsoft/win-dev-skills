# Agent Benchmark

Benchmarks AI agent variants by having them build desktop apps from prompts, then scoring the results.

## Quick Start

```powershell
cd agent-benchmark/dashboard
npm install        # first time only
npm start          # launches the dashboard
```

The dashboard presents a setup wizard:
1. **New benchmark** or **Load previous run**
2. Select scenarios (file-explorer-shell, local-llm-chat, etc.)
3. Select agent with setups to benchmark (bare, starter, base-DAMVC, electron, etc.)
4. Select model (claude-sonnet-4.5, claude-opus-4.6)
5. Set parallel runs and iterations
6. Start

## Scenarios

Each scenario is a single `scenario.md` file with YAML frontmatter + markdown prompt:

```markdown
---
name: local-llm-chat
description: "Build a local LLM chat app"
type: new
app_name: LocalLLMChat
requirements:
  - "Model path selection with folder picker"
  - "Chat interface with streaming responses"
test_notes: |
  Load using CPU provider. Wait 30s for model loading.
  Send "Hello" and verify streaming response.
test_assets:
  - name: Phi-4 model
    path: C:\path\to\model
    description: Use as default model path
    include_in_build: true
---

Create a WinUI 3 app that implements a chat interface...
```

### Frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Scenario identifier |
| `description` | Yes | Brief description |
| `type` | Yes | `new`, `convert`, or `improve` |
| `app_name` | No | App name for MSIX identity |
| `requirements` | No | List of requirements scored during validation |
| `test_notes` | No | Notes passed to the validation agent only |
| `test_assets` | No | Files/paths for testing (see below) |
| `original_app` | No | Source app for convert/improve scenarios |

### Test assets

Test assets are passed to the **validation agent** by default. Set `include_in_build: true` to also share them with the build agent:

```yaml
test_assets:
  - name: ONNX model
    path: C:\path\to\model
    include_in_build: true    # build agent sees this
  - name: Test image
    path: C:\path\to\test.png # only validation agent sees this
```

## Dashboard Views

Switch views with number keys `1-5` or `Tab`:

| Key | View | Shows |
|-----|------|-------|
| 1 | Live | Real-time copilot output for selected run |
| 2 | Progress | Status matrix of all runs |
| 3 | Results | Score table with grades, timing, cost estimate |
| 4 | Charts | Score vs tokens scatter plots |
| 5 | Summary | AI-generated analysis |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `↑↓` | Scroll log (live view) or select runs (progress, when done) |
| `←→` | Switch between runs (live view) |
| `PgUp/PgDn` or `[/]` | Scroll log one page up/down |
| `h` | Jump to top of log |
| `e` | Jump to bottom of log |
| `F` | Follow active run (live view) |
| `O` | Open run folder in Explorer |
| `Space` | Toggle run for rerun/revalidate (progress, when done) |
| `R` | Rerun selected (full copilot build + validate) |
| `V` | Revalidate selected (skip copilot, just rebuild + launch + validate) |
| `H` | Generate HTML report and open in browser |
| `Q` | Quit |

## Process Management & Timeout Handling

Copilot CLI is invoked with `--output-format json`, which streams structured JSONL events to stdout. The dashboard parses these events in real-time to:
- Write each event to `{trialDir}/build-events.jsonl` (and `validation-events.jsonl`, etc.) for persistence
- Track token usage per turn (main agent output tokens + sub-agent totals)
- Reconstruct human-readable text for the dashboard live view
- Detect session completion and manage process lifecycle

The dashboard uses a three-tier termination system:

### 1. Completion detection (fastest — 5 seconds)

Copilot emits a `result` JSONL event when the session finishes, containing `sessionId`, `usage` (premiumRequests, totalApiDurationMs, sessionDurationMs, codeChanges), and `exitCode`.

Once detected → **force-kill the process tree after 5 seconds**. No graceful shutdown needed because copilot already completed and wrote its session data.

### 2. Silence detection (medium — 5 minutes)

If copilot has emitted at least 3 meaningful events but then produces no meaningful output for 5 minutes, it's assumed stuck.

**Typical cause:** copilot finished its work but a child process (e.g., `winapp run` keeping the app alive) holds the process tree open, or a sub-agent is running in the background without producing main-agent events.

**What happens:**
1. Graceful shutdown (SIGTERM / `taskkill /T` without `/F`) — gives copilot 15 seconds to write `session.shutdown`
2. Force kill (SIGKILL / `taskkill /T /F`) if still alive

**Reset behavior:** The 5-minute timer resets on events that indicate real progress:

| Event | Resets timer? | Why |
|-------|:---:|-----|
| `assistant.message` | ✅ | Agent completed a response turn |
| `assistant.message_delta` | ✅ | Agent is actively generating output |
| `assistant.reasoning_delta` | ✅ | Agent is actively thinking |
| `tool.execution_complete` | ✅ | A tool finished executing |
| `tool.execution_partial_result` | ✅ | Tool/sub-agent producing streaming output |
| `subagent.started` | ✅ | Sub-agent was spawned |
| `subagent.completed/failed` | ✅ | Sub-agent finished |
| `session.background_tasks_changed` | ❌ | System heartbeat, not real progress |
| `session.mcp_servers_loaded` | ❌ | Setup event |
| `session.info`, `system.notification` | ❌ | Informational only |

### 3. Hard timeout (slowest — configurable)

An absolute wall-clock limit per phase, set via the dashboard UI:

| Phase | Default | Configurable? |
|-------|---------|--------------|
| Copilot build | 60 min | Yes (`maxBuildMinutes` in setup) |
| Validation | 40 min | No |
| Validation follow-up | 5 min | No |
| Summary analysis | 5 min | No |

**What happens:** Same graceful-then-force sequence as silence detection (15-second grace period).

### Priority

Completion detection (`result` event) > Silence detection > Hard timeout.

### Session event files

Each copilot invocation writes its JSONL events to the trial output directory in real-time:

| File | Phase |
|------|-------|
| `build-events.jsonl` | Main copilot build session |
| `validation-events.jsonl` | Validation agent session |
| `validation-followup-events.jsonl` | Timeout follow-up scoring |
| `retrospective-events.jsonl` | Retrospective analysis |
| `summary-events.jsonl` | Cross-run summary (in run dir, not trial dir) |

Use `scripts/dev-get-session-txt.ps1` to convert any events file to a readable transcript.

## Loading Previous Runs

Select "Load previous run" at startup to view results from any past run.
All views work including live (loads session logs from disk).

## Rerunning and Revalidating

After a run completes (or after loading a past run), go to Progress view (`2`):
- **Rerun** (`R`): full copilot build from scratch + validate
- **Revalidate** (`V`): skip copilot build, just rebuild with MSBuild + launch + validate. Use when fixing harness issues or when the app was built correctly but validation failed.

## Agent setups

Each benchmark trial runs a specific **agent** — a configuration that defines how the AI is set up before it starts coding. All agents live in `src/agents/<name>/` (or `src/.local/agents/<name>/` for local experiments) and are auto-discovered by the dashboard.

Examples:

| Agent | What it does |
|-------|-------------|
| `bare` | Just copilot + prompt, no scaffolding |
| `starter` | Scaffolds with `dotnet new winui` via preset script |
| `electron` | Copilot builds an Electron app instead of WinUI 3 |
| `agentsetup-*` | Runs setup scripts + installs agent from `src/agents/<name>/` with skills |

Agent setups from `src/agents/` are auto-discovered. Each has a `config.json`
controlling which scripts, sections, skills, and MCP servers to include.

### Setup Scripts

Each agent setup can declare a `preset_scripts` field in its `config.json` — an ordered list of actions to run before the agent starts working. Scripts live in `src/scripts/`, each in a self-contained subfolder with a `action.ps1` entry point and any supporting files:

```
src/scripts/
├── run-dotnetnew-winui/     # Runs `dotnet new winui` to scaffold a project
│   └── action.ps1
├── load-vsblank/            # Copies a pre-built VS Blank App template
│   ├── action.ps1
│   └── template/
└── load-dotnetnew/          # Copies a pre-built dotnet new template
    ├── action.ps1
    └── template/
```

Example `config.json`:
```jsonc
{
  "description": "Full agent with VS template",
  "preset_scripts": ["load-vsblank"],      // runs before agent/skills/MCP install
  "sections": ["base", "design", ...],
  "skills": { "include": [] },
  "mcp": { "include": [] }
}
```

Scripts receive environment variables (`BENCH_APP_DIR`, `BENCH_APP_NAME`, etc.) and their stdout/stderr is captured to `setup-script.log`. If a script fails, the trial is marked as failed and skipped.

## How Scoring Works

Each run is scored 0–100:
- **Builds & runs (10 pts)**: Awarded only if the project compiles and the app launches. Otherwise score is 0.
- **Quality subscores (0–40 pts)**: Four categories, each 0–10, scored by a validation agent:
  - **Project quality** — correct framework, packages, app identity
  - **UI completeness** — all expected controls present with labels
  - **Visual quality** — layout, Fluent Design, spacing, theming
  - **Functionality** — controls work and produce correct results
- **Requirements (0–50 pts)**: `50 × (passed / total)`. Each scenario requirement is independently tested.

Score breakdown shown as `88 (42:46)` = 42 quality + 46 requirements.

## HTML Report

Press `H` after a run completes to generate a self-contained HTML report (`index.html` in the run folder). Share the single file — screenshots are embedded as base64.

The report includes:
- Scenario context (prompt, requirements, scoring methodology)
- Interactive charts (score distribution, score vs tokens, efficiency, subscore breakdown, requirements pass rate) with filter controls
- Comparison table with screenshots, scores, build cycles, confidence, timing, tokens
- Requirements heatmap with clickable cells showing pass/fail reasons
- Cross-run pattern analysis (common failures, time sinks, missing tools)
- Per-trial retrospectives with expandable detail cards

Multi-scenario runs get tabbed reports (one tab per scenario).

## Retrospective

After each build, a retrospective agent (Opus) resumes the build session and analyzes what happened. The retrospective captures:

| Field | Description |
|-------|-------------|
| `what_went_well` | Parts that worked smoothly |
| `what_went_wrong` | Errors, failures, time wasted |
| `research_queries` | Every web/MCP search with query, source, usefulness, and issues |
| `failed_apis` | Every API/pattern that didn't work, why it was tried, why it failed, what replaced it |
| `time_sinks` | Phases that took disproportionately long |
| `build_fix_cycles` | Number of build-fix iterations |
| `confidence_score` | Agent's self-assessment (1–10) |
| `known_issues` | Issues the agent identified but didn't fix |
| `suggestions` | What would have helped work faster |

This data feeds the cross-run pattern analysis and is stored in both `retrospective.json` and `results.json`.

## Local Agents and Skills (`src/.local/`)

The `src/.local/` directory (gitignored) mirrors `src/` structure for experimental or private agents and skills:

```
src/.local/
  agents/
    someagent-base-DA/        # Local agent variant
      config.json
  agents/_sections/      # Custom section templates
    base.md
    design.md
  skills/
    some-skill/            # Local skill
      SKILL.md
```

Agents and skills in `.local/` are auto-discovered alongside regular ones. Use this for:
- Experimental agents without checking into the main repo
- Private agent variants for testing
- Skills from external sources

## Agent Setup Config Reference

Each agent variant has a `config.json` in `src/agents/<name>/` (or `src/.local/agents/<name>/`):

```jsonc
{
  "description": "Agent description shown in dashboard",
  "preset_scripts": ["load-dotnetnew"],        // Setup scripts (src/scripts/)
  "sections": ["base", "design", "architecture"], // Agent template sections
  "sections_root": "src/.local/agents/_sections", // Custom sections path (optional)
  "inline_skills": true,                      // Embed skill content into agent.md
  "skills": {
    "include": ["some-skill"],                  // Only these skills
    // OR: "exclude": ["winmd-api-search"],   // All except these
    // OR: "all": true                        // Everything
  },
  "mcp": {
    "include": ["mslearn"]                    // Only these MCP servers
    // Empty {} = no MCP servers
  },
  // Phase overrides (optional — for custom frameworks):
  "scaffold_command": "scafold.exe --create {app_name} --dir \"{app_dir}\"",
  "build_command": "dotnet build \"{csproj}\" -c Debug -p:Platform=x64",
  "launch_mode": "packaged",                  // "packaged" or "unpackaged"
  "prompt_addendum": "Extra instructions for the build agent..."
}
```

## Structure

```
agent-benchmark/
  scenarios/       Scenario definitions (scenario.md files)
  results/         Run output (gitignored)
  common/          Shared config, prompt templates
  dashboard/       Ink-based terminal dashboard (primary entry point)
```

## Utility Scripts

### Export session transcript

Convert a `build-events.jsonl` (or any `*-events.jsonl`) into a readable text file:

```powershell
.\scripts\dev-get-session-txt.ps1 agent-benchmark\results\run3\fes83_poc-v2_s46_i1\build-events.jsonl
```

Outputs `copilot-full-output.txt` next to the input file. Includes turns, reasoning, tool calls with arguments, tool results, sub-agent events, and session stats.

> **Note:** `common/Run-Benchmark.ps1` and `common/Run-Dashboard.ps1` are legacy PowerShell scripts from an earlier version. They do not support setup scripts, section-based agent assembly, or parallel execution. Use `npm start` in the `dashboard/` directory instead.

## Prerequisites

- Node.js 18+
- `copilot` CLI installed and authenticated
- `winapp` CLI installed
- .NET SDK 10+ (for WinUI conditions)
- Windows with Developer Mode enabled
