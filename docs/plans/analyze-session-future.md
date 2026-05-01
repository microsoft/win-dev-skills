# `Analyze-Session.ps1` — Long-Term Home

`Analyze-Session.ps1` lives inside the `winui-session-report` skill and
generates a structured diagnostic report on the current or a recent
Copilot CLI session: which skills loaded, which tools the agent
invoked, build / run outcomes, error fingerprints, and a guidance
block for the user.

It works today as a bundled PowerShell script — same pattern as
`BuildAndRun.ps1` inside `winui-dev-workflow`. But long-term, a
shell script is the wrong shape for a feature this useful: it's
PowerShell-only, it can't be invoked outside an agent context without
copy-pasting the path, and it has no version story independent of the
skill it ships in.

This doc picks the long-term home. Cross-referenced from launch
tracker §12.2 / 12.3 and the `tool-analyze-session-plan` todo.

## What the script does today

1. Resolves the active session folder (or the most recent one) under
   `%USERPROFILE%\.copilot\session-state\<session-id>\`.
2. Walks the session log and produces a structured report:
   - Skills loaded + load order.
   - Tools invoked (winapp, winmd, winui-search, BuildAndRun.ps1, etc.)
     with success / failure counts.
   - Build outcomes (last N builds, error fingerprints).
   - Run outcomes (`Application Loop Started` vs. crash / timeout).
   - Time spent in each phase.
3. Prints a guidance block for the **end user** ("here's what likely
   went wrong, here's what to try next, here's what to attach if you
   file a bug").

It's a single self-contained `.ps1` with no external dependencies.

## Options

### Option 1 — Fold into `microsoft/copilot-cli` as `copilot session report`

**Pros**
- Lives where the session data lives; no path-resolution dance.
- Available to *every* Copilot CLI user, not just users of this skill.
- Versioned with the CLI, so report-format additions follow the CLI's
  release cadence (which is faster than this repo's).
- Cross-platform for free if/when Copilot CLI ships on macOS / Linux
  agents.

**Cons**
- We don't own the `copilot-cli` repo. Requires a sponsor + a design
  proposal landed there before we can deprecate the in-repo script.
- The "guidance block" today is WinUI-specific (knows about WinAppSDK
  build modes, `winapp run`, MSIX install errors). A generic CLI
  command would need a plug-in surface so this repo's skill can
  contribute the WinUI-specific advice.
- Couples our release of new diagnostics to the CLI team's review
  process.

### Option 2 — Publish as a `dotnet tool` on NuGet

**Pros**
- Decouples from this repo entirely. `dotnet tool install -g
  microsoft.copilot-session-report`, run as `copilot-session-report
  --session <id>`.
- We own the release cadence.
- Works for non-Copilot-CLI users (anyone with a `~/.copilot/`
  session folder) — though that's a small audience today.

**Cons**
- Requires a port from PowerShell to C# (or keeping it as a `dotnet
  tool` wrapper around the script, which is awkward).
- Yet another tool the user has to know about and install.
- Still WinUI-specific in its guidance block; we'd need to either own
  a generic version + WinUI plug-in, or accept the narrowness.

### Option 3 — Keep as the bundled `Analyze-Session.ps1` inside the skill

**Pros**
- Zero migration cost. Works today.
- Easy for contributors to extend — it's a single PowerShell file.
- Stays close to the skill that consumes it; updates ship in lockstep
  with skill changes.

**Cons**
- PowerShell-only.
- Versioned implicitly by the skill, which means no explicit version
  story for users who pin a specific report format.
- Doesn't solve the "every Copilot CLI user wants this" use case.

## Recommendation

**Pursue Option 1 (fold into Copilot CLI), keep Option 3 as the
fallback.** The diagnostic-report capability is generally useful to
every Copilot CLI user; landing it as a first-class CLI subcommand is
the highest-leverage outcome. Option 2 is strictly worse than Option
1 unless the CLI team declines.

## Action items

- [ ] **File a design proposal in `microsoft/copilot-cli`** describing
  the `copilot session report` subcommand and the per-language plug-in
  contract for guidance blocks.
- [ ] **Spike the plug-in contract** by extracting this skill's
  guidance block into a small JSON / markdown payload the script reads
  at runtime. Validates the plug-in shape before we propose it
  upstream.
- [ ] **Decision deadline.** If the CLI team hasn't responded within
  one quarter post-public-launch, fall back to Option 3 long-term and
  accept the PowerShell-only constraint.

## Deletion criterion (only relevant if Option 1 lands)

Delete `Analyze-Session.ps1` from the `winui-session-report` skill
payload once:

- [ ] `copilot session report` ships in a stable Copilot CLI release.
- [ ] The plug-in contract supports this skill's WinUI-specific
      guidance block end-to-end (every guidance string the PS1
      currently emits is reachable through the plug-in path).
- [ ] The skill is updated to invoke `copilot session report` instead
      of the bundled script and the change has soaked on `main` for
      at least one release cycle.

## Out of scope

- **Telemetry.** The report is generated locally, never uploaded.
  Whatever home it ends up in, the no-network rule sticks.
- **A web UI.** Plain-text + markdown is the right shape for a tool
  the user pipes into a bug report.
