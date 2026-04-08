---
name: text-editor-swiftui
description: "Build a macOS tabbed text editor with Dock recent files, find/replace, and standard editing features"
type: new
app_name: QuickEdit
requirements:
  - "The app must support multiple tabs, each containing an independent text editing area, with the ability to open new tabs and close existing ones"
  - "Each tab must show the file name (or 'Untitled') and indicate unsaved changes with a dot or asterisk in the tab header"
  - "File > Open (⌘O) must let the user pick a text file and open it in a new tab"
  - "File > Save (⌘S) must save the current tab's content to disk, prompting with a Save panel if the file is new"
  - "File > Save As (⇧⌘S) must always prompt with a Save panel regardless of whether the file was previously saved"
  - "Closing a tab with unsaved changes must show a confirmation dialog offering Save, Don't Save, and Cancel"
  - "The app must populate the File > Open Recent menu with recently opened files using NSDocumentController"
  - "Clicking a file in the Open Recent menu must open that file in a new tab"
  - "A Find and Replace bar (⌥⌘F) must support searching within the current tab's text with match highlighting and replace/replace all"
  - "⌘F must open Find, ⌥⌘F must open Find and Replace, ⌘S must Save, ⇧⌘S must Save As, ⌘N must open a new tab, ⌘W must close the current tab"
  - "A status bar must show the current line number, column number, and total character count"
  - "The text editor must support undo (⌘Z) and redo (⇧⌘Z) per tab"
---

I need a simple but solid text editor for macOS — something like TextEdit but with tabs. I always have a bunch of files open at once and switching between windows is annoying.

Each tab should show the file name and whether there are unsaved changes. Standard file operations with the usual Mac shortcuts. If I try to close a tab without saving it should warn me. Keyboard shortcuts for everything: ⌘S, ⌘N, ⌘W, the usual.

I want recent files to show up in File > Open Recent so I can quickly get back to something I had open before.

Also need find and replace (⌥⌘F) with highlighting, and a status bar at the bottom showing line/column numbers. Undo and redo per tab obviously. Nothing fancy, just a clean, fast text editor that feels native on macOS — proper menu bar, keyboard shortcuts, native look.
