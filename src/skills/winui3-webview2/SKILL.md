---
name: winui3-webview2
description: "WebView2 browser control for WinUI 3 — embedding web content, JavaScript-to-C# interop (ExecuteScriptAsync, WebMessageReceived, AddHostObjectToScript), virtual host mapping, security best practices, and performance optimization. Use when embedding web content, bridging JS and C#, or adding browser features to a desktop app."
---

### Setup

#### Add WebView2 Control
```xml
<WebView2 x:Name="WebView"
          AutomationProperties.AutomationId="MainWebView"
          Source="https://example.com" />
```
WebView2 is included in Windows App SDK — no additional NuGet package needed.

#### Initialize Before Use
```csharp
await WebView.EnsureCoreWebView2Async();
```
**Always await `EnsureCoreWebView2Async()` before accessing `CoreWebView2`** — accessing it before initialization throws. Handle errors in `CoreWebView2Initialized`:
```csharp
WebView.CoreWebView2Initialized += (s, e) =>
{
    if (e.Exception is not null)
    {
        // Handle initialization failure (missing runtime, etc.)
        Logger.LogError(e.Exception, "WebView2 init failed");
    }
};
```

### JavaScript ↔ C# Communication

#### C# → JavaScript
```csharp
// Execute script and get result
string result = await WebView.CoreWebView2.ExecuteScriptAsync(
    "document.title");

// Pass data safely — serialize via JSON
var data = JsonSerializer.Serialize(new { name = "Test", value = 42 });
await WebView.CoreWebView2.ExecuteScriptAsync(
    $"window.receiveData({data})");
```
Always serialize input with `JsonSerializer` to prevent injection.

#### JavaScript → C#
```csharp
// In C# — subscribe to messages
WebView.CoreWebView2.WebMessageReceived += (s, e) =>
{
    // Validate origin first!
    if (!e.Source.StartsWith("https://trusted-domain.com"))
        return;

    var message = e.TryGetWebMessageAsString();
    ViewModel.HandleWebMessage(message);
};
```

```javascript
// In JavaScript — send message to C#
window.chrome.webview.postMessage("action:save");
window.chrome.webview.postMessage(JSON.stringify({ type: "data", payload: items }));
```

#### Host Objects (advanced — trusted content only)
```csharp
// Expose a C# object to JavaScript
WebView.CoreWebView2.AddHostObjectToScript("app", new AppBridge());
```
```javascript
// In JavaScript
const result = await chrome.webview.hostObjects.app.GetData();
```
Only use for **trusted content** — host objects expose your C# API surface to the web page.

### Local Content with Virtual Host Mapping

Serve local files as if from a web server — avoids CORS issues and `file://` restrictions:
```csharp
await WebView.EnsureCoreWebView2Async();
WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
    "app.local",
    "Assets/Web",
    CoreWebView2HostResourceAccessKind.Allow);
WebView.CoreWebView2.Navigate("https://app.local/index.html");
```

### Security

- **Validate origins** in `WebMessageReceived` — always check `e.Source` before processing
- **Filter navigation** in `NavigationStarting` — block unexpected URLs:
  ```csharp
  WebView.CoreWebView2.NavigationStarting += (s, e) =>
  {
      if (!e.Uri.StartsWith("https://trusted-domain.com"))
          e.Cancel = true;
  };
  ```
- **Disable DevTools** for production: `CoreWebView2.Settings.AreDevToolsEnabled = false`
- **Disable script** for untrusted content: `CoreWebView2.Settings.IsScriptEnabled = false`
- Use virtual host mapping for local content instead of `file://` URLs

### Performance

- **Lazy initialization:** WebView2 uses ~150 MB memory. Create only when needed
- **Memory management:** Set `CoreWebView2.MemoryUsageTargetLevel = Low` when hidden or in background
- **Multi-instance:** Each WebView2 control shares a browser process by default. Use `CoreWebView2Environment.CreateAsync()` with custom user data folder for isolated instances
- **Cleanup:** Call `WebView.Close()` when the control is no longer needed

### Common Pitfalls

| Issue | Fix |
|-------|-----|
| `CoreWebView2` is null | Await `EnsureCoreWebView2Async()` before access |
| JS errors silently ignored | Subscribe to `CoreWebView2.ProcessFailed` |
| Cross-origin blocked | Use virtual host mapping for local content |
| Memory leak | Call `WebView.Close()` on page unload |
| Script injection | Always serialize data with `JsonSerializer` |

### References

| File | Read when... |
|------|-------------|
| `references/webview2-patterns.md` | Advanced WebView2 configuration, cookie management, custom environments, navigation filtering, virtual host mapping |