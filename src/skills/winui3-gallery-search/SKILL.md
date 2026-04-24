---
name: winui3-gallery-search
description: Search WinUI 3 Gallery control patterns — find the right control, get XAML + C# code snippets and pitfall notes
---

# WinUI 3 Gallery Pattern Search

Search 100+ WinUI 3 controls from the official WinUI Gallery plus platform integration patterns (JumpList, Share contract, system tray, file pickers, drag-drop).

## Usage

### Search for controls by feature description

```bash
.\.github\skills\winui3-gallery-search\winui3-gallery.exe search "<description>"
```

Example:
```bash
.\.github\skills\winui3-gallery-search\winui3-gallery.exe search "tabbed document interface with closable tabs"
```

Returns a shortlist of matching controls with IDs. Pick the best match.

### Get full code for a specific pattern

```bash
.\.github\skills\winui3-gallery-search\winui3-gallery.exe get <id>
```

Example:
```bash
.\.github\skills\winui3-gallery-search\winui3-gallery.exe get gallery-tabview
.\.github\skills\winui3-gallery-search\winui3-gallery.exe get jumplist-recent-files
.\.github\skills\winui3-gallery-search\winui3-gallery.exe get gallery-treeview-a-treeview-with-databinding
```

Returns full XAML + C# code and known pitfall notes.

### List all available patterns

```bash
.\.github\skills\winui3-gallery-search\winui3-gallery.exe list
```

## Workflow

1. **Search** all controls you need before coding
2. **Pick** the best matching scenario ID from the shortlist
3. **Get** the full code for each control you picked
4. **Code** using the patterns and notes as reference

Do all searches together before coding — do NOT interleave searching with coding.
