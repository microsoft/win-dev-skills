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
3. Select agent conditions (bare, starter, electron, candidate-base-DARMVC, etc.)
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
| `↑↓` | Scroll (or select runs in progress when done) |
| `←→` | Switch between runs (live view) |
| `F` | Follow active run (live view) |
| `O` | Open run folder in Explorer |
| `Space` | Toggle run for rerun/revalidate (progress, when done) |
| `R` | Rerun selected (full copilot build + validate) |
| `V` | Revalidate selected (skip copilot, just rebuild + launch + validate) |
| `Q` | Quit |

## Loading Previous Runs

Select "Load previous run" at startup to view results from any past run.
All views work including live (loads session logs from disk).

## Rerunning and Revalidating

After a run completes (or after loading a past run), go to Progress view (`2`):
- **Rerun** (`R`): full copilot build from scratch + validate
- **Revalidate** (`V`): skip copilot build, just rebuild with MSBuild + launch + validate. Use when fixing harness issues or when the app was built correctly but validation failed.

## Conditions

| Condition | What it does |
|-----------|-------------|
| `bare` | Just copilot + prompt, no scaffolding |
| `starter` | Scaffolds with `dotnet new winui` (includes template instructions) |
| `electron` | Copilot builds an Electron app instead of WinUI 3 |
| `candidate-*` | Scaffolds + installs agent from `src/agents/<name>/` with skills |

Candidates from `src/agents/` are auto-discovered. Each has a `config.json`
controlling which sections, skills, and MCP servers to include.

## How Scoring Works

Each run is scored 0-100:
- **Base points (10)** for building successfully
- **Quality points (0-40)** from 4 subscores (project, UI, visual, functionality) each 0-10
- **Requirements points (0-50)** from pass/fail on scenario requirements

Score breakdown shown as `88 (42:46)` = 42 quality + 46 requirements.

## Structure

```
agent-benchmark/
  scenarios/       Scenario definitions (scenario.md files)
  results/         Run output (gitignored)
  common/          Shared config, prompt templates
  dashboard/       Ink-based terminal dashboard
```

## Prerequisites

- Node.js 18+
- `copilot` CLI installed and authenticated
- `winapp` CLI installed
- .NET SDK 10+ (for WinUI conditions)
- Windows with Developer Mode enabled
