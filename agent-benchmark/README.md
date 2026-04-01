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
| `H` | Generate HTML report and open in browser |
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
| `candidate-*` | Runs setup scripts + installs agent from `src/agents/<name>/` with skills |

Candidates from `src/agents/` are auto-discovered. Each has a `config.json`
controlling which scripts, sections, skills, and MCP servers to include.

### Setup Scripts

Each candidate can declare a `scripts` field in its `config.json` — an ordered list of actions to run before the agent starts working. Scripts live in `src/scripts/`, each in a self-contained subfolder with a `action.ps1` entry point and any supporting files:

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
  "scripts": ["load-vsblank"],           // runs before agent/skills/MCP install
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

## Candidate Config Reference

Each agent variant has a `config.json` in `src/agents/<name>/` (or `src/.local/agents/<name>/`):

```jsonc
{
  "description": "Agent description shown in dashboard",
  "scripts": ["load-dotnetnew"],              // Setup scripts (src/scripts/)
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
  dashboard/       Ink-based terminal dashboard
```

## Prerequisites

- Node.js 18+
- `copilot` CLI installed and authenticated
- `winapp` CLI installed
- .NET SDK 10+ (for WinUI conditions)
- Windows with Developer Mode enabled
