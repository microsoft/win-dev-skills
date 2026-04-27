---
name: photo-organizer
description: "WinUI 3 photo organizer that naturally requires multiple CommunityToolkit controls (masonry layout, chip-style tag input, image crop, resizable split, sort/filter)"
type: new
app_name: PhotoOrganizer
requirements:
  - "Two-pane resizable layout: left pane shows the photo collection, right pane shows the selected photo's editor — the user must be able to drag a vertical splitter between them to resize"
  - "Photo collection must use a masonry / Pinterest-style layout where photos of different aspect ratios pack tightly without uniform rows"
  - "Tag input field where the user can type arbitrary tags as removable chip / pill tokens (Backspace removes the last token, comma or Enter commits a new one)"
  - "Right pane must include an image crop editor: user picks a photo, drags a crop region, and clicks Save to commit the crop. Crop region must support both rectangle and circular shapes selectable by the user"
  - "The collection must be sortable (by name, date taken, file size) and filterable by tag, without rebuilding the underlying list each time"
  - "A Settings page with at least 4 individual Windows 11-style settings rows (each with header + description + a control like ToggleSwitch / ComboBox), plus one expandable group of related sub-settings"
  - "User must be able to pick a custom color tag for each photo using a color picker that includes both a spectrum and a preset color palette (swatches)"
  - "All interactive controls must have AutomationProperties.AutomationId set"
  - "App must use MicaBackdrop and a custom TitleBar"
  - "Frame-based navigation between Library and Settings pages"
---

Build me a photo organizer app for browsing, tagging, and cropping personal photos.

Layout & navigation:
- WinUI 3 desktop app with Fluent Design (Mica backdrop, custom title bar)
- NavigationView (Left pane) with two pages: **Library** and **Settings**
- Frame-based page navigation

Library page (the main UX):
- Two-pane layout split vertically:
  - **Left pane** (collection): photos arranged in a **masonry / staggered layout** — different aspect ratios pack tightly without forcing uniform row heights
  - **Right pane** (editor): selected photo with cropping tools
  - The user must be able to **drag a vertical splitter** between the two panes to resize them
- Above the left pane:
  - A **chip-style tag input** — user types a tag, presses Enter or comma to commit it as a removable token; Backspace removes the last token; clicking the X on a chip removes it
  - Sort dropdown: Name | Date taken | File size
  - Filter dropdown: pick one of the existing tags to filter
  - Sorting and filtering must NOT rebuild the underlying photo list (use a view layer that wraps the collection)
- Right pane editor:
  - **Image crop tool**: user drags a crop region; supports both **rectangle and circular** crop shapes (toggle)
  - "Save crop" button writes the cropped image back
  - **Color tag picker**: full color picker with a spectrum AND a preset palette of swatches (the user can quickly pick from common colors OR pick a custom one). The chosen color is stored as a "color tag" on the photo.

Settings page (Windows 11 style):
- At least 4 individual settings rows, each with: header text, description text, an icon, and an interactive control (ToggleSwitch / ComboBox / etc.):
  - "Theme" — ComboBox: System / Light / Dark
  - "Show file metadata in tooltip" — ToggleSwitch
  - "Default crop shape" — ComboBox: Rectangle / Circle
  - "Library folder" — clickable row that opens a folder picker
- One **expandable group** that contains related sub-settings:
  - "Import behavior" expander, expands to reveal:
    - ToggleSwitch: "Auto-import from Pictures folder"
    - ComboBox: "When duplicate found" (Skip / Replace / Keep both)
    - NumberBox: "Maximum file size (MB)"

Quality bar:
- Make sure the app builds and runs
- All interactive controls have AutomationProperties.AutomationId
- Mica backdrop and custom TitleBar
