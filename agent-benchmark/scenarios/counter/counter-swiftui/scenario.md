---
name: counter-swiftui
description: "Simple counter app with increment/decrement, reset, and history — minimal baseline to verify SwiftUI build pipeline"
type: new
app_name: CounterApp
requirements:
  - "The app must display a large, centered counter value starting at 0"
  - "An increment button ('+') must increase the counter by 1"
  - "A decrement button ('−') must decrease the counter by 1"
  - "A reset button must set the counter back to 0"
  - "The app must have keyboard shortcuts: ⌘↑ for increment, ⌘↓ for decrement, ⌘R for reset"
  - "A history sidebar must show timestamped log of each counter change (e.g., '+1 → 5 at 2:30 PM')"
  - "The app must persist the current counter value across launches using UserDefaults or SwiftData"
  - "A Settings window (⌘,) must allow choosing the step size (1, 5, 10) for increment/decrement"
---

Build me a simple counter app for macOS. I want a clean, native-feeling window with a big number in the center and buttons to increment, decrement, and reset. Add a sidebar showing the history of changes. It should remember the count between launches. Keep it simple and Mac-native.
