---
name: webview2
description: 'Rules for integrating WebView2 browser controls in WinUI 3 desktop applications, covering initialization, navigation, JavaScript interop, security, and performance.'
---

# WebView2 Integration in WinUI 3

These rules apply to embedding and interacting with the Microsoft Edge WebView2 control in WinUI 3 desktop applications using the Windows App SDK.

---

## Rules

### 1. WebView2 Setup and Initialization

Add the `WebView2` control from `Microsoft.UI.Xaml.Controls`. The Edge WebView2 Runtime is bundled with Windows 11 and installable on Windows 10.

**XAML declaration:**

```xml
<WebView2 x:Name="MyWebView"
          Source="https://example.com"
          NavigationCompleted="MyWebView_NavigationCompleted" />
```

**Always await initialization and handle failures:**

```csharp
MyWebView.CoreWebView2Initialized += (sender, args) =>
{
    if (args.Exception is not null)
    {
        Logger.Error($"WebView2 init failed: {args.Exception.Message}");
    }
};

await MyWebView.EnsureCoreWebView2Async();
// Safe to access CoreWebView2 after this point
MyWebView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
```

### 2. Navigation

Use `Source` for XAML-bound URL navigation, `NavigateToString()` for HTML content, or `CoreWebView2.Navigate()` for programmatic control.

```csharp
MyWebView.Source = new Uri("https://example.com");                   // URL binding
MyWebView.CoreWebView2.Navigate("https://example.com/page");        // Programmatic
MyWebView.NavigateToString("<html><body><h1>Hello</h1></body></html>"); // HTML content
```

**Navigation events:**

```csharp
MyWebView.CoreWebView2.NavigationStarting += (sender, args) =>
{
    // Cancel or inspect navigation before it begins
    if (!IsAllowedUri(args.Uri))
    {
        args.Cancel = true;
    }
};

MyWebView.CoreWebView2.NavigationCompleted += (sender, args) =>
{
    if (!args.IsSuccess)
    {
        Logger.Warn($"Navigation failed: {args.WebErrorStatus}");
    }
};
```

### 3. JavaScript Interop — C# to JavaScript

Use `ExecuteScriptAsync()` to run JavaScript. Return values are JSON-encoded strings.

```csharp
// Execute JS and get result
string result = await MyWebView.CoreWebView2.ExecuteScriptAsync("document.title");
// result is JSON-encoded, e.g. "\"My Page Title\""

string parsed = JsonSerializer.Deserialize<string>(result);

// Call a JS function with parameters — always serialize safely
string safeValue = JsonSerializer.Serialize(userInput);
await MyWebView.CoreWebView2.ExecuteScriptAsync($"updateContent({safeValue})");
```

### 4. JavaScript Interop — JavaScript to C#

**Pattern A: Web messages with `postMessage()`:**

```csharp
// C# side — register handler
MyWebView.CoreWebView2.WebMessageReceived += (sender, args) =>
{
    string origin = args.Source;
    if (!IsAllowedOrigin(origin))
    {
        return; // Reject messages from unexpected origins
    }

    string message = args.TryGetWebMessageAsString();
    HandleWebMessage(message);
};
```

```javascript
// JavaScript side — send message to C#
window.chrome.webview.postMessage("button-clicked");
window.chrome.webview.addEventListener("message", (event) => {
    console.log("From C#:", event.data);
});
```

**Pattern B: Host objects for direct C# object access (trusted content only):**

> Security: Prefer Pattern A (`WebMessageReceived`) for most JS → C# communication, especially when any untrusted or remote content can load in the WebView. Only use host objects when you fully control all navigations/content and can keep the exposed API surface minimal and well reviewed.

```csharp
// Expose a minimal, carefully reviewed C# object to JavaScript.
// Do NOT use host objects when the WebView can display untrusted or remote content.
[ClassInterface(ClassInterfaceType.AutoDual)]
[ComVisible(true)]
public class BridgeObject
{
    public string GetData() => "Hello from C#";
}

MyWebView.CoreWebView2.AddHostObjectToScript("bridge", new BridgeObject());
```

```javascript
// JavaScript side
const bridge = chrome.webview.hostObjects.bridge;
const data = await bridge.GetData();
```

### 5. Configuration

**Custom environment with options:**

```csharp
var options = new CoreWebView2EnvironmentOptions
{
    Language = "en-US",
    AdditionalBrowserArguments = "--disable-gpu"
};
var environment = await CoreWebView2Environment.CreateAsync(
    browserExecutableFolder: null,
    userDataFolder: Path.Combine(ApplicationData.Current.LocalFolder.Path, "WebView2Data"),
    options: options);
await MyWebView.EnsureCoreWebView2Async(environment);
```

**Common feature toggles (not exhaustive):**

```csharp
var settings = MyWebView.CoreWebView2.Settings;
settings.AreDevToolsEnabled = false;
settings.AreDefaultContextMenusEnabled = false;
settings.IsZoomControlEnabled = false;
settings.IsStatusBarEnabled = false;
settings.IsWebMessageEnabled = true;
```

### 6. Security

- Filter navigation targets in `NavigationStarting` to block unwanted URLs.
- Validate `WebMessageReceived` origin before processing messages.
- Serialize user input via `JsonSerializer` before passing to `ExecuteScriptAsync`.
- Disable `IsScriptEnabled` when loading untrusted static content.

### 7. Virtual Host Mapping

Load local bundled web assets as if served from a web origin:

> **Security:** Use the least-permissive `CoreWebView2HostResourceAccessKind` value that works for your scenario. `Allow` grants broad access; prefer `DenyCors` when the web content does not need cross-origin requests to mapped resources. Pair host mapping with navigation restrictions to prevent untrusted remote content from accessing local resources.

```csharp
MyWebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
    hostName: "app.local",
    folderPath: Path.Combine(AppContext.BaseDirectory, "WebAssets"),
    accessKind: CoreWebView2HostResourceAccessKind.Allow);

// Navigate to local content
MyWebView.CoreWebView2.Navigate("https://app.local/index.html");
```

### 8. Cookie and State Management

```csharp
var cookieManager = MyWebView.CoreWebView2.CookieManager;
var cookies = await cookieManager.GetCookiesAsync("https://example.com");

var newCookie = cookieManager.CreateCookie("session", "abc123", ".example.com", "/");
cookieManager.AddOrUpdateCookie(newCookie);

await MyWebView.CoreWebView2.Profile.ClearBrowsingDataAsync(); // clear all browsing data
```

### 9. Performance

- **Lazy initialization** — don't create `WebView2` until the user needs it.
- Multiple `WebView2` instances share a browser process but each consumes significant memory.
- Use `CoreWebView2.MemoryUsageTargetLevel` to reduce memory when hidden:

```csharp
MyWebView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;    // hidden
MyWebView.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;  // visible
```

---

## Anti-patterns

| ❌ Anti-pattern | ✅ Correct approach |
|---|---|
| Accessing `CoreWebView2` without awaiting `EnsureCoreWebView2Async()` | Always `await EnsureCoreWebView2Async()` before any `CoreWebView2` access |
| Passing unsanitized user input to `ExecuteScriptAsync` | Serialize values with `JsonSerializer.Serialize()` before injection |
| Blocking UI thread waiting for JavaScript results | Use `await ExecuteScriptAsync()` — never `.Result` or `.Wait()` |
| Not validating origin in `WebMessageReceived` handler | Check `args.Source` against an allowlist before processing |
| Creating `WebView2` instances eagerly or unnecessarily | Lazy-initialize; instances are heavyweight (~150 MB each) |
| Ignoring `CoreWebView2Initialized` errors | Always subscribe and handle initialization failures |

---

## Validation

### Verification Checklist

- [ ] `WebView2` initializes without errors and `CoreWebView2Initialized` is handled
- [ ] Navigation works with URL binding, `NavigateToString()`, and programmatic `Navigate()`
- [ ] `NavigationStarting` and `NavigationCompleted` events fire correctly
- [ ] C#→JS interop via `ExecuteScriptAsync` returns correct JSON-encoded results
- [ ] JS→C# interop via `WebMessageReceived` delivers messages with origin validation
- [ ] `CoreWebView2Settings` restrict DevTools, context menus, and zoom as intended
- [ ] Local content loads correctly via `SetVirtualHostNameToFolderMapping()`
- [ ] `MemoryUsageTargetLevel` is set to `Low` when WebView2 is hidden

---

## Must Read & Research

> **Agent rule:** Before generating or modifying WebView2 code, look up the latest API surface using the references below. WebView2 APIs evolve across Windows App SDK releases — verify method signatures and event names against current documentation.

| Topic | Reference |
|---|---|
| WebView2 in WinUI 3 | [Get started with WebView2 in WinUI 3](https://learn.microsoft.com/microsoft-edge/webview2/get-started/winui) |
| CoreWebView2 class | [CoreWebView2 Class Reference](https://learn.microsoft.com/microsoft-edge/webview2/reference/winrt/microsoft_web_webview2_core/corewebview2) |
| JavaScript interop | [Use JavaScript in WebView2](https://learn.microsoft.com/microsoft-edge/webview2/how-to/javascript) |
| Navigation events | [Navigation events in WebView2](https://learn.microsoft.com/microsoft-edge/webview2/concepts/navigation-events) |
| Security best practices | [WebView2 security best practices](https://learn.microsoft.com/microsoft-edge/webview2/concepts/security) |

---

## Related Skills

- **security** — origin validation, CSP, and secure communication patterns
