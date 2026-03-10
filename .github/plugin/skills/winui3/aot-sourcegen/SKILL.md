---
name: aot-sourcegen
description: 'AOT compilation and source generators for WinUI 3 apps — trimming, NativeAOT readiness, JSON source generators, and XAML compilation. Use when optimizing app startup, size, or deployment.'
---

# AOT Compilation & Source Generators for WinUI 3

These rules apply to **every feature and change**. They are not optional add-ons.

---

## Rules

### 1. Trimming

Enable trimming in your `.csproj` to reduce published app size:

```xml
<PropertyGroup>
  <PublishTrimmed>true</PublishTrimmed>
  <TrimMode>full</TrimMode>
  <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>
</PropertyGroup>
```

Never suppress trim warnings — fix them. For reflection-heavy code, annotate types so the trimmer preserves members:

```csharp
public void LoadService([DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicConstructors)] Type serviceType)
{
    var instance = Activator.CreateInstance(serviceType);
}
```

### 2. NativeAOT Status

WinUI 3 does **not** yet fully support NativeAOT. Setting `<PublishAot>true</PublishAot>` will fail for most WinUI projects due to COM interop and XAML runtime dependencies. Track progress in the Windows App SDK release notes. Use trimming as the current path toward AOT readiness — it catches the same class of reflection issues.

### 3. JSON Source Generators

Replace reflection-based `System.Text.Json` with source-generated serializers. See the **data-persistence** skill for practical usage patterns with settings and app state.

```csharp
[JsonSerializable(typeof(UserProfile))]
[JsonSerializable(typeof(List<UserProfile>))]
internal partial class AppJsonContext : JsonSerializerContext { }

// Usage — no reflection at runtime
var json = JsonSerializer.Serialize(profile, AppJsonContext.Default.UserProfile);
var obj = JsonSerializer.Deserialize(json, AppJsonContext.Default.UserProfile);
```

### 4. Regex Source Generators

Use `[GeneratedRegex]` (.NET 7+) for compile-time regex — faster startup and fully AOT-compatible:

```csharp
public partial class InputValidator
{
    [GeneratedRegex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")]
    private static partial Regex EmailRegex();

    public bool IsValidEmail(string input) => EmailRegex().IsMatch(input);
}
```

Never use `new Regex(pattern)` in AOT-targeted code — it relies on runtime IL emit.

### 5. XAML Compilation

`x:Bind` generates code at compile time and is already AOT-friendly. Always prefer it:

```xml
<!-- ✅ AOT-safe: compile-time generated -->
<TextBlock Text="{x:Bind ViewModel.Title, Mode=OneWay}" />

<!-- ❌ Reflection-based, not trim-safe with dynamic paths -->
<TextBlock Text="{Binding Path=Title}" />
```

Always set `x:DataType` on your page or control to enable compile-time type checking:

```xml
<Page x:DataType="viewmodels:MainViewModel">
```

### 6. CsWin32 Source Generator

CsWin32 generates P/Invoke wrappers at compile time — no hand-written `[DllImport]` needed. Fully AOT-safe:

```
// NativeMethods.txt — list the APIs you need
CreateWindowExW
SetWindowPos
```

Add the package: `dotnet add package Microsoft.Windows.CsWin32`. See the interop skill for detailed setup and usage patterns.

### 7. CommunityToolkit.Mvvm Source Generators

The MVVM Toolkit generates boilerplate at compile time — no reflection, fully AOT-compatible:

```csharp
public partial class SettingsViewModel : ObservableObject
{
    [ObservableProperty]
    private string _userName = string.Empty;

    [RelayCommand]
    private async Task SaveAsync()
    {
        await _settingsService.SaveAsync(UserName);
    }
}
```

These attributes generate the `UserName` property with `INotifyPropertyChanged` and the `SaveCommand` with `ICommand` — all at compile time.

### 8. Self-Contained & Single-File Publishing

```xml
<PropertyGroup>
  <SelfContained>true</SelfContained>
  <PublishSingleFile>true</PublishSingleFile>
  <EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>
</PropertyGroup>
```

**WinUI consideration:** MSIX-packaged apps bundle the runtime differently. Single-file publishing applies primarily to unpackaged (standalone) WinUI apps. Combine with `<PublishTrimmed>true</PublishTrimmed>` for maximum size reduction.

### 9. Trim Compatibility Testing

Always build with trim analysis enabled during development:

```xml
<PropertyGroup>
  <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>
  <TrimmerSingleWarn>false</TrimmerSingleWarn>
</PropertyGroup>
```

Test trimmed builds in CI. Common trim-unsafe patterns to eliminate:

- `Type.GetType("MyNamespace.MyClass")` — invisible to the trimmer
- `Activator.CreateInstance(someType)` without `[DynamicallyAccessedMembers]`
- `Assembly.LoadFrom()` or any dynamic assembly loading
- Unattributed reflection: `typeof(T).GetProperties()`

---

## Anti-patterns

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| Suppressing trim warnings with `<SuppressTrimAnalysisWarnings>true</SuppressTrimAnalysisWarnings>` | Hides real issues; app crashes at runtime | Keep warnings enabled and fix each one |
| Using reflection without `[DynamicallyAccessedMembers]` | Trimmer removes members it cannot see are used | Add appropriate annotations |
| `Type.GetType("Namespace.ClassName")` with string names | Trimmer cannot trace string-based type resolution | Use `typeof(T)` or annotate with `[DynamicDependency]` |
| Dynamic assembly loading in trimmed apps | Loaded assemblies are not analyzed by the trimmer | Use compile-time references or `[DynamicDependency]` |
| Never testing trimmed/published builds | Trim and AOT issues only surface at publish time | Run `dotnet publish` with trimming in CI |
| Using `{Binding}` with dynamic paths in XAML | Relies on runtime reflection, not trim-safe | Switch to `x:Bind` with `x:DataType` |

---

## Validation

### Verification Checklist

- [ ] Project has `<PublishTrimmed>true</PublishTrimmed>` and `<SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>` — no warnings suppressed
- [ ] All `System.Text.Json` usage goes through a `[JsonSerializable]` context — no reflection-based serialization
- [ ] All regex uses `[GeneratedRegex]` instead of `new Regex()`
- [ ] XAML bindings use `x:Bind` with `x:DataType` — no `{Binding}` with dynamic paths
- [ ] MVVM properties and commands use `[ObservableProperty]` / `[RelayCommand]` source generators
- [ ] CI pipeline includes a `dotnet publish` step with trimming enabled to catch regressions

---

## Must Read & Research

> **Agent rule:** Before generating AOT or source-generator code, look up the relevant reference below using microsoft-docs or microsoft-code-reference skills to confirm current API surface, supported scenarios, and any breaking changes.

| Topic | Reference |
|---|---|
| Trimming overview | <https://learn.microsoft.com/dotnet/core/deploying/trimming/trimming-options> |
| Preparing for NativeAOT | <https://learn.microsoft.com/dotnet/core/deploying/native-aot/> |
| System.Text.Json source generation | <https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/source-generation> |
| .NET source generators overview | <https://learn.microsoft.com/dotnet/csharp/roslyn-sdk/source-generators-overview> |
| CommunityToolkit.Mvvm source generators | <https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/generators/overview> |
