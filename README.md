# WinUI agents and skills for Windows app development

A Github Copilot and Claude Code plugin for building native Windows apps with **WinUI 3** and the **Windows App SDK** to cover the end-to-end inner loop: scaffold → design → build → run → test → package → ship.

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/b7d25afc-ba15-4d8a-8dcf-2dd78000f3aa" />


> [!WARNING]
> **🚧 Preview · v0.x — expect breaking changes.** Skill names, on-disk layout, agent configuration, analyzer rule IDs, and CLI tool surfaces are all subject to change without notice. There is no SemVer commitment until v1.0. Pin to a specific commit if you need stability today. Outputs are suggestions, not authoritative answers — review them before committing or shipping anything they produce.

## Install

The plugin requires **GitHub Copilot** (`winget install GitHub.Copilot`) or **Claude Code** installed. 

**Git** (`winget install Git.Git`) is required for installing pluggins.

### Option A — Just ask Copilot to do it

Paste this prompt into a Copilot CLI session. It installs the plugin **and** sets up every prerequisite in one shot:

```
Install the Copilot CLI plugin "winui" from microsoft/win-dev-skills, then set up my machine for WinUI 3 development. Specifically:

1. Run: copilot plugin marketplace add microsoft/win-dev-skills
2. Run: copilot plugin install winui@win-dev-skills
3. Make sure these prerequisites are present (check first; .NET only installs if missing, but WinApp CLI and templates always upgrade to latest):
   - .NET SDK >= 8.0 (run `dotnet --list-sdks`; if none >= 8.0, `winget install --id Microsoft.DotNet.SDK.10 --exact --silent --accept-package-agreements --accept-source-agreements`)
   - WinApp CLI: must be >= 0.3 (parse `winapp --version`); if missing or older, `winget install --id Microsoft.WinAppCLI`. THEN regardless run `winget upgrade --id Microsoft.WinAppCLI` to get the latest.
   - WinUI 3 templates: always run `dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` (after refreshing $env:Path) — it upgrades in place if already installed.
   - Developer Mode (DWORD HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense == 1) — ASK ME first before triggering UAC; if I decline, just print the elevated command for me to run later.
4. Print a short summary of what was installed vs already present, then tell me to start a new Copilot CLI, activate the "winui-dev" agent, and to ask it to build an app.
```

### Option B — Install the plugin yourself, then ask the agent to set up the rest

If you'd rather run the plugin commands by hand, the same commands work for **GitHub Copilot CLI** and **Claude Code** — just swap `copilot` for `claude` (or vice versa):

```powershell
copilot plugin marketplace add microsoft/win-dev-skills
copilot plugin install winui@win-dev-skills
```

```powershell
claude plugin marketplace add microsoft/win-dev-skills
claude plugin install winui@win-dev-skills
```

Then start a new session and run the `winui-setup` skill with `/winui-setup`.

Once setup is done, try a real task:

```sh
copilot --agent winui:winui-dev -p "Build me a WinUI 3 markdown editor with live preview and a custom title bar"
```

```sh
claude --agent winui:winui-dev -p "Build me a WinUI 3 markdown editor with live preview and a custom title bar"
```

### What gets installed

| Tool | Minimum | Recommended | Install command |
|---|---|---|---|
| Git | 2.54 | 2.54+ | `winget install Git.Git` |
| .NET SDK | 8.0 | 10.0 | `winget install Microsoft.DotNet.SDK.10` |
| WinApp CLI | 0.3 | latest | `winget install Microsoft.WinAppCLI` |
| WinUI 3 templates | — | latest | `dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates` |
| Developer Mode | enabled | enabled | DWORD `AllowDevelopmentWithoutDevLicense` set to `1` |

Visual Studio with the WinUI workload is **optional** but recommended for the XAML-diagnostics workaround called out in the next section. Neither setup path will install it; if you want it, run:

```powershell
winget install Microsoft.VisualStudio.Community --override "--add Microsoft.VisualStudio.Workload.Universal"
```

> [!IMPORTANT]
> **For best results, install Visual Studio with the WinUI workload.** There is a known XAML-compiler issue under `dotnet build` where a malformed XAML file produces no useful diagnostic — the build just fails with no indication of what's wrong in which `.xaml`. Agents that hit this thrash through unrelated guesses. The `winui-dev-workflow` skill works around it via a small [`BuildAndRun.ps1`](plugins/winui/skills/winui-dev-workflow/BuildAndRun.ps1) helper that prefers MSBuild when it's available on the machine and falls back to `dotnet build` otherwise. **This workaround is explicitly temporary** and goes away when the next Windows App SDK release fixes the underlying compiler.

## Why a Copilot CLI plugin?

Modern Windows app development covers a lot of ground — XAML and Fluent Design, MVVM, MSIX packaging, code signing, Store submission, accessibility, theming, UI automation. AI agents working from generic web context tend to mix WinUI 3 with older stacks (UWP, WPF), miss the packaged-execution model, or stop short of running and verifying what they built. These skills **stay in the WinUI 3 lane end-to-end** — from `dotnet new` through a signed MSIX — and pair the agent with tools that give it real, ground-truth answers instead of guesses.

The result: you ask `copilot -p "create a WinUI 3 photo viewer with thumbnails and EXIF metadata"`, and the agent picks the right template, scaffolds the project, designs the XAML with theming and accessibility in mind, wires up MVVM correctly, builds, fixes errors with real diagnostics, launches through the right packaged-execution pipeline, and (if you ask) drives the running app through UI automation to validate it works.

## What's in this repo

```
.github/plugin/        Marketplace manifest (marketplace.json)
plugins/winui/         Copilot CLI plugin manifest + agent + skill files
  agents/winui-dev/    The orchestrator agent
  skills/              The eight skills (see table below)
src/tools/             Source for the in-repo tools shipped with the skills
  winmd-cli/           Native-AOT WinRT/.NET metadata indexer (winmd.exe)
  winui-search/        Native-AOT search over WinUI Gallery + Toolkit (winui-search.exe)
  winui-analyzer/      Microsoft.WindowsAppSDK.Analyzers Roslyn analyzer
scripts/               Helper scripts (see scripts/build-tools.ps1)
```

### The agent: `winui-dev`

A focused agent for WinUI 3 / Windows App SDK / XAML / C# work. Use it for new apps, adding features, converting from WPF/Electron/web, or fixing bugs. It pulls in the skills below as needed.

### The eight skills

Each skill is a focused, self-contained playbook. The agent loads `winui-design` and `winui-dev-workflow` by default — those cover most "build me a WinUI 3 app" requests end-to-end. You opt into the others when you want them, including `winui-setup` for one-time machine prep.

| Skill | What it does |
|---|---|
| **`winui-dev-workflow`** | Build and run workflow — project creation from templates, the `BuildAndRun.ps1` helper, `winapp run`, error diagnosis, prerequisites. Use when building, running, or fixing build errors. |
| **`winui-design`** | UI design and XAML correctness — layout planning, control selection, Fluent Design, theming (Light/Dark/HighContrast), typography, spacing, brushes, accessibility, data-binding review. Bundles `winui-search.exe` for grounded control lookup against the WinUI Gallery + Community Toolkit catalogue. |
| **`winui-code-review`** | Code-quality review before committing — MVVM compliance, `x:Bind` correctness, accessibility, theming, security, performance. Catches what the compiler and UI tests won't. |
| **`winui-ui-testing`** | Automated UI testing — generates a batch test script, runs all tests in one pass, reads results. Covers element assertions, interactions, value checks (TextBox, ComboBox, ToggleSwitch), file pickers, flyouts, dialogs, persistence, accessibility audits. |
| **`winui-packaging`** | MSIX packaging, code signing, and distribution — release builds, certificate generation (`winapp cert generate`), trust, signing (`winapp sign`), self-contained deployment, GitHub Actions CI/CD, and Microsoft Store submission. |
| **`winui-wpf-migration`** | WPF → WinUI 3 migration — namespace replacement, control mapping (`DataGrid` → `ListView`, `WrapPanel` → `ItemsRepeater`, `TabControl` → `TabView`), `Dispatcher` → `DispatcherQueue`, `System.Drawing` → `BitmapImage`, MVVM conversion to CommunityToolkit.Mvvm, `DynamicResource` → `ThemeResource`. |
| **`winui-session-report`** | Diagnostic report on the current or a recent Copilot session. Use when filing a bug, debugging agent behaviour, or reviewing what happened during a build session. |
| **`winui-setup`** | Install and verify machine prerequisites — .NET SDK 10, the WinApp CLI, the WinUI 3 .NET templates, and Developer Mode. Idempotent. **User-invoked only** — run it explicitly with `/winui-setup` to set up a fresh machine; the agent will not load it on its own and will instead ask you to run it if a later command fails because a prerequisite is missing. |

## The tools we lean on

Skills are *prompts plus playbooks*. They get their actual leverage from a small set of tools — some external, some included in this repo.

### External tools the skills depend on

* **[`winapp` CLI](https://github.com/microsoft/winappcli)** (`winget install Microsoft.WinAppCLI`) — the command-line driver for installing, running, signing, packaging, and **automating** WinUI 3 / WinAppSDK apps. **Without `winapp`, these skills wouldn't be possible.** Packaged WinUI 3 apps can't just be launched as a `.exe` — they need to be installed and started through the right activation pipeline. `winapp run` does exactly that and streams the app's debug output back to the agent so it can see crashes and exceptions instead of staring at silence. `winapp ui` powers the entire `winui-ui-testing` skill: enumerating elements, asserting state, driving controls, capturing accessibility audits — all from the command line, all scriptable, all readable by an AI agent. `winapp manifest` and `winapp pack` are what makes `winui-packaging` able to take a build all the way to a signed MSIX. `winapp` is being built **in parallel** with these skills, in lockstep — every time a skill needed a new automation surface or a tighter feedback loop, that requirement landed in `winapp` first.
* **[`Microsoft.WindowsAppSDK.WinUI.CSharp.Templates`](https://www.nuget.org/packages/Microsoft.WindowsAppSDK.WinUI.CSharp.Templates)** — the new `dotnet new` templates for WinUI 3 + Windows App SDK. The dev-workflow skill uses these as the canonical scaffold so every new project starts from the same supported baseline.

### In-repo tools — what's running on your machine

Several skills ship helper binaries and PowerShell scripts that run under your user account. **None of them are code-signed today.** They live in this repo so you can read the source, build them yourself, and verify what they do — that's an explicit launch-preview trade-off, not a long-term distribution model.

| Artifact | Source | What it does | Long-term plan |
|---|---|---|---|
| **`Microsoft.WindowsAppSDK.Analyzers.dll`** (Roslyn analyzer) | [`src/tools/winui-analyzer/`](src/tools/winui-analyzer/) | Catches common WinUI 3 / WinAppSDK pitfalls at build time: UWP namespace leaks, `Window.Current`, `CoreDispatcher`, `WebView2` without `EnsureCoreWebView2Async`, raw `TabView` content, attached-property syntax bugs, removed ONNX GenAI APIs, the old field-backed `[ObservableProperty]` pattern, and more. Every rule ships at `Warning` severity (no `Error`s) and includes a `helpLinkUri`. Verified against source on every PR by the `analyzer-provenance` CI job. | Publish as the `Microsoft.WindowsAppSDK.Analyzers` NuGet package; skill stops shipping the prebuilt DLL and projects pick it up via `<PackageReference>`. |
| **`winmd.exe`** (winmd-cli) | [`src/tools/winmd-cli/`](src/tools/winmd-cli/) | Native-AOT WinRT/.NET metadata indexer. The agent uses it to verify an API actually exists and has the signature it thinks it does — *before* writing code that won't compile. Reads `.winmd` and managed `.dll` metadata from NuGet, the Windows SDK, and WinAppSDK and returns the same XML doc text Visual Studio IntelliSense uses. | Publish as a `dotnet tool` on NuGet, or fold relevant subcommands into [`winappcli`](https://github.com/microsoft/winappcli). |
| **`winui-search.exe`** (winui-search) | [`src/tools/winui-search/`](src/tools/winui-search/) | Native-AOT BM25 search over [WinUI Gallery](https://github.com/microsoft/WinUI-Gallery) and [CommunityToolkit/Windows](https://github.com/CommunityToolkit/Windows) scenarios. Lets the agent see real shipping samples for a control before writing a single line of XAML. Embedded JSON snapshots ship offline; live refresh via `winui-search update`. **Distributed today as a prebuilt unsigned exe inside the `winui-design` skill payload**, verified on every PR by the `winui-search-provenance` CI job. | Same as `winmd-cli` — `dotnet tool`, fold into `winappcli`, or expose over a small MCP server. |
| **`BuildAndRun.ps1`** | [`plugins/winui/skills/winui-dev-workflow/BuildAndRun.ps1`](plugins/winui/skills/winui-dev-workflow/BuildAndRun.ps1) | Picks MSBuild over `dotnet build` to work around the XAML-compiler diagnostic gap called out above. After a successful build it hands off to `winapp run`. | **Removed entirely once the next Windows App SDK release fixes the XAML compiler under `dotnet build`** — the skills will switch to `dotnet build` / `dotnet run` directly. |
| **`Analyze-Session.ps1`** | [`plugins/winui/skills/winui-session-report/Analyze-Session.ps1`](plugins/winui/skills/winui-session-report/Analyze-Session.ps1) | Reads your local Copilot session events and produces a `session-report.md` for bug filing. **The report can include excerpts of your prompts, file paths, and command output — review it before sharing.** The skill prints a privacy notice when it runs. | Fold into the `copilot` CLI as a session-report subcommand, or publish as a `dotnet tool`. |

If any of this is a deal-breaker for your environment, please [open an issue](https://github.com/microsoft/win-dev-skills/issues) — that feedback is what determines how quickly each item moves out of "preview, ships from repo" into "signed package on a registry".

### Building the in-repo tools yourself

```powershell
# Build all three tools (AOT-publishes winmd-cli and winui-search), run the
# analyzer test suite, and refresh both committed payloads (analyzer DLL inside
# winui-dev-workflow, winui-search.exe inside winui-design). This is the same
# build the pr-validation workflow runs in CI.
./scripts/build-tools.ps1
```

Per-tool READMEs cover what they do and how to consume them in more detail:

* [`src/tools/winui-analyzer/README.md`](src/tools/winui-analyzer/README.md) — analyzer + rule catalog
* [`src/tools/winmd-cli/README.md`](src/tools/winmd-cli/README.md) — `winmd` CLI usage
* [`src/tools/winui-search/README.md`](src/tools/winui-search/README.md) — `winui-search` CLI usage

## Beyond Copilot CLI

Today the plugin targets [GitHub Copilot CLI](https://github.com/github/gh-copilot), but we want these skills to be usable from **any** AI coding host that's a good fit for Windows desktop development. We're actively figuring out the cleanest way to ship for multiple hosts without forking the content — and we want feedback on which hosts matter most to you. File an issue if you have a preference.

## Help us improve

After trying the skills, run the `winui-session-report` skill. It analyzes your session — turns, tokens, build patterns, what worked, what didn't — and produces a `session-report.md` file. **The file may contain excerpts of your prompts, file paths, and command output, so review it before sharing.** Please attach it when you [open an issue](https://github.com/microsoft/win-dev-skills/issues) — the bug template asks for it.

If a skill produces something wrong, surprising, or just not as good as it should be, we want to know. Skill names, scopes, structure, distribution mechanics for the analyzer and CLI tools, the `BuildAndRun.ps1` workaround — **everything you see today is a starting point**, and feedback in the next few months shapes where each piece lands.

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA); see [opensource.microsoft.com/cla](https://opensource.microsoft.com/cla) for details. This project has adopted the [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md). For support channels see [SUPPORT.md](SUPPORT.md), and for responsible disclosure of security issues see [SECURITY.md](SECURITY.md).

When you open a PR, a `pr-validation` workflow rebuilds the analyzer DLL, runs the analyzer test suite, validates the plugin manifest and skill frontmatter, and verifies the committed analyzer binary matches its source. Run [`scripts/build-tools.ps1`](scripts/build-tools.ps1) locally before pushing to keep those checks green.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is subject to those third parties' policies.

## License

This project is licensed under the [MIT License](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
