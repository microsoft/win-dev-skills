---
name: macos-markdown-editor
description: "Tabbed markdown editor with live preview, file handling, and macOS integrations — tests multi-window, menus, keyboard shortcuts, file I/O, and WebKit rendering"
type: new
app_name: MarkdownEdit
requirements:
  - "The app must support multiple tabs, each containing an independent text editing area, with the ability to open new tabs (⌘N) and close existing ones (⌘W)"
  - "Each tab must show the file name (or 'Untitled') and indicate unsaved changes with a dot or modified marker in the tab header"
  - "File > Open (⌘O) must let the user pick a .md or .txt file and open it in a new tab"
  - "File > Save (⌘S) must save the current tab's content to disk, prompting with a Save panel if the file is new"
  - "File > Save As (⇧⌘S) must always prompt with a Save panel regardless of whether the file was previously saved"
  - "Closing a tab with unsaved changes must show a confirmation dialog offering Save, Don't Save, and Cancel"
  - "A split-pane view must show the raw markdown source on the left and a live-rendered HTML preview on the right"
  - "The preview must update as the user types, rendering headings, bold, italic, code blocks, links, images, and lists"
  - "A Find bar (⌘F) must support searching within the current tab's text with match highlighting"
  - "A toolbar button or menu item must toggle between editor-only, preview-only, and split-pane modes"
  - "A status bar must show the current line number, column number, word count, and character count"
  - "The app must appear in the macOS Services menu allowing other apps to send selected text to open as a new document"
  - "The editor must support undo (⌘Z) and redo (⇧⌘Z) per tab"
  - "The app must include a Settings window (⌘,) with options for editor font size and preview theme (light/dark)"
---

I need a markdown editor for macOS — something clean and native-feeling, not an Electron wrapper.

The main thing is a split view: I want to write markdown on the left and see the rendered preview on the right, updating live as I type. Needs to handle all the standard markdown — headings, bold, italic, code blocks, links, images, lists.

Tab support is essential — I always have multiple files open. Standard file operations with the usual Mac shortcuts. If I close a tab without saving, warn me. I also want the ability to switch between editor-only, preview-only, and split modes.

Find (⌘F) with highlighting, a status bar with line/column/word count, and undo/redo per tab. A simple Settings window for font size and preview theme would be nice.

Make it feel like it belongs on macOS — proper menu bar, keyboard shortcuts, native look.
