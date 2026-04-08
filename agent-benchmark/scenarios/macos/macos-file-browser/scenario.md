---
name: macos-file-browser
description: "File browser with Finder-like navigation, Quick Look preview, and macOS shell integrations — tests file system APIs, NSWorkspace, outline views, and pasteboard"
type: new
app_name: FileBrowse
requirements:
  - "A sidebar must show a tree of folders starting from the user's home directory, with expand/collapse support"
  - "Selecting a folder in the sidebar must display its contents in a table view with columns: Name, Size, Kind, and Date Modified"
  - "Column headers in the table must support click-to-sort ascending/descending by name, size, kind, or date"
  - "Double-clicking a file in the table must open it with the system default application via NSWorkspace"
  - "Double-clicking a folder in the table must navigate into that folder and update both the sidebar selection and the table"
  - "A path bar or breadcrumb at the top must show the current folder path and allow clicking path components to navigate"
  - "Back and Forward toolbar buttons must navigate through folder history"
  - "A search field must filter the file list by name as the user types"
  - "Pressing Space with a file selected must show a Quick Look preview panel"
  - "A right-click context menu on files must include: Open, Open With, Reveal in Finder, Copy, Move to Trash, and Get Info"
  - "The Get Info action must show a sheet or popover displaying file size, creation date, modification date, kind, and full path"
  - "A status bar at the bottom must show the number of items in the current folder and the total size of selected items"
  - "The app must handle permissions gracefully — show an appropriate message for folders the user cannot access instead of crashing"
---

Build me a file browser for macOS — simpler than Finder but with the features I actually use.

I want a sidebar with a folder tree starting from my home directory that I can expand and collapse. Clicking a folder shows its contents in a table with name, size, kind, and date modified. Click column headers to sort. Double-click files to open them, double-click folders to go into them.

Need a path bar at the top so I can see where I am and click to jump back up. Back and forward buttons for navigation history. Search box to filter by file name.

The most important thing: pressing Space on a selected file should show a Quick Look preview, just like Finder does. Also need a right-click context menu with the basics — open, open with, reveal in Finder, copy, trash, and get info. The get info should show file details in a little panel.

Status bar at the bottom showing item count and selected size. And don't crash if I navigate somewhere I don't have permission — just show a message.
