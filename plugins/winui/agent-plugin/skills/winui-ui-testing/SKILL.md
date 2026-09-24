---
name: winui-ui-testing
description: "Automated UI testing for Windows desktop apps with WinApp CLI 0.7 — prefer Windows Sandbox when available, otherwise run locally unless Sandbox was explicitly requested. Use for WinUI 3, WPF, WinForms, and Win32 UI assertions, interactions, accessibility, screenshots, and recordings."
---

## Choose the execution target

Prefer **Windows Sandbox** for app UI testing when available. If it is unavailable, tell the user and test locally; if the user explicitly requested Sandbox, stop instead of falling back. Sandbox requires Windows 11 24H2+, Pro/Enterprise/Education (not Home), virtualization, and an enabled Windows Sandbox feature. **Ask the user** to enable the feature and restart; do not enable it or reboot for them. See [winui-setup](../winui-setup/SKILL.md).

Builds run on the host; app launch and `winapp ui --on sandbox` run in the guest. Preserve the target scope on **every** UI command, including those using a guest PID or picker HWND. A guest PID is not a host PID; rediscover it after guest recreation. Input/capture needs an unlocked host and a connected, nonminimized Sandbox client. A failed app build or UI assertion is not evidence that Sandbox is unavailable.

## Test the app

Prefer one batch of app-specific assertions over repeated interactive exploration. Use AutomationIds from the code you wrote; otherwise inspect the live tree and source for hidden dialogs/flyouts. Assert each requested behavior, not just that a command exited successfully. Check `winapp ui <verb> --help` for selectors and options.

For multi-step input, give cooperating commands the same `WINAPP_UI_WORKFLOW_ID`, a distinct ID for independent workflows, and `winapp ui yield --on sandbox` when finished. WinApp CLI arbitrates automatically; without an ID each command releases immediately, while the four-second grace with an ID only covers tight bursts. After a reasoning pause, inspect/reopen UI before acting.

Use `wait-for --value` for state, `--gone` for disappearance, and inspect **nested** interactive elements for missing AutomationIds. Capture and inspect screenshots after meaningful states: UIA cannot detect clipping, overlap, or incorrect theming. Fail on CLI errors, empty inspections, or undelivered evidence. Guest screenshots/recordings are delivered to host paths; check those files before claiming success.

**When writing a batch UI test script**, read [the tested template and scenario examples](references/batch-testing.md). It covers target-scoped launch/reuse, pickers, input, recordings, guest persistence, and structured pass/fail results. Do not load that reference for a quick lookup or a question about UI testing.
