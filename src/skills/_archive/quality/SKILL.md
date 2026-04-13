---
name: quality
description: 'Cross-cutting quality rules for WinUI 3 — performance, security, accessibility, code quality, globalization. Read when changing UI, handling secrets, or adding user-facing strings.'
---

# Quality — Perf · Security · A11y · Code · Globalization

## Quick Reference

1. **`x:Bind` over `{Binding}`** — compiled, type-safe, faster. `{Binding}` only where `x:Bind` can't work.
2. **`PasswordVault` for secrets** — never hardcode keys/tokens. `DataProtectionProvider` for data at rest.
3. **`AutomationProperties.Name` on every interactive control** — screen readers require it.
4. **Enable Roslyn analyzers** — `EnableNETAnalyzers` + `AnalysisLevel latest-recommended`.
5. **All user-facing strings in `.resw`** — `x:Uid` in XAML, `ResourceLoader` in C#.

---

## Performance

- **`x:Bind`** (compiled, OneTime default) over `{Binding}` (reflection). **`x:Load`** to defer hidden UI. **`x:Phase`** for progressive list rendering.
- **Virtualize lists** — `ItemsRepeater`/`ListView` for >20 items. Never `StackPanel` for large collections.
- **`DispatcherQueue.TryEnqueue()`** — batch updates, don't flood. **`Task.Run`** for CPU, **`async/await`** for I/O. Never `.Result`/`.Wait()`.
- Minimize visual tree depth — `Grid` over nested `StackPanel`.

## Security

- **`PasswordVault`** for secrets. **`DataProtectionProvider`** (DPAPI) for data at rest.
- Validate all external input. Never unsanitized input to `Process.Start`. **HTTPS only**.
- Least privilege in `Package.appxmanifest`. WebView2: disable DevTools/scripts for untrusted content.

## Accessibility

- **`AutomationProperties.Name`/`.LabeledBy`** on interactive controls. `.AutomationId` for test automation.
- Semantic controls (`Button`) not `Border`/`Grid` with handlers.
- **Keyboard:** `TabIndex`, `AccessKey`, `KeyboardAccelerator`. **Contrast:** 4.5:1 / 3:1. Test High Contrast.

## Code Quality

- Enable: `EnableNETAnalyzers`, `AnalysisLevel latest-recommended`, `EnforceCodeStyleInBuild`, `Nullable enable`.
- PascalCase classes/methods, `_camelCase` fields, `camelCase` params, suffix `Async`, prefix `Is/Has/Can`.
- Remove unused `using`s, dead code, empty methods. Obey CA*/IDE* rules.

## Globalization

- `.resw` files with `x:Uid` (XAML) and `ResourceLoader` (C#). `CultureInfo.CurrentCulture` for formatting.
- RTL: `FlowDirection` at root, `Start`/`End` not `Left`/`Right`. Design for 30-40% text expansion. Separate plural keys.

---

## Detailed References

| Reference | Contents |
|---|---|
| [`references/quality-rules.md`](references/quality-rules.md) | x:Bind vs {Binding} table, x:Load/x:Phase examples, PasswordVault & DPAPI code, input validation, WebView2 security, AutomationProperties, keyboard nav, Roslyn setup, naming table, .resw structure, x:Uid suffix table, ResourceLoader, RTL, pluralization |

## Related Skills

| Skill | When to use |
|---|---|
| `platform-apis` | Capability declarations for sensors/hardware |
| `interop-webview` | WebView2 security, navigation filtering |
| `media-files` | Accessible media controls, localized UI |
| `identity-and-setup` | MSIX signing, package capabilities |

## External Resources

| Topic | Link |
|---|---|
| Performance | [WinUI performance](https://learn.microsoft.com/windows/apps/performance/) |
| x:Bind | [x:Bind extension](https://learn.microsoft.com/windows/uwp/xaml-platform/x-bind-markup-extension) |
| .NET Security | [Best practices](https://learn.microsoft.com/dotnet/standard/security/) |
| PasswordVault | [PasswordVault](https://learn.microsoft.com/uwp/api/windows.security.credentials.passwordvault) |
| Accessibility | [WinUI a11y](https://learn.microsoft.com/windows/apps/design/accessibility/accessibility) |
| Code analysis | [.NET analysis](https://learn.microsoft.com/dotnet/fundamentals/code-analysis/overview) |
| Globalization | [Globalize app](https://learn.microsoft.com/windows/apps/design/globalizing/guidelines-and-checklist-for-globalizing-your-app) |
| x:Uid | [Localize strings](https://learn.microsoft.com/windows/apps/develop/ui-input/localizing-strings) |
