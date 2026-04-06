---
name: swiftui
description: "SwiftUI macOS desktop app builder."
---

# SwiftUI macOS App Builder

You build **SwiftUI** desktop applications for **macOS**.

## Workflow

Every time you work on this codebase, follow this checklist:

### Understand the Request
- Re-read the user's request and identify every requirement
- Think through the requirements and constraints and consider the scope of the request
- Define the scope clearly and completely
- Define the requirements based on the request, even if they are not explicitly included in the request. Use those requirements for the rest of the workflow as if they are part of the original request.
- If something is not clear, ask the user to clarify
- Search for related implementations to avoid duplication (DRY)
- Read the `project.yml` or `.xcodeproj` (if existing app) to determine deployment target, dependencies, and build settings

{{swiftui-design}}

{{swiftui-architecture}}

### Scaffold & Code
- Scaffold if you need to create a new app using XcodeGen:
  1. Create `project.yml` with proper macOS target, deployment target `macOS 14.0`, and scheme
  2. Create `Sources/` directory with app entry point, views, models
  3. Create `Resources/Assets.xcassets` with `Contents.json`, `AppIcon.appiconset/Contents.json`, `AccentColor.colorset/Contents.json`
  4. Create `Info.plist` and entitlements file
  5. Run `xcodegen generate`
  6. **Build immediately** to verify scaffold compiles before adding features:
     ```bash
     xcodebuild -project {app_name}.xcodeproj -scheme {app_name} -configuration Debug -derivedDataPath ./build build 2>&1 | tail -5
     ```
- Add Swift Package dependencies in `project.yml` under `packages:` — use `from:` for minimum version
- Write all SwiftUI views and Swift code — use `@Observable` for state, `@Environment` for DI, `NavigationSplitView` for sidebar layouts
- Use SF Symbols for icons (`Image(systemName:)`)
- Use semantic colors (`Color(NSColor.labelColor)`, `.accentColor`, etc.) — never hardcode hex colors
- **Set `.accessibilityIdentifier()` on ALL interactive controls** — buttons, text fields, toggles, list items, navigation links. Use consistent camelCase naming: `"addButton"`, `"searchField"`, `"settingsToggle"`, `"entryList"`. This enables UI testing with XCUITest.
- **After implementing each major component** (e.g., data model, main view, navigation), rebuild and fix errors before continuing. Don't wait until all code is written.

### Build
```bash
xcodebuild -project {app_name}.xcodeproj \
    -scheme {app_name} \
    -configuration Debug \
    -derivedDataPath ./build \
    build 2>&1 | grep -E "error:|warning:|BUILD" || echo "Build succeeded"
```
- Read ALL errors, batch-fix, rebuild
- Never delete `Info.plist` or entitlements

### Run
```bash
open ./build/Build/Products/Debug/{app_name}.app
```
Or to see stdout/logs:
```bash
./build/Build/Products/Debug/{app_name}.app/Contents/MacOS/{app_name}
```

{{swiftui-verify}}

## SwiftUI Essentials

### State Management with @Observable
```swift
// macOS 14+ — use @Observable, NOT ObservableObject
@Observable
class AppState {
    var items: [Item] = []
    var selectedItemID: UUID?
    var isLoading = false
}
```

### Environment Injection
```swift
@main
struct MyApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
        }
    }
}

// Access in any child view:
struct SidebarView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState
        List(appState.items, selection: $appState.selectedItemID) { item in
            Text(item.name)
        }
    }
}
```

### @Bindable for Bindings
When you need bindings to `@Observable` from environment, create a local `@Bindable`:
```swift
var body: some View {
    @Bindable var appState = appState
    TextField("Search", text: $appState.searchText)
}
```

### Navigation Patterns
```swift
// Sidebar + Detail (most macOS apps)
NavigationSplitView {
    SidebarView()
} detail: {
    DetailView()
}

// Multi-column
NavigationSplitView(columnVisibility: $columnVisibility) {
    SidebarView()
} content: {
    ContentListView()
} detail: {
    DetailView()
}
```

### Window & Scene
```swift
WindowGroup {
    ContentView()
}
.commands {
    CommandGroup(replacing: .newItem) { }
    CommandMenu("Edit") {
        Button("Find…") { showFind = true }
            .keyboardShortcut("f", modifiers: .command)
    }
}

Settings {
    SettingsView()
}
```

### Keyboard Shortcuts
```swift
// On buttons
Button("Save") { save() }
    .keyboardShortcut("s", modifiers: .command)

// On views (macOS 14+)
ContentView()
    .onKeyPress(.return) { handleReturn(); return .handled }
```

### Title Bar & Material
```swift
// Material background
.background(.ultraThinMaterial)

// Toolbar items
.toolbar {
    ToolbarItem(placement: .automatic) {
        Button("Add", systemImage: "plus") { addItem() }
    }
}
```

### Accessibility Identifiers for UI Testing
**Always set `.accessibilityIdentifier()` on interactive controls** — this is required for XCUITest validation.
```swift
// ✅ GOOD — every interactive control has an identifier
Button("Save") { save() }
    .accessibilityIdentifier("saveButton")

TextField("Search", text: $searchText)
    .accessibilityIdentifier("searchField")

Toggle("Enable notifications", isOn: $enabled)
    .accessibilityIdentifier("notificationsToggle")

List(items, selection: $selectedID) { item in
    Text(item.name)
        .tag(item.id)
        .accessibilityIdentifier("item_\(item.id)")
}
.accessibilityIdentifier("itemList")

NavigationLink("Settings") { SettingsView() }
    .accessibilityIdentifier("settingsLink")

// ❌ BAD — no identifiers, XCUITest can't find elements reliably
Button("Save") { save() }
TextField("Search", text: $searchText)
```
**Naming convention**: camelCase with control-type suffix: `saveButton`, `searchField`, `notificationsToggle`, `itemList`, `settingsLink`.

## Anti-Patterns
- ❌ Using `ObservableObject` + `@Published` (legacy — use `@Observable`)
- ❌ Hardcoding colors — use semantic `NSColor` wrappers or `.accentColor`
- ❌ Using `NavigationView` (deprecated — use `NavigationSplitView` or `NavigationStack`)
- ❌ Using `Window.current` or UIKit patterns
- ❌ Missing `@Bindable` when creating bindings to `@Observable` objects
- ❌ iOS-style layouts — macOS apps use sidebars, toolbars, menu bars
- ❌ Ignoring keyboard shortcuts and menu bar commands
- ❌ Using `List { ForEach }` instead of `List(items)` for simple cases
