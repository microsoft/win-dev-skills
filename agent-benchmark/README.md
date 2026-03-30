# Agent Benchmark

Benchmarks WinUI 3 agent variants by having them build apps from prompts, then scoring the results.

## Quick Start

```powershell
cd agent-benchmark/dashboard
npm install        # first time only
npm start          # launches the dashboard
```

The dashboard presents a setup wizard:
1. **New benchmark** or **Load previous run**
2. Select scenarios (file-explorer-shell, local-llm-chat, etc.)
3. Select agent conditions (base-only, base-DARMVC, starter, etc.)
4. Select model (claude-sonnet-4.5, claude-opus-4.6)
5. Set parallel runs and iterations
6. Start

## Dashboard Views

Switch views with number keys `1-5` or `Tab`:

| Key | View | Shows |
|-----|------|-------|
| 1 | Live | Real-time copilot output for selected run |
| 2 | Progress | Status matrix of all runs |
| 3 | Results | Score table with grades, timing, cost |
| 4 | Charts | Score vs tokens scatter plots |
| 5 | Summary | AI-generated analysis |

### Keyboard shortcuts
- `Arrow up/down` - scroll (or select runs in progress view when done)
- `Arrow left/right` - switch between runs in live view
- `F` - follow active run (live view)
- `O` - open run folder in Explorer
- `Space` - toggle run for rerun (progress view, when done)
- `R` - rerun selected runs (progress view)
- `Q` - quit

## Loading Previous Runs

Select "Load previous run" at startup to view results from any past run.
All views work including live (loads session logs from disk).

## Rerunning Sub-runs

After a run completes (or after loading a past run):
1. Go to Progress view (key `2`)
2. Use arrow keys to navigate entries
3. Press `Space` to toggle entries for rerun
4. Press `R` to start rerunning selected entries

## Structure

```
agent-benchmark/
  scenarios/       Benchmark prompts and configs
  results/         Run output (gitignored)
  common/          Shared config, prompt templates
  dashboard/       Ink-based terminal dashboard (this tool)
```

## How Scoring Works

Each run is scored 0-100:
- **Base points (10)** for building successfully
- **Quality points (0-40)** from 4 subscores (project, UI, visual, functionality) each 0-10
- **Requirements points (0-50)** from pass/fail on scenario requirements

Score breakdown shown as `88 (42:46)` = 42 quality + 46 requirements.

## How Conditions Work

| Condition | What it does |
|-----------|-------------|
| `bare` | Just copilot + prompt, no scaffolding |
| `starter` | Scaffolds with `dotnet new winui` (includes template instructions) |
| `candidate-*` | Scaffolds + installs agent from `src/agents/<name>/` with skills |

Candidates from `src/agents/` are auto-discovered. Each has a `config.json`
controlling which sections, skills, and MCP servers to include.

## Prerequisites

- Node.js 18+
- `copilot` CLI installed and authenticated
- `winapp` CLI installed
- .NET SDK 10+
- Windows with Developer Mode enabled
