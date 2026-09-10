# Platform semantic differences

Use these families to accelerate review after defining the source contracts. They are not recipes, an exhaustive checklist, or proof of coverage. When none applies, continue with the semantic migration protocol.

## Lifetime and ownership

UWP APIs can imply ownership by the current view, `CoreWindow`, frame, package activation, or framework lifetime. WinUI 3 desktop code may require an explicit `Window`, HWND, dispatcher queue, app-owned lifetime, or packaged/unpackaged distinction. Trace the value to every consumer and preserve cleanup and re-entry behavior.

## Threading and asynchronous transitions

Framework events and delegates may not propagate `Task` completion. Preserve ordering, exceptions, cancellation, and visual-tree lifetime through an async-capable app-owned boundary. Fire-and-forget work is valid only when it is intentionally independent, observes failures, and cannot race navigation, overlay removal, or disposal.

## XAML resources and binding

Equivalent type names do not guarantee equivalent resource lookup, dependency-property metadata, binding defaults, generated event signatures, theme behavior, or control templates. Verify the effective runtime value and user-visible state rather than only converted markup.

## Collections, selection, and input

WinRT collections, .NET collections, change notification, selected-item identity, focus, keyboard modifiers, pointer input, and UI Automation can differ across framework boundaries. Preserve the source state transition and event ordering, not merely the destination control.

## Activation, windows, and deployment

Protocol/file activation, notifications, background work, app services, secondary windows, and package identity have desktop-specific prerequisites and entry paths. A normal primary-window launch does not verify these contracts.

## Media, composition, and hosted controls

Media, WebView/editor hosts, composition surfaces, and other native-backed controls often combine package dependencies with thread, lifetime, and teardown contracts. A replacement must preserve the consumed callbacks, content/state synchronization, and disposal order. Disabling the feature or providing a type-shaped host is not equivalence.
