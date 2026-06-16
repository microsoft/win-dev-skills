---
name: uwp-app-runner
description: "Build, deploy, launch, and health-check a legacy **C# UWP** app on a modern dev box so it can be driven by UI Automation (screenshots, parity capture, smoke checks). Handles the environment-specific friction — retargeting to an installed Windows SDK, installing framework dependencies, registering the loose layout via `winapp run` — and reports a **structured pass/fail with crash diagnostics** so callers can degrade gracefully. Use whenever a workflow needs the *original* UWP app actually running (e.g. capturing a golden visual baseline before/after a UWP→WinUI 3 migration). It does **not** build WinUI 3 / WinApp SDK apps — those use `dotnet build`."
---

## What this skill does

Getting a 10-year-old C# UWP SDK sample to *run* on a current OS is deceptively
hard: the project pins a Windows SDK that isn't installed, the build emits framework
dependencies that must be hand-installed before registration, and even after a clean
build the app may crash at startup due to UWP projection/contract incompatibilities
with the newer OS. This skill turns that into one deterministic call that either hands
you a live **PID** or a precise reason why the app can't run — so the caller never
hangs or guesses.

`scripts/Invoke-UwpApp.ps1` runs the whole pipeline and returns a structured result:

| Stage | What it does | Reliability |
|---|---|---|
| resolve | Find the `.csproj` and MSBuild (via `vswhere`). | deterministic |
| sdk | Detect the newest **installed** Windows SDK (UWP metadata) and override the project's pinned `TargetPlatformVersion`. | deterministic |
| build | `msbuild /restore /t:Build Debug\|<plat>` with the SDK override. | deterministic |
| deps | `Add-AppxPackage` the framework deps the build emits (VCLibs.Debug, NET.CoreRuntime). | deterministic |
| launch | `winapp run <layout> --detach` — register loose layout + activate, capture PID. | deterministic |
| verify | Confirm the process stays alive + has a window. On crash, capture the **WER signature** (faulting module + exception code). | **best-effort** |

The first five stages are reliable. The **launch surviving** is not, for legacy
samples — and that's the whole point of the structured result.

## Prerequisites

- Visual Studio with the **Universal Windows Platform development** workload (MSBuild + UWP targets).
- A Windows 10/11 **SDK** installed (any recent version — the script auto-targets the newest).
- **Developer Mode** enabled (registering a loose layout requires it).
- **`winapp`** CLI on PATH (registers + launches the packaged app, prints the PID).

## Usage

```powershell
# Returns JSON: { ok, stage, pid, aumid, hasWindow, layout, sdk, crash, detail }
$r = .\scripts\Invoke-UwpApp.ps1 -Source "<uwp-cs-source-folder>" -Json | ConvertFrom-Json

if ($r.ok) {
    # App is live — drive it by PID.
    winapp ui screenshot ":root" -a $r.pid --output uwp_launch.png
    # ... or hand $r.pid to winui3-parity-check\Capture-AppScenarios.ps1
} else {
    Write-Host "UWP app not runnable ($($r.stage)): $($r.detail)"
    # Degrade: use the source-derived checklist and/or cached golden screenshots.
}
```

Parameters: `-Source <folder>` (auto-finds the `.csproj`) **or** `-Project <csproj>`;
`-Platform` (default `x64`), `-Configuration` (default `Debug` — faster; `Release`
triggers slow .NET Native compilation), `-SettleSeconds` (default 6), `-NoInstallDeps`,
`-Json`. Exit code: **0** = running, **1** = could not run.

## Interpreting the result — and degrading gracefully

The structured result tells the caller exactly how to proceed:

- **`ok = $true`** → use `pid` to capture screenshots / drive the app. If
  `hasWindow = $false` the app is alive but headless (rare) — give it more
  `-SettleSeconds` or proceed cautiously.
- **`stage = build`** → a real build problem (missing workload/SDK, source errors).
  Worth surfacing to the user; the `detail` carries the first MSBuild errors.
- **`stage = launch` with a `crash`** → the app built and registered but crashed at
  startup. Common codes:
  - `0xc000027b` — native XAML stowed exception (legacy projection incompatibility).
  - `0xe0434352` — managed .NET exception (e.g. `TypeLoadException`).
  This is **expected** for legacy UWP samples on newer OS builds and is **not** a
  failure of the migration. The caller should fall back to the source-derived feature
  checklist and any **cached golden screenshots**, and note that a live UWP visual
  reference was unavailable.

> **Never block a workflow on the launch stage.** Treat a live UWP app as a bonus
> (richer visual reference) and source/cached data as the dependable baseline.

## Capturing golden screenshots once, reusing forever

Because launch is the flaky part, the most reliable way to have UWP visuals is to
capture them **once** (on any machine/OS where the app does run) and **cache** them in
a baseline alongside the source-derived checklist. Subsequent migrations reuse the
cached goldens instead of rebuilding/relaunching the original app. `Invoke-UwpApp.ps1`
makes the one-time capture as painless as possible; the caching is the consumer's job
(see the `winui3-parity-check` skill).

## Cleanup

Building writes `bin/`, `obj/`, and `AppPackages/` next to the project, and `winapp run`
registers a dev package. If you built inside a tracked repo that doesn't ignore these,
remove them afterward and `Get-AppxPackage <pkg> | Remove-AppxPackage` to leave a clean
state. (When operating on a scratch copy of the source — e.g. a migration trial's
preserved `.uwp-source` — this doesn't matter.)
