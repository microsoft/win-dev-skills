---
name: winui3-best-practices
description: 'Code quality, accessibility, performance, security, localization, and design principles for WinUI 3 apps.'
---

# Best Practices

Apply these rules to every change you make.

## Accessibility
- Every interactive control must have `AutomationProperties.Name` or `AutomationProperties.LabeledBy`
- Add stable `AutomationProperties.AutomationId` on key interactive elements for UI automation
- Use semantic controls (`Button`, `HyperlinkButton`) — not clickable `Border`/`TextBlock`
- Ensure keyboard navigation: `TabIndex`, `AccessKey`, `KeyboardAccelerator`
- Don't rely on color alone to convey information

## Code Quality
- Remove unused `using` statements, commented-out code, unused variables after every edit
- File-scoped namespaces, `_camelCase` private fields, PascalCase for types/methods/properties
- `Async` suffix on async methods, `Is/Has/Can` prefix on booleans
- File order: usings → namespace → type → constants → fields → constructors → properties → public methods → private methods → events

## Design Principles
- **DRY** — search for existing code before writing new; refactor duplication immediately
- **KISS** — simplest solution that works; split methods > 30 lines, split classes doing multiple things
- **SRP** — ViewModels for UI state/commands, Services for business logic, Models for data
- **YAGNI** — no speculative abstractions or "future-proofing"
- ❌ Copy-paste across files, large "Manager" classes, `NotImplementedException` in overrides

## Performance
- `x:Bind` over `{Binding}` — compiled bindings are faster
- Heavy work off UI thread: `Task.Run` for CPU, `async/await` for I/O
- Virtualization for long lists — never use `StackPanel` with hundreds of items
- ❌ `.Result` / `.GetAwaiter().GetResult()` — blocks the UI thread
- ❌ Creating `HttpClient` per request — use `IHttpClientFactory` or a singleton
- ❌ Flooding `DispatcherQueue.TryEnqueue` in tight loops

## Security
- Never hard-code secrets — use environment variables, Credential Manager, or Key Vault
- Validate and sanitize all external input
- Least privilege: only request necessary capabilities in `Package.appxmanifest`
- HTTPS/TLS for all network calls; never disable certificate validation
- ❌ Secrets in `appsettings.json` or source control
- ❌ `Process.Start` with unsanitized user input