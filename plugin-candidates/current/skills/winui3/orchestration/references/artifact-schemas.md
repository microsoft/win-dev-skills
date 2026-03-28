# Artifact Schemas

Structured markdown templates used as handover documents between pipeline agents.
Each agent reads the previous agent's artifact and writes its own.

All artifacts are saved to `<project>/.winui-orchestration/`.

---

## 1. requirements.md (Analyzer → Designer, Architect)

```markdown
# Requirements: <App Name>

## Overview
- **Type**: [New app | Convert from <framework> | Add feature to existing]
- **Purpose**: <1-2 sentence description of what the app does>
- **Target users**: <Who uses this app>

## Brand Identity
- **App name**: <display name>
- **Accent/primary color**: <hex> (extracted from source app CSS/theme, or user-specified)
- **Secondary color**: <hex if applicable>
- **Logo/icon**: <path to source logo file, or description>
- **Custom fonts**: <font name if any, otherwise "Use system default">
- **Brand notes**: <any other visual identity to preserve>

## Features

### Feature 1: <Name>
- **What the user does**: <Step-by-step user workflow>
- **Data involved**: <What data is displayed, entered, stored, transmitted>
- **Integration points**: <Serial port, file system, network, database, etc.>

### Feature 2: <Name>
...

## Data Requirements
- **Input sources**: <Where data comes from>
- **Output targets**: <Where data goes>
- **Persistence**: <What needs to be saved between sessions>
- **Real-time data**: <Any live/streaming data?>

## Platform Opportunities
- <Windows-specific capabilities that would enhance the app>
- <e.g., notifications, startup tasks, file associations, share target>

## Constraints
- <Technical constraints, compatibility requirements>

## What NOT to Copy (for convert-app only)
- <Web-specific patterns from the source app that should NOT be reproduced>
- <Framework-specific UI paradigms that don't apply to Windows>
```

---

## 2. design-spec.md (Designer → Design Reviewer, Architect, Builder)

```markdown
# Design Specification: <App Name>

## Brand Identity
- **App name**: <display name>
- **Accent color**: <hex> (override SystemAccentColor in App.xaml)
- **Secondary color**: <hex if applicable>
- **Logo/icon**: <path to logo file, or description for generated icon>
- **Font**: <custom font name OR "Segoe UI Variable (system default)">
- **Brand notes**: <any other identity details — the app should feel like THEIR brand on Windows>

## Design Reference
- **Inspired by**: <Real Windows 11 app> (e.g., "layout like Dev Home")
- **Why this reference**: <brief rationale for why this Windows app is the right model>

## Window
- **Backdrop**: Mica
- **Title bar**: <Standard | Custom with ExtendsContentIntoTitleBar>
- **Default size**: <width>×<height>
- **Min size**: <width>×<height> (if applicable)

## Navigation
- **Pattern**: <NavigationView Left | NavigationView Top | TabView | Single page>
- **NavigationView mode**: <Left | LeftCompact | Top | Auto>
- **Pages**:
  1. <Page name> — <brief description>
  2. <Page name> — <brief description>
  ...
- **Settings**: <NavigationView footer gear icon → Settings page>

## Pages

### Page: <Name>
- **Layout**: <description — e.g., "fixed sidebar 320px + flexible main content">
- **Controls**:
  | Control | Type | Purpose | Data Binding |
  |---------|------|---------|-------------|
  | Device selector | ComboBox | Select serial device | VM.Devices → SelectedDevice |
  | Refresh | Button | Refresh device list | VM.RefreshCommand |
  ...
- **Data displayed**: <what appears on this page>
- **Wireframe**:
  ```
  ┌──────────────────────────────────────────┐
  │ [NavigationView]                         │
  │ ┌──────────┬─────────────────────────────┤
  │ │ Controls │ Main content area           │
  │ │ (320px)  │ (fills remaining space)     │
  │ │          │                              │
  │ │ [ComboBox]│ [Log panel - monospace]     │
  │ │ [Buttons]│ [ScrollViewer]              │
  │ └──────────┴─────────────────────────────┤
  └──────────────────────────────────────────┘
  ```

### Page: Settings
- **Layout**: Vertical stack with SettingsCards
- **Controls**:
  | Control | Type | Purpose |
  |---------|------|---------|
  | Theme | RadioButtons (Light/Dark/System) | App theme selection |

## Anti-Patterns to Avoid
- [ ] No centered floating cards — content fills the window
- [ ] No custom ControlTemplates for standard behaviors
- [ ] No theme toggles in the title bar
- [ ] No equal-width column splits unless both columns need equal space
```

---

## 3. design-review.md (Design Reviewer → Orchestrator)

```markdown
# Design Review: <App Name>

## Verdict: [APPROVED | NEEDS REVISION]

## Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Uses NavigationView or standard navigation | ✅/❌ | |
| 2 | Content fills the window (no centered cards) | ✅/❌ | |
| 3 | All controls are standard WinUI (no unnecessary custom templates) | ✅/❌ | |
| 4 | Theme selection in Settings page (not title bar) | ✅/❌ | |
| 5 | Column proportions are appropriate | ✅/❌ | |
| 6 | References a real Windows 11 app as design anchor | ✅/❌ | |
| 7 | No web-specific patterns | ✅/❌ | |
| 8 | Uses ThemeResource brushes (no hardcoded colors) | ✅/❌ | |
| 9 | Spacing on 4px grid | ✅/❌ | |
| 10 | Accessibility considerations noted | ✅/❌ | |

## Issues Found
1. **[ISSUE]**: <description>
   - **Recommendation**: <how to fix>
   
## Summary
<Brief assessment of design quality>
```

---

## 4. blueprint.md (Architect → Builder)

```markdown
# Technical Blueprint: <App Name>

## Project Setup
- **Template**: `dotnet new winui -n <AppName>`
- **Directory**: `<path>`
- **Target Framework**: net10.0-windows10.0.26100.0

## NuGet Packages
| Package | Purpose |
|---------|---------|
| CommunityToolkit.Mvvm | MVVM source generators |
| ... | ... |

## Project Structure
```
<AppName>/
├── Models/
│   └── <Model>.cs
├── ViewModels/
│   ├── MainViewModel.cs
│   └── <Page>ViewModel.cs
├── Views/
│   ├── MainWindow.xaml(.cs)
│   └── <Page>Page.xaml(.cs)
├── Services/
│   ├── I<Service>.cs
│   └── <Service>.cs
├── Converters/
├── Helpers/
└── App.xaml(.cs)
```

## MVVM Design

### ViewModels
| ViewModel | Page | Key Properties | Key Commands |
|-----------|------|---------------|-------------|
| MainViewModel | MainWindow | SelectedPage | NavigateCommand |
| <Page>ViewModel | <Page>Page | ... | ... |

### Services
| Interface | Implementation | Responsibility |
|-----------|---------------|---------------|
| INavigationService | NavigationService | Page navigation |
| ... | ... | ... |

### DI Registration
```csharp
// In App.xaml.cs
var services = new ServiceCollection();
services.AddSingleton<MainViewModel>();
// ...
```

## API Usage

### <API Name>
- **Namespace**: <namespace>
- **Key classes**: <classes>
- **Threading**: <UI thread / background thread requirements>
- **Sample reference**: <link to sample repo if applicable>
```csharp
// Usage pattern
```

## Data Flow
```
<describe how data moves through the app>
```

## Known Gotchas
1. <gotcha and workaround>
```

---

## 5. code-review.md (Code Reviewer → Orchestrator)

```markdown
# Code Review: <App Name>

## Verdict: [APPROVED | NEEDS FIXES]

## Issues

### Critical
1. **[file:line]** <description>
   - **Fix**: <recommended fix>

### Warning
1. **[file:line]** <description>
   - **Fix**: <recommended fix>

### Info
1. **[file:line]** <description>

## Checklist
| Category | Status | Notes |
|----------|--------|-------|
| MVVM compliance | ✅/❌ | |
| x:Bind usage | ✅/❌ | |
| Accessibility (AutomationProperties) | ✅/❌ | |
| No hardcoded colors/sizes | ✅/❌ | |
| No UI thread blocking | ✅/❌ | |
| No hardcoded secrets | ✅/❌ | |
| Error handling on async | ✅/❌ | |
| Clean build | ✅/❌ | |
| No unused code | ✅/❌ | |
| DRY compliance | ✅/❌ | |
```

---

## 6. test-report.md (Tester → Orchestrator)

```markdown
# Test Report: <App Name>

## Verdict: [PASS | FAIL]

## Screenshots
| # | Page/State | Screenshot | Status |
|---|-----------|-----------|--------|
| 1 | <Page> - default | <path> | ✅/❌ |
| 2 | <Page> - after action | <path> | ✅/❌ |

## Visual Validation
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Content fills window | ✅/❌ | |
| 2 | Navigation matches design spec | ✅/❌ | |
| 3 | Controls match specified types | ✅/❌ | |
| 4 | Spacing/alignment looks correct | ✅/❌ | |

## Functional Tests
| # | Test | Steps | Expected | Actual | Status |
|---|------|-------|----------|--------|--------|
| 1 | <test> | <steps> | <expected> | <actual> | ✅/❌ |

## Accessibility Spot-Check
| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | AutomationProperties on interactive elements | ✅/❌ | |
| 2 | Tab navigation works | ✅/❌ | |

## Blockers
1. **[BLOCKER]**: <description>
   - **Recommended fix**: <fix>

## Major Issues
1. **[MAJOR]**: <description>

## Minor Issues
1. **[MINOR]**: <description>
```
