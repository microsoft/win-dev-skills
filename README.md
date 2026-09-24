# WinUI agents and skills for Windows app development

An [Agent Plugins 1.0](https://agent-plugins.org/specification) package with GitHub Copilot, Claude Code, and OpenAI Codex compatibility for building native Windows apps with **WinUI 3** and the **Windows App SDK**. It covers the end-to-end inner loop: scaffold → design → build → run → test → package → ship.

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/b7d25afc-ba15-4d8a-8dcf-2dd78000f3aa" />


> [!WARNING]
> **🚧 Preview · v0.x — expect breaking changes.** Skill names, on-disk layout, agent configuration, analyzer rule IDs, and CLI tool surfaces are all subject to change without notice. There is no SemVer commitment until v1.0. If you need a stable pin, install from a release tag instead of the rolling marketplace (see [Pinning to a release](#pinning-to-a-release)). Outputs are suggestions, not authoritative answers — review them before committing or shipping anything they produce.

> [!IMPORTANT]
> **WinApp CLI 0.7 migration release gate:** this development version requires
> WinApp CLI 0.7+. Do not promote it to the marketplace until the released CLI's
> fresh-project, packaging, AOT, and Windows Sandbox workflows are exercised.
> Recommend the latest `Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`; if
> unavailable, continue with a notice that analyzer checks were not run.
> Older CLI prereleases do not necessarily contain these commands.

## Install

The plugin requires **GitHub Copilot** (`winget install GitHub.Copilot`), **Claude Code**, or **OpenAI Codex** installed. 

**Git** (`winget install Git.Git`) is required for installing pluggins.

### Option A — Just ask Copilot to do it

Paste this prompt into a Copilot CLI session. It installs the plugin **and** sets up every prerequisite in one shot:

```
Install the Copilot CLI plugin "winui" from microsoft/win-dev-skills, then set up my machine for WinUI 3 development. Specifically:

1. Run: copilot plugin marketplace add microsoft/win-dev-skills
2. Run: copilot plugin install winui@win-dev-skills
3. Make sure these prerequisites are present (check first and change only what is missing or too old):
   - .NET SDK >= 8.0.100 (run `dotnet --list-sdks`; if none qualifies, `winget install --id Microsoft.DotNet.SDK.10 --exact --silent --accept-package-agreements --accept-source-agreements`)
   - WinApp CLI: must be released >= 0.7.0 (parse the standalone version line from `winapp --version`); if missing, `winget install --id Microsoft.WinAppCli`; if older, `winget upgrade --id Microsoft.WinAppCli`. If that release is not available, report setup blocked rather than using old commands.
   - Do not install WinUI templates separately — WinApp CLI installs and updates them on demand through `winapp new`.
   - Developer Mode (DWORD HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense == 1) — ASK ME first before triggering UAC; if I decline, just print the elevated command for me to run later.
   - Prefer Windows Sandbox when available; otherwise explain and run locally. If I explicitly request Windows Sandbox, don't fall back: ask me to enable it myself (Pro, Enterprise, or Education, not Home) and restart if needed. Do not enable the feature or reboot for me. Report native C++ toolchain requirements separately if I request AOT.
4. Print a short summary of what was installed vs already present, then tell me to start a new Copilot CLI, activate the "winui-dev" agent, and to ask it to build an app.
```

### Option B — Install the plugin yourself, then ask the agent to set up the rest

If you'd rather run the plugin commands by hand:

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

The plugin is listed on **awesome-copilot** and can be installed directly:

```powershell
copilot plugin install winui@awesome-copilot
```

Or add this repo as a marketplace and install from there:

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install winui@win-dev-skills
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```powershell
claude plugin marketplace add microsoft/win-dev-skills
claude plugin install winui@win-dev-skills
```
</details>

<details>
<summary><strong>OpenAI Codex</strong></summary>

Add the `microsoft/win-dev-skills` marketplace, then enable the `winui` plugin from the plugin directory.

> **Note:** Codex doesn't have an "agents" concept, so the orchestrator agent isn't exposed there. The skills still work - invoke them by name (e.g. `/winui-setup`, `/winui-design`) and Codex will load them on demand.
</details>

<details>
<summary><strong>OpenClaw</strong></summary>

Install straight from this repo - no marketplace pre-registration needed. The explicit `--marketplace` source clones the repo on demand, reads its marketplace manifest, and installs the `winui` plugin natively (`Format: openclaw`):

```powershell
openclaw plugins install winui --marketplace microsoft/win-dev-skills
openclaw gateway restart
```

Or from a local clone:

```powershell
git clone https://github.com/microsoft/win-dev-skills
openclaw plugins install ./win-dev-skills/plugins/winui
```

Verify the eight skills loaded with `openclaw skills list` (each shows `✓ ready`).

> **Note:** OpenClaw maps skills, not agents, so the `winui-dev` orchestrator agent isn't exposed there. The skills still work - ask the agent for a WinUI task and it loads the relevant skill on demand.
</details>

<details>
<summary><strong>OpenCode</strong></summary>

OpenCode loads Agent Skills natively from `<name>/SKILL.md` folders. Point it at the
shared skills - no fork or copy needed. Link each skill into OpenCode's global skills
directory (or a project's `.opencode/skills/`):

```powershell
# One-time setup: link the shared skills into OpenCode's global skills directory
$src = "C:\path\to\win-dev-skills\plugins\winui\agent-plugin\skills"
$dst = "$env:USERPROFILE\.config\opencode\skills"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem $src -Directory | ForEach-Object {
  $link = Join-Path $dst $_.Name
  if (-not (Test-Path $link)) {
    New-Item -ItemType Junction -Path $link -Target $_.FullName | Out-Null
  }
}
```

Because these are junctions (not copies), `git pull` in the repo picks up upstream
skill updates automatically.

> **Note:** OpenCode maps skills, not agents, so the `winui-dev` orchestrator agent
> isn't exposed there. The skills still work - invoke them by name (e.g. `/winui-setup`,
> `/winui-design`) and OpenCode loads them on demand.
</details>

Then start a new session and run the `winui-setup` skill with `/winui-setup`.

Once setup is done, try a real task:

> "Build me a WinUI 3 markdown editor with live preview and a custom title bar"

### What gets installed

| Tool | Minimum | Recommended | Install command |
|---|---|---|---|
| Git | 2.54 | 2.54+ | `winget install Git.Git` |
| .NET SDK | 8.0.100 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| WinApp CLI | 0.7.0 (released) | latest | `winget install Microsoft.WinAppCli` |
| Developer Mode | enabled | enabled | DWORD `AllowDevelopmentWithoutDevLicense` set to `1` |

Visual Studio is **not required for normal JIT builds**. Native AOT additionally
requires the Windows native toolchain (Visual Studio or Build Tools with the
Desktop development with C++ workload); install it only when explicitly
requested. The app's target framework / `global.json` may require a newer .NET
SDK than the CLI minimum. If you want Visual Studio as an IDE, run:

```powershell
winget install Microsoft.VisualStudio.Community --override "--add Microsoft.VisualStudio.Workload.Universal"
```

> [!NOTE]
> **Older Windows App SDK versions had a XAML-compiler bug** under `dotnet build`: a malformed `.xaml` file produced no useful diagnostic — the build just failed with a cryptic `MSB3073` (`XamlCompiler.exe ... exited with code 1`) and no indication of which `.xaml` was wrong. This is **fixed in current releases** — Windows App SDK **≥ 2.1.3** on the 2.x line and **≥ 1.8** on the 1.x line. If you hit a cryptic build failure with no XAML diagnostic, **update the `Microsoft.WindowsAppSDK` NuGet package to the latest version**. WinApp CLI builds the project directly through `winapp run <project>`.

WinApp's Windows Sandbox execution requires Windows 11 24H2+ on Pro, Enterprise,
or Education (not Home), with
virtualization and Windows Sandbox enabled, and a working Sandbox client.
Builds remain on the host; deployment and UI input run in the guest. This does
not isolate untrusted builds. Prefer it when available; otherwise explain and
run locally, unless Windows Sandbox was explicitly requested. See `winui-setup` for enablement and
`winui-ui-testing` for target-scoped automation and artifact retrieval.

## Why a Copilot CLI plugin?

Modern Windows app development covers a lot of ground — XAML and Fluent Design, MVVM, MSIX packaging, code signing, Store submission, accessibility, theming, UI automation. AI agents working from generic web context tend to mix WinUI 3 with older stacks (UWP, WPF), miss the packaged-execution model, or stop short of running and verifying what they built. These skills **stay in the WinUI 3 lane end-to-end** — from `winapp new` through a signed MSIX — and pair the agent with tools that give it real, ground-truth answers instead of guesses.

The result: you ask `copilot -p "create a WinUI 3 photo viewer with thumbnails and EXIF metadata"`, and the agent picks the right template, scaffolds the project, designs the XAML with theming and accessibility in mind, wires up MVVM correctly, builds, fixes errors with real diagnostics, launches through the right packaged-execution pipeline, and (if you ask) drives the running app through UI automation to validate it works.

## What's in this repo

```
.github/plugin/          GitHub Copilot marketplace manifest
.claude-plugin/          Claude Code marketplace manifest
.agents/plugins/         OpenAI Codex marketplace manifest
plugins/winui/           Legacy-client compatibility package root
  .claude-plugin/        Claude Code compatibility manifest
  .codex-plugin/         OpenAI Codex compatibility manifest
  agents/                Claude Code orchestrator agent
  openclaw.plugin.json   OpenClaw compatibility manifest
  package.json           OpenClaw package metadata
  index.js               OpenClaw content-plugin entry point
  agent-plugin/          Agent Plugins 1.0 package root
    plugin.json          Portable manifest
    assets/              SVG and PNG marketplace artwork
    skills/              Portable Agent Skills (see table below)
    com.github.copilot/  Copilot-specific extension namespace
      agents/            The Copilot orchestrator agent
scripts/               Release helper and PowerShell workflow regression checks
```

### The agent: `winui-dev`

A focused agent for WinUI 3 / Windows App SDK / XAML / C# work. Use it for new apps, adding features, converting from WPF/Electron/web, or fixing bugs. It pulls in the skills below as needed.

### The eight skills

Each skill is a focused, self-contained playbook. The agent loads `winui-design` and `winui-dev-workflow` by default — those cover most "build me a WinUI 3 app" requests end-to-end. You opt into the others when you want them, including `winui-setup` for one-time machine prep.

| Skill | What it does |
|---|---|
| **`winui-dev-workflow`** | Build and run workflow — `winapp new`, direct `winapp run`, analyzer NuGet integration, Sandbox execution, opt-in Native AOT, crash diagnosis, and prerequisites. |
| **`winui-design`** | UI design and XAML correctness — layout planning, control selection, Fluent Design, theming (Light/Dark/HighContrast), accessibility, data binding, and grounded sample/API lookup with `winapp find-ui` and `winapp find-api`. |
| **`winui-code-review`** | Code-quality review before committing — MVVM compliance, `x:Bind` correctness, accessibility, theming, security, performance. Catches what the compiler and UI tests won't. |
| **`winui-ui-testing`** | Batch UI testing, preferring Windows Sandbox when available and otherwise using announced local execution. Explicit Windows Sandbox requests never fall back. Covers scoped targets, evidence, dialogs, persistence, and accessibility. |
| **`winui-packaging`** | Project-mode MSIX packaging, architecture bundles, Native AOT/trimming guidance, signing, self-contained deployment, CI/CD, and Store hand-off. |
| **`winui-wpf-migration`** | WPF → WinUI 3 migration — namespace replacement, control mapping (`DataGrid` → `ListView`, `WrapPanel` → `ItemsRepeater`, `TabControl` → `TabView`), `Dispatcher` → `DispatcherQueue`, `System.Drawing` → `BitmapImage`, MVVM conversion to CommunityToolkit.Mvvm, `DynamicResource` → `ThemeResource`. |
| **`winui-session-report`** | Diagnostic report on the current or a recent Copilot session. Runs only after an explicit request for session feedback, agent debugging, or a review of what happened during a build session. |
| **`winui-setup`** | Install and verify .NET SDK 8.0.100+, WinApp CLI 0.7+, and Developer Mode; identify additional project SDK, AOT, and Sandbox requirements. Templates are managed by `winapp new`. **Explicit request required**. |

## The tools we lean on

Skills are *prompts plus playbooks*. Build, deployment, API discovery, and
automation belong to WinApp CLI; analyzer delivery belongs to NuGet.

### External tools the skills depend on

* **[`winapp` CLI 0.7+](https://github.com/microsoft/winappCli)** (install with `/winui-setup`) — scaffolding, grounded `find-ui` samples and project-scoped `find-api` metadata, build/run, project packaging, signing, and UI automation. `run --aot` explicitly publishes native output; `package .\App.csproj` uses the project's deployment configuration. `--on sandbox` scopes execution to the guest, with `target` commands for diagnostics and file transfer.
* **[`Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer`](https://www.nuget.org/packages/Microsoft.Windows.SDK.BuildTools.WinUIAnalyzer)** — recommended at its latest version with `PrivateAssets="all"` for normal CLI, IDE, and CI builds. The assembly remains named `Microsoft.WindowsAppSDK.Analyzers`; the CLI does not inject it automatically. If unavailable, continue and disclose that its checks for potential runtime issues were not run.

### What still ships in the plugin

The plugin no longer ships an analyzer DLL, duplicate MSBuild targets, a
build/run wrapper, or a metadata CLI. Its remaining executable helper is the
unsigned `Analyze-Session.ps1` in the `winui-session-report` skill. It reads
local session events only when explicitly requested and produces a diagnostic
report. **The report can include prompts, paths, and command output: review
it before sharing.**

### Tool ownership

The analyzer source, tests, and NuGet publication live in
[`microsoft/winappCli`](https://github.com/microsoft/winappCli/tree/main/src/winapp-Analyzer).
API discovery, build/run, packaging, and Sandbox execution also belong there.
Contribute tool fixes upstream rather than adding a second implementation or
distribution channel to this repository. This repository owns plugin content,
the session-report helper, and their lightweight validation; there is no
C# source tree or native build step.

## Pinning to a release

The default install (`copilot plugin install winui@win-dev-skills`) tracks
`main` HEAD — every promotion to `main` is a tagged release, but the
marketplace install path always picks up the latest. If you need a stable
pin, install from the git URL with a tag ref instead:

```powershell
copilot plugin install https://github.com/microsoft/win-dev-skills.git#v0.3.0
```

```powershell
claude plugin install https://github.com/microsoft/win-dev-skills.git#v0.3.0
```

Browse available tags at <https://github.com/microsoft/win-dev-skills/tags>.

## How releases work

Day-to-day work lands on a `staging` branch via PRs. Periodically a maintainer
opens a **promotion PR** (`staging → main`) that bumps the version and
updates `CHANGELOG.md`; merging that PR auto-creates a `vX.Y.Z` git tag at
the merge commit. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
contributor flow and [`RELEASING.md`](RELEASING.md) for the maintainer
playbook.

## Portable packaging across agents

The plugin follows the vendor-neutral [Agent Plugins 1.0 specification](https://agent-plugins.org/specification). Compatible clients discover the shared skills from the fixed `skills/` directory, and CI validates each one with the [Agent Skills reference validator](https://agentskills.io/specification#validation). Capabilities that are not part of the portable v1 core remain in client-specific locations.

Agent Plugins 1.0 standardizes [skills and MCP server packaging](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#7-component-types), but it does not standardize custom agents. The `winui-dev` agent therefore lives under GitHub Copilot's [`com.github.copilot/` extension namespace](https://github.blog/changelog/2026-08-12-agent-plugins-1-0-in-vs-code-copilot-cli-and-the-copilot-app/) and is mirrored in the outer compatibility package's `agents/` directory for Claude Code. CI requires both copies to remain content-identical.

The separate package roots are intentional. The Agent Plugins specification requires [client-specific files to use reverse-domain top-level namespaces](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md#8-client-extensions), while Claude Code and OpenAI Codex still require `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` at the root of the package they install, and OpenClaw requires its own root manifest and JavaScript entry point. GitHub Copilot and other conforming clients therefore install `plugins/winui/agent-plugin`; the Claude, Codex, and OpenClaw integrations install the containing `plugins/winui` compatibility package and reference the canonical `agent-plugin/skills/` directory. This follows the specification's [additive migration guidance](https://github.com/agentplugins/agent-plugins-example/blob/main/skills/migrate-agent-plugin/references/migration-guide.md#6-preserve-platform-behavior) without duplicating the eight skills or their helper scripts.

Marketplace artwork is available as [`assets/logo.svg`](plugins/winui/agent-plugin/assets/logo.svg) and [`assets/logo-512.png`](plugins/winui/agent-plugin/assets/logo-512.png). Codex references these files from its client-specific manifest; other marketplace publishing flows can upload them directly. They are intentionally not declared in the portable manifest because `logo` is not part of the [Agent Plugins 1.0 manifest schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).

## Help us improve

After trying the skills, run the `winui-session-report` skill. It analyzes your session — turns, tokens, build patterns, what worked, what didn't — and produces a `session-report.md` file. **The file may contain excerpts of your prompts, file paths, and command output, so review it before sharing.** Please attach it when you [open an issue](https://github.com/microsoft/win-dev-skills/issues) — the bug template asks for it.

If a skill produces something wrong, surprising, or just not as good as it should be, we want to know. Skill names, scopes, structure, analyzer integration, and CLI workflows — **everything you see today is a starting point**, and feedback shapes where each piece lands.

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA); see [opensource.microsoft.com/cla](https://opensource.microsoft.com/cla) for details. This project has adopted the [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). For support channels see [SUPPORT.md](SUPPORT.md), and for responsible disclosure of security issues see [SECURITY.md](SECURITY.md).

**Open PRs against `staging`, not `main`.** See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch model and the release flow.

When you open a PR, the `pr-validation` workflow validates plugin manifests and
skill frontmatter and runs lightweight PowerShell workflow regressions. It
does not restore NuGet dependencies or build C# tools. The `release-policy`
workflow enforces the staging/main split (no version bumps in feature PRs;
required version bump + CHANGELOG entry in promotion PRs). See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the local validation commands.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third parties' policies.

## License

This project is licensed under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
