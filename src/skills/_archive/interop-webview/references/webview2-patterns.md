# WebView2 Patterns — Detailed Reference

Detailed patterns for WebView2 integration in WinUI 3 — initialization, navigation, JavaScript interop, security, virtual host mapping, cookies, and performance.

---

## WebView2 Setup and Initialization

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

---

## Navigation

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

---

## JavaScript Interop — C# to JavaScript

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

---

## JavaScript Interop — JavaScript to C#

**Pattern A: Web messages with `postMessage()` (preferred):**

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

---

## Configuration

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

**Common feature toggles:**

```csharp
var settings = MyWebView.CoreWebView2.Settings;
settings.AreDevToolsEnabled = false;
settings.AreDefaultContextMenusEnabled = false;
settings.IsZoomControlEnabled = false;
settings.IsStatusBarEnabled = false;
settings.IsWebMessageEnabled = true;
```

---

## Security

- Filter navigation targets in `NavigationStarting` to block unwanted URLs.
- Validate `WebMessageReceived` origin before processing messages.
- Serialize user input via `JsonSerializer` before passing to `ExecuteScriptAsync`.
- Disable `IsScriptEnabled` when loading untrusted static content.

---

## Virtual Host Mapping

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

---

## Cookie and State Management

```csharp
var cookieManager = MyWebView.CoreWebView2.CookieManager;
var cookies = await cookieManager.GetCookiesAsync("https://example.com");

var newCookie = cookieManager.CreateCookie("session", "abc123", ".example.com", "/");
cookieManager.AddOrUpdateCookie(newCookie);

await MyWebView.CoreWebView2.Profile.ClearBrowsingDataAsync(); // clear all browsing data
```

---

## Performance

- **Lazy initialization** — don't create `WebView2` until the user needs it.
- Multiple `WebView2` instances share a browser process but each consumes significant memory (~150 MB).
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

## Verification Checklist

- [ ] `WebView2` initializes without errors and `CoreWebView2Initialized` is handled
- [ ] Navigation works with URL binding, `NavigateToString()`, and programmatic `Navigate()`
- [ ] `NavigationStarting` and `NavigationCompleted` events fire correctly
- [ ] C#→JS interop via `ExecuteScriptAsync` returns correct JSON-encoded results
- [ ] JS→C# interop via `WebMessageReceived` delivers messages with origin validation
- [ ] `CoreWebView2Settings` restrict DevTools, context menus, and zoom as intended
- [ ] Local content loads correctly via `SetVirtualHostNameToFolderMapping()`
- [ ] `MemoryUsageTargetLevel` is set to `Low` when WebView2 is hidden
