# WinUI Studio — a GitHub Copilot CLI canvas extension

A Fluent-styled, tabbed **canvas extension** for the GitHub Copilot app that turns
Copilot into an agentic WinUI 3 development companion. It runs a small loopback HTTP
server per canvas instance and renders an offline-safe, theme-aware UI (hand-rolled
Fluent 2 CSS) that hands work off to the `winui-dev` agent and the `winapp` CLI.

> Canvas id: `winui-template-studio` · scope: user · entry: `extension.mjs`

## Tabs

| Tab | What it does |
|-----|--------------|
| **Scaffold** ("New project") | Visually configure an app — name, **Language** (XAML/C# or C# Reactor), **Packaging** (Packaged MSIX / Unpackaged / Self-contained), **UI** template (Blank, MVVM, NavigationView, TabView), and **Features** (Settings + theme, Protocol activation, File associations, Widgets, Notifications, Windows AI Foundry, Localization). Generates the exact `dotnet new` command + an ordered scaffold plan and hands it to the `winui-dev` agent. |
| **Samples** | Browse ~180 real samples in one place — WinUI Gallery (`ControlInfoData.json`) + Windows App SDK samples — and drop a chosen sample's canonical code into your app via an agent hand-off. |
| **Design** | A Type / Color / Icons design system: 7 canonical TextBlock styles, 90 Fluent theme brushes (grouped, with "when to use" guidance and Light/Dark preview), and all 1,533 Segoe Fluent icons with client-side search. Copy snippets or "Use in app". |
| **Review** | A static XAML/C# scorecard (19 rules across Accessibility, Theming, Binding & MVVM, Typography, Layout, Performance, Security) grounded in the `winui-design` / `winui-code-review` checklists. Auto-attaches to the WinUI project in the current workspace; per-finding and per-category fixes hand off to the agent. |
| **Inspect** | A live UIA visual-tree inspector for a running WinUI app (element tree, properties, screenshot, live tweak → commit-to-XAML where a DevBridge is present). Auto-latches to the workspace app by process name across rebuild/relaunch. |

The extension is **agent-drivable**: `open_canvas` accepts a nav target, and actions
(`navigate`, `list_samples`, `review`, `inspect_latch`, `inspect_snapshot`,
`inspect_select`, …) let the agent drive an already-open panel.

## Layout

```
extensions/winui-studio/
├─ extension.mjs        # entry: per-instance HTTP server + routes + canvas actions
├─ renderer.mjs         # the whole UI (one HTML/CSS/JS template) — shell + all tabs
├─ catalog.mjs          # wizard vocabulary (languages, packaging, UI templates, features) + spec schema
├─ prompt.mjs           # spec → dotnet command, scaffold plan, agent hand-off prompt, summary
├─ samples.mjs          # WinUI Gallery sample index
├─ sdk-samples.mjs      # Windows App SDK sample index (reads a git branch, no worktree)
├─ design.mjs           # Type / Color / Icons data
├─ review.mjs           # static scorecard scanner
├─ inspect.mjs          # UIA visual-tree bridge (winapp `ui` runner)
├─ store.mjs            # draft / last-spec / recent / review-target persistence (writes to artifacts/)
├─ sdk-loader-hook.mjs  # ESM/CJS loader shim for the Copilot SDK
└─ public/
   ├─ assets/           # hero image + WinUI logo
   └─ inspect/          # the iframe-embedded inspector client (index.html / app.js / styles.css)
```

`artifacts/` (draft.json, last-spec.json, recent.json, review-target.json) is **runtime
state** the extension writes as you use it — it is git-ignored, not source.

## Requirements

- Node.js (the extension runs under the Copilot app's Node host)
- .NET SDK + the WinUI/WinAppSDK templates (`dotnet new winui`, `winui-navview`, …)
- `winapp` CLI (init / run / package / sign) — used for build/run and the UIA inspector
- Windows (WinUI 3 / Windows App SDK target)

## Install (development)

Copy this folder into your Copilot extensions directory and reload:

```powershell
Copy-Item -Recurse extensions\winui-studio "$env:USERPROFILE\.copilot\extensions\winui-template-studio"
```

Then reload extensions from within the Copilot app. The canvas registers as
**WinUI Template Studio** (`winui-template-studio`).

## Status

Experimental / in active design. Scaffold, Samples, Design, Review, and Inspect tabs
are all functional; Reactor (C# markup) support is a scaffold-plan step, and a few
feature-card glyphs are still being finalized.
