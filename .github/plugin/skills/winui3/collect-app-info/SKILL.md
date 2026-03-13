---
name: collect-app-info
description: Collects application metadata required for creating WinUI 3 C# apps, including app name, publisher, description, and target directory. Use when gathering requirements before project scaffolding.
---

# Get App Metadata for WinUI 3 App Creation

Collects essential metadata needed to create a new WinUI 3 C# desktop application.

## When to Use This Skill

- Before creating a new WinUI 3 application
- When the agent needs app name, publisher, or target directory
- User provides partial metadata and remaining fields need collecting or inferring

## Required Information

| Field | Description | Example |
|-------|-------------|---------|
| **App Display Name** | User-facing name of the application | `WeatherApp` |
| **Publisher** | Company or individual name | `WeatherCorp` |
| **Description** | Brief description of the app | `A weather application` |
| **Target Directory** | Absolute path where app will be created | `C:\Projects\WeatherApp` |

## Inference Rules

Apply these rules **before** asking follow-up questions:

1. **Parse the conversation** for publisher, description, or directory hints — treat them as answers even if phrased casually
2. **Resolve relative paths** — if user says "use my current directory", resolve to the actual absolute path
3. **Acknowledge descriptions** — when user describes app purpose in prose ("capture photos"), suggest a generic description
4. **Don't re-ask** unless info is contradictory or ambiguous; acknowledgments like "sounds good" count as confirmations

## Default Values

| Field | Default |
|-------|---------|
| Publisher | `TestDeveloper` |
| Description | Derived from user's request |
| Target Directory | `$PWD\{AppName}` |

## Autopilot Mode

| Mode | Can Ask Questions? | Detection |
|------|-------------------|-----------|
| **VS Code** | Yes | `workspace_info` present |
| **CLI Interactive** | Yes | `askQuestions` tool available |
| **CLI Autopilot** | No | `askQuestions` tool not available |

### Autopilot Behavior (no `askQuestions` tool)

- Do NOT ask questions or wait for confirmation
- Apply inference rules aggressively and use defaults
- Log the resolved metadata summary to terminal and proceed immediately

## Interaction Example

```
User: Create an app named WeatherApp published by WeatherCorp.

AI: I'll create a new WinUI 3 app. I already have:
- App display name: WeatherApp
- Publisher: WeatherCorp

I still need:
1. Application description (Suggestion: "A weather application")
2. Target directory (Suggestion: "<current-directory>/WeatherApp")

User: Description is ok. Put it in ./src/WeatherApp

AI: Got it:
- App display name: WeatherApp
- Publisher: WeatherCorp
- Description: A weather application
- Target directory: <absolute-path>/src/WeatherApp

Proceeding with project creation.
```

## Path Resolution

- **VS Code**: Use the current workspace folder as base for relative paths
- **CLI**: Use `$PWD` as base for relative paths
- Always resolve to an absolute path before proceeding
