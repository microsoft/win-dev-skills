---
name: fix-errors
description: Workflow for diagnosing and fixing errors in WinUI 3 C# apps. Use when encountering build failures, runtime crashes, HRESULT errors, XAML parsing issues, package registration problems, unexpected behavior, or visual/UI bugs (content not visible, blank areas, wrong colors, missing text, layout broken). Also use when the user reports something looks wrong, is missing, or doesn't work as expected. Searches known issues, applies targeted fixes, and verifies by rebuilding.
---

# Workflow: Troubleshooting WinUI 3 C# Apps

**Trigger:** User encounters errors or issues during WinUI 3 development.

## When to Use This Skill

- Build errors, runtime crashes, or unexpected behavior
- HRESULT codes, MSBuild failures, or XAML parsing issues
- Package registration or deployment fails
- App doesn't run correctly after code changes
- **Visual/UI bugs** — content not visible, layout broken, blank areas, wrong colors, theme-related rendering issues (e.g., dark mode text invisible on print preview)
- User says "fix this error", "why is my build failing", "debug this crash"
- User reports something "doesn't look right", "is blank", "can't see the text", or similar visual issues

## Steps (add each step to TODO list before starting)

### Step 1: Check Prerequisites

Follow the instructions in [check-env skill](../check-env/SKILL.md) to verify the environment.

### Step 2: Search Known Issues

Search for a known fix in order — stop as soon as one gives a clear answer:

1. **Past feedback** — `grep "Keywords:.*<error-code-or-symptom>" FEEDBACK.md .feedback-session.md`
2. **Troubleshooting notes** — follow [search-docs skill](../search-docs/SKILL.md) with category `trouble-shooting-notes`
3. **GitHub issues** — search `microsoft/WindowsAppSDK` repository

If a fix is found, apply it and skip to Step 4. If none found, proceed to Step 3.

### Step 3: Diagnose and Apply Fixes

Based on the error type:

| Error Type | Action |
|------------|--------|
| Build errors (CS*) | Check MSBuild output, verify NuGet packages, check `using` statements |
| Runtime crashes | Check `App.xaml` / `App.xaml.cs` startup, verify manifest, check unhandled exceptions |
| XAML parsing | Verify XAML syntax, check `x:Bind` path expressions, validate resource dictionaries |
| Visual/UI bugs | Check theme inheritance (dark mode foreground on white print preview), verify explicit colors on theme-independent surfaces (print, export, image render) |
| Package identity | Run `winapp init --use-defaults` if not already done |
| NuGet restore | Run `dotnet restore`, check `nuget.config` sources |
| Missing SDK | Re-run [check-env skill](../check-env/SKILL.md) |

### Step 4: Rebuild and Verify

```powershell
dotnet run -c Debug
```

After successful launch, verify with `raka`:

```bash
raka status --app <AppName>
raka screenshot -f fix-verify.png
```

### Step 5: MANDATORY — Log Feedback

⚠️ **DO NOT mark `log-feedback` as done without actually invoking the [log-feedback skill](../log-feedback/SKILL.md) and writing to `.feedback-session.md` on disk.**

Follow the [log-feedback skill](../log-feedback/SKILL.md) to log every error encountered and its resolution. If nothing went wrong, still create `.feedback-session.md` with a `# Session Feedback` header — the reflection step needs it.

#### 5.1 Verify .feedback-session.md Written (`verify-feedback`)

**Run this command now and paste the output before marking `verify-feedback` done:**

```powershell
Test-Path (Join-Path (Get-Location).Path ".feedback-session.md")
```

- Output is `True` → mark `verify-feedback` done, proceed to reflection
- Output is `False` → **STOP. Go back to Step 5 and write .feedback-session.md now. Do not proceed.**

### Step 6: Reflection and Session Close

Follow the [reflect-session skill](../reflect-session/SKILL.md) to review session feedback, merge valuable entries to `FEEDBACK.md`, and optionally report issues.

---

## Common Error Reference

### HRESULT Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 0x80070005 | Access denied | Check permissions, run as admin |
| 0x80070002 | File not found | Verify paths, check assets |
| 0x80073CF6 | Package install failed | Check manifest, re-register with `winapp init` |
| 0x8007000B | Bad image format | Check platform target (x64/x86/arm64) |

### Build Errors

| Error | Cause | Solution |
|-------|-------|----------|
| CS0234 | Missing namespace | Add `using` directive or NuGet package reference |
| CS0103 | Name doesn't exist in context | Check spelling, add reference |
| CS0246 | Type not found | Add missing NuGet package (`dotnet add package`) |
| NETSDK1004 | Assets file not found | Run `dotnet restore` |
| NU1101 | Package not found | Check `nuget.config` sources, verify package name |

### XAML Errors

| Error | Cause | Solution |
|-------|-------|----------|
| XLS0414 | Type not found in XAML | Add `xmlns` namespace declaration |
| XDG0062 | Binding path not found | Verify `x:Bind` property exists on ViewModel |
| XLS0504 | Duplicate resource key | Remove duplicate `x:Key` entries in ResourceDictionary |

---

## Success Criteria

1. Prerequisites verified
2. Known issues searched in resources and documentation
3. Appropriate fix applied based on error analysis
4. Rebuild successful with no remaining errors
5. App functionality verified with `raka screenshot`
