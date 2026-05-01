# Windows Development Skills

Copilot CLI skills and agents for Windows app development.

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

## Help Us Improve

After trying the skills, activate the `/winui-session-report` skill. It will automatically analyze your session — turns, tokens, build patterns, what worked, what didn't — and produce a `session-report.md` file. Please attach that report when you [open an issue](https://github.com/microsoft/win-dev-skills/issues).
