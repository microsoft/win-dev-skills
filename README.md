# Agents and skills for Windows app development

Agent plugins for building Windows apps with GitHub Copilot, Claude Code, OpenAI Codex, and more. Add this repo as a marketplace once, then install the plugins you need.

| Plugin | What it's for | Maintained in | Hosts |
|---|---|---|---|
| **`winappcli`** | Packaging, signing, and distributing Windows apps with [WinApp CLI](https://github.com/microsoft/winappCli): MSIX, certificates, package identity, appxmanifest, Windows SDK setup, and the Microsoft Store. Works with Electron, .NET, C++, Rust, Flutter, and Tauri. | [microsoft/winappCli](https://github.com/microsoft/winappCli/tree/main/plugins/winapp) | Copilot, Claude Code, Codex, OpenClaw, OpenCode |
| **`winui`** | Native Windows apps with **WinUI 3** and the **Windows App SDK**: scaffold, design, build, run, test, package, and ship. | [microsoft/winappCli](https://github.com/microsoft/winappCli/tree/main/plugins/winui) | Copilot, Claude Code, Codex, OpenClaw, OpenCode |

On Codex, OpenClaw, and OpenCode, skills load; agents aren't available.

Plugins are either hosted here under `plugins/<name>/` or maintained in another repo and pinned to a release; both are first-class. `winappcli` and `winui` are maintained in [microsoft/winappCli](https://github.com/microsoft/winappCli); file their issues and PRs there.

## Install

You need **Git** (`winget install Git.Git`) and one of the hosts below. Replace `<plugin>` with a name from the table.

> [!NOTE]
> Install each plugin from **one** catalog. microsoft/winappCli's own catalog (`<plugin>@winappcli`) and awesome-copilot ship the same plugins; installing a second copy gives you duplicate skills.

### GitHub Copilot CLI

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install <plugin>@win-dev-skills
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
claude plugin install <plugin>@win-dev-skills
```

### OpenAI Codex

```powershell
codex plugin marketplace add microsoft/win-dev-skills
codex plugin add <plugin>@win-dev-skills
```

Codex loads skills, not agents. Invoke skills by name (e.g. `/winui-setup`).

> [!IMPORTANT]
> **Added this catalog to Codex before as `microsoft-winui`?** It's now named `win-dev-skills`, and `codex plugin marketplace upgrade` fails with "upgraded marketplace name `win-dev-skills` does not match configured marketplace `microsoft-winui`". Your installed plugins keep working but stop updating. Move them over once, removing plugins before the marketplace:
>
> ```powershell
> codex plugin remove <plugin>@microsoft-winui      # for each installed plugin
> codex plugin marketplace remove microsoft-winui
> codex plugin marketplace add microsoft/win-dev-skills
> codex plugin add <plugin>@win-dev-skills          # for each plugin
> ```

### OpenClaw

OpenClaw only reads catalogs whose plugins all live in the same repo, so it can't use this catalog today. Install from the catalog of the repo that maintains the plugin. For `winappcli` and `winui`, that's microsoft/winappCli:

```powershell
openclaw plugins install <plugin> --marketplace microsoft/winappCli
openclaw gateway restart
```

OpenClaw loads skills, not agents. Check them with `openclaw skills list`.

> [!IMPORTANT]
> **Installed `winui` from `--marketplace microsoft/win-dev-skills` before?** That route no longer works, and `openclaw plugins update` fails for it. Reinstall once with the command above.

### OpenCode

OpenCode loads Agent Skills from `<name>/SKILL.md` folders. Clone the repo that maintains the plugin, then link its skills folder (the one containing `<skill>/SKILL.md` directories) into OpenCode's global skills directory, or a project's `.opencode/skills/`:

```powershell
git clone <repo from the "Maintained in" column>
$src = "<path to the plugin's skills folder in that clone>"
$dst = "$env:USERPROFILE\.config\opencode\skills"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem $src -Directory | ForEach-Object {
  $link = Join-Path $dst $_.Name
  if (-not (Test-Path $link)) { New-Item -ItemType Junction -Path $link -Target $_.FullName | Out-Null }
}
```

The links are junctions, so `git pull` in the clone picks up skill updates. OpenCode loads skills, not agents.

### Next steps

Start a new session and ask for a real task, for example:

> "Build me a WinUI 3 markdown editor with live preview and a custom title bar"

## Updates

When a catalog entry moves to a new version, update with your host's usual commands:

```powershell
copilot plugin marketplace update win-dev-skills; copilot plugin update <plugin>@win-dev-skills
claude plugin marketplace update win-dev-skills; claude plugin update <plugin>@win-dev-skills
codex plugin marketplace upgrade win-dev-skills
```

Tags up to `v0.7.1` of this repo contain the `winui` plugin itself, so `https://github.com/microsoft/win-dev-skills.git#v0.7.1` still installs that version.
## Contributing

New plugins and skills for Windows app development are welcome, either as a plugin in this repo under `plugins/<name>/` or as a pinned entry for a plugin maintained in another repo. See [`CONTRIBUTING.md`](CONTRIBUTING.md). For catalog or install problems, [open an issue here](https://github.com/microsoft/win-dev-skills/issues).

Most contributions require you to agree to a Contributor License Agreement (CLA); see [opensource.microsoft.com/cla](https://opensource.microsoft.com/cla) for details. This project has adopted the [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). For support channels see [SUPPORT.md](SUPPORT.md), and for responsible disclosure of security issues see [SECURITY.md](SECURITY.md).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third parties' policies.

## License

This project is licensed under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
