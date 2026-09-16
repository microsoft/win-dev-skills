# Platform semantic differences

Use these families to accelerate review after defining the source contracts. They are not recipes, an exhaustive checklist, or proof of coverage. When none applies, continue with the semantic migration protocol.

## Lifetime and ownership

UWP APIs can imply ownership by the current view, `CoreWindow`, frame, package activation, or framework lifetime. WinUI 3 desktop code may require an explicit `Window`, HWND, dispatcher queue, app-owned lifetime, or packaged/unpackaged distinction. Trace the value to every consumer and preserve cleanup and re-entry behavior.

## Threading and asynchronous transitions

Framework events and delegates may not propagate `Task` completion. Preserve ordering, exceptions, cancellation, and visual-tree lifetime through an async-capable app-owned boundary. Fire-and-forget work is valid only when it is intentionally independent, observes failures, and cannot race navigation, overlay removal, or disposal.

## XAML resources and binding

Equivalent type names do not guarantee equivalent resource lookup, dependency-property metadata, binding defaults, generated event signatures, theme behavior, or control templates. Verify the effective runtime value and user-visible state rather than only converted markup.

A custom template whose target is a framework-owned control depends on that framework's template contract, not only on its public control type. When the active sentinel reaches such a control, inspect the template root, presenters, named parts, resources, and selection assumptions actually consumed by the source behavior. If those internals are not valid on the target, retain the target framework's template contract and reapply only the source-visible customization needed for the invariant. Do not discard a compatible custom template preemptively or preserve an incompatible source visual tree solely because it compiles.

## Collections, selection, and input

WinRT collections, .NET collections, change notification, selected-item identity, focus, keyboard modifiers, pointer input, and UI Automation can differ across framework boundaries. Preserve the source state transition and event ordering, not merely the destination control.

When a navigation surface mixes stable destinations with transient documents, configuration sessions, or other dynamically removed state, decide its target representation before porting the source collection mutation. Treat add, select, navigate, cancel or close, remove, reopen, collection ownership, selected-item identity, and visual-tree removal as one lifetime contract. Use mutable target navigation topology only when the target control can own that full lifecycle without stale selection, generated-binding type conflicts, re-entry, or teardown races. Otherwise keep stable destinations in the navigation control and host transient state behind a target-owned frame, overlay, document host, or equivalent boundary. The representation may differ from the source without becoming a fallback when it preserves the same observable navigation behavior.

## Activation, windows, and deployment

Use the report's `activationAnalysis` as the source manifest contract and mechanical target-declaration evidence. Follow [Activation contracts](activation-contracts.md) for protocol and file activation. Notifications, background work, app services, secondary windows, and package identity still have desktop-specific entry paths and lifetime semantics. A normal primary-window launch or a mechanically verified manifest declaration does not verify these contracts.

## Media, composition, and hosted controls

Media, WebView/editor hosts, composition surfaces, and other native-backed controls often combine package dependencies with thread, lifetime, and teardown contracts. A replacement must preserve the consumed callbacks, content/state synchronization, and disposal order. Disabling the feature or providing a type-shaped host is not equivalence.
