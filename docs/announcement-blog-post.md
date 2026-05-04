# Build WinUI 3 apps with Copilot CLI: introducing `win-dev-skills` (Preview)

> **Draft — for review.** Target publication: **devblogs.microsoft.com/ifdef-windows**.
>
> **Placeholders to fill in:**
> * `[HERO VIDEO]` — short, autoplay/muted, 15-30s screen recording showing Copilot CLI scaffolding a WinUI 3 app, building, and launching it.
> * `[SKILL DEMO: <name>]` — one short clip per major skill (design, dev-workflow, packaging, ui-testing, wpf-migration).
> * `[SCREENSHOT: ...]` — single-frame illustrations called out inline.
> * Author photo + byline at the bottom.

---

We're excited to share a set of [Copilot CLI](https://github.com/github/gh-copilot) agents and skills designed to help you build native Windows apps with **WinUI 3** and the **Windows App SDK**.

These skills supercharge copilot to take your ideas to a native Windows app in minutes! `win-dev-skills` are built around the **end-to-end loop**: scaffold, build, run, test, iterate. They've been optimized to know how to drive each stage, recognize common failures that get normal agents stuck in loops, and steer towards successful patterns. We hope to continual improve this experience and outcomes as we gather more feedback and examples from our developer community!

`[HERO VIDEO]` *Copilot CLI scaffolding a WinUI 3 app, building it, and launching it — end to end, in one prompt.*

> **🚧 Heads up: this is a preview.** Skills, tools, names, and behaviors will change quickly as we listen to feedback. Pin to a specific commit if you need stability today.

## Why a Copilot CLI plugin?

Modern Windows app development covers a lot of ground — XAML and Fluent Design, MVVM, MSIX packaging, code signing, Store submission, accessibility, theming, UI automation. Each piece is well-documented on its own, but stitching them together into a smooth inner loop takes practice. AI agents working from generic web context tend to mix WinUI 3 with older stacks, miss the packaged-execution model, or stop short of running and verifying what they built. We wanted skills that **stay in the WinUI 3 lane end-to-end** — from `dotnet new` through a signed MSIX — and that pair the agent with tools that give it real, ground-truth answers instead of guesses.

Copilot CLI agents and skills let us put that knowledge right next to the developer. You ask `copilot -p "create a WinUI 3 photo viewer with thumbnails and EXIF metadata"`, and the agent:

1. Picks the right template and scaffolds the project
2. Designs the XAML with theming and accessibility
3. Wires up MVVM correctly
4. Builds it and fixes issues as needed
5. Launches it through the right packaged-execution pipeline
6. Interacts with the app to validate functionality as needed
7. Runs accessibility audits, code reviews, packaging, and more

…all without you needing to guide it or teach it how to do any of those steps.

## What's inside the plugin

The plugin ships **one agent**, **seven skills**, and **several supporting tools**. The agent is the entry point — it knows when to bring in which skill. You can also invoke skills directly.

### The agent: `winui3`

A focused agent for WinUI 3 / Windows App SDK / XAML / C# work. Use it for new apps, adding features, converting from WPF/Electron/web, or fixing bugs. It's the orchestrator that pulls in the skills below as needed.

`[SKILL DEMO: agent]` *"Create a markdown editor with live preview and a custom title bar."*

### The skills

Each skill is a focused, self-contained playbook. The agent loads `winui-design` and `winui-dev-workflow` by default — those cover most "build me a WinUI 3 app" requests end-to-end. You opt into the others when you want them: include `winui-ui-testing` and the agent will drive your app through real UI automation, find functional issues, and iterate on fixes; include `winui-packaging` when you're ready to ship; include `winui-wpf-migration` when you're porting from WPF. Skills compose cleanly, so adding one doesn't disrupt the others.

| Skill | What it does |
|---|---|
| **`winui-dev-workflow`** | Build and run workflow — project creation from templates, the `BuildAndRun.ps1` helper, `winapp run`, error diagnosis, prerequisites. Use when building, running, or fixing build errors. |
| **`winui-design`** | UI design and XAML correctness — layout planning, control selection, Fluent Design, theming (Light/Dark/HighContrast), typography, spacing, brushes, accessibility, data-binding review. Use when designing new pages, converting from WPF/Electron/web, reviewing XAML, or fixing theme issues. |
| **`winui-code-review`** | Code-quality review before committing — MVVM compliance, `x:Bind` correctness, accessibility, theming, security, performance. Catches the issues the compiler and UI tests won't. |
| **`winui-ui-testing`** | Automated UI testing — generates a batch test script, runs all tests in one pass, reads results. Covers element assertions, interactions, value checks (TextBox, ComboBox, ToggleSwitch), file pickers, flyouts, dialogs, persistence, and accessibility audits. |
| **`winui-packaging`** | MSIX packaging, code signing, and distribution — release builds, certificate generation (`winapp cert generate`), trust, signing (`winapp sign`), self-contained deployment, GitHub Actions CI/CD, and Microsoft Store submission. |
| **`winui-wpf-migration`** | WPF → WinUI 3 migration — namespace replacement, control mapping (`DataGrid` → `ListView`, `WrapPanel` → `ItemsRepeater`, `TabControl` → `TabView`), `Dispatcher` → `DispatcherQueue`, `System.Drawing` → `BitmapImage`, MVVM conversion to CommunityToolkit.Mvvm, and `DynamicResource` → `ThemeResource`. |
| **`winui-session-report`** | Diagnostic report on the current or a recent Copilot session. Use when asking for session feedback, debugging agent behavior, or reviewing what happened during a build session. |

`[SKILL DEMO: winui-design]` *Iterating on a Settings page with theming + accessibility checks.*
`[SKILL DEMO: winui-wpf-migration]` *Converting a small WPF sample to WinUI 3 in one pass.*
`[SKILL DEMO: winui-packaging]` *Generating a self-signed cert, signing an MSIX, and producing a CI-ready GitHub Actions workflow.`

`[INFOGRAPHIC: one composite image illustrating all 7 skills and how they fit together — replace the individual SKILL DEMO clips above if we go this route]`

## The tools we lean on

Skills are *prompts plus playbooks*. They get their actual leverage from a small set of **tools** — some external, some included as part of each skill.

### External: tools every skill expects on your machine

* **[winapp CLI](https://github.com/microsoft/winappcli)** (`winget install Microsoft.WinAppCLI`) — the command-line driver for installing, running, signing, packaging, and **automating** WinUI 3 / WinAppSDK apps. **Without `winapp`, these skills wouldn't be possible.** Packaged WinUI 3 apps can't just be launched as a `.exe` — they need to be installed and started through the right activation pipeline. `winapp run` does exactly that, and crucially streams the app's debug output back to the agent so it can see crashes and exceptions instead of staring at silence. `winapp ui` powers the entire `winui-ui-testing` skill: enumerating elements, asserting state, driving controls, capturing accessibility audits — all from the command line, all scriptable, all readable by an AI agent. `winapp manifest` and `winapp pack` are what makes the `winui-packaging` skill able to take a build all the way to a signed MSIX.

  `winapp CLI` is being built **in parallel** with these skills, in lockstep. Every time a skill needed a new automation surface, a missing JSON output mode, or a tighter feedback loop, that requirement landed in `winapp` first. The two repos co-evolve, and we expect that to continue.
* **[Microsoft.WindowsAppSDK.WinUI.CSharp.Templates](https://www.nuget.org/packages/Microsoft.WindowsAppSDK.WinUI.CSharp.Templates)** — the new `dotnet new` templates for WinUI 3 + Windows App SDK. The dev-workflow skill uses these as the canonical scaffold so every new project starts from the same supported baseline.

### In-repo: the three tools we built alongside the skills

These live in `src/tools/` and ship with the plugin. Each one solves a problem that prevents the skills from being reliable. **All three are early days — see the "What's next" notes for where each is heading.**

#### 🛠 `winui3-analyzer` — a Roslyn analyzer for WinUI 3 pitfalls

A `netstandard2.0` Roslyn analyzer that catches common WinUI 3 / WinAppSDK issues at build time: UWP namespace leaks, `Window.Current` and `CoreDispatcher` usage, `WebView2` without `EnsureCoreWebView2Async`, `TabView` items containing raw content, attached-property initializer bugs, removed ONNX GenAI APIs, the old field-backed `[ObservableProperty]` pattern, and more. Distributed today as a prebuilt DLL the `winui-dev-workflow` skill auto-injects into your `dotnet build`.

* **What's next:** the goal is to ship this as a standalone NuGet package (`Microsoft.WindowsAppSDK.Analyzers`) with a categorized rule catalog, severity-ceiling policy (no `Error` rules by default), and per-rule `helpLinkUri`s. Whenever that lands on NuGet, the skill will switch to a `<PackageReference>` and the in-repo distribution path goes away. Feedback on rule severity, false positives, and which categories matter most will shape the catalog.

`[SCREENSHOT: analyzer warnings appearing inline in the Problems pane]`

#### 🔍 `winui-search` — a fast, offline catalog of WinUI Gallery + Community Toolkit samples

A native-AOT CLI that indexes [WinUI Gallery](https://github.com/microsoft/WinUI-Gallery) and [CommunityToolkit/Windows](https://github.com/CommunityToolkit/Windows) scenarios so the agent has **grounded knowledge of which control to pick, and how to use it well**. WinUI 3 ships with a *lot* of controls — and Community Toolkit adds many more on top. Knowing whether the right answer is `NavigationView` or `TabView`, `ListView` or `ItemsRepeater`, a stock `Expander` or a Toolkit `SettingsExpander`, isn't something a generic LLM gets right reliably. `winui-search` puts the actual shipping samples behind a fast lookup so the agent can see real usage before writing a single line of XAML. When a skill is drafting a settings page, it can ask `winui-search` for *"toggle switch with description text"* and get back the actual XAML pattern from WinUI Gallery — including the expected resource keys, spacing, and ancillary controls. Need a `NavigationView` example with a custom title bar? An `ItemsRepeater` with virtualized cards? A Community Toolkit `SettingsCard` with an icon and a hyperlink? It's one query away. Backs the design skill's "show me a real-world example" capability and grounds the agent's XAML in patterns that already shipped to real users.

* **What's next:** the data layer and the CLI surface are both in flux. We're considering a few directions: shipping it as a standalone CLI tool, folding the search surface into `winapp` itself, or exposing the catalog over a small MCP server. We're also working on **expanding what's searchable** — multi-control composite patterns (a full settings page, not just a single `ToggleSwitch`), and going beyond UI into **C# code patterns** so agents can reliably search for snippets like "how do I implement a custom `ICommand`" or "Dispatcher-safe progress reporting from a background `Task`". The right answer depends on where developers want to use it — your feedback will decide.

#### 🧬 `winmd-cli` — offline WinRT + .NET API metadata lookup

A native-AOT CLI that indexes `.winmd` and managed `.dll` metadata from NuGet, the Windows SDK, and WinAppSDK and provides fast, offline API lookup with the same XML doc text Visual Studio IntelliSense uses. The agent uses it to verify that an API actually exists and has the signature it thinks it does — *before* writing code that won't compile.

* **What's next:** same set of options as `winui-search` — standalone CLI, integration into `winapp`, or MCP server. Likely shares whatever distribution decision we land on for `winui-search`.

`[SCREENSHOT: agent transcript showing winmd-cli verifying an API signature mid-conversation]`

### One more in-repo tool you should know about

#### 🩹 `BuildAndRun.ps1` — a temporary build wrapper

The `winui-dev-workflow` skill currently invokes a small PowerShell helper, `BuildAndRun.ps1`, instead of calling `dotnet build` directly. Why? There's a known XAML compiler issue where, under `dotnet build`, **a malformed XAML file produces no useful diagnostic** — the build just fails with no indication of what's wrong in which `.xaml`. Agents that hit this get completely stuck: they can see the build failed, but they have no signal to act on, and they thrash through unrelated guesses. (Tracked in the WindowsAppSDK / WinUI repos — `[LINK TO ISSUE TBD]`.)

The script's actual workaround is small but specific: **if MSBuild is available on the machine** (i.e. Visual Studio with the right workload is installed), the script builds with MSBuild instead of `dotnet build`, because the XAML diagnostics flow correctly through MSBuild. If MSBuild isn't there, it falls back to `dotnet build` and surfaces what it can. Either way, after a successful build it hands off to `winapp run` so the app launches the right way.

* **What's next:** **this script is explicitly temporary.** It's slated to be removed entirely once the XAML compiler fix ships in the next Windows App SDK release. We'd rather not paper over platform bugs forever — the right fix lives in the platform.

## How we're thinking about feedback

This is the part we want to over-communicate: **everything you see today is a starting point.**

* **Skill names, scopes, and structure** will change. We've already collapsed and re-scoped a few skills based on early internal feedback.
* **Distribution mechanics** for the analyzer and CLI tools are open questions — see each tool's "what's next" above.
* **Beyond Copilot CLI.** Today the plugin targets [GitHub Copilot CLI](https://github.com/github/gh-copilot), but we want these skills to be usable from **any** AI coding host that's a good fit for Windows desktop development. We're actively figuring out the cleanest way to ship for multiple hosts without forking the content — and we want feedback on which hosts matter most to you.
* **The `BuildAndRun.ps1` helper will go away** when the platform fix ships.
* The **`winapp` CLI** is itself young and evolving in lockstep with these skills.

If a skill produces something wrong, surprising, or just not as good as it should be, we want to know. The fastest way to influence the direction is to **file an issue** on the [`microsoft/win-dev-skills` repo](https://github.com/microsoft/win-dev-skills/issues) (the bug template asks you to attach a session report — generated for you by the `winui-session-report` skill).


## Try it

```sh
# Install Copilot CLI
winget install GitHub.Copilot

# Install winapp CLI
winget install Microsoft.WinAppCLI

# Install the WinUI 3 templates
dotnet new install Microsoft.WindowsAppSDK.WinUI.CSharp.Templates

# Add the win-dev-skills plugin to Copilot CLI
# (final installation command TBD — will be in the repo README at launch) (TODO)
```

Then ask Copilot CLI for the WinUI 3 app you've been meaning to build, and tell us how it goes.

---

`[AUTHOR BYLINE + AVATAR]`

---

## Outstanding TODOs for this draft

- [ ] Decide on canonical install command (one-liner that adds the plugin to Copilot CLI) — depends on how we publish the plugin manifest.
- [ ] Find and link the WinAppSDK/WinUI repo issue for the silent XAML compiler diagnostics under `dotnet build` (placeholder `[LINK TO ISSUE TBD]` in the BuildAndRun section).
- [ ] Capture hero video and 4–5 short skill-demo clips.
- [ ] Replace the bug-report / discussions URLs with final post-public-flip links.
- [ ] Confirm whether to mention upcoming skills (e.g., `winui-gallery-search` MCP server) or keep the post strictly to what ships at launch.
- [ ] Author byline (single author or "the win-dev-skills team"?).
- [ ] Decide whether to link directly to specific skill `SKILL.md` files in the repo, or just point at the repo root.
- [ ] Sensitivity check: anything in here that touches roadmap commitments we're not ready to make publicly? (analyzer-as-NuGet, BuildAndRun removal timing, winapp CLI integration plans.)
