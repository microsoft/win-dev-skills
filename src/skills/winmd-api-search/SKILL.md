---
name: winmd-api-search
description: 'Find and explore Windows desktop APIs. Use when building features that need platform capabilities — camera, file access, notifications, UI controls, AI/ML, sensors, networking, etc. Discovers the right API for a task, retrieves full type details with descriptions, and validates properties before writing code.'
license: Complete terms in LICENSE.txt
---

# WinMD API Search

Local metadata cache of all Windows/WinUI APIs with IntelliSense-quality descriptions. Searches types, validates properties, and warns about common pitfalls — all offline, no MCP round-trip needed.

**Data sources:** Windows SDK, WinAppSDK/WinUI, all NuGet packages with `.winmd` files, plus XML documentation from the same packages. Cache auto-generates on first query and refreshes when packages change.

## Commands

### search — find APIs by keyword

```powershell
.\.github\skills\winmd-api-search\winmd.exe search "<keyword>"
```

Returns ranked namespaces with matching types. **Warns about namespace ambiguity** — if a type name exists in multiple namespaces (e.g., `FileAttributes` in `System.IO` and `Windows.Storage`), shows a `⚠️ AMBIGUOUS` banner with both options to prevent CS0104 errors.

| Looking for | Keywords to try |
|-------------|----------------|
| AI / language model | `LanguageModel`, `AI`, `MachineLearning` |
| Camera | `camera`, `capture`, `MediaCapture` |
| File access | `file`, `picker`, `StorageFile` |
| Notifications | `notification`, `toast`, `AppNotification` |
| UI Controls | `TabView`, `NavigationView`, `TreeView` |

### members — type details with descriptions

```powershell
.\.github\skills\winmd-api-search\winmd.exe members "<FullTypeName>"
```

Shows properties, events, and methods grouped by kind. Each member includes its **XML doc description** — the same text VS IntelliSense shows. This often reveals critical guidance:

- `Window.Current` → *"Desktop apps always return null for this property."*
- `Window.Dispatcher` → *"Always returns null. Use Window.DispatcherQueue instead."*
- `TabView` → *"Do not use a TabView to display a static set of tabs... Use NavigationView instead."*

**Desktop interop warning:** If a type has `GetForCurrentView()` (a UWP-era pattern), shows `⚠️` that desktop WinUI 3 apps may need COM interop.

**Deprecated API warning:** Members with `[Deprecated]` attributes are flagged with `🚫`.

### check-property — validate before writing XAML

```powershell
.\.github\skills\winmd-api-search\winmd.exe check-property <TypeName> <PropertyName>
```

**Always run this before using a property you're not 100% sure about.** Prevents hallucinated properties that cause build failures.

- Checks direct members, inherited members, and attached properties
- Accepts short names (`TextBox`) or fully-qualified (`Microsoft.UI.Xaml.Controls.TextBox`)

**Positive result:**
```
✅ Microsoft.UI.Xaml.Controls.NavigationView.MenuItems
   IList<Object> MenuItems { get; }
   Gets the collection of menu items displayed in the NavigationView.
```

**Negative result — with actionable suggestions:**
```
❌ Microsoft.UI.Xaml.Controls.TextBox does not have property 'Icon'

  Similar TextBox properties:
    Header : object { get; set; } — Gets or sets the content for the control's header.

  Types that have an 'Icon' property:
    AppBarButton.Icon : IconElement { get; set; }

  Types with a similar property:
    AutoSuggestBox.QueryIcon : IconElement { get; set; }
```

**Attached properties work too:**
```
> check-property Grid Row
✅ Microsoft.UI.Xaml.Controls.Grid.Row (attached)
   Int32 — via Grid.GetRow() / Grid.SetRow()
```

### Other commands

```powershell
# List types in a namespace
.\.github\skills\winmd-api-search\winmd.exe types "<Namespace>"

# Enum values
.\.github\skills\winmd-api-search\winmd.exe enums "<FullTypeName>"

# Browse namespaces
.\.github\skills\winmd-api-search\winmd.exe namespaces --filter "Microsoft.UI"

# Index info
.\.github\skills\winmd-api-search\winmd.exe packages
.\.github\skills\winmd-api-search\winmd.exe stats
```

## Workflow Rules

1. **Restore packages first:** Run `dotnet restore` (or build the project) before querying. The tool reads `project.assets.json` to discover packages — without it, no results will be returned. After adding a new NuGet package, restore again so the tool picks it up automatically.
2. **Before using any WinUI control:** Run `members` to get the real API surface and read the description for usage guidance.
3. **Before writing a property in XAML or C#:** Run `check-property` to verify it exists. Do NOT guess property names.
4. **After a CS0104 ambiguity error:** Run `search` on the type name — it will show both namespaces and tell you to use the fully-qualified name.
5. **Prefer `members` over MCP docs search** for API signatures. The tool has the same descriptions as VS IntelliSense, is faster, and never truncates.

## Options

All commands accept `--project-dir <path>` (defaults to current directory).

```powershell
.\.github\skills\winmd-api-search\winmd.exe search "Button" --project-dir C:\MyApp
.\.github\skills\winmd-api-search\winmd.exe search "Control" --max 5
```
