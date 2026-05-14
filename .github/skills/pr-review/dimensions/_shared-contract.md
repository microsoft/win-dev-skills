# Shared output contract

Every dimension sub-agent must follow this output contract.

## Header line

Start with exactly one line:

```
# <dimension name>: <N> findings
```

Where `<dimension name>` is one of: `skill-content`, `skill-tool-boundary`,
`tool-correctness`, `payloads-and-tests`, `docs-and-manifests`,
`multi-model`.

## Per-finding block

Each finding is a level-2 heading followed by labeled bullets:

```markdown
## <relative file path>:<start_line>-<end_line>
- **Severity**: critical | high | medium | low
- **Confidence**: high | medium | low
- **Domain**: <dimension name>
- **Tier** (if applicable): 0 (env) | 1 (tooling) | 2 (template) | 3 (instructions)
- **Finding**: <one-line statement of what is wrong>
- **Evidence**: <specific code/prose evidence — quote 1-3 lines, cite line refs in the diff>
- **Recommendation**: <concrete actionable next step — name the file and the change>
```

Notes:

- File paths are relative to the repo root (no leading `./`).
- Line numbers refer to the **post-change** file (the right side of the
  diff). For `working` / `staged` / `all` scopes this means the
  working-tree or staged state, not a committed version.
- For findings that span discontiguous regions, emit them as separate
  findings.
- The **Tier** field is required for `skill-content` and
  `skill-tool-boundary` findings; optional elsewhere.

## Trailing "what I checked" note

After the findings (or in place of them when there are zero), include:

```markdown
## What I checked
- <one bullet per area inspected, e.g., "All new lines in winui-design SKILL.md">
- <e.g., "Analyzer rule WUI2099 implementation + tests">
- <e.g., "plugins/winui/skills/winui-dev-workflow/analyzer/ payload">
```

This appears in the orchestrator's `Coverage notes` section so the
contributor can see scope, not just verdict.

## The Team Lead Test (mandatory signal-to-noise gate)

Before emitting a finding, ask: *"Would a senior maintainer of
microsoft/win-dev-skills keep this comment in a PR review, or delete it
as noise?"* If you would delete it, do not emit it.

This repo's audience are AI agents (Copilot CLI, Claude Code, Codex)
that **frequently ignore Tier 3 instructions** (see
`skill-tool-boundary.md`). The bar for adding skill prose is therefore
high. The bar for adding tooling enforcement is lower.

### Drop these (always)

- **Style, formatting, brace placement, naming preferences.** Analyzers
  and `EnforceCodeStyleInBuild` cover these for C#; markdownlint covers
  prose nits.
- **"Consider adding a comment."** Without a substantive reason.
- **Restatements of what the code/prose does.**
- **Context inflation.** Skill prose added "just in case" without
  evidence the agent actually needs it. Every token costs money and
  every sentence dilutes the rest.
- **Scenario-specific patches.** A skill addition or analyzer rule that
  only handles the one observed case and would not help with future
  scenarios. Apply the **generalization test**: if you cannot describe
  three other situations where this change would help, it is too
  narrow.
- **Redundant enforcement.** Suggesting skill text for something the
  C# compiler, the WinUI analyzer, the `winapp` CLI, `BuildAndRun.ps1`,
  or the CI provenance jobs already catch. Name the existing
  enforcement instead of duplicating it.
- **Action bias.** Feeling obliged to flag every diff hunk. "No
  finding" is a valid verdict for a clean change.
- **Speculative hypotheticals not grounded in the diff.**

### Keep these

- Bugs, logic errors, races, missed edge cases (in tool C# code or in
  shipped PowerShell scripts).
- Security issues — never suppressed, even at low confidence.
- Skill content that is **measurably bloated** with content that
  duplicates other skills, would have been better as a tool change, or
  is too scenario-specific.
- Trigger-phrasing problems in `description:` frontmatter that would
  cause the wrong agent activation.
- Stale committed payloads (analyzer DLL, `winui-search.exe`,
  `Microsoft.WindowsAppSDK.Analyzers.targets`) that will fail CI
  provenance.
- Manifest / version / agent-file drift that ships broken artifacts to
  end users.
- Missing analyzer xUnit tests for new or changed rules.

## Severity guide

| Severity | Meaning |
|----------|---------|
| critical | Will ship broken behavior to end users (plugin install fails, manifest invalid, analyzer crashes on real code) or block release. Must fix before merge. |
| high | Real bug in tool code, real provenance drift CI will reject, real skill bloat that meaningfully harms agent quality, or missing tests for a new analyzer rule. Should fix before merge. |
| medium | Worth fixing but not a blocker; may be deferred with a note. |
| low | Minor improvement; only emit if the recommendation is concrete and actionable AND the finding survives the Team Lead Test. |

## Confidence guide

- **high**: Full chain visible in the diff (cause + effect both present),
  or the diff itself is the artifact being reviewed (e.g. a `SKILL.md`
  edit speaks for itself).
- **medium**: One half visible; the other half inferred from repo
  context you read.
- **low**: Pattern resembles a known issue but key elements not
  verifiable.

Security findings (in the `tool-correctness` dimension when reviewing
shipped PowerShell or analyzer code) are **never** suppressed by low
confidence — emit them anyway.

## The Solution Hierarchy (cross-cutting)

This repo follows a strict tier order when deciding *where* a behavior
change should land. Cite the tier on every `skill-content` and
`skill-tool-boundary` finding.

| Tier | Type | Reliability | Examples in this repo |
|------|------|-------------|------------------------|
| **0** | Environment / harness defaults | Highest — agent never sees it | `dotnet new` template choice, `BuildAndRun.ps1` defaults, prerequisite checks in `winui-setup` |
| **1** | Tooling enforcement | High — produces errors/warnings the agent must address | `Microsoft.WindowsAppSDK.Analyzers` rules, `winui-search.exe` query results, `winmd.exe` API verification, `winapp` CLI exit codes |
| **2** | Templates / scaffolding | Medium — structural, applied at creation time | `Microsoft.WindowsAppSDK.WinUI.CSharp.Templates`, starter project files |
| **3** | Instructions / skills | Lowest — advisory, frequently ignored | `SKILL.md` content, `winui-dev.agent.md` rules, `references/*.md` |

### Upstream alternatives (when this repo isn't the right place at all)

Two of the most leveraged Tier 0/1/2 surfaces this plugin depends on
live in **other repositories**. When a finding's recommendation lands
naturally on one of them, name the upstream surface explicitly so the
contributor can decide whether to file an issue there instead of
working around it locally:

| Upstream | Lives in | Right for |
|----------|----------|-----------|
| **`winapp` CLI** ([`microsoft/winappcli`](https://github.com/microsoft/winappcli)) | external repo, installed via `winget install Microsoft.WinAppCLI` | New install/run/sign/package/automate behavior; better error messages from `winapp run`, `winapp ui`, `winapp manifest`, `winapp pack`; new subcommands the skill currently scripts around. The skills are co-developed with this CLI in lockstep, so "land it in `winapp`" is often the highest-leverage option. |
| **WinUI 3 .NET templates** (`Microsoft.WindowsAppSDK.WinUI.CSharp.Templates`) | shipped on [NuGet](https://www.nuget.org/packages/Microsoft.WindowsAppSDK.WinUI.CSharp.Templates) by the WinAppSDK team | New "every WinUI 3 app should start with X" defaults — pre-wired dependencies, default `app.manifest` settings, baseline MVVM scaffolding, default analyzer references. Anything the agent re-types into `dotnet new` output every time is a template request. |

**Rule:** When a finding recommends *adding* something to a `SKILL.md`
(Tier 3), the recommendation must explain why a Tier 0-2 alternative is
infeasible — and that includes considering whether the right place is
actually `winappcli` or the WinUI templates upstream. "Just put it in
the skill" is the last resort, not the first suggestion.
