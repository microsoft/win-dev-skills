# UWP skill-value pilot

Headless, Python-standard-library benchmark tooling, **outside the shipped plugin**.
The first admitted scenario is the complete C# `XamlDeferLoadStrategy` sample:
three pages, shared shell, linked source and assets. It was chosen for deterministic
load/unload/navigation behavior without hardware or picker dependencies, not from
observed arm outcomes. This is a plumbing/development pilot, not evidence of a
general skill advantage.

## Frozen inputs

| Input | Pin |
|---|---|
| Migration candidate | `microsoft/win-dev-skills@196d076e92d7161031dba5eef50f4e23e04a4d8e` |
| Original sample | `microsoft/Windows-universal-samples@4eb2fcb499c5bc549e918920cfd2b64396a650d9` |
| Copilot / WinApp | `1.0.83` / `0.6.1` |
| .NET SDK | `10.0.401`, `rollForward: disable` |
| Initial model | `gpt-5.4`, medium effort, default context |

Every arm gets the same supplied, previously built empty official-template
scaffold, common WinUI agent and eight non-UWP skills. The common agent's
unconditional UWP routing is removed equally. B has no migration package;
T has the unchanged tools/inventory and neutral operational adapter; L adds the
unchanged on-demand reference catalog and compact routing; F has the unmodified
candidate migration skill. The materializer records exact bytes, transformations,
source Git blob identities and treatment differences. No current checkout or
user configuration is used as a candidate input.

The template must be materialized **once before measurement**. Its postactions
may resolve moving package versions even when version arguments were provided.
Inspect actual project XML and resolved assets; do not regenerate per arm.
The supplied pilot scaffold pins Windows App SDK `1.8.260209005`, SDK BuildTools
`10.0.26100.7705`, BuildTools.WinApp `0.6.1`, and CommunityToolkit.Mvvm `8.4.2`.
The source files are copied without `bin`, `obj`, signing keys or user config.
One root `.csproj` is discovered and retained without renaming.

## Safety and isolation boundary

This implementation requires explicit **supervised-local** acknowledgment.
Fresh workspaces, `COPILOT_HOME`, tool permissions and prompts are **not an OS
sandbox**. The pilot machine's restricted MXC policy was unsupported; no feature
was enabled, elevated workaround attempted, account created or machine rebooted.
OS authentication, machine policy, package caches and desktop remain shared.
Do not run this unattended on a machine with sensitive reachable files.

Only the current sample, target and current treatment enter the agent workspace.
Other treatments, evaluator, goldens and result files stay outside repository
context. The agent is told not to read outside that workspace, deploy applications,
interact with the desktop, mutate GitHub, upload telemetry, install tools or change
pinned dependencies. Remote export and built-in MCPs are disabled. Authentication
is inherited, never copied from the user's Copilot home or printed.

Each attempt has a unique package identity, with the intentional name-only change
and before/after hashes retained. Windows agent/build subprocesses are created
suspended, assigned to a private kill-on-close Job Object, then resumed; timeout
never kills by image name. Registration cleanup is not a wildcard operation:
retain trial artifacts and registrations unless a coordinator explicitly removes
that exact owned package.

## Commands

Run from this repository worktree in PowerShell with Python 3.12 or newer.
No package installation is required. Keep `$root` outside every Git checkout
and reasonably short. It must be empty for preparation.

```powershell
$runner = '.\benchmarks\uwp-skill-value\runner.py'
$root = Join-Path $env:TEMP 'uwpsv-pilot-20260924'
$scaffold = 'C:\path\to\pinned-empty-scaffold'

python $runner prepare --root $root --scaffold $scaffold
python $runner preflight --root $root

# No model call, app launch, registration or global configuration change:
python $runner plan --root $root --model gpt-5.4 --effort medium `
    --context default --credits 600 --seconds 1800 --repeats 1 --seed 20260924

(Get-Content (Join-Path $root 'experiment.json') -Raw | ConvertFrom-Json).schedule

# Use the FIRST saved schedule ID, then subsequent IDs in that exact order.
python $runner run --root $root --attempt <saved-id> --supervised-local

# Only after the coordinator reserves this desktop; never overlap UI runs.
python $runner evaluate --root $root --attempt <saved-id> --desktop-reserved

# Replay from evidence; no model call, repair, or app launch.
python $runner report --root $root
```

`prepare --preflight-record <json>` optionally retains an explicit coordinator
record, including machine limitations, successful scaffold probes and prospective
budget calibration. Initial pilot cap: 600 AI credits (soft), 1,800 seconds
(hard), four attempts. Before any measured run, the proposed 120-credit cap was
increased after a real two-request no-op used 4.8832 credits. This does not
authorize a 48-trial sweep. Expansions require a newly recorded schedule/budget;
do not rerun only failed arms.

Preparation fetches public immutable inputs. `plan` is the offline dry-run and
freezes input, harness and oracle hashes. A changed input or harness refuses
subsequent execution; create a new experiment instead of rewriting evidence.
The exact executable harness is retained under `harness-snapshot`; CLI 1.0.83
selects the custom agent by its namespaced identifier `winui:winui-dev`.
`preflight` only checks native tool versions; model availability is not inferred
from `--version`. A real request records the requested and observed model.

## Evidence and interpretation

`experiment.json` contains the complete randomized schedule and common/arm
prompts. `prepared.json` and `materialization.json` identify inputs. Each
`e\<attempt-id>` retains start/finish records, process exit/timeout/timing,
raw JSONL stdout, stderr, exported session, run-owned CLI logs and usage,
identity changes, frozen output and independent evaluation.
Fresh CLI state is only under `h\<attempt-id>`; no whole-user home scan occurs.
`attempts.jsonl` is an append-only phase journal. Final attempt/evaluation files
are create-exclusive. An interrupted attempt remains visible rather than
being silently replaced.

Evaluation builds a separate copy of the frozen deliverable with fixed
Release/x64 configuration. It uses project-mode WinApp launch and PID-scoped
UI evidence, not the candidate validator or the agent's final claim.
Assertions remain in the result even when an earlier failure prevents them
from running. Source-derived expectations are explicitly distinguished from
original-UWP runtime calibration. Mock goldens/mutants exercise failure
semantics; they do not substitute for real UI calibration.

Reports include **every scheduled row**, including not-run, failed, timed-out,
blocked and missing-evidence attempts. Missing credits are `null`, never zero.
Top-level provider `totalNanoAiu / 1e9` is the credit aggregate; component
model/agent metrics are retained but not added to it again. Model input tokens
already include cache reads: they must not be added to `tokenDetails.input`.
Failed-attempt spend stays in total cost and cost-per-success. No success means
cost-per-success is undefined. A tiny one-family pilot is **inconclusive** for
keep/shrink/remove decisions regardless of the observed winner.

## Regression checks

```powershell
python -m unittest discover -s .\benchmarks\uwp-skill-value\tests -v
```

These cover frozen treatment separation, common-file equality, native exit and
owned timeout cleanup, offline immutable scheduling, usage accounting, missing
evidence, scheduled denominators and evaluator golden/mutant behavior. They make
no model calls or real app launches.

Historical inspiration: PR #43's same-agent comparisons and the old benchmark's
per-attempt evidence interfaces, not its globally installed skills, name-based
cleanup, static pricing or completed-only denominator. Prior Markdown Editor
scores are not UWP migration evidence. This benchmark does not modify migration
PR #134 or the documentation guide in PR #186.
