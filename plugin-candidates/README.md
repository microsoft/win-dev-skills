# Plugin Candidates

Benchmark variants of the WinUI 3 plugin, testing different approaches to agent knowledge and orchestration.

## Why

The current plugin (`current/`) takes **1h 52m** and **32.3M input tokens** vs **9 min** bare — the orchestrator with 8 sub-agents and ~500KB of skills/references is too heavy. These candidates test whether simpler approaches can achieve comparable quality in under 30 minutes.

## Candidates

| Candidate | Approach | Agents | Skills | Refs | Size | Expected Speed |
|-----------|----------|--------|--------|------|------|---------------|
| `current` | Full orchestrator (8 sub-agents) | 2 | 22 | 16 | 549KB | ~1-2h |
| `minimal` | Direct builder, core knowledge | 2 | 8 | 4 | 125KB | ~10min |
| `single-agent` | Phased single agent, curated skills | 2 | 12 | 8 | 181KB | ~15-25min |
| `lite-orchestrator` | 3 sub-agents (Planner→Builder→Verifier) | 2 | 12 | 8 | 182KB | ~20-35min |
| `mcp-first` | MCP-reliant, zero reference files | 2 | 8 | 1 | 68KB | ~10-15min |

## How It Works

Each candidate is a complete plugin with its own agents, skills, and MCP configuration. The benchmark harness uses a `candidate` condition that:

1. Scaffolds a WinUI 3 project with `dotnet new winui` (for project structure only)
2. **Strips** all template-generated agent instructions (`AGENTS.md`, `.github/instructions/`)
3. Installs only the candidate's agents and skills into `.github/`
4. Runs `copilot --agent winui3` against the candidate

This ensures a **level playing field** — the only knowledge available is what the candidate provides.

## Running Benchmarks

### Run all candidates + bare + starter
```powershell
cd agent-benchmark
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\file-explorer-shell-minimal
```

### Run a single candidate
```powershell
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\file-explorer-shell-minimal -Condition candidate -PluginPath ..\plugin-candidates\minimal
```

### Run with a different model
```powershell
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\file-explorer-shell-minimal -Condition candidate -PluginPath ..\plugin-candidates\single-agent -Model claude-sonnet-4.5
```

## Candidate Details

### `current` — Full Orchestrator (Baseline)
Exact copy of the production plugin. Spawns 8 specialist sub-agents in a pipeline:
Analyzer → Designer → Design Reviewer → Architect → Builder → Code Reviewer → Tester.
Includes all 22 skills and ~193KB of orchestration knowledge bundles.

### `minimal` — Direct Builder
Simplest possible plugin. Single agent that writes code directly with key WinUI 3 patterns inlined. Uses `winapp run` / `winapp ui` for self-verification. Tests how far a lightweight agent with 4 core skills gets.

### `single-agent` — Phased Workflow
Middle ground. Single agent that follows a structured 5-phase workflow (Analyze → Design → Build → Run → Verify) without spawning sub-agents. Has 8 curated skills and 2 reference files for deeper knowledge.

### `lite-orchestrator` — Simplified Multi-Agent
Orchestrator with 3 sub-agents instead of 8: Planner (merged Analyzer+Designer+Architect), Builder, and Verifier (merged Code Reviewer+Tester). Fewer iteration loops and trimmed knowledge bundles.

### `mcp-first` — On-Demand Knowledge
Tests whether Microsoft Learn MCP lookups can replace bundled reference files. Single agent with only 4 skills and zero reference files. Agent is instructed to actively look up APIs and patterns via MCP before coding.
