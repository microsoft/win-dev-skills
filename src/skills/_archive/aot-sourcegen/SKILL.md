---
name: aot-sourcegen
description: 'AOT compilation and source generators for WinUI 3 apps — trimming, NativeAOT readiness, JSON source generators, and XAML compilation. Use when optimizing app startup, size, or deployment.'
---

# AOT Compilation & Source Generators for WinUI 3

These rules apply to **every feature and change**.

---

## Quick Reference

- **Trimming:** `<PublishTrimmed>true</PublishTrimmed>` — never suppress warnings, fix them.
- **NativeAOT:** Not yet supported for WinUI 3. Trimming is the path toward AOT readiness.
- **JSON:** `[JsonSerializable]` contexts, never reflection-based serialization.
- **Regex:** `[GeneratedRegex]` (.NET 7+), never `new Regex(pattern)`.
- **XAML:** `{x:Bind}` with `x:DataType` — compiled, AOT-safe.
- **MVVM:** `[ObservableProperty]` / `[RelayCommand]` — compile-time, no reflection.

---

## Rules

### Decision Tree — When to Use Each Generator

| Need | Generator |
|---|---|
| JSON serialization | `[JsonSerializable]` on `JsonSerializerContext` |
| Regex patterns | `[GeneratedRegex]` on `partial Regex Method()` |
| Win32 P/Invoke | CsWin32 + `NativeMethods.txt` |
| MVVM properties/commands | `[ObservableProperty]` / `[RelayCommand]` |
| XAML bindings | `{x:Bind}` + `x:DataType` |

### Trimming
Enable `<PublishTrimmed>true</PublishTrimmed>` with `<TrimMode>full</TrimMode>`. Never suppress trim warnings — fix them. Annotate reflection with `[DynamicallyAccessedMembers]`.

### NativeAOT
Not yet supported for WinUI 3. `<PublishAot>true</PublishAot>` will fail.

### JSON / Regex / XAML
- JSON: `[JsonSerializable(typeof(T))]` context — never reflection-based serialization
- Regex: `[GeneratedRegex(pattern)]` — never `new Regex(pattern)`
- XAML: `{x:Bind}` with `x:DataType` — never `{Binding}` with dynamic paths

### CsWin32 / MVVM / Publishing
- CsWin32: add package, list APIs in `NativeMethods.txt`
- MVVM: `[ObservableProperty]` / `[RelayCommand]` — compile-time, no reflection
- Self-contained: `<SelfContained>` + `<PublishSingleFile>` + `<EnableCompressionInSingleFile>`

### Trim Compatibility
Eliminate: `Type.GetType("string")`, `Activator.CreateInstance` without annotations, `Assembly.LoadFrom()`, unattributed `typeof(T).GetProperties()`.

---

## Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| Suppressing trim warnings | Fix each warning |
| Reflection without annotations | `[DynamicallyAccessedMembers]` |
| `Type.GetType("string")` | `typeof(T)` or `[DynamicDependency]` |
| Dynamic assembly loading | Compile-time references |
| `{Binding}` with dynamic paths | `x:Bind` with `x:DataType` |

---

## Verification Checklist

- [ ] `<PublishTrimmed>true</PublishTrimmed>` with warnings enabled
- [ ] JSON uses `[JsonSerializable]` contexts
- [ ] Regex uses `[GeneratedRegex]`
- [ ] XAML uses `x:Bind` with `x:DataType`
- [ ] MVVM uses `[ObservableProperty]` / `[RelayCommand]`
- [ ] CI includes `dotnet publish` with trimming

## References

- [Detailed source generator patterns and code examples](references/sourcegen-patterns.md)

## External Resources

- [Trimming options](https://learn.microsoft.com/dotnet/core/deploying/trimming/trimming-options)
- [NativeAOT](https://learn.microsoft.com/dotnet/core/deploying/native-aot/)
- [JSON source generation](https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/source-generation)
- [CommunityToolkit.Mvvm generators](https://learn.microsoft.com/dotnet/communitytoolkit/mvvm/generators/overview)
