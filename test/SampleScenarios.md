# Windows App SDK Sample Scenarios

This document provides a comprehensive list of application scenarios that can be built using the Windows App SDK samples in this repository. Each scenario is described from a product perspective, outlining what users can accomplish and the features involved.

---

## Table of Contents

1. [Camera Capture Tool](#app-1---camera-capture-tool)
2. [Photo Editor Application](#app-2---photo-editor-application)
3. [File & Folder Picker Application](#app-3---file--folder-picker-application)
4. [App Lifecycle Manager](#app-4---app-lifecycle-manager)
5. [Push Notification Client](#app-5---push-notification-client)
6. [App Notification Center](#app-6---app-notification-center)
7. [Badge Notification Display](#app-7---badge-notification-display)
8. [Windows Widgets Dashboard](#app-8---windows-widgets-dashboard)
9. [Window Management Tool](#app-9---window-management-tool)
10. [OAuth2 Authentication Flow](#app-10---oauth2-authentication-flow)
11. [Multi-Language Resource Manager](#app-11---multi-language-resource-manager)
12. [Custom Controls Library](#app-12---custom-controls-library)
13. [Background Task Scheduler](#app-13---background-task-scheduler)
14. [Deployment Manager Utility](#app-14---deployment-manager-utility)
15. [Self-Contained Deployment Package](#app-15---self-contained-deployment-package)
16. [Mica Material Showcase](#app-16---mica-material-showcase)
17. [Visual Composition Gallery](#app-17---visual-composition-gallery)
18. [Input Gesture Recognizer](#app-18---input-gesture-recognizer)
19. [App Insights Telemetry](#app-19---app-insights-telemetry)
20. [Windows ML Image Classifier](#app-20---windows-ml-image-classifier)
21. [Windows AI Foundry Integration](#app-21---windows-ai-foundry-integration)

---

### **App 1 - Camera Capture Tool**

**Name**: Camera Capture Tool

**Core API**:
- `Microsoft.Windows.Media.Capture.CameraCaptureUI`

**Description**:
> I want to create an app that lets users take photos and record videos using the Windows system camera interface. Users should be able to set photo format (JPG/PNG) and resolution, set video format (MP4/WMV) and maximum duration, and after capture, preview photos (display images) and play videos in the app, showing the path and size information of captured files.

**Test Scenarios**:
1. **Photo (Default Settings)**: Take photos using default settings, verify image saving
2. **Photo (JPG Format)**: Specify JPG format, verify output format
3. **Photo (PNG Format)**: Specify PNG format, verify output format
4. **Photo (High Resolution)**: Set highest resolution, verify image dimensions
5. **Photo Cancel**: Cancel after opening camera, verify app has no errors
6. **Video (Default Settings)**: Record 5-second video, verify saving
7. **Video (Duration Limit)**: Set maximum duration to 30 seconds, verify automatic stop on timeout
8. **Video (MP4 Format)**: Specify MP4 format, verify output
9. **Image Preview**: Display image in app after taking photo
10. **Video Playback**: Play video in app after recording
11. **No Camera Device**: Test error messages on devices without camera

**Complexity**: Medium

---

### **App 2 - Photo Editor Application**

**Name**: Photo Editor

**Core API**:
- `Microsoft.UI.Xaml` (Layout, Data Binding)
- `Microsoft.UI.Composition` (Visual Effects)
- `Microsoft.Graphics.Win2D` (2D Graphics Rendering)

**Description**:
> I want to build a photo editing application that allows users to browse their Pictures library, select photos, and apply various visual effects. The app should display a gallery view of all photos with thumbnails, let users tap on a photo to open a detailed editing view, and provide sliders to adjust effects like brightness, contrast, saturation, and blur in real-time.

**Test Scenarios**:
1. **Gallery View**: Launch app and verify all photos from Pictures library are displayed as thumbnails
2. **Photo Selection**: Tap a photo and verify it opens in full editing view with smooth animation
3. **Brightness Adjustment**: Move brightness slider and verify the photo updates in real-time
4. **Contrast Adjustment**: Adjust contrast slider and verify visual changes
5. **Saturation Effect**: Modify saturation levels and verify color intensity changes
6. **Blur Effect**: Apply blur effect and verify the image becomes blurred
7. **Multiple Effects**: Apply multiple effects simultaneously and verify they stack correctly
8. **Empty Library**: Test app behavior when Pictures library is empty
9. **Large Library Performance**: Test app performance with 1000+ photos
10. **Return to Gallery**: Navigate back to gallery and verify the animation is smooth

**Complexity**: High

---

### **App 3 - File & Folder Picker Application**

**Name**: Storage Pickers

**Core API**:
- `Microsoft.Windows.Storage.Pickers.FileOpenPicker`
- `Microsoft.Windows.Storage.Pickers.FileSavePicker`
- `Microsoft.Windows.Storage.Pickers.FolderPicker`

**Description**:
> I want to create an application that demonstrates how to let users select files for opening, choose locations to save files, and pick folders for various operations. The app should provide a clean interface with tabs for each picker type and display the selected file/folder information after user selection.

**Test Scenarios**:
1. **Open Single File**: Use FileOpenPicker to select a single file and display its path
2. **Open Multiple Files**: Select multiple files and display all paths
3. **Filter File Types**: Set file type filter (e.g., only images) and verify only matching files are selectable
4. **Save File**: Use FileSavePicker to choose save location and filename
5. **Save with Extension**: Verify file is saved with correct extension
6. **Pick Folder**: Use FolderPicker to select a folder and display its path
7. **Cancel Operation**: Cancel picker dialog and verify app handles it gracefully
8. **Access Denied**: Attempt to access restricted location and verify error handling
9. **Network Location**: Test picker with network folder locations
10. **Recent Locations**: Verify recent locations are shown in picker

**Complexity**: Low

---

### **App 4 - App Lifecycle Manager**

**Name**: App Lifecycle Manager

**Core API**:
- `Microsoft.Windows.AppLifecycle.AppInstance`
- `Microsoft.Windows.AppLifecycle.ActivationRegistrationManager`
- `Windows.ApplicationModel.Activation`

**Description**:
> I want to develop an app that demonstrates how modern Windows applications can manage their lifecycle - including how they start up, how they can ensure only one instance runs at a time, how they respond to different activation methods (like file associations or protocol links), and how they handle system power state changes to save battery or respond to sleep/wake events.

**Test Scenarios**:
1. **Standard Launch**: Launch app normally and verify it starts correctly
2. **File Activation**: Associate app with a file type and launch via file double-click
3. **Protocol Activation**: Register protocol handler and launch via URI
4. **Single Instance**: Launch app twice and verify second launch redirects to first instance
5. **Multi Instance**: Configure multi-instance mode and verify separate instances can run
6. **Redirect Activation**: Verify activation arguments are passed to existing instance
7. **Power State - Low Battery**: Simulate low battery and verify app receives notification
8. **Power State - Sleep**: Put system to sleep and verify app handles state transition
9. **Power State - Resume**: Resume from sleep and verify app recovers properly
10. **Environment Variables**: Access and modify environment variables for the app

**Complexity**: High

---

### **App 5 - Push Notification Client**

**Name**: Push Notification Client

**Core API**:
- `Microsoft.Windows.PushNotifications.PushNotificationManager`
- `Microsoft.Windows.PushNotifications.PushNotificationChannel`

**Description**:
> I want to build an app that can receive real-time notifications from a cloud server. The app should register with Windows Notification Services to get a unique channel URI, display this URI (so it can be used by a server to send notifications), and handle incoming notifications both when the app is running in the foreground and when it's closed or in the background.

**Test Scenarios**:
1. **Channel Registration**: Launch app and verify it obtains a WNS Channel URI
2. **Display Channel URI**: Verify the channel URI is displayed in the app interface
3. **Foreground Notification**: Receive notification while app is open and verify it's handled
4. **Background Notification**: Close app, send notification, and verify background activation
5. **Notification Content**: Verify notification payload is correctly parsed and displayed
6. **Channel Refresh**: Test channel URI refresh after expiration
7. **No Network**: Test behavior when device has no network connection
8. **Invalid Azure ID**: Test error handling with incorrect Azure App ID
9. **Multiple Notifications**: Send rapid succession of notifications and verify all are received
10. **Notification Action**: Tap notification and verify app activates with correct arguments

**Complexity**: High

---

### **App 6 - App Notification Center**

**Name**: App Notification Center

**Core API**:
- `Microsoft.Windows.AppNotifications.AppNotificationManager`
- `Microsoft.Windows.AppNotifications.AppNotificationBuilder`

**Description**:
> I want to create an app that sends local notifications to the user. The app should be able to display rich toast notifications with images, text, and interactive buttons. Users should be able to respond to notifications by clicking buttons or typing in text fields, and the app should receive and handle these responses even if it was closed when the user interacted with the notification.

**Test Scenarios**:
1. **Simple Toast**: Send a basic text notification and verify it appears
2. **Toast with Image**: Send notification with embedded avatar image
3. **Toast with Button**: Send notification with action button and verify click handling
4. **Toast with Text Input**: Send notification with text box and verify input retrieval
5. **Foreground Response**: Respond to notification while app is open
6. **Background Response**: Respond to notification while app is closed and verify activation
7. **Multiple Toasts**: Send multiple notifications and verify all appear in Action Center
8. **Clear Notification**: Clear a specific notification programmatically
9. **Notification Expiration**: Set expiration time and verify notification disappears
10. **Custom Sound**: Set custom notification sound and verify it plays

**Complexity**: Medium

---

### **App 7 - Badge Notification Display**

**Name**: Badge Notification Display

**Core API**:
- `Microsoft.Windows.AppNotifications.BadgeNotificationManager`

**Description**:
> I want to build an app that can display badge notifications on its taskbar icon. The badge should be able to show numeric values (like unread message counts) or status glyphs (like "new", "alert", or "attention"). This helps users see important status information at a glance without opening the app.

**Test Scenarios**:
1. **Numeric Badge (Small)**: Display badge with number 1-9 and verify visibility
2. **Numeric Badge (Large)**: Display badge with number 99+ and verify display format
3. **Glyph Badge - New**: Display "new" glyph badge and verify icon
4. **Glyph Badge - Alert**: Display "alert" glyph badge and verify icon
5. **Glyph Badge - Attention**: Display "attention" glyph badge and verify icon
6. **Clear Badge**: Clear badge and verify it disappears from taskbar
7. **Update Badge**: Update badge value and verify change reflects immediately
8. **Badge Persistence**: Minimize app and verify badge remains visible
9. **App Restart**: Close and reopen app and test badge behavior
10. **Multiple Windows**: Test badge behavior with multiple app windows

**Complexity**: Low

---

### **App 8 - Windows Widgets Dashboard**

**Name**: Windows Widgets

**Core API**:
- `Microsoft.Windows.Widgets.Providers.WidgetProvider`
- `Microsoft.Windows.Widgets.WidgetManager`

**Description**:
> I want to create custom widgets that appear in the Windows Widgets Dashboard. These widgets should display dynamic content and respond to user interactions. Users should be able to pin my widgets to their dashboard and see real-time updates without opening my full application.

**Test Scenarios**:
1. **Widget Registration**: Deploy app and verify widget appears in widget picker
2. **Pin Widget**: Pin widget to dashboard and verify it displays correctly
3. **Widget Content**: Verify widget displays expected content
4. **Widget Update**: Update widget data and verify dashboard reflects changes
5. **Widget Interaction**: Click/tap widget elements and verify response
6. **Multiple Widgets**: Pin multiple widgets of same type and verify independence
7. **Widget Unpin**: Remove widget from dashboard and verify cleanup
8. **Widget Size**: Test widget at different supported sizes
9. **Background Updates**: Close app and verify widget continues to update
10. **Widget Debugging**: Attach debugger and verify widget code execution

**Complexity**: High

---

### **App 9 - Window Management Tool**

**Name**: Window Manager

**Core API**:
- `Microsoft.UI.Windowing.AppWindow`
- `Microsoft.UI.Windowing.AppWindowTitleBar`
- `Microsoft.UI.Windowing.DisplayArea`

**Description**:
> I want to build an app that demonstrates advanced window management capabilities. The app should allow users to customize the title bar appearance, switch between different window presentation modes (normal, fullscreen, compact overlay), position windows precisely on screen, and handle multiple display scenarios.

**Test Scenarios**:
1. **Default Window**: Launch app with default window settings and verify appearance
2. **Custom Title Bar**: Customize title bar colors and verify appearance
3. **Hide Title Bar**: Hide default title bar and verify custom content displays
4. **Fullscreen Mode**: Switch to fullscreen and verify window fills entire screen
5. **Compact Overlay**: Enable compact overlay (picture-in-picture) mode
6. **Window Resize**: Resize window and verify content adapts
7. **Window Position**: Set specific window position and verify coordinates
8. **Multi-Monitor**: Move window between monitors and verify correct behavior
9. **DPI Changes**: Change display scaling and verify window responds correctly
10. **Window State Persistence**: Close and reopen app and verify window state is restored

**Complexity**: Medium

---

### **App 10 - OAuth2 Authentication Flow**

**Name**: OAuth2 Login Manager

**Core API**:
- `Microsoft.Security.Authentication.OAuth.OAuth2Manager`

**Description**:
> I want to create an app that allows users to sign in using popular identity providers (like Microsoft, Google, or GitHub) through OAuth 2.0. The app should launch the default browser for user authentication, securely receive the authorization code or access token, and then use this token to access protected resources on behalf of the user.

**Test Scenarios**:
1. **Authorization Code Flow**: Complete OAuth flow using authorization code grant
2. **Implicit Grant Flow**: Complete OAuth flow using implicit grant
3. **Browser Launch**: Verify default browser opens with correct auth URL
4. **Token Receipt**: Verify access token is received after successful login
5. **Token Display**: Display received token information in app
6. **Login Cancel**: Cancel login in browser and verify app handles gracefully
7. **Invalid Client ID**: Test with incorrect client ID and verify error handling
8. **Token Refresh**: Test token refresh flow if applicable
9. **Logout Flow**: Implement and test logout/token revocation
10. **Multiple Providers**: Test with different OAuth providers

**Complexity**: Medium

---

### **App 11 - Multi-Language Resource Manager**

**Name**: Resource Manager

**Core API**:
- `Microsoft.Windows.ApplicationModel.Resources.ResourceLoader`
- `Microsoft.Windows.ApplicationModel.Resources.ResourceManager`

**Description**:
> I want to build an app that supports multiple languages and can load different resources based on user preferences. The app should be able to load localized strings, images, and other assets from resource files, automatically selecting the appropriate version based on system language settings or user selection.

**Test Scenarios**:
1. **Load Default String**: Load a string resource using default language
2. **Load Localized String**: Change system language and verify correct localized string loads
3. **Fallback Behavior**: Request resource for unsupported language and verify fallback
4. **Multiple Resource Files**: Load resources from different .resw files
5. **Resource Not Found**: Request non-existent resource and verify error handling
6. **Image Resources**: Load localized image resources
7. **Runtime Language Change**: Change language at runtime and verify resources update
8. **Resource Context**: Create custom resource context and verify selection
9. **Packaged Resources**: Verify resources work in packaged deployment
10. **Unpackaged Resources**: Verify resources work in unpackaged deployment

**Complexity**: Medium

---

### **App 12 - Custom Controls Library**

**Name**: Custom Controls

**Core API**:
- `Microsoft.UI.Xaml.Controls.UserControl`
- `Microsoft.UI.Xaml.Controls.Control` (Custom Control)
- `Microsoft.Windows.CsWinRT` (C# WinRT Authoring)

**Description**:
> I want to create reusable UI components that can be shared across multiple applications. The app demonstrates how to build custom controls in C# that can be consumed by both C# and C++ applications, allowing teams to create consistent UI experiences across their product suite.

**Test Scenarios**:
1. **User Control Display**: Add user control to page and verify it renders
2. **Custom Control Display**: Add custom control to page and verify it renders
3. **Property Binding**: Bind control properties and verify two-way binding works
4. **Event Handling**: Subscribe to control events and verify they fire
5. **C# App Consumption**: Use control in C# WinUI app
6. **C++ App Consumption**: Use control in C++ WinUI app
7. **Packaged Deployment**: Verify controls work in packaged app
8. **Unpackaged Deployment**: Verify controls work in unpackaged app
9. **Control Styling**: Apply custom styles to controls and verify appearance
10. **Control Templates**: Apply custom control template and verify functionality

**Complexity**: High

---

### **App 13 - Background Task Scheduler**

**Name**: Background Task Scheduler

**Core API**:
- `Windows.ApplicationModel.Background.BackgroundTaskBuilder`
- `Windows.ApplicationModel.Background.BackgroundTaskRegistration`

**Description**:
> I want to create an app that can perform work in the background even when the main application is not running. The app should register background tasks that execute on specific triggers (like time intervals, system events, or push notifications) and can run code in-process or in a separate out-of-process component.

**Test Scenarios**:
1. **In-Process Task Registration**: Register a background task that runs in-process
2. **Out-of-Process Task Registration**: Register task in separate background process
3. **Time Trigger**: Set up task with time trigger and verify execution
4. **System Trigger**: Set up task with system event trigger
5. **Task Execution**: Trigger task and verify code executes
6. **Task Progress**: Report and display task progress
7. **Task Completion**: Verify task completion callback fires
8. **Task Cancellation**: Cancel running task and verify cleanup
9. **Task Unregistration**: Unregister task and verify it no longer runs
10. **Multiple Tasks**: Register and manage multiple background tasks

**Complexity**: High

---

### **App 14 - Deployment Manager Utility**

**Name**: Deployment Manager

**Core API**:
- `Microsoft.Windows.ApplicationModel.WindowsAppRuntime.DeploymentManager`

**Description**:
> I want to build an app that checks if the Windows App SDK runtime is properly installed and initialized before my application's main features start. This ensures users have a smooth experience and get helpful guidance if dependencies are missing, rather than cryptic error messages.

**Test Scenarios**:
1. **Runtime Check**: Check if Windows App SDK runtime is installed
2. **Status Display**: Display deployment status information
3. **Initialization Success**: Verify successful initialization on compatible system
4. **Missing Runtime**: Test behavior when runtime is not installed
5. **Version Mismatch**: Test with mismatched runtime version
6. **Auto-Initialize**: Test automatic initialization behavior
7. **Manual Initialize**: Test manual initialization API calls
8. **Error Handling**: Verify helpful error messages for failures
9. **Repair Guidance**: Verify user guidance for fixing deployment issues
10. **Runtime Installation**: Guide user through runtime installation if missing

**Complexity**: Low

---

### **App 15 - Self-Contained Deployment Package**

**Name**: Self-Contained App

**Core API**:
- Windows App SDK Self-Contained Deployment
- Framework Package References

**Description**:
> I want to distribute my application as a completely standalone package that doesn't require users to install any additional runtime or framework packages. The app bundles all necessary Windows App SDK components within itself, ensuring it works on any compatible Windows system without additional downloads.

**Test Scenarios**:
1. **Build Self-Contained**: Build app with self-contained configuration
2. **Package Size**: Verify resulting package includes all dependencies
3. **Clean Machine Deployment**: Deploy to machine without Windows App SDK runtime
4. **App Execution**: Verify app runs without external dependencies
5. **API Functionality**: Verify all Windows App SDK APIs work correctly
6. **Update Scenario**: Test updating self-contained app
7. **Side-by-Side**: Run alongside apps using different SDK versions
8. **Packaged Self-Contained**: Test self-contained with MSIX packaging
9. **Unpackaged Self-Contained**: Test self-contained without packaging
10. **Distribution Size**: Compare package size with framework-dependent deployment

**Complexity**: Medium

---

### **App 16 - Mica Material Showcase**

**Name**: Mica Material Demo

**Core API**:
- `Microsoft.UI.Composition.SystemBackdrops.MicaController`
- `Microsoft.UI.Xaml.Media.MicaBackdrop`

**Description**:
> I want to create an app that showcases the modern Mica material design, which provides a translucent, tinted background that shows the user's desktop wallpaper subtly through the app window. This creates a beautiful, personalized appearance that feels integrated with the Windows desktop environment.

**Test Scenarios**:
1. **Basic Mica**: Apply Mica backdrop to window and verify appearance
2. **Mica Alt**: Apply Mica Alt variant and compare appearance
3. **Theme Adaptation**: Switch between light/dark themes and verify Mica adapts
4. **Wallpaper Visibility**: Change desktop wallpaper and verify tint updates
5. **Window Focus**: Focus/unfocus window and observe material behavior
6. **Win32 Integration**: Apply Mica to Win32 window (non-XAML)
7. **WebView2 Integration**: Apply Mica to window containing WebView2
8. **Fallback Behavior**: Test on systems without Mica support
9. **Performance**: Verify smooth performance with Mica enabled
10. **Multiple Windows**: Apply Mica to multiple windows simultaneously

**Complexity**: Low

---

### **App 17 - Visual Composition Gallery**

**Name**: Composition Effects Gallery

**Core API**:
- `Microsoft.UI.Composition.Compositor`
- `Microsoft.UI.Composition.Visual`
- `Microsoft.UI.Composition.ExpressionAnimation`

**Description**:
> I want to create an app that showcases beautiful visual effects and animations using the Windows Composition layer. The app should demonstrate smooth animations, blur effects, shadow effects, and other visual transformations that create engaging and fluid user experiences.

**Test Scenarios**:
1. **Basic Visual**: Create and display composition visual
2. **Translation Animation**: Animate visual position smoothly
3. **Scale Animation**: Animate visual size changes
4. **Rotation Animation**: Animate visual rotation
5. **Opacity Animation**: Fade visuals in and out
6. **Blur Effect**: Apply Gaussian blur to visual content
7. **Shadow Effect**: Add drop shadow to visual
8. **Expression Animation**: Create animation using expression string
9. **Chained Animations**: Sequence multiple animations
10. **Interactive Demo**: Respond to user gestures with animations

**Complexity**: High

---

### **App 18 - Input Gesture Recognizer**

**Name**: Input & Gesture Demo

**Core API**:
- `Microsoft.UI.Input.GestureRecognizer`
- `Microsoft.UI.Input.PointerPoint`
- `Microsoft.UI.Input.InputCursor`

**Description**:
> I want to build an app that demonstrates how to handle various user input methods including touch gestures, mouse actions, and pen input. The app should recognize common gestures like tap, double-tap, hold, drag, pinch-to-zoom, and rotation, providing visual feedback for each recognized gesture.

**Test Scenarios**:
1. **Tap Recognition**: Tap on element and verify tap gesture detected
2. **Double Tap**: Double-tap and verify recognition
3. **Hold Gesture**: Press and hold to trigger hold gesture
4. **Drag Gesture**: Drag element and verify position updates
5. **Pinch to Zoom**: Use two fingers to zoom and verify scale changes
6. **Rotation Gesture**: Rotate with two fingers and verify angle changes
7. **Manipulation Events**: Handle manipulation start/update/complete
8. **Mouse Input**: Verify gestures work with mouse
9. **Touch Input**: Verify gestures work with touch
10. **Custom Cursor**: Change cursor appearance based on interaction

**Complexity**: Medium

---

### **App 19 - App Insights Telemetry**

**Name**: App Insights Logger

**Core API**:
- `Microsoft.Windows.Insights` (ETW/TraceLogging)

**Description**:
> I want to add telemetry to my application to understand how users interact with it and to diagnose issues. The app demonstrates how to define custom events, log them during app execution, capture the data locally for analysis, and view the collected information using Windows Performance Analyzer.

**Test Scenarios**:
1. **Define Events**: Define custom telemetry events in code
2. **Log Event**: Trigger and log a custom event
3. **Event Parameters**: Log events with additional data parameters
4. **Start Trace Capture**: Begin capturing events using tracelog
5. **Stop Trace**: Stop capture and save ETL file
6. **View in WPA**: Open ETL file in Windows Performance Analyzer
7. **Event Filtering**: Filter specific events in trace viewer
8. **Performance Events**: Log performance-related events
9. **Error Events**: Log error and exception events
10. **Session Correlation**: Correlate events within user session

**Complexity**: Medium

---

### **App 20 - Windows ML Image Classifier**

**Name**: ML Image Classifier

**Core API**:
- Windows ML / ONNX Runtime
- `Microsoft.ML.OnnxRuntime`
- Execution Provider APIs

**Description**:
> I want to create an app that uses machine learning to classify images. The app should be able to load a pre-trained ONNX model, process input images, run inference using available hardware acceleration (CPU, GPU, or NPU), and display the classification results with confidence scores.

**Test Scenarios**:
1. **Model Loading**: Load SqueezeNet or ResNet ONNX model
2. **Image Preprocessing**: Convert image to model input format
3. **CPU Inference**: Run inference using CPU execution provider
4. **GPU Inference**: Run inference using GPU if available
5. **NPU Inference**: Run inference using NPU if available
6. **Classification Result**: Display top prediction with confidence
7. **Top-5 Results**: Display top 5 predictions
8. **Batch Processing**: Process multiple images in sequence
9. **Model Compilation**: Test first-run model optimization
10. **Different Deployment**: Test in self-contained and framework-dependent modes

**Complexity**: High

---

### **App 21 - Windows AI Foundry Integration**

**Name**: AI Foundry Demo

**Core API**:
- Windows AI Foundry APIs
- Local AI Model Integration

**Description**:
> I want to build a WinUI 3 app that leverages on-device AI capabilities through Windows AI Foundry. The app should demonstrate how to integrate AI models that run locally on the user's device, providing intelligent features while maintaining privacy by keeping data on-device without cloud dependencies.

**Test Scenarios**:
1. **WinUI Integration**: Use AI Foundry in WinUI 3 app
2. **Packaged Deployment**: Test in packaged (MSIX) deployment
3. **Sparse Package**: Test in sparse packaged deployment
4. **Model Inference**: Run local AI model inference
5. **Hardware Acceleration**: Verify GPU/NPU utilization
6. **Response Processing**: Process and display AI model output
7. **Performance Measurement**: Measure inference latency

**Complexity**: High

---

## Summary by Complexity

### Low Complexity
- File & Folder Picker Application
- Badge Notification Display
- Deployment Manager Utility
- Mica Material Showcase

### Medium Complexity
- Camera Capture Tool
- App Notification Center
- Window Management Tool
- OAuth2 Authentication Flow
- Multi-Language Resource Manager
- Self-Contained Deployment Package
- Input Gesture Recognizer
- App Insights Telemetry

### High Complexity
- Photo Editor Application
- App Lifecycle Manager
- Push Notification Client
- Windows Widgets Dashboard
- Custom Controls Library
- Background Task Scheduler
- Visual Composition Gallery
- Windows ML Image Classifier
- Windows AI Foundry Integration

---

## Sample Folder Reference

| Scenario | Sample Folder |
|----------|---------------|
| Camera Capture Tool | `CameraCaptureUI/` |
| Photo Editor Application | `PhotoEditor/` |
| File & Folder Picker Application | `StoragePickers/` |
| App Lifecycle Manager | `AppLifecycle/` |
| Push Notification Client | `Notifications/Push/` |
| App Notification Center | `Notifications/App/` |
| Badge Notification Display | `Notifications/Badge/` |
| Windows Widgets Dashboard | `Widgets/` |
| Window Management Tool | `Windowing/` |
| OAuth2 Authentication Flow | `OAuth2Manager/` |
| Multi-Language Resource Manager | `ResourceManagement/` |
| Custom Controls Library | `CustomControls/` |
| Background Task Scheduler | `BackgroundTask/` |
| Deployment Manager Utility | `DeploymentManager/` |
| Self-Contained Deployment Package | `SelfContainedDeployment/` |
| Mica Material Showcase | `Mica/` |
| Visual Composition Gallery | `SceneGraph/` |
| Input Gesture Recognizer | `Input/` |
| App Insights Telemetry | `Insights/` |
| Windows ML Image Classifier | `WindowsML/` |
| Windows AI Foundry Integration | `WindowsAIFoundry/` |
