---
name: windows-community-toolkit
description: 'Windows Community Toolkit (WCT) overview, including useful controls, helpers, and patterns for WinUI 3 development. Use when building or modifying WinUI 3 UI code. Check here first for existing controls/extensions before building custom solutions.'
---

# Windows Community Toolkit

These rules apply to **every feature and change**. They are not optional add-ons.

---

## 1. Windows Community Toolkit

### Recommended Packages

```xml
<!-- Use latest stable versions; do not hard-code version numbers in instructions; Use only specific packages as needed -->
<PackageReference Include="CommunityToolkit.WinUI.Animations" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Behaviors" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Converters" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Extensions" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Controls.Primitives" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Controls.SettingsControls" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Controls.Sizers" Version="*" />
<PackageReference Include="CommunityToolkit.WinUI.Triggers" Version="*" />
```

### Useful Toolkit Features

| Feature | Package | Use Case |
|---|---|---|
| Animations | `CommunityToolkit.WinUI.Animations` | Composition and XAML-based animation extensions for creating composition-based animations easily. |
| Behaviors | `CommunityToolkit.WinUI.Behaviors` | `KeyDownTriggerBehavior`, `AutoSelectBehavior`, `ViewportBehavior`, `FocusBehavior`, `NavigateToUriAction`, ListView Header Behaviors, `StackedNotificationsBehavior` |
| Converters | `CommunityToolkit.WinUI.Converters` | Common `IValueConverter` implementations (eg., Visibility converters from various types `bool`, `object`, collections, `StringFormatConverter`, `TaskResultConverter`, `FileSizeToFriendlyStringConverter`) to simplify XAML bindings |
| Extensions | `CommunityToolkit.WinUI.Extensions` | Extension methods for WinUI types to simplify common tasks (eg., `DispatcherQueue.EnqueueAsync`, `DispatcherQueueTimer.Debounce`, Visual and Logical Tree helpers `DependencyObject.FindDescendant<T>`, `FrameworkElementExtensions.EnableActualSizeBinding`, RelativeSource Ancestor Bindings `FrameworkElementExtensions.AncestorType`, TextBox Mask and Regex validation extensions) |
| Controls.Primitives | `CommunityToolkit.WinUI.Controls.Primitives` | Non-templatable layout primitives like `SwitchPresenter`, `WrapPanel`, `WrapLayout`, `ConstrainedBox`, `StaggeredLayout`, `StaggeredPanel`, `DockPanel`, `UniformGrid` |
| Controls.SettingsControls | `CommunityToolkit.WinUI.Controls.SettingsControls` | Pre-built controls for settings pages (eg., `SettingsCard`, `SettingsExpander`) that follow Fluent Design guidelines |
| Controls.Sizers | `CommunityToolkit.WinUI.Controls.Sizers` | Resizable panels and splitters for dynamic layouts (eg., `GridSplitter`, `ContentSizer`, `PropertySizer`) |
| Triggers | `CommunityToolkit.WinUI.Triggers` | XAML visual state triggers for declaratively responding to events and state changes without code-behind (eg. `CompareStateTrigger`, `ControlStateTrigger`, `IsEqualStateTrigger`, `RegexStateTrigger`) |

---

## 2. Windows Community Toolkit Labs

The **Labs** repo contains experimental controls and features that are not yet production-ready but can be used for inspiration or early access to upcoming toolkit capabilities. Use with caution and check the documentation for each Labs control for stability and compatibility notes. Many are well used in production by early adopters, but their API may change without semver guarantees.

### Useful Source Generators

| Feature | Package | Use Case |
|---|---|---|
| DependencyPropertyGenerator | `CommunityToolkit.Labs.WinUI.DependencyPropertyGenerator` | Source generator for creating DependencyProperties with less boilerplate and improved maintainability |
| Extensions.DependencyInjection | `CommunityToolkit.Labs.Extensions.DependencyInjection` | Source generator for automatic registration of services and ViewModels in the DI container, reducing boilerplate in `ConfigureServices` |

### Useful Features

| Feature | Package | Use Case |
|---|---|---|
| Adorners | `CommunityToolkit.Labs.WinUI.Adorners` | Adorner controls for overlaying content on top of other UI elements (eg., `ResizeElementAdorner`, `InputValidationAdorner`) |
| DataTable | `CommunityToolkit.Labs.WinUI.Controls.DataTable` | A lightweight layout helper for displaying tabular data without support for sorting, filtering, and editing, for small data sets. |
| MarkdownTextBlock | `CommunityToolkit.Labs.WinUI.Controls.Markdown` | A Markdown renderer control for displaying rich text content with support for basic Markdown syntax leveraging Markdig. |
| Ribbon | `CommunityToolkit.Labs.WinUI.Controls.Ribbon` | An implementation of the Ribbon UI pattern for organizing commands and controls in a tabbed toolbar interface. (Also see stable `CommunityToolkit.WinUI.Controls.TabbedCommandBar`) |
| Shimmer | `CommunityToolkit.Labs.WinUI.Controls.Shimmer` | A shimmer effect control for indicating loading states with a visually appealing animation. |
| TransitionHelper | `CommunityToolkit.Labs.WinUI.TransitionHelper` | A helper class for managing and coordinating XAML transitions and animations across multiple controls and pages. |

---

## Anti-patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Using `CommunityToolkit.WinUI.UI.Controls` namespace | Use `CommunityToolkit.WinUI.Controls` for WinUI 3 |
| Using 7.x package versions | Use latest 8.x versions of Community Toolkit packages for WinUI 3 compatibility |
| Building custom controls or extensions without checking the toolkit first | Check the toolkit's extensive collection of controls and helpers before building custom solutions to save time and ensure consistency with Fluent Design guidelines |
| Use inconsistent xmlns for toolkit controls | Use `xmlns:controls="using:CommunityToolkit.WinUI.Controls"` for all toolkit controls for consistency, `xmlns:ui="using:CommunityToolkit.WinUI"` for extensions and helpers in the `CommunityToolkit.WinUI` namespace, `xmlns:ani="using:CommunityToolkit.WinUI.Animations"` for animations, and `xmlns:media="using:CommunityToolkit.WinUI.Media"` for media-related helpers from `CommunityToolkit.WinUI.Media` package. |
| Referencing old docs from https://learn.microsoft.com/en-us/windows/communitytoolkit/ | Use the official Windows Community Toolkit documentation for WinUI 3 at https://learn.microsoft.com/en-us/dotnet/communitytoolkit/windows/ to ensure guidance is accurate and up-to-date for WinUI 3 development |
| Using old `WinUI.UI.DataGrid` package | Use `WinUI.TableView` community package instead |
| Using old `WinUI.UI.Markdown` package | Use Labs `CommunityToolkit.WinUI.Controls.Markdown` package instead |
| Using Monaco in a WebView or building a Code Editor control | Use `WinUIEdit` community package instead |

---

## Validation

### Verification Checklist

- [ ] Followed guidance and avoided any anti-patterns listed above.
- [ ] Included the right `CommunityToolkit.WinUI.*` namespaces in both usings and xmlns declarations.
- [ ] Referenced the latest package available from nuget.org for any toolkit package used.
- [ ] Didn't implement a custom control or extension that already exists in the toolkit without a good reason.

---

## Must Read & Research

> **Agent Rule:** Before creating any control, extension, or helper, you **must** fetch and review the relevant references below using `fetch_webpage`. Consult the appropriate section based on the type of change. Apply what you learn, do not skip this step.

### Official Documentation

| # | Reference | When to consult |
|---|---|---|
| 1 | [Windows Community Toolkit Overview](https://learn.microsoft.com/en-us/dotnet/communitytoolkit/windows/) | General guidance on using the Windows Community Toolkit with WinUI 3, including installation, package references, and high-level features. Always consult this first for any toolkit-related work. |
| 2 | [Windows Community Toolkit API reference](https://learn.microsoft.com/en-us/dotnet/api/?view=win-comm-toolkit-dotnet-8.2) | API package overview page |
| 3 | [Windows Community Toolkit repository](https://github.com/CommunityToolkit/Windows) | Repository of the Windows Community Toolkit for latest information, controls, and examples |
| 4 | [Windows Community Toolkit Labs repository](https://github.com/CommunityToolkit/Labs-Windows) | Latest experimental controls |
| 5 | [Old Toolkit information to New information guide](https://github.com/CommunityToolkit/Windows/wiki/Migration-Guide-from-v7-to-v8) | Guide for translating any older information about the Windows Community Toolkit to the latest concepts. |

### Samples

> **Agent Rule, MANDATORY:** Before implementing any use of a Windows Community Toolkit component you have not used before, **search the `samples` folders in the repo first** and study the working example. Do not guess API usage from docs alone.

---

## Related Skills

- **accessibility** — accessibility requirements for WinUI 3 apps, including AutomationProperties, keyboard navigation, screen readers, and contrast. Use when adding or modifying interactive controls.
- **data-binding** — best practices for data-binding in WinUI 3, including `x:Bind` vs `{Binding}`, binding modes, converters, collection patterns, and common pitfalls
- **fluent-design** — guidance on applying Fluent Design System principles in WinUI 3 apps, including spacing, typography, colour, materials, motion, and layout
- **windows-apis** — how to find and use Windows APIs from WinAppSDK and Platform SDK, with a sample-first approach and common gotchas to avoid
- **windows-community-toolkit** — overview of useful controls and helpers from the Windows Community Toolkit that can accelerate WinUI 3 development without having to build custom solutions
