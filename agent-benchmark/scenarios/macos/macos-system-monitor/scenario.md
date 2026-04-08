---
name: macos-system-monitor
description: "Real-time system monitor with live charts for CPU, memory, disk, and network — tests macOS system APIs, real-time UI updates, menu bar extras, and chart rendering"
type: new
app_name: SystemPulse
requirements:
  - "A main window must display real-time line charts for CPU usage and memory usage, updating at least once per second with a scrolling time axis"
  - "The CPU chart must display overall CPU utilization as a percentage (0–100%) over time"
  - "The memory chart must display used memory vs total available memory over time, labeled in GB"
  - "A Disk activity chart must show read/write throughput in real time"
  - "A Network activity chart must show bytes sent/received throughput in real time"
  - "Each chart must display its current value as a numeric label (e.g. 'CPU 34%', 'Memory 8.2 / 16.0 GB')"
  - "The charts must retain at least 60 seconds of history visible on the time axis"
  - "A MenuBarExtra (status bar icon) must show a compact CPU usage indicator in the macOS menu bar"
  - "Clicking the menu bar icon must show a popover or dropdown with a summary of current CPU, memory, disk, and network values"
  - "The app must support window-level floating (always-on-top) mode toggled via a toolbar button or menu item (Window > Float on Top)"
  - "A Settings window (⌘,) must let the user configure the chart update interval and choose which charts to display"
---

Build me a system resource monitor for macOS — something like Activity Monitor but focused on the performance graphs.

I want a window with live-updating charts showing CPU percentage, memory usage, disk read/write, and network throughput. Line charts that scroll over time, each showing the current value as a number next to the chart. Keep at least 60 seconds of history visible.

I also want a menu bar icon that shows a quick CPU readout — clicking it should show a compact summary of all the stats without opening the full window.

It should support floating the window on top of everything (always-on-top mode) so I can keep it in a corner while working. And a Settings window to tweak the update interval and toggle which charts are visible.

Make it look native — proper macOS design, not a ported Windows app.
