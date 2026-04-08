---
name: macos-snippet-manager
description: "Code snippet manager with SwiftData persistence, syntax highlighting, tagging, search, and sharing — tests data persistence, pasteboard integration, and macOS services"
type: new
app_name: SnippetVault
requirements:
  - "A sidebar must list all saved snippets, organized by user-defined folders or tags"
  - "A detail view must show the selected snippet's title, language, tags, and source code"
  - "An Add Snippet button must create a new snippet with fields for title, language (dropdown), tags (comma-separated), and code content"
  - "A Delete button must remove the selected snippet with a confirmation dialog"
  - "Snippet data must persist across app launches using SwiftData"
  - "The code content area must display syntax highlighting appropriate to the selected language (at minimum: Swift, Python, JavaScript, HTML, and plain text)"
  - "A Copy button (⌘C on the detail view) must copy the snippet's code to the macOS clipboard"
  - "A search field must filter snippets by title, tag, or code content as the user types"
  - "The sidebar must support drag-and-drop reordering of snippets within a folder"
  - "A tag filter in the sidebar or toolbar must let the user click a tag to show only snippets with that tag"
  - "An Export button must export the selected snippet as a file (.swift, .py, .js, etc. based on language) via a Save panel"
  - "The app must accept text from other apps via the macOS Services menu to create a new snippet from selected text"
  - "A Settings window (⌘,) must let the user configure the default language for new snippets and the editor font size"
---

I need a snippet manager for macOS — a place to store, organize, and quickly grab code snippets I use all the time.

The main view should be a sidebar with my snippets organized by folders or tags, and a detail view showing the code with syntax highlighting. I work in multiple languages so it needs to handle at least Swift, Python, JavaScript, and HTML.

Key features: add/delete snippets, copy code to clipboard with one click, search across everything (title, tags, code content), and filter by tags. I want to be able to drag snippets around to reorder them.

Data needs to persist between launches — I don't want to lose my snippets. Also need to export individual snippets as files and accept text from other apps via the Services menu so I can select code anywhere and send it to the app.

Simple Settings window for default language and font size. Keep it clean and native macOS.
