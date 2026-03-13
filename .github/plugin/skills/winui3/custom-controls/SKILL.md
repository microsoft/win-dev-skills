---
name: custom-controls
description: 'Custom controls and UserControls in WinUI 3 — UserControl vs TemplatedControl, DependencyProperties, template parts, visual states, and styling. Use when creating or modifying reusable controls.'
---

# Custom Controls

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

- **Choose the right base class.** Use `UserControl` for composite views that combine existing controls for a specific page/feature. Use `TemplatedControl` (derive from `Control`) for reusable, styleable, redistributable controls.
- **Expose bindable APIs with DependencyProperty.** Every public property on a custom control that participates in data binding or styling must be a `DependencyProperty`. Use the full registration pattern:

```csharp
public sealed partial class StatusCard : UserControl
{
    public static readonly DependencyProperty TitleProperty =
        DependencyProperty.Register(
            nameof(Title),                          // property name
            typeof(string),                         // property type
            typeof(StatusCard),                     // owner type — must match the control class
            new PropertyMetadata(string.Empty, OnTitleChanged));

    public string Title
    {
        get => (string)GetValue(TitleProperty);
        set => SetValue(TitleProperty, value);
    }

    private static void OnTitleChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is StatusCard control)
        {
            // React to property change
        }
    }
}
```

- **UserControl creation.** Define XAML layout and code-behind together. Use `x:Bind` internally to bind to your DependencyProperties:

```xml
<!-- StatusCard.xaml -->
<UserControl
    x:Class="MyApp.Controls.StatusCard"
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">

    <Grid Padding="12" Background="{ThemeResource CardBackgroundFillColorDefaultBrush}">
        <TextBlock Text="{x:Bind Title, Mode=OneWay}"
                   Style="{StaticResource SubtitleTextBlockStyle}" />
    </Grid>
</UserControl>
```

- **TemplatedControl creation.** Derive from `Control`, set `DefaultStyleKey`, and provide a default `ControlTemplate` in `Themes/Generic.xaml`:

```csharp
public class RatingControl : Control
{
    public RatingControl()
    {
        DefaultStyleKey = typeof(RatingControl);
    }

    protected override void OnApplyTemplate()
    {
        base.OnApplyTemplate();

        // Retrieve template parts with null checks
        if (GetTemplateChild("PART_StarPanel") is StackPanel starPanel)
        {
            // Wire up events
        }
    }
}
```

```xml
<!-- Themes/Generic.xaml -->
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
                    xmlns:local="using:MyApp.Controls">

    <Style TargetType="local:RatingControl">
        <Setter Property="Template">
            <Setter.Value>
                <ControlTemplate TargetType="local:RatingControl">
                    <Grid Background="{TemplateBinding Background}">
                        <VisualStateManager.VisualStateGroups>
                            <VisualStateGroup x:Name="CommonStates">
                                <VisualState x:Name="Normal" />
                                <VisualState x:Name="PointerOver">
                                    <VisualState.Setters>
                                        <Setter Target="PART_StarPanel.Opacity" Value="0.8" />
                                    </VisualState.Setters>
                                </VisualState>
                                <VisualState x:Name="Disabled">
                                    <VisualState.Setters>
                                        <Setter Target="PART_StarPanel.Opacity" Value="0.4" />
                                    </VisualState.Setters>
                                </VisualState>
                            </VisualStateGroup>
                        </VisualStateManager.VisualStateGroups>

                        <StackPanel x:Name="PART_StarPanel" Orientation="Horizontal" />
                    </Grid>
                </ControlTemplate>
            </Setter.Value>
        </Setter>
    </Style>
</ResourceDictionary>
```

- **Template parts** should be documented using the `[TemplatePart]` attribute on the control class. Retrieve them in `OnApplyTemplate` with null-safe casts. Unsubscribe from events on previous template parts before subscribing to new ones:

```csharp
[TemplatePart(Name = "ActionButton", Type = typeof(Button))]
public partial class MyControl : Control
```

```csharp
protected override void OnApplyTemplate()
{
    base.OnApplyTemplate();

    _button?.Click -= OnButtonClick;

    _button = GetTemplateChild("ActionButton") as Button;
    
    _button?.Click += OnButtonClick;
}
```

- **Visual states.** Use `VisualStateManager.GoToState(this, "StateName", useTransitions)` in code-behind to drive visual state changes. Define state groups in the `ControlTemplate` (e.g., `CommonStates`, `FocusStates`, `SelectionStates`).
- **Use ThemeResource for all colors and brushes.** Never hardcode hex values. Use WinUI system brushes for theme-aware rendering:

```xml
<!-- GOOD -->
<Border Background="{ThemeResource CardBackgroundFillColorDefaultBrush}"
        BorderBrush="{ThemeResource CardStrokeColorDefaultBrush}" />

<!-- BAD -->
<Border Background="#FFFFFF" BorderBrush="#CCCCCC" />
```

- **Attached properties** for cross-control behavior. Use `RegisterAttached` when the property applies to elements that don't derive from your control:

```csharp
public static class ToolTipExtensions
{
    public static readonly DependencyProperty ShowDelayProperty =
        DependencyProperty.RegisterAttached(
            "ShowDelay",
            typeof(int),
            typeof(ToolTipExtensions),
            new PropertyMetadata(0));

    public static void SetShowDelay(DependencyObject obj, int value)
        => obj.SetValue(ShowDelayProperty, value);

    public static int GetShowDelay(DependencyObject obj)
        => (int)obj.GetValue(ShowDelayProperty);
}
```

- **ContentControl for wrapper scenarios.** Derive from `ContentControl` and use `ContentPresenter` in the template when your control wraps arbitrary child content:

```xml
<ControlTemplate TargetType="local:CardContainer">
    <Border Background="{TemplateBinding Background}"
            CornerRadius="8" Padding="16">
        <ContentPresenter Content="{TemplateBinding Content}"
                          ContentTemplate="{TemplateBinding ContentTemplate}" />
    </Border>
</ControlTemplate>
```

- **Events and commands.** Expose standard CLR events for control-specific notifications. Add `ICommand` properties as DependencyProperties for MVVM-friendly interaction:

```csharp
// CLR event
public event EventHandler<RatingChangedEventArgs>? RatingChanged;

// ICommand DependencyProperty
public static readonly DependencyProperty RatingChangedCommandProperty =
    DependencyProperty.Register(
        nameof(RatingChangedCommand),
        typeof(ICommand),
        typeof(RatingControl),
        new PropertyMetadata(null));

public ICommand? RatingChangedCommand
{
    get => (ICommand?)GetValue(RatingChangedCommandProperty);
    set => SetValue(RatingChangedCommandProperty, value);
}

private void OnRatingUpdated(int newRating)
{
    RatingChanged?.Invoke(this, new RatingChangedEventArgs(newRating));

    if (RatingChangedCommand?.CanExecute(newRating) == true)
    {
        RatingChangedCommand.Execute(newRating);
    }
}
```

- **Accessibility.** All custom controls must set `AutomationProperties.Name` or implement `AutomationPeer` for screen reader support.

## Anti-patterns

- Using `UserControl` when a `TemplatedControl` is needed for redistribution or re-templating — `UserControl` cannot be restyled by consumers.
- Hardcoding colors or brushes (`#FF0000`, `new SolidColorBrush(...)`) instead of `{ThemeResource}` — breaks Dark and High Contrast themes.
- Not providing a default `ControlTemplate` in `Themes/Generic.xaml` — the control renders as invisible.
- Forgetting `OnApplyTemplate` null checks for template parts — causes `NullReferenceException` at runtime.
- Creating `DependencyProperty` with incorrect owner type (e.g., passing a base class instead of the declaring class) — property registration silently fails or collides.
- Tightly coupling a custom control to a specific ViewModel — controls should expose DependencyProperties and events, not reference ViewModels directly.
- Subscribing to template part events without unsubscribing from previous parts — causes duplicate event handlers and memory leaks.
- Using `{Binding}` inside a `UserControl` instead of `{x:Bind}` — loses compile-time safety and performance.

## Validation

- Build & register the MSIX package — see **Build, Run & Deploy** in `Agents.md`.
- Test the control in Light, Dark, and High Contrast themes.
- Verify `TemplatedControl` renders correctly without any consumer-provided style.
- Confirm DependencyProperties are bindable from XAML with `{x:Bind}` and `Mode=OneWay`.
- Run Accessibility Insights to verify automation properties.

### Verification Checklist

- [ ] Custom controls use `{ThemeResource}` for all colors and brushes
- [ ] DependencyProperties have correct owner type and sensible default values
- [ ] TemplatedControls have `Themes/Generic.xaml` with a default style
- [ ] `OnApplyTemplate` uses null-safe casts for all `PART_` template children
- [ ] Controls render correctly in Light, Dark, and High Contrast themes
- [ ] Controls expose `AutomationProperties.Name` or implement `AutomationPeer`
- [ ] Events are unsubscribed from previous template parts before subscribing to new ones
- [ ] ICommand properties fire with correct parameters for MVVM consumers
- [ ] UserControls use `{x:Bind}` internally, not `{Binding}`

## Must Read & Research

> **Agent Rule:** Before creating or modifying any custom control, you **must** fetch and review the relevant references below using `fetch_webpage`. Apply what you learn — do not skip this step.

| # | Reference | When to consult |
|---|---|---|
| 1 | [Custom controls overview](https://learn.microsoft.com/en-us/windows/apps/design/controls/custom-controls-overview) | Deciding between UserControl and TemplatedControl |
| 2 | [Dependency properties overview](https://learn.microsoft.com/en-us/windows/uwp/xaml-platform/dependency-properties-overview) | Creating or debugging DependencyProperty registrations |
| 3 | [Control templates](https://learn.microsoft.com/en-us/windows/apps/design/style/xaml-control-templates) | Building ControlTemplate, TemplateParts, and VisualStates |
| 4 | [XAML custom panels](https://learn.microsoft.com/en-us/windows/apps/design/layout/custom-panels-overview) | Implementing custom layout with MeasureOverride / ArrangeOverride |
| 5 | [UserControl class reference](https://learn.microsoft.com/en-us/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.usercontrol) | API surface and members for UserControl |
| 6 | [Windows Community Toolkit (GitHub)](https://github.com/CommunityToolkit/Windows) | Before building a custom control — check if the toolkit already has one |
