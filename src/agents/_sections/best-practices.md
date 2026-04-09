### Accessibility
- Every interactive control must have `AutomationProperties.Name` or `AutomationProperties.LabeledBy`
- Add stable `AutomationProperties.AutomationId` on key interactive elements for UI automation
- Use semantic controls (`Button`, `HyperlinkButton`) — not clickable `Border`/`TextBlock`
- Ensure keyboard navigation: `TabIndex`, `AccessKey`, `KeyboardAccelerator`
- Don't rely on color alone to convey information

### Code Quality
- Remove unused `using` statements, commented-out code, unused variables after every edit
- File-scoped namespaces, `_camelCase` private fields, PascalCase for types/methods/properties
- `Async` suffix on async methods, `Is/Has/Can` prefix on booleans

### Design Principles
- **DRY** — search for existing code before writing new; refactor duplication immediately
- **KISS** — simplest solution that works; split methods > 30 lines
- **SRP** — ViewModels for UI state/commands, Services for business logic, Models for data
- **YAGNI** — no speculative abstractions or "future-proofing"

### Performance
- `x:Bind` over `{Binding}` — compiled bindings are faster
- Heavy work off UI thread: `Task.Run` for CPU, `async/await` for I/O
- Virtualization for long lists — never use `StackPanel` with hundreds of items
- ❌ `.Result` / `.GetAwaiter().GetResult()` — blocks the UI thread

### Security
- Never hard-code secrets — use environment variables, Credential Manager, or Key Vault
- Validate and sanitize all external input
- ❌ Secrets in `appsettings.json` or source control
- ❌ `Process.Start` with unsanitized user input