---
name: task-manager
description: "app that tests deep OS integration, custom windowing (AppWindow), and Win32 interop for system tray support."
type: new
app_name: MiniResourceMonitor
requirements:
  - "A toggle button must exist to switch the window into a Compact Overlay (always-on-top) mode."
  - "A button or window close action must minimize the application to the Windows System Tray."
  - "The application must accurately display current CPU and Memory usage using System.Diagnostics or WMI."
  - "Double-clicking the system tray icon must restore the main window."
---

Build an application that monitors basic system CPU and memory usage. The app must support a compact overlay (always-on-top) mode, and be able to minimize to the system tray (notification area). Make sure the app looks and feels modern and belong on windows.
