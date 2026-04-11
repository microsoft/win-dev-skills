---
inline_skills: [swiftui-architecture]
---

### Architecture
Prior to continuing, design the code structure, select APIs, and create a technical blueprint.

Plan the structure — keep it as simple as the app requires:
- **Folders**: `App/`, `Models/`, `Views/`, `Services/` (only if needed)
- **State**: `@Observable` class for shared app state — NOT `ObservableObject`+`@Published` (legacy)
- **DI**: inject via `.environment()` at app level, access with `@Environment(MyState.self)`
- **Bindings**: create local `@Bindable var state = state` inside `body` when bindings are needed
- **Models**: use `Identifiable` + `Hashable` structs; use `@Model` for SwiftData persistence
- **State enums**: use enums (`ViewState.loading/ready/error`) not multiple booleans
- **Navigation**: single page = just `WindowGroup { ContentView() }`; multi-page = `NavigationSplitView` + sidebar
- **Async**: use `.task { }` modifier for async work, `@MainActor` for UI updates, actors for shared mutable state
- **Cancellation**: `.task` auto-cancels on view disappear; for manual control use `Task` + `task.cancel()`
- Document async/threading considerations
- List all Swift Package dependencies with rationale
- ❌ No `ObservableObject` — use `@Observable` (macOS 14+)
- ❌ No `NavigationView` — use `NavigationSplitView` or `NavigationStack`
- ❌ No massive centralized state — split by domain if complex
- ❌ No business logic in views — extract to state objects or services
- ❌ No `DispatchQueue.main` — use `@MainActor` and `async/await`
- ❌ No strong self captures in async closures — use `[weak self]` or structured concurrency

### Project Setup (XcodeGen)
For new apps, scaffold using XcodeGen:
```yaml
# project.yml
name: {app_name}
options:
  bundleIdPrefix: com.app
  deploymentTarget:
    macOS: "14.0"
  createIntermediateGroups: true
settings:
  base:
    SWIFT_VERSION: "5.9"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
targets:
  {app_name}:
    type: application
    platform: macOS
    sources: [Sources]
    resources: [Resources]
    info:
      path: Sources/Info.plist
    entitlements:
      path: Sources/{app_name}.entitlements
      properties:
        com.apple.security.app-sandbox: true
        com.apple.security.network.client: true
        com.apple.security.files.user-selected.read-write: true
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.app.{app_name_lower}
        PRODUCT_NAME: {app_name}
        CODE_SIGN_STYLE: Automatic
      configs:
        Debug:
          SWIFT_OPTIMIZATION_LEVEL: -Onone
        Release:
          SWIFT_OPTIMIZATION_LEVEL: -Osize
  {app_name}Tests:
    type: bundle.unit-test
    platform: macOS
    sources: [Tests]
    dependencies:
      - target: {app_name}
  {app_name}UITests:
    type: bundle.ui-testing
    platform: macOS
    sources: [UITests]
    dependencies:
      - target: {app_name}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.app.{app_name_lower}.uitests
schemes:
  {app_name}:
    build:
      targets:
        {app_name}: all
        {app_name}Tests: [test]
        {app_name}UITests: [test]
    run:
      config: Debug
    test:
      config: Debug
      targets:
        - {app_name}Tests
        - {app_name}UITests
```

Then:
```bash
xcodegen generate
xcodebuild -project {app_name}.xcodeproj -scheme {app_name} -derivedDataPath ./build build
```
