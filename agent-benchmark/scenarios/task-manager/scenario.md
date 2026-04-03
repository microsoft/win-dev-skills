---
name: task-manager
description: "app that tests deep OS integration, custom windowing (AppWindow), Win32 interop for system tray, and real-time chart rendering."
type: new
app_name: MiniResourceMonitor
requirements:
  - "A toggle button must exist to switch the window into a Compact Overlay (always-on-top) mode."
  - "A button or window close action must minimize the application to the Windows System Tray."
  - "The application must accurately display current CPU and Memory usage using System.Diagnostics or WMI."
  - "Double-clicking the system tray icon must restore the main window."
  - "A Performance tab must show real-time line charts for CPU usage and memory usage, updating at least once per second with a scrolling time axis."
  - "The CPU chart must display overall CPU utilization as a percentage (0–100%) over time."
  - "The memory chart must display used memory vs total available memory over time."
  - "A Disk activity chart must show read/write throughput in real time."
  - "A Network activity chart must show send/receive throughput in real time."
  - "Each chart must display its current value as a numeric label (e.g. 'CPU 34%', 'Memory 8.2 / 16.0 GB')."
  - "The charts must retain at least 60 seconds of history visible on the time axis."
---

Build me something like a mini Windows Task Manager. I want to monitor my system resources — CPU, memory, disk, and network — in real time.

The main thing I care about is a Performance tab with live-updating charts, like the ones in the real Task Manager. Line charts that scroll over time showing CPU percentage, memory usage, disk read/write, and network send/receive. Each chart should show the current value as a number too, not just the line.

It should also support a compact overlay mode so I can keep it always-on-top in a corner, and minimize to the system tray so it's out of the way but still running. Make sure the app looks and feels modern and belongs on Windows.
