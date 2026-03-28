---
name: microsoft-docs
description: 'Search official Microsoft documentation for WinUI 3, Windows App SDK, .NET, and Windows API reference. Use when looking up API signatures, finding code samples, verifying method names, or troubleshooting SDK errors. Prevents hallucinated API names and outdated patterns.'
---

# Microsoft Docs — Official API & Documentation Search

This plugin includes the Microsoft Learn MCP Server, which gives you direct access to official Microsoft documentation. Use it instead of guessing API names or relying on training data.

## Available MCP Tools

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| `microsoft_docs_search` | Search Microsoft Learn documentation | Finding API classes, methods, concepts, tutorials, configuration |
| `microsoft_docs_fetch` | Fetch a full documentation page as markdown | Getting complete API reference, all method overloads, full tutorials |
| `microsoft_code_sample_search` | Search official code samples | Finding working patterns before implementing, verifying your approach |

## When to Use

**ALWAYS use before implementing an unfamiliar API.** This replaces the "web search" step in the sample-first rule.

| Scenario | Tool | Example Query |
|----------|------|---------------|
| Verify a WinUI 3 class exists | `microsoft_docs_search` | `"AppNotificationManager Windows.UI.Notifications"` |
| Find method signature | `microsoft_docs_search` | `"NavigationView SelectionChanged event WinUI"` |
| Get full API reference | `microsoft_docs_fetch` | Fetch URL from search result |
| Find working code sample | `microsoft_code_sample_search` | `query: "winui3 NavigationView", language: "csharp"` |
| Troubleshoot build error | `microsoft_docs_search` | `"HRESULT 0x80070005 Windows App SDK"` |
| Check if API exists in SDK version | `microsoft_docs_search` | `"Windows App SDK 1.6 new APIs"` |
| Look up WinUI 3 control usage | `microsoft_docs_search` | `"NumberBox SpinButtonPlacementMode WinUI"` |
| Find .NET async patterns | `microsoft_docs_search` | `"DispatcherQueue TryEnqueue WinUI desktop"` |

## Query Tips

```
# ❌ Too vague — returns too many results
"WinUI controls"

# ✅ Specific — gets the right page
"NumberBox SpinButtonPlacementMode WinUI 3"
"AppNotificationBuilder add text image button"
"ContentDialog XamlRoot WinUI 3 desktop"
"System.IO.Ports SerialPort async ReadLineAsync"
```

Include:
- **Namespace** for precision (`Windows.UI.Notifications`, `Microsoft.UI.Xaml.Controls`)
- **Control or class name** (`NavigationView`, `AppWindow`, `MediaPlayerElement`)
- **Specific property or method** (`SelectionChanged`, `UploadAsync`, `TryEnqueue`)

## CLI Fallback

If the MCP tools are not available, use the CLI:
```powershell
npx @microsoft/learn-cli search "WinUI 3 NavigationView SelectionChanged"
npx @microsoft/learn-cli code-search "winui3 file picker" --language csharp
npx @microsoft/learn-cli fetch "https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview"
```
