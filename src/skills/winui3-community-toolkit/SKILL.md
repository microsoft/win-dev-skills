---
name: winui3-community-toolkit
description: "Windows Community Toolkit packages for WinUI 3 — CommunityToolkit.Mvvm (ObservableObject, RelayCommand, Messenger, ObservableValidator), CommunityToolkit.WinUI.Controls (SettingsCard, SettingsExpander, DataGrid, Segmented, TokenizingTextBox, HeaderedContentControl, DockPanel), CommunityToolkit.WinUI.Converters (BoolToVisibility, StringFormatter), and CommunityToolkit.WinUI.Behaviors (EventTriggerBehavior, InvokeCommandAction). Use when adding toolkit controls, converters, or behaviors."
---

### Package Index

| Package | Install | Use For |
|---------|---------|---------|
| `CommunityToolkit.Mvvm` | Always included | ObservableObject, RelayCommand, Messenger, ObservableValidator |
| `CommunityToolkit.WinUI.Controls.SettingsControls` | `dotnet add package` | SettingsCard, SettingsExpander |
| `CommunityToolkit.WinUI.Controls` | `dotnet add package` | DataGrid, TokenizingTextBox, HeaderedContentControl, Segmented, DockPanel |
| `CommunityToolkit.WinUI.Converters` | `dotnet add package` | BoolToVisibilityConverter, StringFormatConverter, BoolNegationConverter |
| `CommunityToolkit.WinUI.Behaviors` | `dotnet add package` | EventTriggerBehavior, InvokeCommandAction |

Add XAML namespace: `xmlns:controls="using:CommunityToolkit.WinUI.Controls"` or `xmlns:converters="using:CommunityToolkit.WinUI.Converters"`.

### CommunityToolkit.Mvvm (Deep Features)

The base agent covers `ObservableObject`, `[ObservableProperty]`, and `[RelayCommand]`. Here are the advanced features:

#### WeakReferenceMessenger
Decouple ViewModels without direct references:
```csharp
// Define a message
public record NavigationMessage(string PageName);

// Send
WeakReferenceMessenger.Default.Send(new NavigationMessage("Settings"));

// Receive (register in constructor, unregister in cleanup)
WeakReferenceMessenger.Default.Register<NavigationMessage>(this, (r, m) =>
{
    ((ShellViewModel)r).NavigateTo(m.PageName);
});
```

#### ObservableValidator
For form validation with data annotations — see `winui3-architecture` skill.

### SettingsCard and SettingsExpander

The standard pattern for settings pages — matches Windows Settings appearance:

```xml
<controls:SettingsCard Header="App theme"
                       Description="Choose between light, dark, and system default"
                       HeaderIcon="{ui:FontIcon Glyph=&#xE790;}">
    <ComboBox AutomationProperties.AutomationId="CmbTheme"
              SelectedIndex="{x:Bind ViewModel.ThemeIndex, Mode=TwoWay}">
        <ComboBoxItem Content="Light" />
        <ComboBoxItem Content="Dark" />
        <ComboBoxItem Content="System default" />
    </ComboBox>
</controls:SettingsCard>

<controls:SettingsExpander Header="Advanced"
                           Description="Additional configuration options"
                           HeaderIcon="{ui:FontIcon Glyph=&#xE713;}">
    <controls:SettingsExpander.Items>
        <controls:SettingsCard Header="Enable logging">
            <ToggleSwitch AutomationProperties.AutomationId="TglLogging"
                          IsOn="{x:Bind ViewModel.IsLoggingEnabled, Mode=TwoWay}" />
        </controls:SettingsCard>
    </controls:SettingsExpander.Items>
</controls:SettingsExpander>
```

**Rules:**
- Group related settings with `SettingsExpander`
- Use `HeaderIcon` with `FontIcon` for visual consistency
- Place the action control (ComboBox, ToggleSwitch, Button) as direct content of `SettingsCard`
- Persist on every change — no "Save" button for settings

### DataGrid

For tabular data display. Install `CommunityToolkit.WinUI.Controls`:
```xml
<controls:DataGrid AutoGenerateColumns="False"
                   ItemsSource="{x:Bind ViewModel.Items, Mode=OneWay}"
                   IsReadOnly="True">
    <controls:DataGrid.Columns>
        <controls:DataGridTextColumn Header="Name" Binding="{Binding Name}" />
        <controls:DataGridTextColumn Header="Size" Binding="{Binding Size}" />
    </controls:DataGrid.Columns>
</controls:DataGrid>
```
Note: DataGrid columns use `{Binding}` not `{x:Bind}` — this is a known limitation.

### Other Useful Controls

| Control | Use For |
|---------|---------|
| `Segmented` | Inline mode/view switcher (like iOS segmented control) |
| `TokenizingTextBox` | Tag/chip input (email recipients, labels) |
| `HeaderedContentControl` | Section with header + content |
| `DockPanel` | WPF-style dock layout (Top/Bottom/Left/Right/Fill) |

### Converters

```xml
<Page.Resources>
    <converters:BoolToVisibilityConverter x:Key="BoolToVis" />
</Page.Resources>

<ProgressRing Visibility="{x:Bind ViewModel.IsLoading, Converter={StaticResource BoolToVis}, Mode=OneWay}" />
```

Available: `BoolToVisibilityConverter`, `BoolNegationConverter`, `StringFormatConverter`, `EmptyStringToObjectConverter`, `EmptyCollectionToObjectConverter`.

**Prefer `x:Bind` functions** over converters when possible — they're compiled and type-safe.

### Behaviors

Use `Microsoft.Xaml.Behaviors.WinUI.Managed` for event-to-command binding:
```xml
<ListView>
    <interactivity:Interaction.Behaviors>
        <interactions:EventTriggerBehavior EventName="SelectionChanged">
            <interactions:InvokeCommandAction Command="{x:Bind ViewModel.SelectionChangedCommand}" />
        </interactions:EventTriggerBehavior>
    </interactivity:Interaction.Behaviors>
</ListView>
```

### References

For complete API documentation, see [Windows Community Toolkit](https://learn.microsoft.com/dotnet/communitytoolkit/) and `references/` directory.