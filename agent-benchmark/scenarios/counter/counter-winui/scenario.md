---
name: counter-winui
description: "Simple counter app with increment/decrement, reset, and history — minimal baseline to verify WinUI 3 build pipeline"
type: new
app_name: CounterApp
requirements:
  - "The app must display a large, centered counter value starting at 0"
  - "An increment button ('+') must increase the counter by 1"
  - "A decrement button ('−') must decrease the counter by 1"
  - "A reset button must set the counter back to 0"
  - "The app must have keyboard shortcuts: Ctrl+Up for increment, Ctrl+Down for decrement, Ctrl+R for reset"
  - "A history pane must show timestamped log of each counter change (e.g., '+1 → 5 at 2:30 PM')"
  - "The app must persist the current counter value across launches using ApplicationData.Current.LocalSettings"
  - "A Settings page must allow choosing the step size (1, 5, 10) for increment/decrement"
---

Build me a simple counter app for Windows. I want a clean, native-feeling window with a big number in the center and buttons to increment, decrement, and reset. Add a side pane showing the history of changes. It should remember the count between launches. Keep it simple and Windows-native with Fluent Design.
