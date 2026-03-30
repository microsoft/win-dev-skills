
### API Metadata Verification
**Before writing code that use any unfamiliar APIs or platform capability**, use the winmd tool for API lookup - it has IntelliSense-quality descriptions and never truncates.

See `winmd-api-search` skill for full command reference. 

**Prerequisite:** Ensure NuGet packages are restored (`dotnet restore`) before querying. The tool reads `project.assets.json` to discover packages — if it doesn't exist, no results will be returned.

```powershell
# Find APIs by keyword
.\.github\skills\winmd-api-search\winmd.exe search "<capability>"

# Get type details with descriptions (properties, events, methods)
.\.github\skills\winmd-api-search\winmd.exe members "<FullTypeName>"

# Validate a property exists BEFORE writing it in XAML or C#
.\.github\skills\winmd-api-search\winmd.exe check-property <TypeName> <PropertyName>
```

- **Before coding:** run `members` to get real API surface + usage guidance from descriptions
- **Before writing any property:** run `check-property` to verify it exists — do NOT guess
- **On CS0104 ambiguity:** run `search` — it warns when a type exists in multiple namespaces
- **Prefer this over MCP docs search** for API signatures - faster, offline, same descriptions as VS
- **Find the right NuGet package.** If the platform doesn't have a built-in API, use the Microsoft Learn MCP server to search for the right package -> Search docs: `"<capability> WinUI 3 Windows App SDK C#"`. Search code samples with class names (language: csharp). After installing a package (`dotnet add package` + `dotnet restore`), re-index and query the real API surface