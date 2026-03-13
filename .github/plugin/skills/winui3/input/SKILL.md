---
name: input
description: 'Input controls for WinUI 3 apps — choosing the right control for each type of data, grouping inputs, and deciding between RadioButton, CheckBox, ToggleSwitch, ComboBox, SelectorBar, NumberBox, DatePicker, and more. Use when adding or modifying any user input control.'
---

# Input Controls

Use the decision tables and rules below to choose the correct control for each input scenario. For laying out many inputs together in one form, see the **forms** skill. For rich and multi-line text editing scenarios, see the **text-editing** skill.

---

## Rules

### Choosing the Right Control — Quick Reference

| Data type | Choices | Recommended control |
|---|---|---|
| Short free text (single line) | — | `TextBox` |
| Password / secret | — | `PasswordBox` |
| Search / auto-complete | — | `AutoSuggestBox` |
| Long free text (multi-line) | — | `TextBox` with `AcceptsReturn="True"` |
| Number in a range | Continuous | `Slider` |
| Number (precise, typed) | — | `NumberBox` |
| Star rating | 1–5 | `RatingControl` |
| Boolean on/off | Immediate effect | `ToggleSwitch` |
| Boolean yes/no | Part of a form, committed on submit | `CheckBox` (single) |
| Single choice from 2–5 options, all visible | Always visible | `RadioButton` group |
| Single choice from 5+ options, or space is limited | Hidden until tapped | `ComboBox` |
| Single choice from 2–5 options, compact/tab-like | Persistent, space-efficient | `SelectorBar` or `SegmentedControl` |
| Multiple choices (independent) | — | `CheckBox` group |
| Multiple choices from a list | Long list | `ListBox` (multi-select) |
| Date only | — | `DatePicker` or `CalendarDatePicker` |
| Time only | — | `TimePicker` |
| Date range | — | `CalendarView` (multi-select) |

---

### Text Input

Use `TextBox` for any free-form text input. Set `Header` and `PlaceholderText` — never rely on a separate label `TextBlock` alone.

```xml
<!-- GOOD — header and placeholder on the control itself -->
<TextBox Header="Display name"
         PlaceholderText="e.g. Jane Smith"
         MaxLength="100" />

<!-- Multi-line text -->
<TextBox Header="Notes"
         PlaceholderText="Add any additional information…"
         AcceptsReturn="True"
         TextWrapping="Wrap"
         MinHeight="96" />

<!-- BAD — floating label disconnected from the control -->
<TextBlock Text="Display name" />
<TextBox PlaceholderText="e.g. Jane Smith" />
```

Use `PasswordBox` for secrets — **never** `TextBox` with custom masking.

```xml
<PasswordBox Header="Password" PlaceholderText="Enter your password" />
```

Use `AutoSuggestBox` when the user can filter or pick from suggestions. Wire `QuerySubmitted` and `SuggestionChosen`.

```xml
<AutoSuggestBox Header="Search cities"
                PlaceholderText="Type a city name…"
                QueryIcon="Find"
                QuerySubmitted="OnQuerySubmitted"
                SuggestionChosen="OnSuggestionChosen" />
```

---

### Boolean — ToggleSwitch vs. CheckBox

| Scenario | Use |
|---|---|
| Turns a feature on/off **immediately** (like a settings toggle) | `ToggleSwitch` |
| Part of a form submitted by a button (e.g. "I agree to the terms") | `CheckBox` |
| One of several independent options to tick | `CheckBox` group |

```xml
<!-- ToggleSwitch — immediate effect, clear on/off label -->
<ToggleSwitch Header="Notifications"
              OnContent="On"
              OffContent="Off" />

<!-- CheckBox — deferred until form submit -->
<CheckBox Content="I agree to the terms and conditions" />
```

Set the `Header` on `ToggleSwitch` to describe the setting, and set `OnContent`/`OffContent` to short labels (default "On"/"Off" is fine for most cases).

---

### Single Selection — RadioButton vs. ComboBox vs. SelectorBar

#### RadioButton — always-visible exclusive choice

Use when the user must choose **exactly one** option from **2 to 5** items and you have the space to show all options at once.

- Wrap in a `StackPanel` with `RadioButtons` (the control), which provides correct keyboard navigation and `Header`.
- Set `GroupName` only if using raw `RadioButton` elements outside `RadioButtons`.
- Do **not** pre-select an option unless a sensible default exists.

```xml
<!-- GOOD — RadioButtons control for easy grouping and keyboard nav -->
<RadioButtons Header="Notification frequency" SelectedIndex="0">
    <x:String>Real time</x:String>
    <x:String>Hourly digest</x:String>
    <x:String>Daily digest</x:String>
</RadioButtons>

<!-- RadioButtons with MaxColumns for horizontal layout (2-3 items) -->
<RadioButtons Header="Theme" MaxColumns="3" SelectedIndex="0">
    <x:String>System</x:String>
    <x:String>Light</x:String>
    <x:String>Dark</x:String>
</RadioButtons>

<!-- BAD — raw RadioButtons without grouping control -->
<TextBlock Text="Notification frequency" />
<RadioButton Content="Real time" GroupName="freq" />
<RadioButton Content="Hourly digest" GroupName="freq" />
<RadioButton Content="Daily digest" GroupName="freq" />
```

#### ComboBox — drop-down exclusive choice

Use when there are **5 or more** options, or space is limited and showing all options inline would clutter the UI.

```xml
<ComboBox Header="Country or region"
          PlaceholderText="Select a country"
          ItemsSource="{x:Bind Countries}"
          SelectedItem="{x:Bind SelectedCountry, Mode=TwoWay}" />
```

Use `ComboBox` with a list of `ComboBoxItem` for static short lists:

```xml
<ComboBox Header="Sort by" SelectedIndex="0">
    <ComboBoxItem Content="Name" />
    <ComboBoxItem Content="Date modified" />
    <ComboBoxItem Content="Size" />
    <ComboBoxItem Content="Type" />
</ComboBox>
```

#### SelectorBar — compact persistent tab-like selection

Use `SelectorBar` when the selected item controls what content is shown **on the same page** (like switching between views or filter tabs). It is always visible, space-efficient, and communicates the current view.

```xml
<SelectorBar x:Name="ViewSelectorBar"
             SelectionChanged="OnViewSelectorChanged">
    <SelectorBarItem Text="All" Tag="all" />
    <SelectorBarItem Text="Active" Tag="active" />
    <SelectorBarItem Text="Archived" Tag="archived" />
</SelectorBar>
```

> **SelectorBar vs. RadioButtons:** Use `SelectorBar` for view-switching (the selection changes what content is displayed). Use `RadioButtons` for settings choices that configure a value (the selection sets a property).

> **SelectorBar vs. NavigationView tabs:** Use `SelectorBar` for filtering/switching content within a page. Use `NavigationView` (with `PaneDisplayMode="Top"`) for top-level app navigation between pages.

---

### Multiple Selection — CheckBox Groups

Use a group of `CheckBox` controls when the user can pick **zero or more** items independently. Each checkbox represents an independent boolean.

```xml
<!-- GOOD — StackPanel groups related checkboxes with a label -->
<StackPanel Spacing="8">
    <TextBlock Text="Notify me about"
               Style="{StaticResource BodyStrongTextBlockStyle}" />
    <CheckBox Content="New messages" IsChecked="{x:Bind NotifyMessages, Mode=TwoWay}" />
    <CheckBox Content="Mentions" IsChecked="{x:Bind NotifyMentions, Mode=TwoWay}" />
    <CheckBox Content="Reactions" IsChecked="{x:Bind NotifyReactions, Mode=TwoWay}" />
</StackPanel>
```

For long lists of selectable items, use `ListBox` with `SelectionMode="Multiple"` or `ListView` with `SelectionMode="Multiple"` instead of many checkboxes.

---

### Numeric Input

#### NumberBox — precise typed number

Use `NumberBox` when the user enters a specific number. Set `Minimum`, `Maximum`, and `SmallChange`; enable `SpinButtonPlacementMode` for step controls.

```xml
<NumberBox Header="Quantity"
           Value="{x:Bind Quantity, Mode=TwoWay}"
           Minimum="1"
           Maximum="999"
           SmallChange="1"
           SpinButtonPlacementMode="Compact"
           ValidationMode="InvalidInputOverwritten" />
```

#### Slider — continuous or stepped range

Use `Slider` when the exact value is less important than exploring a range (volume, brightness, opacity). Always show the current value via a `ToolTip` or adjacent `TextBlock`.

```xml
<Slider Header="Volume"
        Minimum="0"
        Maximum="100"
        Value="{x:Bind Volume, Mode=TwoWay}"
        TickFrequency="10"
        TickPlacement="BottomRight" />
```

#### RatingControl — star ratings

Use `RatingControl` for subjective ratings (1–5 stars). It is read-only by default in display contexts; set `IsReadOnly="False"` for interactive input.

```xml
<RatingControl Value="{x:Bind Rating, Mode=TwoWay}"
               PlaceholderValue="3"
               Caption="Rate this item" />
```

---

### Date & Time

| Scenario | Control |
|---|---|
| Pick a single date (compact) | `DatePicker` |
| Pick a single date (calendar context needed) | `CalendarDatePicker` |
| Pick a time | `TimePicker` |
| Pick a date range or multiple dates | `CalendarView` with `SelectionMode="Multiple"` or `"Range"` |

```xml
<!-- Single date — spinner-style compact picker -->
<DatePicker Header="Start date"
            SelectedDate="{x:Bind StartDate, Mode=TwoWay}" />

<!-- Single date — calendar flyout (shows surrounding days) -->
<CalendarDatePicker Header="Appointment date"
                    PlaceholderText="Choose a date"
                    Date="{x:Bind AppointmentDate, Mode=TwoWay}" />

<!-- Time picker -->
<TimePicker Header="Reminder time"
            SelectedTime="{x:Bind ReminderTime, Mode=TwoWay}"
            ClockIdentifier="12HourClock" />

<!-- Date range — inline calendar -->
<CalendarView SelectionMode="Range"
              SelectedDatesChanged="OnDatesChanged" />
```

---

### Grouping and Labeling Inputs

- Always use the control's built-in **`Header`** property for labels — it is correctly associated with the control for accessibility.
- Use **`Description`** (supported on `TextBox`, `PasswordBox`, `ComboBox`, `CheckBox`, etc.) for hint text below the control.
- Group related controls in a `StackPanel` with `Spacing="8"` and add a section heading using `BodyStrongTextBlockStyle`.
- Use a `GroupBox`-style `Border` with a heading for visually distinct groups within a form.

```xml
<!-- Input with header and description -->
<TextBox Header="Username"
         PlaceholderText="e.g. jsmith"
         Description="Must be 3–20 characters, letters and numbers only." />

<!-- Grouped section -->
<StackPanel Spacing="16">
    <TextBlock Text="Notification preferences"
               Style="{StaticResource SubtitleTextBlockStyle}" />
    <StackPanel Spacing="8">
        <CheckBox Content="Email" IsChecked="{x:Bind NotifyEmail, Mode=TwoWay}" />
        <CheckBox Content="Push notification" IsChecked="{x:Bind NotifyPush, Mode=TwoWay}" />
        <CheckBox Content="SMS" IsChecked="{x:Bind NotifySms, Mode=TwoWay}" />
    </StackPanel>
</StackPanel>
```

---

## Anti-patterns

| Anti-pattern | Why it fails | Correct approach |
|---|---|---|
| `TextBox` for passwords | Exposes sensitive input | Use `PasswordBox` |
| Raw `RadioButton` elements without `RadioButtons` control | Poor keyboard navigation, no built-in header | Wrap in `RadioButtons` |
| `ToggleSwitch` inside a form submitted by a button | Confusing — toggles imply immediate effect | Use `CheckBox` for deferred choices |
| `ComboBox` for 2–3 options | Hides choices unnecessarily, extra click | Use `RadioButtons` or `SelectorBar` |
| `RadioButtons` for 6+ items | Hard to scan, prefer a compact drop-down | Use `ComboBox` |
| Floating `TextBlock` as a label instead of `Header` | Not linked to the control — fails accessibility | Use the control's `Header` property |
| `Slider` without visible current value | User doesn't know the selected value | Add `ToolTip` or adjacent `TextBlock` |
| Multiple `DatePicker`/`TimePicker` without `CalendarDatePicker` context | Confusing when surrounding dates matter | Use `CalendarDatePicker` when context helps |
| `ListBox` when only one item can be selected | Misleads users into expecting multi-select | Use `ComboBox` or `RadioButtons` |
| Mixing `SelectorBar` and `NavigationView` for the same purpose | Inconsistent navigation metaphor | `SelectorBar` for in-page filtering; `NavigationView` for page navigation |

---

## Validation

### Verification Checklist

- [ ] Every input control has a `Header` (or `AutomationProperties.Name` if `Header` is not supported) — no floating `TextBlock` labels
- [ ] `PasswordBox` is used for all password / secret input — no `TextBox` with masking
- [ ] `RadioButtons` control (not raw `RadioButton`) used for single-choice groups
- [ ] Boolean settings that take immediate effect use `ToggleSwitch`; form checkboxes use `CheckBox`
- [ ] `ComboBox` is only used when there are 5+ options or space is constrained
- [ ] `SelectorBar` is used for in-page view/filter switching, not for page-level navigation
- [ ] `NumberBox` has `Minimum`, `Maximum`, and `ValidationMode` set
- [ ] `Slider` displays its current value
- [ ] Grouped checkboxes are inside a `StackPanel` with a visible section heading
- [ ] Date/time controls use the right picker for the scenario (single vs. range, compact vs. calendar)
- [ ] All controls render and navigate correctly with keyboard only

---

## Must Read & Research

> **Agent Rule:** Before adding or modifying any input control, you **must** fetch and review the relevant references below using `fetch_webpage`. Apply what you learn.

| # | Reference | When to consult |
|---|---|---|
| 1 | [Input controls overview](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/) | Any input control decision — survey available controls |
| 2 | [Forms guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/forms) | Laying out and validating form inputs |
| 3 | [TextBox](https://learn.microsoft.com/en-us/windows/apps/design/controls/text-box) | Single-line and multi-line text input |
| 4 | [RadioButtons](https://learn.microsoft.com/en-us/windows/apps/design/controls/radio-button) | Single-choice groups — grouping, layout, keyboard nav |
| 5 | [CheckBox](https://learn.microsoft.com/en-us/windows/apps/design/controls/checkbox) | Independent boolean and multi-select scenarios |
| 6 | [ToggleSwitch](https://learn.microsoft.com/en-us/windows/apps/design/controls/toggles) | Immediate on/off settings |
| 7 | [ComboBox](https://learn.microsoft.com/en-us/windows/apps/design/controls/combo-box) | Drop-down single selection |
| 8 | [SelectorBar](https://learn.microsoft.com/en-us/windows/apps/design/controls/selector-bar) | Compact tab-style selection and view switching |
| 9 | [NumberBox](https://learn.microsoft.com/en-us/windows/apps/design/controls/number-box) | Numeric input with validation and spin buttons |
| 10 | [Slider](https://learn.microsoft.com/en-us/windows/apps/design/controls/slider) | Continuous and stepped range input |
| 11 | [DatePicker](https://learn.microsoft.com/en-us/windows/apps/design/controls/date-picker) | Compact single-date picker |
| 12 | [CalendarDatePicker](https://learn.microsoft.com/en-us/windows/apps/design/controls/calendar-date-picker) | Calendar-context single-date picker |
| 13 | [TimePicker](https://learn.microsoft.com/en-us/windows/apps/design/controls/time-picker) | Time input |
| 14 | [CalendarView](https://learn.microsoft.com/en-us/windows/apps/design/controls/calendar-view) | Date range and multi-date selection |
| 15 | [AutoSuggestBox](https://learn.microsoft.com/en-us/windows/apps/design/controls/auto-suggest-box) | Search and filtered text input with suggestions |
