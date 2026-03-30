# winmd — WinMD API Metadata Cache & Query Tool

A native AOT CLI that indexes WinRT (`.winmd`) and managed .NET (`.dll`) metadata from NuGet packages, Windows SDK, and WinAppSDK. Provides fast, offline API lookup with XML documentation descriptions — the same data Visual Studio IntelliSense uses.

## Building

```powershell
# Build native AOT exe and deploy to src/skills/winmd-api-search/
.\scripts\build-winmd.ps1

# Build for ARM64
.\scripts\build-winmd.ps1 -Runtime win-arm64

# Build only (don't deploy)
.\scripts\build-winmd.ps1 -SkipPublish
```

Requires .NET 10 SDK. Produces a self-contained ~8MB single-file executable.

## Architecture

Two-phase design:

1. **`update`** — Discovers NuGet packages and Windows SDK, parses `.winmd` files and XML documentation, caches structured JSON to `%LOCALAPPDATA%\winmd-cache`
2. **Query commands** — Read from the JSON cache. Auto-refresh triggers when `project.assets.json` is newer than the cached manifest.

### Data Sources

| Source | Discovery | Content |
|--------|-----------|---------|
| NuGet packages | `project.assets.json` or `packages.config` | `.winmd` files + adjacent `.xml` docs |
| Windows SDK | `%ProgramFiles(x86)%\Windows Kits\10\UnionMetadata` | `Windows.winmd` |
| WinAppSDK runtime | `Get-AppxPackage Microsoft.WindowsAppRuntime.*` | Runtime `.winmd` files |
| XML docs (WinUI) | `microsoft.windowsappsdk.winui` NuGet package | Type/member descriptions |
| XML docs (SDK) | `microsoft.windows.sdk.net.ref` NuGet package | 48K+ WinRT API descriptions |

### Cache Layout

```
%LOCALAPPDATA%\winmd-cache\
  projects\
    MyApp.json              # Project manifest (packages list)
  packages\
    Microsoft.WindowsAppSDK.WinUI\1.8.x\
      meta.json             # Package metadata + stats
      namespaces.json       # List of namespaces
      types\
        Microsoft_UI_Xaml_Controls.json  # Types with members + descriptions
```

## Commands

### `search <query>` — Find APIs by keyword

Fuzzy search across all cached types and members. Warns when a type name exists in multiple namespaces (e.g., `FileAttributes` in both `System.IO` and `Windows.Storage`).

```
> winmd search TabView
[100] Microsoft.UI.Xaml.Controls
    Class Microsoft.UI.Xaml.Controls.TabView [100]
```

### `members <FullTypeName>` — Type details with descriptions

Shows all properties, events, and methods grouped by kind. Includes XML doc descriptions from NuGet packages — the same text VS IntelliSense shows. Emits `⚠️ GetForCurrentView()` warnings for UWP-era APIs that need desktop interop.

```
> winmd members Microsoft.UI.Xaml.Window
Class Microsoft.UI.Xaml.Window
  Represents the window of the current Application.
  Extends: System.Object

  Properties:
    Content : UIElement { get; set; } — Gets or sets the visual root of an application window.
    Current : Window { get; } — Desktop apps always return null for this property.
    Dispatcher : CoreDispatcher { get; } — Always returns null. Use Window.DispatcherQueue instead.
    ...
```

### `check-property <TypeName> <PropertyName>` — Property validation

Validates a property exists on a type, including inherited properties and attached properties. On miss, suggests similar properties and which types have the requested property.

```
> winmd check-property Grid Row
✅ Microsoft.UI.Xaml.Controls.Grid.Row (attached)
   Int32 — via Grid.GetRow() / Grid.SetRow()

> winmd check-property TextBox Icon
❌ Microsoft.UI.Xaml.Controls.TextBox does not have property 'Icon'
  Similar TextBox properties:
    Header : object { get; set; } — Gets or sets the content for the control's header.
  Types that have an 'Icon' property:
    AppBarButton.Icon : IconElement { get; set; }
```

### `types <Namespace>` — List types in a namespace

### `enums <FullTypeName>` — List enum values

### `namespaces [--filter <prefix>]` — Browse namespaces

### `packages` / `projects` / `stats` — Index info

## Metadata Features

| Feature | Source | Description |
|---------|--------|-------------|
| XML doc descriptions | `.xml` files from NuGet | Descriptions for types, properties, methods, events |
| `[Deprecated]` warnings | Custom attributes in `.winmd` | Flags deprecated APIs with replacement guidance |
| Namespace disambiguation | Query-time computation | Warns when a type name exists in multiple namespaces |
| Attached property detection | Static `GetXxx`/`SetXxx` method patterns | Recognizes XAML attached properties |
| `GetForCurrentView()` warning | Method name pattern | Warns about UWP-era APIs needing desktop interop |
| Inheritance resolution | Base type chain walking | `check-property` checks inherited members |

## Source Files

| File | Purpose |
|------|---------|
| `Program.cs` | Entry point, CLI dispatch, update flow, project resolution |
| `QueryEngine.cs` | All query commands (search, members, check-property, etc.) |
| `WinMdParser.cs` | PE metadata reader — extracts types, members, `[Deprecated]` attributes |
| `XmlDocParser.cs` | .NET XML documentation file parser |
| `NuGetResolver.cs` | Package discovery from assets.json, packages.config, SDK, runtime |
| `Scoring.cs` | Fuzzy search scoring (exact → prefix → contains → acronym → subsequence) |
| `SimpleTypeProvider.cs` | Metadata signature decoder (turns IL signatures into readable type names) |
| `CustomAttributeTypeProvider.cs` | Custom attribute decoder for `[Deprecated]` extraction |
| `CliArgs.cs` | CLI argument parser |

## Options

```
--project-dir <path>          Project directory (default: cwd)
--project <name>              Project name (auto-selected if unambiguous)
--output <path>               Cache directory (default: %LOCALAPPDATA%\winmd-cache)
--scan                        Recursively discover projects (update only)
--max <n>                     Max search results (default: 30)
--filter <prefix>             Namespace prefix filter (namespaces only)
--winappsdk-runtime <path>    WinAppSDK runtime path override
```
