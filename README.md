# Windows Development Skills

Copilot CLI skills and agents for Windows app development.

> [!WARNING]
> **Preview · v0.x — expect breaking changes.** Skill names, on-disk layout, agent configuration, analyzer rule IDs, and CLI tool surfaces are all subject to change without notice. There is no SemVer commitment until v1.0. Do not depend on any of these interfaces from automation you can't easily update. Outputs are suggestions, not authoritative answers — review them before committing or shipping anything they produce.

> [!IMPORTANT]
> **For best results, install Visual Studio with the WinUI workload** — there is a known issue with the XAML compiler when used with `dotnet build` where XAML errors are not shown. This will be fixed in future updates of the WinAppSDK NuGet packages. In the meantime, the skills can use MSBuild to build the apps so the agents get better errors. The agent will automatically choose MSBuild when it is available on the device and fall back to `dotnet build` otherwise.

## What is this

This repo contains agents and skills for Windows development, focusing on WinUI 3.

The work in this repo is in parallel with [WinAppCLI](https://github.com/microsoft/winappcli) to enable agents to build, run, and see (with UI Automation) without Visual Studio or other heavy dependencies.

## What's in this repo

- **`.github/plugin/`** — Copilot CLI plugin with agents and skills for Windows development
  - **winui3** agent — responsible for building WinUI 3 applications with the latest tooling and best practices.
  - 7 skills covering design, dev workflow, code review, UI testing, packaging, WPF migration, and session reporting.
- **`scripts/install.ps1` / `scripts/install.cmd`** — User installer (temporary, see below)

## Prerequisites

| Tool | Minimum | Recommended | Install |
|------|---------|-------------|---------|
| .NET SDK | 8.0 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| WinApp CLI | 0.3 | latest | `winget install Microsoft.WinAppCLI` |
| WinUI templates | — | latest | `dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` |

Developer Mode must be enabled in Windows (Settings → System → Advanced → Developer Mode).

## Quick start

1. Download the latest release from [Releases](https://github.com/microsoft/win-dev-skills/releases)
2. Extract the zip
3. Double-click `install.cmd`
4. When prompted, confirm the installation

The installer will:
- Install **WinApp CLI** as a portable executable
- Install **WinUI 3 project templates** (requires .NET SDK)
- Install the **Copilot CLI plugin** with Windows development agents and skills

After installation, open a terminal and run:

```
copilot --agent win-dev-skills:winui3
```

Then ask something like:

```
Build me a WinUI 3 app called TaskFlow
```

## Network access

Most skills run fully offline once installed. Two helpers in `winui-search` reach out to GitHub on demand to keep their data fresh:

- `GalleryFetcher` queries [`microsoft/WinUI-Gallery`](https://github.com/microsoft/WinUI-Gallery) for control scenarios.
- `ToolkitFetcher` queries [`CommunityToolkit/Windows`](https://github.com/CommunityToolkit/Windows) for toolkit samples.

Both repos are owned by the WinUI / Windows Community Toolkit teams. Requests use anonymous, unauthenticated GitHub REST calls; no telemetry, no user data, and no credentials leave your machine. If you operate in an air-gapped environment, the embedded `Data\*.json` snapshots are used as a fallback.

## Bundled tools and binaries — what's running on your machine

Several skills ship helper binaries and PowerShell scripts that run under your user account. **None of them are code-signed today.** They live in this repo so you can read the source, build them yourself, and verify what they do — that's an explicit launch-preview trade-off, not a long-term distribution model. The table below lists every artifact, why it ships from this repo, and what the long-term plan is.

| Artifact | Where it lives | Why it ships from this repo today | Long-term plan |
|---|---|---|---|
| `BuildAndRun.ps1` | `winui-dev-workflow` skill | Picks MSBuild over `dotnet build` to work around the XAML-compiler error-reporting issue called out in the IMPORTANT block above. | Removed once the next WinAppSDK release fixes the XAML compiler under `dotnet build` — the skills will switch to `dotnet build` / `dotnet run` directly. |
| `Analyze-Session.ps1` | `winui-session-report` skill | Reads your local Copilot session events and produces `session-report.md`. There's no first-party CLI subcommand for this yet. | Fold into the `copilot` CLI as a session-report subcommand or publish as a `dotnet tool` on NuGet. |
| `WinUI3.Analyzer.dll` | `winui-dev-workflow` skill (prebuilt) — source under `src/tools/winui3-analyzer/` | A Roslyn analyzer that flags common WinUI 3 pitfalls at build time. Committed alongside the skill so the skill is self-contained, and verified against source on every PR by the `analyzer-provenance` CI job. | Publish as `WinUI3.Analyzer` on NuGet (the csproj is already wired for it). Skill stops shipping the prebuilt DLL — projects pick it up via `<PackageReference>`. |
| `winmd.exe` (winmd-cli) | source under `src/tools/winmd-cli/` (built artifact distributed via the consuming skill) | Native-AOT WinRT/.NET metadata indexer used by skills to resolve and validate APIs offline. No upstream tool exposes the same surface. | Publish as a `dotnet tool` on NuGet, or fold the relevant subcommands into [`winappcli`](https://github.com/microsoft/winappcli). |
| `winui-search.exe` (winui-search) | source under `src/tools/winui-search/` (built artifact distributed via the consuming skill) | Native-AOT search over WinUI Gallery + Community Toolkit scenarios. Pairs with the network access described above. | Same as `winmd-cli` — published `dotnet tool` or folded into `winappcli`. |

If any of this is a deal-breaker for your environment, please [open an issue](https://github.com/microsoft/win-dev-skills/issues) — that feedback is what determines how quickly each item moves out of "preview, ships from repo" into "signed package on a registry."

## Help Us Improve

After trying the skills, activate the `/winui-session-report` skill. It will automatically analyze your session — turns, tokens, build patterns, what worked, what didn't — and produce a `session-report.md` file. Please attach that report when you [open an issue](https://github.com/microsoft/win-dev-skills/issues).
