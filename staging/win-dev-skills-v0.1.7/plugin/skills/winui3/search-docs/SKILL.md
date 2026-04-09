---
name: search-docs
description: Searches Windows App SDK resources including API specs, Windows AI docs, official samples, and troubleshooting notes. Use when implementing new features, looking up API contracts, finding code examples, or debugging issues in WinUI 3 C# projects.
---

# Search Windows App Development Resources

Searches the **Microsoft/WindowsAppSdkResources** GitHub repository for specifications, samples, documentation, and troubleshooting information relevant to WinUI 3 C# development.

## When to Use This Skill

- Before implementing a new WinUI 3 feature (search specs + samples first)
- When looking up Windows App SDK API contracts or behavior
- When troubleshooting build or runtime errors
- When working with Windows AI / ML features

## Resource Categories

| Category | Description |
|----------|-------------|
| `WindowsAppSDK-specs` | API specifications and design documents |
| `Windows-AI-Docs` | Windows AI and ML feature documentation |
| `WindowsAppSDK-Samples` | Official code samples and examples |
| `trouble-shooting-notes` | Known issues and solutions |

## Environment Detection

| Context | Detection | Search Method |
|---------|-----------|---------------|
| **VS Code** | `workspace_info` present | Local workspace search (if folder added) |
| **CLI** | No `workspace_info` | GitHub MCP `search_code` + `git sparse-checkout` |

---

## VS Code Context

### Prerequisites

Ensure the WindowsAppSdkResources folder is added to the workspace first.

### Search Patterns

| Category | Pattern |
|----------|---------|
| `WindowsAppSDK-specs` | `**/WindowsAppSDK-specs/{version}-stable/**` |
| `Windows-AI-Docs` | `**/Windows-AI-Docs/**` |
| `WindowsAppSDK-Samples` | `**/WindowsAppSDK-Samples/{version}-stable/**` (fallback: `main`) |
| `trouble-shooting-notes` | `**/trouble-shooting-notes/**` |

⚠️ **Do NOT prefix** with `**/WindowsAppSdkResources/...` — VS Code doesn't recognize the root folder name in search patterns.

---

## CLI Context

Use a two-step approach: **discover** with GitHub MCP `search_code`, then **read** with `git sparse-checkout`.

### ⚠️ Why Not `get_file_contents`?

The `microsoft/WindowsAppSdkResources` repo enforces SAML SSO. The `get_file_contents` tool returns 403 for most tokens. Use `search_code` (unaffected) and `git clone --sparse` (public access) instead.

### Step 1: Discover Files

```
repo:microsoft/WindowsAppSdkResources path:WindowsAppSDK-specs/{version}-stable/ {search terms}
```

```
repo:microsoft/WindowsAppSdkResources path:WindowsAppSDK-Samples/{version}-stable/ {search terms}
```

```
repo:microsoft/WindowsAppSdkResources path:Windows-AI-Docs/ {search terms}
```

```
repo:microsoft/WindowsAppSdkResources path:trouble-shooting-notes/ {search terms}
```

If no results for `{version}-stable`, retry with `path:WindowsAppSDK-Samples/main/`.

### Step 2: Read with Sparse Checkout

```powershell
$tempDir = Join-Path $env:TEMP "WindowsAppSdkResources"
if (-not (Test-Path $tempDir)) {
    git clone --depth 1 --filter=blob:none --sparse https://github.com/Microsoft/WindowsAppSdkResources.git $tempDir
}

Push-Location $tempDir
git sparse-checkout add WindowsAppSDK-Samples/{version}-stable/{SampleName}
Pop-Location

Get-Content "$tempDir\WindowsAppSDK-Samples\{version}-stable\{SampleName}\{FileName}"
```

### CLI Search Tips

- Use **specific, targeted queries** — avoid combining too many keywords with path filters
- Search with **path filter first** to discover what's available, then narrow down
- Include **API names, class names, or error codes** for best results
- The sparse-checkout temp directory is **reusable** across searches

---

## Version Selection

Match search version to the project's Windows App SDK NuGet package version:

| Package Version | Search Version |
|-----------------|----------------|
| 1.7.x | `1.7-stable` |
| 1.8.x | `1.8-stable` |
| 2.0.x | `2.0-stable` |

## Workflow

1. Identify the feature or error to research
2. Determine SDK version from the project's NuGet package reference
3. Search specs first for API documentation
4. Search samples for implementation examples
5. Read and apply relevant code patterns
