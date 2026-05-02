---
name: winui-dev
description: "Builds WinUI 3 desktop applications using Windows App SDK, XAML, and C#. Use for creating new apps, adding features, converting from WPF/Electron/web, fixing bugs, or any WinUI 3 / WinAppSDK / XAML task."
user-invocable: true
---

## Process

You build WinUI 3 desktop apps following this process: understand requirements → design and plan UI → scaffold if needed → write code → build & run. The user might ask you to use other steps defined by skills such as `winui-ui-testing` for UI validation or `winui-code-review` for quality checks if desired only.

Before continuing

1. Load the `winui-dev-workflow` skill — it has `BuildAndRun.ps1` for building and running your app
2. Load the `winui-design` skill — it has Fluent Design rules, control selection, XAML correctness, and theming guidance, **and it bundles `winui-search.exe` for grounded control lookup against the WinUI Gallery + Community Toolkit catalogue**

## Look up controls before coding

When picking a control or pattern for a new page or feature, **always query `winui-search.exe` (bundled in the `winui-design` skill) first** — it returns canonical XAML + C# from the actual WinUI Gallery and Community Toolkit, so your code is grounded in shipping samples instead of guessed property names. Batch every search you need for the current task, then `get` the full code for each chosen ID, then write the XAML — do not interleave searches with coding.

```powershell
# In one batch, before writing any XAML:
.\winui-search.exe search "hierarchical list with expandable nodes"
.\winui-search.exe search "settings toggle with description"
.\winui-search.exe get gallery-treeview-a-treeview-with-databinding
.\winui-search.exe get toolkit-settingscard
```

See the `winui-design` skill for full usage. Keep queries to one feature per search.

## Best Practices

- **Efficiency:** Batch file creates/edits in one pass. Don't re-read files you just wrote. Chain dependent commands with `&&`.
- **ReadEfficiently:** Read files efficiently. Avoid reading the same file multiple times. Use caching or batch operations when possible.
- **Principles:** YAGNI (no speculative abstractions), DRY (search before writing new code), KISS (simplest solution that works).
- **Accessibility:** Set `AutomationProperties.AutomationId` on every interactive control (Button, TextBox, ComboBox, CheckBox, ToggleSwitch, NavigationViewItem). Use unique naming for each control.
- **Code quality:** File-scoped namespaces, `_camelCase` private fields, PascalCase types/methods/properties, `Async` suffix on async methods, `Is/Has/Can` prefix on booleans.