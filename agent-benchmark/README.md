# WinUI 3 Benchmark Framework

Measures how well an AI agent can build, convert, or improve a Windows app.

## Quick Start

```powershell
# Run all conditions + plugin candidates and compare (default)
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\imageresizer-wpf-to-winui

# Run a single condition
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\imageresizer-wpf-to-winui -Condition bare
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\imageresizer-wpf-to-winui -Condition starter
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\imageresizer-wpf-to-winui -Condition candidate -PluginPath ..\plugin-candidates\minimal

# Different model
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\file-explorer-shell -Model claude-sonnet-4.5

# Skip build phase (validate existing output)
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\imageresizer-wpf-to-winui -Condition bare -SkipBuild

# Custom results directory
.\common\Run-Benchmark.ps1 -Scenario .\scenarios\local-llm-chat -ResultsRoot D:\my-results
```

## Configuration

### Path resolution

All paths are resolved relative to the script location — no hardcoded paths. The script automatically determines:
- **Benchmark root** — parent of `common/` (i.e., `agent-benchmark/`)
- **Repo root** — parent of the benchmark root (for locating the plugin)
- **Results root** — `<benchmark-root>/results/` by default; override with `-ResultsRoot`

### Placeholders in scenarios

Scenario files (`scenario.json`) support placeholders in paths:

```json
{
  "original_app": {
    "source_dir": "{repo_root}\\..\\PowerToys",
    "run_args": "\"{scenario_dir}\\testimage.png\""
  }
}
```

- `{repo_root}` — absolute path to the repository root
- `{scenario_dir}` — absolute path to the scenario folder

## Scenario Types

| Type | Description | Validation approach |
|------|-------------|-------------------|
| `convert` | Convert app from one framework to another | Launches BOTH original and converted apps, compares via `winapp ui` |
| `new` | Build a new app from scratch | Evaluates against prompt requirements only |
| `improve` | Add features to an existing app | Launches original, verifies old features still work + new features added |

## What It Measures

| # | Metric | Source |
|---|--------|--------|
| 1 | Time, tokens, cost | `/usage` from `copilot -p --yolo` |
| 2 | Builds? | `dotnet build` exit code |
| 3 | Runs? | `winapp run` + `winapp ui list-windows` |
| 4 | UI Completeness | Validation agent via `winapp ui` |
| 5 | Visual Quality | Validation agent via `winapp ui screenshot` |
| 6 | Functionality | Validation agent via `winapp ui invoke` |

## How It Works

1. **Build phase** — `copilot -p "<prompt>" --yolo` creates/converts the app into `results/<scenario>/<trial>/app/`
2. **Validation phase** — A second `copilot` session inspects the running app with `winapp ui`, and for `convert`/`improve` scenarios, also launches the original app for side-by-side comparison

Each trial's output is self-contained — no repo cleanup needed. Every trial is preserved for comparison.

## Creating a New Scenario

```
scenarios/my-scenario/
├── scenario.json     # Config
├── prompt.md         # Build agent prompt
├── starter/          # (optional) Starting project for improve/extend scenarios
└── reference/        # (optional) Original app captures
```

### scenario.json

```json
{
  "name": "my-scenario",
  "description": "What this scenario tests",
  "type": "convert|new|improve",
  "app_name": "MyApp",
  "requirements": [
    "Specific thing the validator must check",
    "Another requirement to verify"
  ],
  "original_app": {
    "source_dir": "E:\\path\\to\\source",
    "build_command": "MSBuild.exe src\\app.csproj /restore /p:Platform=x64",
    "run_command": "bin\\Debug\\OriginalApp.exe",
    "run_args": "\"path\\to\\test-file.png\"",
    "app_name": "OriginalApp"
  }
}
```

### common/config.json (global — shared by all scenarios)

```json
{
  "conditions": {
    "starter": {
      "template_command": "dotnet new winui -n {app_name} --output \"{app_dir}\"",
      "prompt_addendum": "A WinUI 3 starter project has been created..."
    },
    "plugin": {
      "install_path": "",
      "prompt_addendum": "You have WinUI 3 skills and agents available..."
    }
  },
  "build": {
    "command": "dotnet build {csproj} -c Debug -p:Platform=x64",
    "csproj_pattern": "*.csproj"
  },
  "run": {
    "command": "winapp run {output_folder}"
  }
}
```

> **Note:** When `install_path` is empty, the script automatically resolves the plugin from the repository root.

## Results Structure

Each run is preserved in a timestamped folder with all artifacts:

```
results/
└── run1-032726-174625/                     # Auto-incrementing run number + date + time
    ├── run1-032726-174625-results.json     # Comparison summary (all conditions)
    └── file-explorer-shell-minimal/        # Scenario name
        ├── bare-claude-opus-4.6/           # Condition + model
        │   ├── app/                        # The built project (self-contained)
        │   ├── results.json               # Metrics for this condition
        │   ├── session-log.txt            # Build agent transcript
        │   ├── build-output.txt           # dotnet build output
        │   ├── validation-log.txt         # Validation agent transcript
        │   └── screenshot.png             # App screenshot
        ├── bare-claude-opus-4.6-job.log   # Job log (when run via "all")
        ├── starter-claude-opus-4.6/
        │   └── ...
        ├── candidate-minimal-claude-opus-4.6/
        │   └── ...
        └── candidate-mcp-first-claude-opus-4.6/
            └── ...
```
