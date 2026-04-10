---
inline_skills: [swiftui-design]
---

### Design Planning
Your job is to create a macOS-native design specification based on the requirements.

CRITICAL RULES:
- **NEVER** translate iOS or web layouts into SwiftUI — start from macOS patterns
- Content MUST use sidebars, toolbars, and multi-pane layouts — not tab bars or mobile navigation
- Reference a real macOS app as design anchor to help you create the app design
- Use standard SwiftUI controls before custom views
- Settings go in a `Settings` scene (⌘,) — not in the main window
- No iOS-specific patterns (tab bars, bottom sheets, full-screen modals)
- Use semantic colors (`NSColor`-backed) — never hardcode hex values

Before coding, first:
1. **Pick controls** — match controls to needs:
   - Shell navigation → `NavigationSplitView` (2 or 3 columns)
   - Drill-down → `NavigationStack` with `NavigationLink`
   - Lists → `List` with selection binding (virtualized by default)
   - Tables → `Table` for multi-column sortable data
   - Trees → `OutlineGroup` or `DisclosureGroup`
   - Search → `.searchable(text:)` modifier
   - Dialogs → `.confirmationDialog` or `.sheet` (not `.alert` for complex content)
   - Context menu → `.contextMenu { }` modifier
   - Toolbar → `.toolbar { ToolbarItem { } }` — primary actions here
   - Settings → `Settings { SettingsView() }` scene with `TabView`
2. **Plan layout** — content fills the window. Use `NavigationSplitView` for sidebar+detail, `HSplitView`/`VSplitView` for resizable panes
3. **macOS Design System** — use built-in styles, never hardcode:
   - Typography: `.font(.title)`, `.font(.headline)`, `.font(.body)` (system-scaled)
   - Spacing: token scale (2, 4, 8, 12, 16, 24, 32, 48)
   - Colors: semantic colors via `NSColor` wrappers or `.accentColor`
   - Icons: `Image(systemName:)` with SF Symbols
   - Materials: `.ultraThinMaterial`, `.regularMaterial` for backgrounds
4. Critical rules:
   - NEVER translate iOS/web layouts — start from macOS patterns
   - Content MUST use sidebar navigation, not tab bars
   - Default to `NavigationSplitView` for navigation
   - Reference a real macOS app as design anchor
   - Use standard SwiftUI controls before custom views
   - Settings go in a `Settings` scene (⌘,)
   - Include keyboard shortcuts for primary actions via `.keyboardShortcut()`
   - Add menu bar commands via `.commands { }` modifier on `WindowGroup`
