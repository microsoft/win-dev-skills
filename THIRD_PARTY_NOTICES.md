# Third-Party Notices

This repository incorporates material from the projects listed below. The
original copyright notices and licenses apply to those portions; the rest of
the repository is licensed under the [MIT License](LICENSE).

This file is informational and is updated whenever vendored content,
embedded data snapshots, or significant runtime dependencies change. For
machine-readable component governance metadata, see
[`cgmanifest.json`](cgmanifest.json).

---

## 1. WinUI-Gallery (microsoft/WinUI-Gallery)

- **Source:** https://github.com/microsoft/WinUI-Gallery
- **License:** MIT
- **Used as:**
  - Embedded JSON snapshot of control scenarios in
    `src/tools/winui-search/Data/gallery-scenarios.json` and
    `src/tools/winui-search/Data/gallery-tags.json`.
  - Live fetch target for `src/tools/winui-search/GalleryFetcher.cs`,
    which downloads sample C#/XAML on demand from `main`.

The Gallery is owned by the same WinUI engineering team that owns this
repository. Snapshots are regenerated periodically; see
[`scripts/`](scripts) for the regeneration tooling.

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 2. Windows Community Toolkit (CommunityToolkit/Windows)

- **Source:** https://github.com/CommunityToolkit/Windows
- **License:** MIT
- **Used as:**
  - Embedded JSON snapshot of toolkit scenarios in
    `src/tools/winui-search/Data/toolkit-scenarios.json` and
    `src/tools/winui-search/Data/toolkit-tags.json`.
  - Live fetch target for `src/tools/winui-search/ToolkitFetcher.cs`,
    which downloads sample C#/XAML on demand from `main`.

```
MIT License

Copyright (c) .NET Foundation and Contributors.
All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## NuGet runtime dependencies

The C# tools under `src/tools/` reference the following NuGet packages.
Each package's license is declared in its own `.nuspec` and is consumed
under those terms:

- `Microsoft.CodeAnalysis.CSharp` — Apache-2.0
- `Microsoft.CodeAnalysis.Analyzers` — Apache-2.0

Transitive dependencies are tracked by the SDK at restore time and are not
duplicated here. See `cgmanifest.json` for the canonical machine-readable
list.
