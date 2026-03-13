---
name: context-menus
description: 'Context menus and keyboard shortcuts for WinUI 3 apps — MenuFlyout, CommandBarFlyout, KeyboardAccelerator, and accelerator keys. Use when adding right-click menus or hotkeys.'
---

# Context Menus & Keyboard Shortcuts in WinUI 3

Build right-click menus, command flyouts, and keyboard shortcuts using WinUI 3's MenuFlyout, CommandBarFlyout, and KeyboardAccelerator APIs. Follow Windows platform conventions for consistent, accessible input handling.

---

## Rules

### MenuFlyout — Basic Context Menus

Use `MenuFlyout` for simple right-click menus. Populate with `MenuFlyoutItem`, `MenuFlyoutSeparator`, `MenuFlyoutSubItem`, `ToggleMenuFlyoutItem`, and `RadioMenuFlyoutItem`.

```xml
<Button Content="Options">
    <Button.ContextFlyout>
        <MenuFlyout>
            <MenuFlyoutItem Text="Cut" Icon="Cut">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="X" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutItem Text="Copy" Icon="Copy">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="C" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutItem Text="Paste" Icon="Paste">
                <MenuFlyoutItem.KeyboardAccelerators>
                    <KeyboardAccelerator Key="V" Modifiers="Control" />
                </MenuFlyoutItem.KeyboardAccelerators>
            </MenuFlyoutItem>
            <MenuFlyoutSeparator />
            <MenuFlyoutSubItem Text="Share">
                <MenuFlyoutItem Text="Email" />
                <MenuFlyoutItem Text="Link" />
            </MenuFlyoutSubItem>
            <ToggleMenuFlyoutItem Text="Read Only" />
            <RadioMenuFlyoutItem Text="Small" GroupName="Size" />
            <RadioMenuFlyoutItem Text="Large" GroupName="Size" />
        </MenuFlyout>
    </Button.ContextFlyout>
</Button>
```

### CommandBarFlyout — Rich Context Menus

Use `CommandBarFlyout` when you need primary icon buttons plus a secondary overflow area. Preferred for text editing, image manipulation, and multi-action contexts.

```xml
<TextBox x:Name="EditBox">
    <TextBox.ContextFlyout>
        <CommandBarFlyout>
            <AppBarButton Icon="Cut" Label="Cut" />
            <AppBarButton Icon="Copy" Label="Copy" />
            <AppBarButton Icon="Paste" Label="Paste" />
            <CommandBarFlyout.SecondaryCommands>
                <AppBarButton Icon="SelectAll" Label="Select All" />
                <AppBarButton Icon="Find" Label="Find and Replace" />
            </CommandBarFlyout.SecondaryCommands>
        </CommandBarFlyout>
    </TextBox.ContextFlyout>
</TextBox>
```

### Attaching Context Menus

**Preferred — `ContextFlyout` property in XAML** (shown above). The flyout opens automatically on right-click and long-press.

**Programmatic show via `ShowAt()`** — use when you need conditional menus or dynamic positioning:

```csharp
private void OnElementRightTapped(object sender, RightTappedRoutedEventArgs e)
{
    var flyout = new MenuFlyout();
    flyout.Items.Add(new MenuFlyoutItem { Text = "Rename", Icon = new SymbolIcon(Symbol.Rename) });
    flyout.Items.Add(new MenuFlyoutItem { Text = "Delete", Icon = new SymbolIcon(Symbol.Delete) });

    flyout.ShowAt(sender as UIElement, e.GetPosition(sender as UIElement));
}
```

### KeyboardAccelerator

Attach `KeyboardAccelerator` to any `UIElement` or `MenuFlyoutItem`. The framework handles key matching and displays the shortcut text automatically.

```xml
<MenuFlyoutItem Text="Save" Click="OnSave">
    <MenuFlyoutItem.KeyboardAccelerators>
        <KeyboardAccelerator Key="S" Modifiers="Control" />
    </MenuFlyoutItem.KeyboardAccelerators>
</MenuFlyoutItem>

<!-- Accelerator on a standalone button (no menu required) -->
<Button Content="Undo" Click="OnUndo">
    <Button.KeyboardAccelerators>
        <KeyboardAccelerator Key="Z" Modifiers="Control" />
    </Button.KeyboardAccelerators>
</Button>
```

Standard Windows shortcuts to always provide: `Ctrl+C` (Copy), `Ctrl+X` (Cut), `Ctrl+V` (Paste), `Ctrl+Z` (Undo), `Ctrl+Y` (Redo), `Ctrl+S` (Save), `Ctrl+A` (Select All), `Ctrl+N` (New), `Ctrl+O` (Open), `Delete` (Delete).

### AccessKey — Alt+Key Navigation

Use `AccessKey` for Alt-key navigation that displays key tips when Alt is pressed. Scope access keys with `AccessKeyScopeOwner` to avoid conflicts.

```xml
<MenuBar>
    <MenuBarItem Title="File" AccessKey="F">
        <MenuFlyoutItem Text="New" AccessKey="N" Click="OnNew" />
        <MenuFlyoutItem Text="Open" AccessKey="O" Click="OnOpen" />
        <MenuFlyoutItem Text="Save" AccessKey="S" Click="OnSave" />
    </MenuBarItem>
    <MenuBarItem Title="Edit" AccessKey="E">
        <MenuFlyoutItem Text="Undo" AccessKey="U" Click="OnUndo" />
        <MenuFlyoutItem Text="Redo" AccessKey="R" Click="OnRedo" />
    </MenuBarItem>
</MenuBar>

<!-- Scoping access keys to a panel -->
<StackPanel x:Name="ToolbarPanel" AccessKeyScopeOwner="{x:Bind ToolbarPanel}">
    <Button Content="Bold" AccessKey="B" />
    <Button Content="Italic" AccessKey="I" />
</StackPanel>
```

### Dynamic Menu Items

Build menus programmatically based on selection state. Bind `MenuFlyoutItem.Command` to ViewModel `ICommand` properties for MVVM patterns.

```csharp
private void OnListViewRightTapped(object sender, RightTappedRoutedEventArgs e)
{
    var listView = sender as ListView;
    var item = (e.OriginalSource as FrameworkElement)?.DataContext as MyItem;
    if (item == null) return;

    var flyout = new MenuFlyout();

    flyout.Items.Add(new MenuFlyoutItem
    {
        Text = "Edit",
        Icon = new SymbolIcon(Symbol.Edit),
        Command = ViewModel.EditCommand,
        CommandParameter = item
    });

    if (item.CanDelete)
    {
        flyout.Items.Add(new MenuFlyoutItem
        {
            Text = "Delete",
            Icon = new SymbolIcon(Symbol.Delete),
            Command = ViewModel.DeleteCommand,
            CommandParameter = item
        });
    }

    flyout.ShowAt(listView, e.GetPosition(listView));
}
```

**XAML-bound commands:**

```xml
<MenuFlyoutItem Text="Rename" Command="{x:Bind ViewModel.RenameCommand}"
                CommandParameter="{x:Bind SelectedItem, Mode=OneWay}" />
```

## Anti-patterns

- **Hardcoded menu items when data-bound menus are needed** — if the menu depends on runtime state or selection, build it dynamically or bind commands. Do not duplicate logic across multiple static menus.
- **Missing keyboard accelerators for common actions** — every Cut, Copy, Paste, Save, Undo, and Delete action must have a `KeyboardAccelerator`. Users expect standard shortcuts to work.
- **Using `MenuFlyout` when `CommandBarFlyout` is more appropriate** — for text editing or image contexts with multiple primary actions, `CommandBarFlyout` provides a better UX with icon buttons and overflow.
- **Non-standard keyboard shortcuts** — do not use `Ctrl+D` for delete (use `Delete` key), `Ctrl+R` for redo (use `Ctrl+Y`), or other bindings that conflict with Windows conventions.
- **Showing context menus with `Flyout.ShowAt()` when `ContextFlyout` property works** — always prefer the declarative `ContextFlyout` property; it handles right-click, long-press, and keyboard (Shift+F10) automatically.
- **Forgetting `AccessKey` on `MenuBarItem` and `MenuFlyoutItem`** — all menu bar items need access keys for keyboard-only navigation and accessibility compliance.

## Validation

### Verification Checklist

1. **Right-click opens context menu** — verify `ContextFlyout` responds to right-click, long-press (touch), and `Shift+F10` (keyboard).
2. **Keyboard accelerators display and fire** — confirm shortcut text appears next to menu items and the associated command executes when the key combination is pressed.
3. **Access keys show key tips** — press `Alt` and verify key tip badges appear on menu bar items and interactive controls.
4. **Dynamic menus reflect selection state** — right-click different items and confirm the menu updates based on the selected item's properties (e.g., conditional delete).
5. **CommandBarFlyout layout is correct** — primary commands appear as icon buttons; secondary commands appear in the overflow list below.
6. **Standard shortcuts follow Windows conventions** — `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+Z`, `Ctrl+S` all map to the expected operations with no conflicts.

## Must Read & Research

- [Menus and context menus — WinUI 3](https://learn.microsoft.com/windows/apps/design/controls/menus)
- [Command bar flyout — WinUI 3](https://learn.microsoft.com/windows/apps/design/controls/command-bar-flyout)
- [Keyboard accelerators — WinUI 3](https://learn.microsoft.com/windows/apps/design/input/keyboard-accelerators)
- [Access keys — WinUI 3](https://learn.microsoft.com/windows/apps/design/input/access-keys)
- [MenuFlyout Class — Windows App SDK API](https://learn.microsoft.com/windows/windows-app-sdk/api/winrt/microsoft.ui.xaml.controls.menuflyout)
