### Verify
Once you are done building the application, validate the built app against its requirements and design specification using XCUITest and CLI tools.

#### Build Verification
```bash
# Verify it compiles cleanly
xcodebuild -project {app_name}.xcodeproj \
    -scheme {app_name} \
    -configuration Debug \
    -derivedDataPath ./build \
    build 2>&1 | grep -E "error:|warning:|BUILD"
```

#### Launch Verification
```bash
# Launch and verify it runs without crashing
./build/Build/Products/Debug/{app_name}.app/Contents/MacOS/{app_name} &
APP_PID=$!
sleep 3
kill -0 $APP_PID 2>/dev/null && echo "App running ✅" || echo "App crashed ❌"
```

#### Screenshot Capture
```bash
# Get the window ID for the running app
WINDOW_ID=$(osascript -e 'tell application "System Events" to tell process "{app_name}" to get id of window 1' 2>/dev/null || osascript -e 'tell app "{app_name}" to id of window 1' 2>/dev/null)
# Capture screenshot of the app window only (never full screen)
screencapture -l $WINDOW_ID screenshot.png
```

#### Log Monitoring
```bash
# Stream app logs to check for errors
log stream --predicate 'process == "{app_name}"' --level error --timeout 10
```

#### Crash Diagnostics
```bash
# Check for crash reports
ls ~/Library/Logs/DiagnosticReports/ | grep {app_name}
cat ~/Library/Logs/DiagnosticReports/{app_name}_*.ips 2>/dev/null | head -100
```

#### UI Validation with XCUITest
Write XCUITest cases in the `UITests/` folder to programmatically verify the app's UI and functionality. The `{app_name}UITests` target is already configured in `project.yml`.

Create `UITests/{app_name}UITests.swift`:
```swift
import XCTest

final class {app_name}UITests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    override func tearDown() {
        app.terminate()
    }

    // Test that the app launches and shows the main window
    func testAppLaunches() {
        XCTAssertTrue(app.windows.count > 0, "App should have at least one window")
    }
}
```

**XCUITest patterns for common checks:**
```swift
// Find elements by accessibility identifier
let saveButton = app.buttons["saveButton"]
XCTAssertTrue(saveButton.exists, "Save button should exist")

// Click a button
saveButton.click()

// Type into a text field
let searchField = app.textFields["searchField"]
searchField.click()
searchField.typeText("hello world")

// Verify text exists in the UI
XCTAssertTrue(app.staticTexts["hello world"].exists)

// Toggle a checkbox/switch
let toggle = app.checkBoxes["notificationsToggle"]
toggle.click()

// Check list/table has items
let list = app.outlines.firstMatch  // sidebar list
XCTAssertTrue(list.children(matching: .any).count > 0, "List should have items")

// Navigate via sidebar
app.staticTexts["Settings"].click()

// Wait for element to appear (async operations)
let result = app.staticTexts["Complete"]
XCTAssertTrue(result.waitForExistence(timeout: 5), "Result should appear within 5 seconds")

// Verify element does NOT exist
XCTAssertFalse(app.alerts.firstMatch.exists, "No error alert should be shown")

// Take screenshot for visual verification
let screenshot = app.windows.firstMatch.screenshot()
let attachment = XCTAttachment(screenshot: screenshot)
attachment.lifetime = .keepAlways
add(attachment)

// Test menu bar commands
app.menuItems["New Entry"].click()

// Test keyboard shortcuts
app.typeKey("n", modifierFlags: .command)  // ⌘N

// Verify window title
XCTAssertTrue(app.windows.firstMatch.title.contains("{app_name}"))
```

**Run UI tests:**
```bash
# Run all UI tests
xcodebuild -project {app_name}.xcodeproj \
    -scheme {app_name} \
    -derivedDataPath ./build \
    -only-testing:{app_name}UITests \
    test 2>&1 | grep -E "Test Case|passed|failed|error:"

# Run a specific UI test
xcodebuild -project {app_name}.xcodeproj \
    -scheme {app_name} \
    -derivedDataPath ./build \
    -only-testing:{app_name}UITests/{app_name}UITests/testAppLaunches \
    test
```

WORKFLOW:
1. Build the app and verify zero errors
2. Launch the app and verify it doesn't crash on startup
3. Take a screenshot for visual inspection
4. Write XCUITest cases that verify:
   - All expected controls exist (by accessibility identifier)
   - Buttons respond to clicks
   - Text fields accept input
   - Navigation works (sidebar, pages)
   - Core features work end-to-end
5. Run the UI tests and verify they pass
6. Check logs for runtime errors

If the app crashes on startup, run the binary directly from the terminal to see crash output. Check `~/Library/Logs/DiagnosticReports/` for crash logs.

If something is not completed — a requirement missing, a feature not implemented, UI unfinished, something not working, or crashing — go back to the Code and Build phase to resolve issues and then revalidate/reverify again.
