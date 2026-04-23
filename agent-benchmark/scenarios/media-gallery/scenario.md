---
name: media-gallery
description: "Build a WinUI 3 media gallery app with advanced controls and platform features"
type: new
app_name: MediaGallery
requirements:
  - "NavigationView with Top mode must switch between Gallery, Favorites, and Settings pages"
  - "Gallery page must display images in a GridView or ItemsRepeater with UniformGridLayout showing thumbnail previews"
  - "Gallery page must support drag-and-drop: users can drop image files from Explorer onto the gallery to import them"
  - "Clicking an image must open a full-screen preview using a ContentDialog or overlay with the image displayed large"
  - "A CommandBar at the top must have buttons for Import, Delete, Select All, and a share button"
  - "The share button must use the Windows Share contract (IDataTransferManagerInterop) to share selected images"
  - "Favorites page must show only images marked as favorite, using the same grid layout as Gallery"
  - "Right-clicking an image must show a MenuFlyout with options: Open, Add to Favorites, Copy, Delete"
  - "Settings page must have a ToggleSwitch for dark/light theme, a ComboBox for thumbnail size (Small/Medium/Large), and a NumberBox for slideshow interval"
  - "An InfoBar must appear when images are imported successfully, showing the count of imported files"
  - "A ProgressRing must be visible while images are being loaded or imported"
  - "The app must show image metadata (filename, dimensions, file size, date taken) in a TeachingTip or Flyout when hovering or clicking an info button on each image"
  - "The app must use MicaBackdrop, a custom TitleBar, and follow Fluent Design spacing/typography rules"
  - "All interactive controls must have AutomationProperties.AutomationId set"
---

Build me a media gallery app for browsing, organizing, and sharing photos.

Requirements:
- WinUI 3 desktop app with Fluent Design (Mica backdrop, custom title bar)
- NavigationView in Top mode with 3 pages: Gallery, Favorites, Settings
- Gallery page:
  - GridView or ItemsRepeater with UniformGridLayout for image thumbnails
  - Drag-and-drop support: drop images from File Explorer to import
  - Click image to see full-size preview in a ContentDialog or overlay
  - ProgressRing while loading images
- CommandBar with Import, Delete, Select All, Share buttons
- Share button uses Windows Share contract (IDataTransferManagerInterop COM interop for desktop)
- Favorites page: shows images the user marked as favorite, same grid layout
- Right-click context menu (MenuFlyout): Open, Add to Favorites, Copy, Delete
- Settings page:
  - ToggleSwitch for dark/light theme
  - ComboBox for thumbnail size (Small/Medium/Large)
  - NumberBox for slideshow interval
- InfoBar notification when import completes (e.g. "Imported 12 images")
- Image metadata display (filename, dimensions, size, date) in TeachingTip or Flyout
- Make sure the app builds and runs
