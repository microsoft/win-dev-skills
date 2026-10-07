# Agents and skills for Windows app development

A catalog of agent plugins for building Windows apps with GitHub Copilot, Claude Code, and OpenAI Codex. Add the catalog once, then install the plugins you need.

| Plugin | What it's for | Maintained in | Copilot | Claude Code | Codex |
|---|---|---|---|---|---|
| **`winappcli`** | Packaging, signing, and distributing Windows apps with [WinApp CLI](https://github.com/microsoft/winappCli): MSIX, certificates, package identity, appxmanifest, Windows SDK setup, and the Microsoft Store. Works with Electron, .NET, C++, Rust, Flutter, and Tauri. | [microsoft/winappCli](https://github.com/microsoft/winappCli/tree/main/plugins/winapp) | `copilot plugin install winappcli@win-dev-skills` | `claude plugin install winappcli@win-dev-skills` | `codex plugin add winappcli@microsoft-winui` |
| **`winui`** | Native Windows apps with **WinUI 3** and the **Windows App SDK**: scaffold, design, build, run, test, package, and ship. | [microsoft/winappCli](https://github.com/microsoft/winappCli/tree/main/plugins/winui) | `copilot plugin install winui@win-dev-skills` | `claude plugin install winui@win-dev-skills` | `codex plugin add winui@microsoft-winui` |

Each entry pins an exact commit of the plugin's source repo. **File issues and PRs for a plugin's skills or agents in the repo that maintains it.** This repo only holds the catalog.

> [!WARNING]
> **🚧 Preview · v0.x — expect breaking changes.** Plugin and skill names, layout, and agent configuration can change without notice until v1.0. Outputs are suggestions, not authoritative answers — review them before committing or shipping anything they produce.

## Install

You need **Git** (`winget install Git.Git`) and one of the hosts below.

> [!NOTE]
> Install each plugin from **one** catalog. microsoft/winappCli's own catalog (`winappcli@winappcli`, `winui@winappcli`) and awesome-copilot ship the same plugins; installing a second copy gives you duplicate skills.

### GitHub Copilot CLI

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install winappcli@win-dev-skills
copilot plugin install winui@win-dev-skills
```

<details>
<summary>Or let Copilot install <code>winui</code> and its prerequisites</summary>

Paste this prompt into a Copilot CLI session:

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
</details>

### Claude Code

```powershell
claude plugin marketplace add microsoft/win-dev-skills
claude plugin install winappcli@win-dev-skills
claude plugin install winui@win-dev-skills
```

### OpenAI Codex

```powershell
codex plugin marketplace add microsoft/win-dev-skills
codex plugin add winappcli@microsoft-winui
codex plugin add winui@microsoft-winui
```

Codex loads skills, not agents. Invoke skills by name (e.g. `/winui-setup`, `/winapp-setup`).

### OpenClaw

OpenClaw installs `winui` from the microsoft/winappCli catalog:

```powershell
openclaw plugins install winui --marketplace microsoft/winappCli
openclaw gateway restart
```

Or from a clone: `git clone https://github.com/microsoft/winappCli` and `openclaw plugins install ./winappCli/plugins/winui`.

> [!IMPORTANT]
> **Installed `winui` from `--marketplace microsoft/win-dev-skills` before?** That route no longer works, and `openclaw plugins update` fails for it. Reinstall once with the command above.

OpenClaw loads skills, not agents.

### OpenCode

OpenCode loads Agent Skills from `<name>/SKILL.md` folders. Clone microsoft/winappCli and link the skills into OpenCode's global skills directory (or a project's `.opencode/skills/`):

```powershell
git clone https://github.com/microsoft/winappCli
$dst = "$env:USERPROFILE\.config\opencode\skills"
New-Item -ItemType Directory -Force $dst | Out-Null
foreach ($src in "$PWD\winappCli\plugins\winapp\skills", "$PWD\winappCli\plugins\winui\agent-plugin\skills") {
  Get-ChildItem $src -Directory | ForEach-Object {
    $link = Join-Path $dst $_.Name
    if (-not (Test-Path $link)) { New-Item -ItemType Junction -Path $link -Target $_.FullName | Out-Null }
  }
}
```

The links are junctions, so `git pull` in the clone picks up skill updates. OpenCode loads skills, not agents.

### Next steps

Start a new session. For WinUI 3, run `/winui-setup` to check your machine. To package an existing app, ask about it or run `/winapp-setup` in the project. Then try a real task:

> "Build me a WinUI 3 markdown editor with live preview and a custom title bar"

## Updates

When a catalog entry moves to a new version, update with your host's usual commands:

```powershell
copilot plugin marketplace update win-dev-skills; copilot plugin update winui@win-dev-skills
claude plugin marketplace update win-dev-skills; claude plugin update winui@win-dev-skills
codex plugin marketplace upgrade microsoft-winui
```

Tags up to `v0.7.1` of this repo contain the `winui` plugin itself, so `https://github.com/microsoft/win-dev-skills.git#v0.7.1` still installs that version.

## Contributing

New plugins and skills for Windows app development are welcome — as a plugin in this repo or a catalog entry pointing to another repo. See [`CONTRIBUTING.md`](CONTRIBUTING.md). For catalog or install problems, [open an issue here](https://github.com/microsoft/win-dev-skills/issues).

Most contributions require you to agree to a Contributor License Agreement (CLA); see [opensource.microsoft.com/cla](https://opensource.microsoft.com/cla) for details. This project has adopted the [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). For support channels see [SUPPORT.md](SUPPORT.md), and for responsible disclosure of security issues see [SECURITY.md](SECURITY.md).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third parties' policies.

## License

This project is licensed under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
