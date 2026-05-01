---
name: winui-search
description: "Search WinUI 3 Gallery and Community Toolkit control patterns — find the right control, get XAML + C# code snippets and pitfall notes for grounded, on-pattern WinUI 3 code. Load before scaffolding a new page or feature."
---

> [!NOTE]
> **Preview skill** — ships a prebuilt unsigned `winui-search.exe` (Native AOT). The data sources are snapshots of [microsoft/WinUI-Gallery](https://github.com/microsoft/WinUI-Gallery) and [CommunityToolkit/Windows](https://github.com/CommunityToolkit/Windows) plus a small set of curated platform patterns. Subject to change without notice; pin to a specific commit if you need stability.

# WinUI 3 Gallery + Community Toolkit pattern search

A fast, offline lookup of 100+ WinUI 3 controls from the official **WinUI Gallery**, scenarios from the **Windows Community Toolkit**, and a curated set of platform integration patterns (JumpList, Share contract, system tray, file pickers, drag-drop). Use this skill **before** writing any XAML — it returns ground-truth shipping samples so you write on-pattern code instead of guessing the right control or property names.

## When to use

- Picking a control for a new page or feature ("hierarchical list with expandable nodes" → `TreeView`).
- Confirming the canonical XAML for a control you've used before but don't remember the resource keys / `x:DataType` / event handlers for.
- Looking up Community Toolkit composites (e.g. `SettingsExpander`, `SettingsCard`) before reaching for a hand-rolled equivalent.
- Finding platform integration patterns that don't show up cleanly in generic LLM training data (JumpList, Share, file pickers, drag-drop).

**Always run searches in a single batch, before coding** — do NOT interleave searching with writing code.

## Usage

The skill ships `winui-search.exe` alongside this `SKILL.md`. From the skill folder:

### Search by feature description

```powershell
.\winui-search.exe search "<description>"
```

Examples:
```powershell
.\winui-search.exe search "tabbed document interface with closable tabs"
.\winui-search.exe search "settings page with toggle and description text"
.\winui-search.exe search "show recent files in the taskbar jump list"
```

Returns a shortlist of matching scenarios with IDs and one-line descriptions. Pick the best ID.

### Get full code for a specific pattern

```powershell
.\winui-search.exe get <id>
```

Examples:
```powershell
.\winui-search.exe get gallery-tabview
.\winui-search.exe get jumplist-recent-files
.\winui-search.exe get gallery-treeview-a-treeview-with-databinding
```

Returns full XAML + C#, including `xmlns` declarations, `x:DataType`, brushes, spacing, and any pitfall notes the catalog has for that scenario.

### List everything

```powershell
.\winui-search.exe list
```

Useful for browsing what's available when you don't yet have a search query.

### Refresh the embedded data

```powershell
.\winui-search.exe update
```

Re-fetches snapshots from the upstream WinUI Gallery and Community Toolkit repos (anonymous, unauthenticated GitHub REST). Skip this in air-gapped environments — the embedded snapshots ship offline.

## Workflow

1. **Search** all controls / patterns you need for the current page or feature in one batch.
2. **Pick** the best matching scenario ID from each shortlist.
3. **Get** the full code for each ID.
4. **Code** using the patterns and pitfall notes as reference — copy the resource keys, brushes, `x:DataType`, spacing, and event-handler shapes verbatim where you can.

Search **one feature per query** — don't combine multiple controls into a single search. The BM25 scoring rewards focused queries.

## What the catalog covers

| Source | What's in it |
|---|---|
| **WinUI Gallery** | Every control sample shipped in the [WinUI 3 Gallery](https://github.com/microsoft/WinUI-Gallery) app. Full XAML + code-behind. |
| **Community Toolkit** | Sample scenarios from [CommunityToolkit/Windows](https://github.com/CommunityToolkit/Windows) (`SettingsCard`, `SettingsExpander`, `SwitchPresenter`, `TokenizingTextBox`, etc.). |
| **Core platform patterns** | Hand-curated catalog (`Data/core-patterns.json` baked into the exe) covering JumpList, Share contract, file pickers, drag-drop, and other foundational integrations where pulling a Gallery scenario is overkill. |

## Notes

- All output is plain text designed to be parsed by an AI agent — `[score]`-prefixed result lines, fenced code blocks for `get` results, and clearly labelled pitfall notes.
- The exe is Native AOT so first-run startup is instant — there's no JIT warmup penalty.
- Source: [`src/tools/winui-search/`](../../../../src/tools/winui-search/). Build it yourself with `./scripts/build-tools.ps1 -PublishAot`.
