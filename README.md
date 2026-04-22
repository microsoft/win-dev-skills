# Windows Development Skills

Copilot CLI skills and agents for Windows app development.

> [!IMPORTANT]
> READ BEFORE USE
> 
> :warning: The install script and release bundling are **temporary**. WinApp CLI is currently in preview. For public facing skills, the agents will handle tool installation automatically — no script needed, and the plugin will be installable directly from the Copilot CLI.
>
> **For best results, install VisualStudio with the WinUI workload** - there is a known issue with the Xaml Compiler when used with `dotnet build` and it does not show Xaml errors. This will be fixed in future updates of the WinAppSDK nugets. In the meantime, the skills can use MSBuild to build the apps so the agents get better errors. The agent will automaticly chose MSBuild for building when available on the device and fall back to dotnet build otherwise.

## What is this

This repo contains agents and skills for windows development, focusing on Winui3. 

The work in this repo is in parallel with [WinAppCLI](https://github.com/microsoft/winappcli) to enable agents to build, run, and see (with UI Automation) without Visual Studio or other heavy dependencies.

## What's in this repo

- **`.github/plugin/`** — Copilot CLI plugin with agents and skills for Windows development
  - **winui3** agent - responsible for building winui3 applications with latest tooling and best practices.
  -6 skills organized as thin rule sets with `references/` for detailed patterns.
- **`scripts/install.ps1` / `scripts/install.cmd`** — User installer (temporary, see below)

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

## Help Us Improve

After trying the skills, activate the `/winui3-session-report` skill. It will automaticaly analyze your session - turns, tokens, build patterns, what worked, what didn’t - and produce a `session-report.md` file. Please attach that report when you [open an issue](https://github.com/microsoft/win-dev-skills/issues).
