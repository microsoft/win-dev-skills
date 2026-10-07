# Agents and skills for Windows app development

A catalog of agent plugins for building Windows apps with GitHub Copilot, Claude Code, and OpenAI Codex. Add this repo as a marketplace once, then install the plugins you need.

| Plugin | What it does | Source |
|---|---|---|
| **`winui`** | Build native Windows apps with **WinUI 3** and the **Windows App SDK**: scaffold, design, build, run, test, package, ship. | [`microsoft/winappCli`](https://github.com/microsoft/winappCli/tree/main/plugins/winui) |

> [!NOTE]
> **WinUI content is authored in [microsoft/winappCli](https://github.com/microsoft/winappCli); file WinUI issues and PRs there.** This repo only holds the catalog. Each entry pins an exact commit of the plugin's source repository.

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/b7d25afc-ba15-4d8a-8dcf-2dd78000f3aa" />

> [!WARNING]
> **🚧 Preview · v0.x — expect breaking changes.** Skill names, on-disk layout, agent configuration, and CLI tool surfaces can change without notice until v1.0. Outputs are suggestions, not authoritative answers — review them before committing or shipping anything they produce.

## Install

You need **GitHub Copilot** (`winget install GitHub.Copilot`), **Claude Code**, or **OpenAI Codex**, plus **Git** (`winget install Git.Git`).

### Option A — Just ask Copilot to do it

Paste this prompt into a Copilot CLI session. It installs the `winui` plugin **and** sets up every prerequisite in one shot:

```
Install the Copilot CLI plugin "winui" from microsoft/win-dev-skills, then set up my machine for WinUI 3 development. Specifically:

1. Run: copilot plugin marketplace add microsoft/win-dev-skills
2. Run: copilot plugin install winui@win-dev-skills
3. Make sure these prerequisites are present (check first and change only what is missing or too old):
   - .NET SDK >= 8.0.100 (run `dotnet --list-sdks`; if none qualifies, `winget install --id Microsoft.DotNet.SDK.10 --exact --silent --accept-package-agreements --accept-source-agreements`)
   - WinApp CLI: must be >= 0.7.0 (parse the standalone version line from `winapp --version`); if missing, `winget install --id Microsoft.WinAppCli`; if older, `winget upgrade --id Microsoft.WinAppCli`.
   - Do not install WinUI templates separately — WinApp CLI installs and updates them on demand through `winapp new`.
   - Developer Mode (DWORD HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense == 1) — ASK ME first before triggering UAC; if I decline, just print the elevated command for me to run later.
   - Report whether Windows Sandbox is available for UI testing. If it isn't and I want it, tell me how to enable it myself (Pro, Enterprise, or Education, not Home); don't change Windows features or reboot. Report native C++ toolchain requirements separately if I request AOT.
4. Print a short summary of what was installed vs already present, then tell me to start a new Copilot CLI, activate the "winui-dev" agent, and to ask it to build an app.
```

### Option B — Install the plugin yourself, then ask the agent to set up the rest

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install winui@win-dev-skills
```

The plugin is also listed on **awesome-copilot** (`copilot plugin install winui@awesome-copilot`). Install it from one catalog, not both.
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```powershell
claude plugin marketplace add microsoft/win-dev-skills
claude plugin install winui@win-dev-skills
```

`microsoft/winappCli` also publishes the same plugin as `winui@winappcli`. Use `winui@win-dev-skills`, and don't install both.
</details>

<details>
<summary><strong>OpenAI Codex</strong></summary>

```powershell
codex plugin marketplace add microsoft/win-dev-skills
codex plugin add winui@microsoft-winui
```

> **Note:** Codex doesn't have an "agents" concept, so the orchestrator agent isn't exposed there. The skills still work - invoke them by name (e.g. `/winui-setup`, `/winui-design`) and Codex will load them on demand.
</details>

<details>
<summary><strong>OpenClaw</strong></summary>

OpenClaw installs the plugin from the `microsoft/winappCli` catalog:

```powershell
openclaw plugins install winui --marketplace microsoft/winappCli
openclaw gateway restart
```

Or from a local clone:

```powershell
git clone https://github.com/microsoft/winappCli
openclaw plugins install ./winappCli/plugins/winui
```

Verify the eight skills loaded with `openclaw skills list` (each shows `✓ ready`).

> [!IMPORTANT]
> **Installed `winui` from `--marketplace microsoft/win-dev-skills` before?** That route no longer works, and `openclaw plugins update` fails for it. Reinstall once from `microsoft/winappCli` with the command above.

> **Note:** OpenClaw maps skills, not agents, so the `winui-dev` orchestrator agent isn't exposed there. The skills still work - ask the agent for a WinUI task and it loads the relevant skill on demand.
</details>

<details>
<summary><strong>OpenCode</strong></summary>

OpenCode loads Agent Skills natively from `<name>/SKILL.md` folders. Clone `microsoft/winappCli` and link its WinUI skills into OpenCode's global skills directory (or a project's `.opencode/skills/`):

```powershell
git clone https://github.com/microsoft/winappCli
$src = "$PWD\winappCli\plugins\winui\agent-plugin\skills"
$dst = "$env:USERPROFILE\.config\opencode\skills"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem $src -Directory | ForEach-Object {
  $link = Join-Path $dst $_.Name
  if (-not (Test-Path $link)) {
    New-Item -ItemType Junction -Path $link -Target $_.FullName | Out-Null
  }
}
```

Because these are junctions (not copies), `git pull` in the clone picks up skill updates.

> **Note:** OpenCode maps skills, not agents, so the `winui-dev` orchestrator agent isn't exposed there. The skills still work - invoke them by name (e.g. `/winui-setup`, `/winui-design`) and OpenCode loads them on demand.
</details>

Then start a new session and run the `winui-setup` skill with `/winui-setup`.

Once setup is done, try a real task:

> "Build me a WinUI 3 markdown editor with live preview and a custom title bar"

### What `winui-setup` installs

| Tool | Minimum | Recommended | Install command |
|---|---|---|---|
| Git | 2.54 | 2.54+ | `winget install Git.Git` |
| .NET SDK | 8.0.100 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| WinApp CLI | 0.7.0 (released) | latest | `winget install Microsoft.WinAppCli` |
| Developer Mode | enabled | enabled | DWORD `AllowDevelopmentWithoutDevLicense` set to `1` |

Visual Studio is **not required for normal JIT builds**. Native AOT additionally requires the Desktop development with C++ workload (Visual Studio or Build Tools). UI testing prefers Windows Sandbox (Windows 11 24H2+, Pro/Enterprise/Education) when it's available.

## The `winui` plugin

The **`winui-dev`** agent handles WinUI 3 / Windows App SDK / XAML / C# work — new apps, new features, converting from WPF/Electron/web, and bug fixes. It pulls in these skills as needed:

| Skill | What it does |
|---|---|
| **`winui-dev-workflow`** | Build and run workflow — `winapp new`, `winapp run`, analyzer NuGet integration, opt-in Native AOT, crash diagnosis. |
| **`winui-design`** | Layout, control selection, Fluent Design, theming, accessibility, data binding, and grounded sample/API lookup. |
| **`winui-code-review`** | Pre-commit review — MVVM, `x:Bind`, accessibility, theming, security, performance. |
| **`winui-ui-testing`** | Batch UI testing, preferring Windows Sandbox when available. |
| **`winui-packaging`** | MSIX packaging, signing, self-contained deployment, CI/CD, and Store hand-off. |
| **`winui-wpf-migration`** | WPF → WinUI 3 migration. |
| **`winui-session-report`** | Diagnostic report on a Copilot session, only on explicit request. The report can include prompts, paths, and command output: review it before sharing. |
| **`winui-setup`** | Installs and verifies the prerequisites above; asks before anything needing admin rights. |

## Updates and pinning

Each catalog entry pins an exact commit of the plugin's source repository, so `winui@win-dev-skills` installs a known version. When the catalog moves to a new version, update with your host's usual commands:

```powershell
copilot plugin marketplace update win-dev-skills; copilot plugin update winui@win-dev-skills
claude plugin marketplace update win-dev-skills; claude plugin update winui@win-dev-skills
codex plugin marketplace upgrade microsoft-winui
```

Tags up to `v0.7.1` of this repo contain the `winui` plugin itself, so `https://github.com/microsoft/win-dev-skills.git#v0.7.1` still installs that version.

## Feedback

Run the `winui-session-report` skill after trying the WinUI skills and attach the `session-report.md` to an issue in [microsoft/winappCli](https://github.com/microsoft/winappCli/issues). Catalog or install problems belong [here](https://github.com/microsoft/win-dev-skills/issues).

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA); see [opensource.microsoft.com/cla](https://opensource.microsoft.com/cla) for details. This project has adopted the [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). For support channels see [SUPPORT.md](SUPPORT.md), and for responsible disclosure of security issues see [SECURITY.md](SECURITY.md).

Changes to WinUI skills, the agent, or plugin manifests go to [microsoft/winappCli](https://github.com/microsoft/winappCli). Catalog changes go here; see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`RELEASING.md`](RELEASING.md).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third parties' policies.

## License

This project is licensed under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
