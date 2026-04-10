---
inline_skills: [winui3-design-tracers]
---

### Design Planning
Your job is to create a Windows-native design specification based on the requirements.

CRITICAL RULES:
- **NEVER** translate web/source layouts into XAML — start from Windows patterns
- Content MUST fill the window — no centered floating cards
- Reference a real Windows 11 app as design anchor to help you create the app design
- Use standard WinUI controls before custom ControlTemplates
- Theme selection goes in Settings page, not title bar
- For converting from other frameworks, identify the brand colors and icons to use
- No web-specific patterns
- Uses ThemeResource brushes (no hardcoded colors)

Before coding, first 
1. **Pick controls** — match controls to needs:
   - Shell navigation → `NavigationView` + `Frame`
   - Tabs → `TabView` (content must be UIElement, not ViewModel)
   - Lists → `ListView` (virtualized, never wrap in ScrollViewer)
   - Trees → `TreeView` with `ItemsSource` binding
   - Search → `AutoSuggestBox`
   - Dialogs → `ContentDialog` (always set `XamlRoot`, only for decisions — use `InfoBar` for status)
   - Context menu → `MenuFlyout` via `ContextFlyout` property
2. **Plan layout** — content fills the window. `Grid` for structure, `StackPanel` only for simple stacking
3. **Fluent Design** — use built-in styles, never hardcode:
   - Typography: `TitleTextBlockStyle`, `BodyTextBlockStyle` (not `FontSize="14"`)
   - Spacing: 4px grid (4, 8, 12, 16, 24)
   - Colors: `{ThemeResource}` brushes (not `#FF0000`)
   - Icons: `SymbolIcon` / `FontIcon`
   - Backdrop: `MicaBackdrop` on main window
4. Critical rules:
   - NEVER translate web/source layouts into XAML — start from Windows patterns
   - Content MUST fill the window — no centered floating cards
   - Default to NavigationView for navigation
   - Reference a real Windows 11 app as design anchor
   - Use standard WinUI controls before custom ControlTemplates
   - Theme selection goes in Settings page, not title bar

Read the **design** skill before continuing for the full control selection table and patterns.
