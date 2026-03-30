---
name: windows-platform-apis
description: 'Access Windows APIs (Windows SDK, Windows App SDK) from any app framework including Electron, .NET, C++, Rust, Flutter, and Tauri. Covers SDK installation and version management (winapp.yaml for non-.NET, NuGet for .NET), CppWinRT projection generation for C++ projects, .NET SDK references, Electron native addons for Windows API access, and calling identity-requiring APIs (push notifications, background tasks, share target, startup tasks, Windows AI). Use when adding Windows platform capabilities to an app, setting up SDK access, creating native addons, or troubleshooting SDK and API runtime errors.'
---

## Quick reference

| Framework | API access method | Identity mechanism |
|-----------|-------------------|-------------------|
| **.NET** | Direct via NuGet (`Microsoft.Windows.SDK.BuildTools`, `Microsoft.WindowsAppSDK`) | `dotnet run` (NuGet pkg) or `winapp run` |
| **C++** | CppWinRT headers in `.winapp/generated/include` | `winapp run` |
| **Electron** | Native addons via `npx winapp node create-addon` | `npx winapp node add-electron-debug-identity` |
| **Rust** | `windows` crate for API bindings | `winapp run` |
| **Flutter** | Platform channels or FFI | `winapp run` |
| **Tauri** | Use winapp for MSIX and identity-requiring APIs | `winapp run` |

> Run `winapp init --help`, `winapp restore --help`, `winapp update --help`, or `winapp --cli-schema` for full CLI details.

## How SDKs work

```
winapp init --setup-sdks stable
       │
       ├─ Downloads Windows SDK packages
       ├─ Downloads Windows App SDK packages
       ├─ Generates CppWinRT projection headers (C++ projects)
       ├─ Creates winapp.yaml (pins SDK versions)
       └─ Creates .winapp/ folder (gitignored)
              ├─ packages/        ← SDK NuGet packages
              └─ generated/
                    └─ include/   ← CppWinRT headers
```

### SDK version management

| Task | Command |
|------|---------|
| Pin versions and download SDKs | `winapp init --setup-sdks stable` (or `preview`) |
| Reinstall from existing config | `winapp restore` (after clone; does not change versions) |
| Update to latest versions | `winapp update` (updates `winapp.yaml` + reinstalls) |
| Switch to preview channel | `winapp update --setup-sdks preview` |
| Skip SDK setup entirely | `winapp init --setup-sdks none` |

**`winapp.yaml`** tracks SDK versions. `.winapp/` contains downloaded packages and is gitignored — team members recreate it via `winapp restore`.

## Key rule: most Windows APIs require package identity

Windows APIs like push notifications, background tasks, share target, taskbar pinning, and Windows AI APIs require **package identity**. A standard `.exe` does not have identity — register it before these APIs work:

```
Need identity?
├─ Most frameworks (.NET, C++, Rust, Flutter, Tauri)
│  └─ winapp run <build-output-dir>
│     (registers loose layout package + launches app)
└─ Electron
   └─ npx winapp node add-electron-debug-identity
      (registers sparse identity for electron.exe)
```

## Per-framework details

### .NET (WPF, WinForms, Console, WinUI 3)
- .NET projects manage all SDK dependencies via NuGet `<PackageReference>` in the `.csproj`
- **`winapp.yaml` is NOT needed** for .NET projects — winapp auto-detects SDK versions from `.csproj`
- For API access without winapp: just add the NuGet packages (`Microsoft.WindowsAppSDK`, `Microsoft.Windows.SDK.NET.Ref`) directly
- **`winapp restore` and `winapp update` are for non-.NET projects only** — .NET uses `dotnet restore`

### C++ (CMake, MSBuild)
- `winapp init --setup-sdks stable` downloads SDKs and generates CppWinRT headers at `.winapp/generated/include`
- **`winapp.yaml` IS needed** — tracks SDK versions for `restore`/`update`
- Add `.winapp/packages` include/lib paths to CMakeLists.txt or MSBuild props
- Response file at `.cppwinrt.rsp` — pass to `cppwinrt.exe` if regenerating projections manually

### Electron
- Use the npm package: `npm install --save-dev @microsoft/winappcli`
- Create native addons: `npx winapp node create-addon --template cs` (C#) or `--template cpp` (C++)
- Guides: [C++ notification addon](https://github.com/microsoft/WinAppCli/blob/main/docs/guides/electron/cpp-notification-addon.md), [WinML addon](https://github.com/microsoft/WinAppCli/blob/main/docs/guides/electron/winml-addon.md), [Phi Silica addon](https://github.com/microsoft/WinAppCli/blob/main/docs/guides/electron/phi-silica-addon.md)

## Common API setup examples

```bash
# Set up a .NET project for Windows APIs (no winapp.yaml needed)
dotnet add package Microsoft.WindowsAppSDK
dotnet add package Microsoft.Windows.SDK.NET.Ref
winapp init --use-defaults --setup-sdks none   # manifest + assets only

# Set up a C++ project for Windows APIs (winapp.yaml needed)
winapp init --setup-sdks stable                 # downloads SDKs + generates CppWinRT
# Add to CMakeLists.txt: include_directories(.winapp/generated/include)

# Set up Electron for Windows APIs
npm install --save-dev @microsoft/winappcli
npx winapp init --use-defaults
npx winapp node create-addon --template cs      # C# native addon scaffold
npx winapp node add-electron-debug-identity     # register identity for testing

# After setup, verify identity works (any framework):
winapp run <build-output-dir>                   # registers + launches with identity
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Build tools not found" | Run `winapp update` — auto-downloads on first use. Ensure internet access. |
| Windows APIs fail at runtime | Register identity first: `winapp run <dir>` or `create-debug-identity <exe>`. Relaunch after. |
| "winapp.yaml not found" | Run `winapp init`. .NET with NuGet references may not need it. |
| SDK download fails | Check internet/proxy. Run `winapp restore` to retry. |
| `.winapp/` missing after clone | Run `winapp restore` — recreates from `winapp.yaml`. |

## Related skills

- **Identity & setup** → See `identity-and-setup` for package identity, `winapp init`, manifest authoring, and choosing between `winapp run` and `create-debug-identity`.
- **Packaging & signing** → See `packaging-and-signing` for MSIX distribution and certificates.

## External resources

- [Full CLI documentation](https://github.com/microsoft/WinAppCli/blob/main/docs/usage.md)
- [Framework-specific guides](https://github.com/microsoft/WinAppCli/tree/main/docs/guides)
- [Electron setup guide](https://github.com/microsoft/WinAppCli/blob/main/docs/guides/electron/setup.md)
- [Debugging Guide](https://github.com/microsoft/WinAppCli/blob/main/docs/debugging.md)
