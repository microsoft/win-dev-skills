---
name: check-env
description: Validates the development environment for WinUI 3 C# apps. Use when creating a new project, troubleshooting build failures, or setting up a new machine. Checks Windows 10 1903+, .NET SDK 10.0+, winapp CLI, and raka CLI availability.
---

# Check Prerequisites for WinUI 3 Development

Validates the minimum environment prerequisites for building WinUI 3 C# apps with the Windows App SDK.

## When to Use This Skill

- Before creating a new WinUI 3 application
- When troubleshooting build failures or missing dependencies
- When setting up a new development machine
- After Windows or .NET SDK updates

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| Windows | 10 version 1903 (build 18362) or later |
| .NET SDK | 10.0 or later |

> **Note:** Visual Studio is **not** required for C# WinUI 3 projects. The .NET SDK plus `winapp` and `raka` handle everything.

## AI Agent Instructions

**IMPORTANT: Execute the provided PowerShell script. Do NOT write your own checking logic.**

### Step 1: Execute the Script

```powershell
pwsh -ExecutionPolicy Bypass -File "<path-to-this-skill-folder>\scripts\check-prerequisites.ps1"
```

Replace `<path-to-this-skill-folder>` with the actual path to the folder containing this SKILL.md file.

### Step 2: Interpret Results

| Exit Code | Action |
|-----------|--------|
| `0` | Prerequisites satisfied — proceed with the next workflow step. |
| `1` | Prerequisites failed — report the `[FAIL]` lines to the user and **stop**. |

### Step 3: Report Failures

| Failed Check | User Action |
|--------------|-------------|
| Windows version too old | Upgrade to Windows 10 1903 or later |
| .NET SDK not found | Install .NET SDK 10.0 from https://dot.net/download |
| `winapp` not on PATH | Install the winapp MSIX package |
| `raka` not on PATH | Install the raka MSIX package |

## Script Parameters

| Parameter | Description |
|-----------|-------------|
| `-Quiet` | Only prints failures/warnings and the final result |
| `-PassThru` | Returns a PowerShell object with detailed results |
