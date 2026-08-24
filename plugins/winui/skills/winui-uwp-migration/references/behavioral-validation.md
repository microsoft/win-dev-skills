# Behavioral validation

Use this protocol to preserve observable behavior across the UWP-to-WinUI migration. It orchestrates existing tools; do not create helper scripts, temporary test projects, or app-specific CLI extensions.

## 1. Plan evidence by behavior

After reading `migration-report.json` and the source, create a compact state plan:

- startup and initial navigation;
- each distinct top-level feature path;
- states that exercise migration-sensitive TODOs, bindings, data loading, selection, dialogs, or window-dependent behavior;
- protocol, file, toast, or command-line activation; suspend/resume and lifecycle transitions; background tasks; and secondary windows when the source uses them;
- user-provided critical flows.

Capture one state per distinct outcome or migration risk. Do not capture every data item, repeated control, or equivalent permutation. Before source capture, persist the plan at the path declared by `migration-report.json` (`<target>/.migration-evidence/state-plan.json`). Store runtime evidence under the report's source and target evidence roots. Do not treat these files as application source or commit them unless the user requests it.

Use this durable shape so later steps replay the same plan rather than reconstructing it from conversation context:

```json
{
  "schemaVersion": "1.0",
  "states": [
    {
      "id": "stable-state-id",
      "featurePaths": ["feature-or-flow"],
      "todoIds": ["UWMIG000"],
      "preconditions": ["required initial state"],
      "actions": ["ordered semantic action"],
      "expectedOutcome": "observable source behavior",
      "source": {
        "status": "not-run",
        "evidence": [],
        "reason": null
      },
      "target": {
        "status": "not-run",
        "evidence": [],
        "reason": null
      },
      "comparison": {
        "status": "not-run",
        "reason": null
      }
    }
  ]
}
```

Update this file after every attempted source capture, target replay, and comparison. Evidence entries are paths relative to `<target>`; do not encode screenshots, UI trees, or logs into the plan.

For each state, set `source.status` to `captured`, `blocked`, or `unverified`; set `target.status` to `passed`, `blocked`, `unverified`, or `failed`; and set `comparison.status` to the final `verified`, `blocked`, `unverified`, or `failed` classification below. Keep `not-run` only until that phase is attempted, and provide `reason` for every status other than `captured`, `passed`, or `verified`.

For each state-changing behavior, plan a transition rather than only a destination: capture or inspect the relevant before state, perform the semantic action, and verify the changed value, selection, collection, navigation state, or visible content afterward. Include cancel/back restoration and alternate modifier-key paths when they produce different source behavior. A reachable destination page without the action and its observable result does not verify that behavior.

For each visual runtime state captured by the agent, retain:

1. ordered semantic actions;
2. a screenshot;
3. a JSON UI tree;
4. the related migration TODOs or feature paths.

For a non-visual state, retain its trigger, expected outcome, observable runtime evidence, and related TODOs. User-provided screenshots or recordings can replace agent-captured source evidence only when the actions and expected outcome are known; otherwise classify the state as `unverified`.

## 2. Capture the original UWP app

Prefer user-provided baseline evidence when it already covers the state plan. Otherwise:

1. Capture the pre-launch window inventory in its own command, retaining only `hwnd`, `processId`, `title`, and `className`. Then launch the source project in a separate command with `winapp run "<source.csproj>" --arch <current-architecture> --detach --json`. Do not place the post-launch inventory after `winapp run` in the same shell command or echo full before/after inventories through the tool output channel. Project mode owns legacy UWP build-tool selection, installed-SDK retargeting, unsigned loose-layout generation when only a development certificate is missing, framework dependency registration, and AUMID activation.
2. If project mode reports a build failure, use its structured diagnostics to identify any remaining environmental prerequisite. Do not manually reproduce its MSBuild selection, SDK retargeting, signing bypass, dependency registration, or loose-layout logic. Make another attempt only when the diagnostic identifies a distinct, actionable prerequisite; never edit the source project for baseline capture.
3. Treat a successfully compiled and registered source that fails activation as a runtime failure, not a build failure. Retain deployment and activation diagnostics, then make one diagnostic launch without the incompatible `--detach` and `--json` options:

   ```powershell
   winapp run "<source.csproj>" --arch <current-architecture> --debug-output
   ```

   If a Debug-only framework startup failure is plausible, make at most one Release build and launch attempt. After this bounded recovery pass, record affected states as `unverified` rather than entering a launch-repair loop.
4. Independently poll `winapp ui list-windows --json` and the returned source PID at short intervals for at most 10 seconds. Emit only newly observed candidate windows rather than the full desktop inventory. A UWP top-level window may belong to `ApplicationFrameHost` instead of the PID returned by `winapp run`; identify it by the before/after HWND difference, title, and timing, then use its HWND for all capture and interaction commands. A newly observed usable source window proves activation succeeded even if the launch tool call or its output transport is still pending; stop waiting for that call and continue source capture. Persist the source PID and HWND as soon as either becomes available so cleanup does not depend on later tool output.

Capture a state with the HWND:

```powershell
winapp ui inspect -w <hwnd> -d 8 --json |
    Set-Content -Encoding utf8 "<target>\.migration-evidence\source\<state-id>-ui.json"
winapp ui screenshot -w <hwnd> --focus --json `
    -o "<target>\.migration-evidence\source\<state-id>.png"
winapp ui invoke "<semantic-name>" -w <hwnd> --json
```

After every action, inspect again and confirm that the expected state was reached before taking its screenshot. For target replay, use the same filenames under `<target>\.migration-evidence\target`. Prefer visible semantic names for action selectors because they can survive framework-specific AutomationId changes.

If a known, unmet external prerequisite such as permissions, data, hardware, or credentials prevents a state from running, classify that state as `blocked`. Use `unverified` only after the bounded capture or comparison process finishes without usable evidence and no specific outstanding prerequisite remains. Do not use the statuses interchangeably or silently replace the state with a different behavior.

After the last source state, inspect the source HWND for its title-bar Close element, invoke that element, and confirm the HWND is no longer listed:

```powershell
winapp ui invoke "Close" -w <source-hwnd> --json
winapp ui list-windows --json
```

If that window does not expose a UIA Close element, stop only the exact source PID returned by `winapp run`. If structured launch output was unavailable after a window appeared, resolve one exact source PID by matching all of the source executable path, a start time after the launch attempt began, and the newly observed HWND's package/window timing; do not act when that identity is ambiguous. Confirm both the PID and HWND disappeared. Never stop `ApplicationFrameHost` or clean up by a broad process name: it can own unrelated UWP windows. Perform this cleanup immediately after source capture, including when launch output remains pending or a planned source state fails, so a later migration timeout cannot leave the source app open. Do not inspect or edit target files until this confirmation succeeds or the cleanup failure is explicitly recorded.

## 3. Replay against WinUI 3

After the analyzer-enabled build succeeds, launch the existing target output through project mode without rebuilding:

```powershell
winapp run "<target.csproj>" --no-build --detach --json
```

This is the only permitted first target launch after a successful build. Do not call `BuildAndRun.ps1`, `dotnet build`, or `winapp run` without `--no-build` at this gate. Pass the same `--configuration` and `--arch` used by the build when they differ from the defaults. Never launch the packaged executable directly. If the detached app exits or turns blank, rerun it in the foreground to collect startup and crash diagnostics:

```powershell
winapp run "<target.csproj>" --no-build --debug-output
```

After the detached launch, poll the returned PID, window list, and any existing app startup log at short intervals for at most 10 seconds. Stop as soon as the process exits or a usable window appears; do not add an unconditional ten-second sleep. If the process and window remain healthy, continue with UI inspection and do not also run `--debug-output`.

Use `--debug-output` once only when the detached process exits, produces a blank/unusable window, or never exposes a usable window. Record a crash signature consisting of the exception or HRESULT, the first app-owned stack frame, and the WinUI triage verdict. Follow the CLI verdict before forming another hypothesis. In particular, a resource-property-resolution verdict is actionable migration evidence; do not begin XAML subtree deletion while that diagnostic remains unresolved.

When the target exits only while a semantic action is driven through `winapp ui invoke`, or the native crash stack is dominated by `UIAutomationCore` without an app-owned frame, test the same control once with `winapp ui click` after a clean launch. This comparison distinguishes an application-path failure from an automation-sensitive transition; it does not waive the required semantic action. If `invoke` fails while pointer input succeeds, inspect the invoked control's handler and its complete downstream path for overlapping fire-and-forget tasks, reentrant navigation, frame replacement, overlay removal, or disposal of the invoked element while the UI Automation call is still returning. Serialize and await the app-owned transition, prevent re-entry, and remove or replace visual-tree elements only after the action and required exit transition complete. Do not treat `UIAutomationCore`, composition, or media frames as the root cause merely because they are the first named native subsystem.

After correcting an automation-sensitive transition, replay it once through `invoke` and once through pointer input, then verify the destination state instead of relying on process survival. If both input paths fail, continue from their crash signatures as an application-path defect. If the signature changes, discard the prior root-cause hypothesis and classify the new signature independently; do not keep editing the subsystem named by an obsolete stack.

Group all locations explained by one signature into one correction. For the same signature, allow at most two correction-and-probe cycles. Each cycle must state one root-cause hypothesis that the next detached probe can disprove. If the signature is unchanged after the second cycle, stop speculative edits and retain the failure evidence instead of entering an unbounded build/run loop. Do not launch a subagent to reinterpret the same local stack and files.

Only when mechanical verification, build diagnostics, WinUI triage, resource resolution, and generated XAML provide no actionable cause may you bisect XAML. Bisect by disabling approximately half of one root subtree per probe, change only that dimension, and record the changed scope and resulting signature. Stop after four probes. Restore the complete page before applying the root-cause fix; stripped or placeholder XAML is diagnostic evidence, never the migrated result.

Use the returned PID with `winapp ui`; if more than one window is returned, select the intended HWND for each state rather than assuming one window covers the whole plan.

Replay the same ordered semantic actions and capture the same states under the target evidence directory. If a source semantic name is ambiguous or changed intentionally, inspect the target tree and use its AutomationId for target-local precision. Record the mapping instead of changing the source baseline.

Reuse the running app while replaying states. Restart only when a state explicitly depends on clean startup, prior actions cannot be reversed, or a correction requires a new process. Do not collect another foreground diagnostic run for a signature already recorded.

Replay nonstandard activation, lifecycle, background, and multi-window states with the same existing OS or deployment mechanism used for the source. Apply the same `blocked` versus `unverified` rule when the environment cannot trigger or observe one of these states; a normal launch does not verify it.

After the last target state, close the exact target HWND the same way and confirm it disappeared. This also lets a foreground `winapp run --debug-output` invocation finish instead of leaving a live diagnostic session.

If the workflow must stop before all states pass, restore complete source-preserving UI and persist the latest truthful build/runtime result and state classifications before ending. A documented failed or unverified state is preferable to leaving a temporary diagnostic layout or claiming unverified parity.

## 4. Compare semantically

For every source/target state pair, verify:

- the action succeeded and reached the intended state;
- state-changing actions produced the expected changed value, selection, collection, navigation state, or visible result;
- expected navigation, text, controls, data, selection, status, and user-visible outcomes are present;
- content order and relative layout remain usable;
- no content is missing, blank, unintentionally hidden, clipped, or replaced by template UI;
- any intentional difference is supported by the migration design or platform behavior.

Use screenshots as semantic visual evidence, not as a raw pixel threshold. UWP and WinUI 3 can differ in theme, window size, default styles, spacing, rasterization, and item density while preserving behavior. Normalize window size and theme when practical, but do not hide legitimate platform differences or fail parity solely because pixels differ.

## 5. Apply the completion gate

Classify each planned state:

- `verified`: the required source evidence for that visual or non-visual state exists, target replay succeeded, and semantic comparison passed;
- `blocked`: an identified external prerequisite prevented capture or replay;
- `unverified`: no usable source evidence exists or the comparison could not be completed;
- `failed`: replay or comparison exposed a regression.

A target process crash, app-owned exception, visual-tree race, or broken navigation transition is `failed`, not `blocked`. Use `blocked` only for a prerequisite outside the migrated app that the workflow cannot satisfy, such as unavailable hardware, credentials, permissions, or external data.

A TODO may be resolved when its implementation is complete and successful target evidence establishes the required outcome against unambiguous source semantics. If paired source runtime evidence is missing, keep `validation.parityStatus` unverified even when such a TODO is resolved. Keep the TODO pending when the source behavior or mapping is ambiguous, implementation is incomplete, a fallback was used, or target replay is blocked or failed. Build success, process launch, or a target-only screenshot is not parity evidence.

When finalizing `migration-report.json` 1.2, keep `validation.statePlan` and both `evidenceRoot` values unchanged, list attempted state IDs in each phase, and summarize the plan as follows:

- `sourceBaseline.status`: `captured` when every source state has usable evidence, `partial` when only some do, or `unverified` when none do;
- `targetReplay.status`: `passed` when every target state succeeds, `partial` when at least one is blocked or unverified, or `failed` when any state fails;
- `parityStatus`: `verified` when every planned comparison is verified, `partial` when verified states coexist with blocked or unverified states, `unverified` when no paired comparison can be completed, or `failed` when any comparison fails.

Set each phase and overall `reason` to a concise explanation whenever its status is not the successful first value.
