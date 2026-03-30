# Plugin Source (`src/`)

Source of truth for all skills, MCP configs, and agent variants.

## Structure

```
src/
  skills/          All skills (shared, single source of truth)
  mcp/             MCP server configurations
  agents/          Agent variants (section-based + legacy)
    _sections/     Composable agent template + slot fragments
  tools/           Build tools (winmd-cli source)
```

## Setup

Before running benchmarks, build and deploy the `winmd.exe` tool:

```powershell
.\scripts\build-winmd.ps1
```

This builds a native AOT single-file exe and copies it to `src/skills/winmd-api-search/winmd.exe`.
Use `-Runtime win-arm64` for ARM64 builds.

## Agent Variants

### Section-based (composable)

Agents are assembled from a base template (`_sections/base.md`) with slot injection.
Each variant's `config.json` lists which sections to include:

| Variant | Sections | Purpose |
|---------|----------|---------|
| `base-only` | base | Baseline - just build/run commands |
| `base-D` | + design | + Design planning |
| `base-DA` | + architecture | + MVVM/project structure |
| `base-DAR` | + research | + MCP doc research |
| `base-DARM` | + metadata | + WinMD API verification |
| `base-DARMV` | + verify | + UI verification with winapp |
| `base-DARMVC` | + checklist | + Requirement verification before done |

### Legacy (standalone agent.md)

| Variant | Description |
|---------|-------------|
| `mcp-first` | MCP docs first, WinMD verify |
| `winmd-first` | WinMD cache first, MCP fallback |
| `single-agent` | 6-phase workflow |

### Config format

```json
{
  "description": "Human-readable description",
  "sections": ["base", "design", "architecture", "research"],
  "inline_skills": true,
  "skills": { "include": [] },
  "mcp": { "include": [] }
}
```

- `sections` - which slot fragments to assemble into agent.md
- `inline_skills` - embed SKILL.md content into agent.md (agents dont read skill files)
- `skills`/`mcp` - explicit overrides (usually empty, auto-resolved from section deps)

### Section dependencies (`*.deps.json`)

Each section declares what it needs:
- `inline_skills` - content embedded in agent.md
- `skills` - installed as tool files
- `mcp` - MCP servers configured

## Adding a New Variant

1. Create folder: `agents/<name>/`
2. Write `config.json` with sections list
3. Run the benchmark - it auto-discovers new variants
