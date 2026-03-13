# Windows Development Skills

Copilot CLI skills and agents for Windows app development.

> [!IMPORTANT]
> :warning: **Note:** The install script and release bundling are **temporary**. The versions of the tools (WinApp CLI, Raka CLI) and NuGet packages are currently in preview or proof of concepts and are not available in public package registries. For public facing skills, the agents will handle tool installation automatically with tools and packages available in public registries — no script needed, and the plugin will be installable directly from the Copilot CLI.

## What's in this repo

- **`.github/plugin/`** — Copilot CLI plugin with agents and skills for Windows development
  - **winapp** agent — App packaging, code signing, Windows SDK, package identity (Electron, .NET, C++, Rust, Flutter, Tauri)
  - **winui3-builder** agent — WinUI 3 app development with live UI automation via Raka
  - Skills for setup, packaging, signing, manifest authoring, troubleshooting, and more
- **`scripts/install.ps1` / `scripts/install.cmd`** — User installer (temporary, see below)
- **`scripts/build-release.ps1`** — Maintainer script to download artifacts and publish releases

## Quick start

1. Download the latest release from [Releases](https://github.com/microsoft/win-dev-skills/releases)
2. Extract the zip
3. Double-click `install.cmd`
4. When prompted, confirm the installation

The installer will:
- Install **WinApp CLI** and **Raka CLI** as portable executables (everything is in the zip -- no internet or admin required)
- Copy NuGet packages and register them as a NuGet source (so `dotnet restore` just works)
- Install WinUI 3 project templates (if included)
- Install the **Copilot CLI plugin** with Windows development agents and skills

After installation, open a terminal and run:

```
copilot
```

Then ask something like:

```
Build me a WinUI 3 app called TaskFlow
```

## Building a release (maintainers)

The `build-release.ps1` script downloads artifacts from source repositories, bundles them, and publishes to GitHub Releases. This is only needed while the tools are in preview.

### Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated — downloads WinApp CLI artifacts from Actions and publishes releases
- [Azure CLI](https://learn.microsoft.com/cli/azure/) (`az`) installed and logged in — downloads WinUI templates from the internal ADO NuGet feed (use `-SkipTemplates` to skip)
- [.NET SDK](https://dotnet.microsoft.com/download) (`dotnet`) — used for template package restore

### Artifact sources

| Artifact | Source | Auth required |
|---|---|---|
| WinApp CLI (exe + NuGet) | GitHub Actions artifacts from [microsoft/winappCli](https://github.com/microsoft/winappCli) PR | Yes (`gh`) |
| Raka CLI (exe + NuGet) | Latest release from [nmetulev/raka](https://github.com/nmetulev/raka) | No |
| WinUI Templates | ADO internal NuGet feed | Yes (`az`) |

### Usage

```powershell
# Download artifacts and create zip (default - no publish)
.\scripts\build-release.ps1

# Explicit version
.\scripts\build-release.ps1 -Version "0.3.0"

# Build and publish to GitHub Releases
.\scripts\build-release.ps1 -Publish

# Skip templates if you don't have ADO access
.\scripts\build-release.ps1 -SkipTemplates
```

The script will:
1. Verify all prerequisites are met (tools installed, authenticated)
2. Download WinApp CLI portable executables + NuGet from the latest successful build on the PR branch
3. Download Raka CLI portable executables + NuGet from the latest GitHub release
4. Download WinUI templates from the ADO feed
5. Bundle everything with the plugin and install script into a zip
6. Optionally publish to GitHub Releases (with `-Publish`)

## Contributing

This project welcomes contributions and suggestions. Please see [SECURITY.md](SECURITY.md) for security policies.
