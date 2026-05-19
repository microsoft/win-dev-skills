# Data Sources

`winui-search` builds its index from two upstream repositories. This doc describes
exactly **which files** are used, **what for**, and **how** they're processed.

> Reference clones (developer convenience only — runtime always reads from GitHub):
> - `Q:\WinUI-Gallery\` — https://github.com/microsoft/WinUI-Gallery
> - `Q:\Windows\` — https://github.com/CommunityToolkit/Windows

---

## 1. WinUI Gallery — `microsoft/WinUI-Gallery`

Fetcher: **`GalleryFetcher.cs`** (cached for 7 days under
`%LOCALAPPDATA%\winui-search\cache\gallery`; fallback to embedded `Data/gallery-*.json`).

### Files we read

| Path on `main` | Purpose | Fields used |
|---|---|---|
| `WinUIGallery/Samples/Data/ControlInfoData.json` | Master index of every control | `Groups[].Items[]`: `UniqueId`, `Title`, `Subtitle`, `Description`, `ApiNamespace`, `RelatedControls`, `Docs[]`, plus group-level `Folder` for IsSpecialSection items |
| `WinUIGallery/Samples/ControlPages/{UniqueId}Page.xaml` | Per-control sample page | `<controls:ControlExample HeaderText="…">` blocks — one per scenario. Inline `<ControlExample.Xaml>` / `<ControlExample.CSharp>`, plus attributes `XamlSource=`/`CSharpSource=` pointing to external code files |
| `WinUIGallery/Samples/ControlPages/{UniqueId}Page.xaml.cs` | Code-behind (real working C#) | Whole file — used by `ExtractFromCodeBehind` to build symbol-closure C# (preferred over inline templated C#, which contains `$(...)` substitutions that break agent builds) |
| `WinUIGallery/Samples/SampleCode/...` | External code referenced by `XamlSource=`/`CSharpSource=` | Raw file contents — fallback when code-behind extraction misses |

### Fields actually consumed (not all schema fields)

From each `ControlInfoData.json` Item we extract:
- `UniqueId` → `Scenario.ControlId` (lowercased)
- `Title` → `Scenario.ControlName`
- **`Subtitle`** → `Scenario.ControlDescription` (median 68 chars / max 129) — surfaced in `search` list as `[gallery] Name — <Subtitle>`. Also concatenated with Title + Description for tag-source text
- `Description` (median 144 chars / max 448) — used **only** as tag-source text; was previously surfaced per-control in search but dropped during compression because it bloated tokens (Subtitle is the lighter replacement)
- **`ApiNamespace`** → `Scenario.ApiNamespace` (surfaced in `get` output for non-default namespaces only — see § Output)
- `RelatedControls[]` → `Scenario.RelatedControls` (surfaced as `**See also:**`)
- `Docs[]` → `Scenario.Docs` (kept on the Scenario but **not emitted** — agents never fetch them)
- `Folder` (when `IsSpecialSection: true`) → URL prefix for the control page

Schema reference: `WinUIGallery/Samples/Data/ControlInfoDataSchema.json` —
JSON-Schema description of every field. Read for documentation; **not loaded at runtime**.

### Files NOT used

Everything else under `WinUI-Gallery/`:
- `WinUIGallery/` app shell, MainWindow, App.xaml, Helpers, framework code
- `WinUIGallery/Samples/SamplePages/`, `Samples/SampleHelpers/`
- `WinUIGallery.SourceGenerator/`
- `tests/`, `scripts/`, `packagestore/`, `.pipelines/`, `.github/`
- `WinUIGallery/Assets/` (icons, images, sample media)

### Output: when does Namespace show?

- 79/115 controls map to `Microsoft.UI.Xaml.Controls` — auto-imported in default
  templates, **suppressed** to keep output clean.
- 76 scenarios across 14 long-tail namespaces emit `**Namespace:** \`xxx\``:
  - `Microsoft.UI.Xaml`, `Microsoft.UI.Windowing`, `Microsoft.UI.Xaml.Media.Animation`,
    `Microsoft.UI.Xaml.Shapes`, `Windows.ApplicationModel.DataTransfer`,
    `Microsoft.Windows.Notifications`, `Microsoft.Windows.Storage.Pickers`,
    `Microsoft.UI.Composition.SystemBackdrops`, `Microsoft.UI.Xaml.Controls.Primitives`,
    `Microsoft.Windows.BadgeNotifications`, `Windows.UI.StartScreen` (jumplist),
    `Microsoft.UI.Xaml.Input`, `Microsoft.UI.Xaml.Media`, `Microsoft.UI.Content`.

These are the namespaces agents most often miss when writing `using` / `xmlns`
declarations.

---

## 2. CommunityToolkit Windows — `CommunityToolkit/Windows`

Fetcher: **`ToolkitFetcher.cs`** (cached for 7 days under
`%LOCALAPPDATA%\winui-search\cache\toolkit`; fallback to embedded `Data/toolkit-*.json`).

### Files we read

| Path pattern | Purpose | Fields used |
|---|---|---|
| `https://api.github.com/repos/CommunityToolkit/Windows/git/trees/main?recursive=1` | File tree to discover all components/samples | All paths under `components/` |
| `components/<Component>/src/<Package>.csproj` | NuGet package id (the csproj filename = package id) | filename → `Scenario.NuGetPackage` |
| `components/<Component>/samples/<File>.md` | Sample frontmatter + descriptions + tags | YAML frontmatter (`title`, `description`, `keywords`), `## <SampleName>` headings → control description + per-sample text |
| `components/<Component>/samples/<File>.xaml` | XAML scenario | Whole file — extracted as `Scenario.Xaml`, with derived `xmlns:` imports → `Scenario.XmlnsImports` |
| `components/<Component>/samples/<File>.xaml.cs` | Code-behind (when present) | Whole file — `Scenario.CSharp` |

### Skipped components (not visual controls)

`Triggers`, `Converters`, `Behaviors`, `Extensions`, `Helpers`, `Media`,
`DeveloperTools`, `Animations`, `CameraPreview`, `LayoutTransformControl`.

### Sample-name → controlId overrides

`SampleOverrides` dictionary in `ToolkitFetcher.cs` — collapses multiple
sample files to one control (e.g., `SettingsCardSample` + `ClickableSettingsCardSample`
+ `SettingsPageExample` all → `settingscard`).

### Files NOT used

- `tests/`, `docs/`, `.github/`, repo-level configs
- `components/<Component>/src/` source code (we only read csproj filename, not contents)

---

## 3. Hand-curated data shipped with the tool

Files under `src/tools/winui-search/Data/` — embedded resources baked into the exe:

| File | Source | Purpose |
|---|---|---|
| `gallery-scenarios.json` | Auto-baked from § 1 by `winui-search update` | 325 scenarios across 115 controls — fallback when GitHub fetch fails or cache stale |
| `gallery-tags.json` | Auto-baked from § 1 (with manual overrides for missing controls like `jumplist-*`) | Per-control keyword arrays for BM25 |
| `toolkit-scenarios.json` | Auto-baked from § 2 | 48 scenarios across 26 controls |
| `toolkit-tags.json` | Auto-baked from § 2 | Per-control keyword arrays for BM25 |
| `core-patterns.json` | **Hand-written** | 6 platform patterns Gallery doesn't cover well: jumplist, share contract, file picker, drag-drop, etc. Loaded as a separate index alongside scenarios |

---

## 4. Cache & refresh

- Cache dir: `%LOCALAPPDATA%\winui-search\cache\{gallery,toolkit}\`
- TTL: 7 days
- Schema version: see `CacheVersion.cs` (currently `"14"`). **Bump it on any
  embedded-data or tag-logic change**, otherwise existing user caches keep serving
  the older snapshot. Recent bumps:
  - `10` Notes/Synonyms refactor
  - `11` Added chip/token/tag entries to TokenizingTextBox tags
  - `12` Added StopWords.TagOnly (text/input/layout/pick/basics/advanced)
  - `13` Toolkit cache now written CLEAN (CleanTagDictionary applied before serialize)
  - `14` Plan A keywords.json + Plan B Header attribute is the sole HeaderText source
- Manual refresh: `winui-search update` — pulls fresh data from GitHub and rewrites
  `%LOCALAPPDATA%` cache. To re-bake the embedded fallback, copy
  `%LOCALAPPDATA%\winui-search\cache\gallery\*.json` →
  `src\tools\winui-search\Data\gallery-*.json` and rebuild.

---

## 5. Quick stats (after most recent refresh)

| Source | Scenarios | Unique controls | Notes |
|---|---:|---:|---|
| Gallery | 325 | 115 | 288 with `ApiNamespace`, 76 of which are non-default (shown as hint) |
| Toolkit | 48 | 26 | All carry `NuGetPackage` + `XmlnsImports` |
| Core patterns | 6 | n/a | jumplist, share-target, file-picker, drag-drop, etc. |
| **Total** | **379 patterns** | | |
