# `BuildAndRun.ps1` — Sunset Plan

`BuildAndRun.ps1` lives inside the `winui-dev-workflow` skill and exists
to work around a single problem: **`dotnet build` cannot reliably build
a WinUI 3 / Windows App SDK project** in the current SDK versions, so
the agent has to shell out to MSBuild via vswhere and stitch in a
temporary `Directory.Build.props`. Once the underlying issue is fixed
upstream, the script has no reason to exist and the skill should drop
it.

This is a forcing-function plan, not a deletion plan. We're not racing
to remove the script — we're making sure we know exactly what fix we're
waiting on, so the moment it lands we can rip the band-aid off cleanly.

## What `BuildAndRun.ps1` does today

1. Verifies Developer Mode is on (packaged WinUI apps refuse to launch
   without it).
2. Detects platform (x64 / ARM64) and configuration (Debug by default).
3. Locates MSBuild via `vswhere -latest -requires
   Microsoft.Component.MSBuild`. Falls back to `dotnet build` only when
   vswhere fails to resolve a VS install.
4. Injects the in-repo `Microsoft.WindowsAppSDK.Analyzers.dll` via a
   temporary `Directory.Build.props` on the project's parent folder so
   the analyzer runs without requiring a `<PackageReference>` change.
5. Runs the build.
6. On success, locates the output folder and invokes
   [`winapp run`](https://github.com/microsoft/winappcli) so the user
   sees a launched app, not just a compiled binary.

Step 3 is the headline reason the script exists. Steps 1, 4, 5, 6 are
incidental conveniences we'd happily keep.

## What we're waiting on upstream

**Tracking issue:** the WinAppSDK XAML compiler currently ships in the
`Microsoft.WindowsAppSDK` NuGet package and assumes an MSBuild host
that exposes the full VS toolset (`xamlc.exe` + supporting targets).
Under `dotnet build` (which uses the .NET SDK's bundled MSBuild) those
targets misbehave — typical failure modes include silent exit code 1
with no `output.json`, missing generated `g.cs` files, or
`MSB3073`-style "command failed" errors with no diagnostic output.

The fix the script is waiting on is **any one** of:

- The WinAppSDK ships a `dotnet build`-clean XAML compiler target
  pack — i.e. `dotnet build MyApp.csproj` succeeds end-to-end on a
  machine with only the .NET SDK installed (no Visual Studio,
  no `vswhere`).
- The .NET SDK bundles enough of the WinAppSDK XAML compiler shim that
  the same scenario works without an extra install.
- WinAppSDK + .NET SDK ship a documented "use this MSBuild invocation
  string" that's stable across SDK upgrades, and the script is
  reduced to a 5-line wrapper around that.

The first two are deletion-grade. The third is reduction-grade.

## Per-skill migration steps once the fix lands

The script is referenced from `winui-dev-workflow/SKILL.md` and from
the agent prompt's "build & run" section. Migration is a single PR:

1. **Verify upstream.** Run `dotnet build` against
   [`samples/`](https://github.com/microsoft/WindowsAppSDK-Samples)
   and a clean scaffold from `winapp scaffold`. Both must succeed
   without `vswhere` on a Windows runner with **only** the .NET SDK +
   WinAppSDK bits installed (no VS).
2. **Update `winui-dev-workflow/SKILL.md`.** Replace the
   `BuildAndRun.ps1`-centric "Build & run" section with the standard
   `dotnet build` + `winapp run` two-liner. Keep the Developer Mode
   pre-flight check as a one-liner the agent runs once per session.
3. **Update the agent prompt** (`winui3.agent.md`) to drop the
   "always use BuildAndRun.ps1" instruction; replace with the same
   two-liner.
4. **Drop the analyzer-injection workaround.** If the analyzer is
   already published as a NuGet package by then
   (`tool-analyzer-nuget` todo), the skill should switch to a
   `<PackageReference>` injection via a `Directory.Build.props` that
   ships in the skill folder — same mechanism, different content. If
   the analyzer is still in-tree, keep the existing props copy.
5. **Delete `BuildAndRun.ps1`** from the skill payload and update
   `scripts/build-tools.ps1` if it references the script.
6. **Update `.github/workflows/pr-validation.yml`** if any job invokes
   `BuildAndRun.ps1` directly (today, none do — the script is
   agent-runtime-only).
7. **Smoke-test** an end-to-end agent run on the
   [`scaffold` →` design` → `build` → `run`] inner loop without the
   script.

## Deletion criterion

Delete `BuildAndRun.ps1` from the `winui-dev-workflow` skill payload
once **all** of the following are true:

- [ ] A clean `dotnet build` of a freshly scaffolded WinUI 3 app on a
      runner with only the .NET SDK + WinAppSDK installed succeeds
      end-to-end (no `vswhere`, no MSBuild host gymnastics) on **both**
      x64 and ARM64.
- [ ] The same dotnet-only build path succeeds on the
      `winui3-base` benchmark agent's full task suite with success
      rate within 5% of the current `BuildAndRun.ps1` baseline.
- [ ] The skill is updated to use `dotnet build` directly and the
      change has soaked on `main` for at least one release cycle
      without regression reports tagged `build-failure`.
- [ ] The analyzer injection is either NuGet-based or the props-only
      injection works under `dotnet build` end-to-end.

Until the first criterion is met, the script stays. Don't gate the
deletion on the NuGet decision (`tool-analyzer-nuget`) — those are
independent.

## Out of scope

- **Replacing `winapp run` with a managed launcher.** `winapp run`
  handles MSIX install + `Application Loop Started` detection in a way
  that's nontrivial to replicate; that's `winappcli`'s problem to
  solve, not this script's.
- **Cross-platform.** WinUI 3 is Windows-only; nothing to migrate.
- **A C# rewrite of the script.** Pointless if the deletion criterion
  is met; the script's whole reason to exist evaporates.
