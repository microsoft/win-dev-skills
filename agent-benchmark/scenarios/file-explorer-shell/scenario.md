---
name: file-explorer-shell
description: "Build a WinUI 3 file explorer with Windows shell integrations"
type: new
app_name: FileExplorer
requirements:
  - "Tab support: the app must support multiple tabs, each showing a different folder, with ability to open new tabs and close existing ones"
  - "Back, Forward, and Up navigation buttons must be present and functional for folder history traversal"
  - "A TreeView or navigation pane must provide folder navigation with expand/collapse"
  - "A BreadcrumbBar or address bar must show the current path and allow direct path entry"
  - "A file list view must display files with at least name, size, type, and date modified columns"
  - "Column headers in the file list must support click-to-sort (ascending/descending) by name, size, type, or date"
  - "Double-clicking a file in the list must open it with the system default handler"
  - "Double-clicking a folder in the list must navigate into that folder"
  - "Right-click context menu on files/folders must include at least: Open, Copy, Cut, Paste, Rename, Delete, and Properties"
  - "A search or filter box must narrow the file list by name as the user types"
  - "A Share button or context menu item must invoke the Windows Share contract (DataTransferManager or ShareStorageItemsAsync)"
  - "The app must populate the taskbar JumpList with recently opened folders using Windows.UI.StartScreen.JumpList"
  - "Status bar at the bottom must show the number of items in the current folder and the number of selected items"
---

Build me a file explorer with shell integrations like sharing, recent files in taskbar, and more.

Requirements:
- WinUI 3 desktop app with modern Fluent Design (Mica backdrop, custom title bar)
- Tabbed interface: multiple tabs, each showing a different folder, with new tab and close tab support
- Back, Forward, and Up navigation buttons for folder history
- TreeView-based folder navigation in a left sidebar with expand/collapse
- BreadcrumbBar or address bar showing the current path, with ability to type a path directly
- File list view with columns: name, size, type, date modified
- Click column headers to sort ascending/descending
- Double-click a file to open it with the system default handler
- Double-click a folder to navigate into it
- Right-click context menu on files/folders: Open, Copy, Cut, Paste, Rename, Delete, Properties
- Search/filter box that filters the file list by name as you type
- Share button that uses the Windows Share contract to share selected files
- JumpList integration: recently opened folders appear in the taskbar right-click menu
- Status bar showing item count and selection count
- Make sure the app builds and runs
