---
name: winui3-testing
description: "Unit testing for WinUI 3 apps — MSTest and Moq test stack, project setup, AAA pattern (Arrange/Act/Assert), naming conventions (MethodName_Scenario_Expected), testing ViewModels and Services, async test patterns, folder mirroring, coverage targets, and test execution with dotnet test. Use when writing, modifying, or running unit tests."
---

### Test Project Setup

Extract testable code (ViewModels, Services, Models) into a **class library** so both the app and tests can reference it without pulling in XAML/WinAppSDK dependencies:

```
<Solution>/
  <AppName>/              → WinUI app (references the class library)
  <AppName>.Core/         → Class library: ViewModels, Services, Models
  <AppName>.Tests/        → MSTest project (references the class library)
```

**Step 1: Create the class library and test project**
```powershell
dotnet new classlib -n <AppName>.Core
dotnet new mstest -n <AppName>.Tests
cd <AppName>.Tests
dotnet add reference ..\<AppName>.Core\<AppName>.Core.csproj
dotnet add package Moq
```

**Step 2: Configure the class library `.csproj`**
```xml
<PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
</PropertyGroup>

<ItemGroup>
    <PackageReference Include="CommunityToolkit.Mvvm" />
</ItemGroup>
```

Move ViewModels, Services (interfaces + implementations), and Models into the class library. Keep only XAML pages, code-behind, and App.xaml.cs in the WinUI app project.

**Step 3: Configure the test project `.csproj`**
```xml
<PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
</PropertyGroup>

<ItemGroup>
    <PackageReference Include="MSTest" />
    <PackageReference Include="Moq" />
</ItemGroup>
```

> **Do NOT reference the WinUI app project directly** — it pulls in the XAML compiler and WinAppSDK runtime, causing `COMException` failures. Reference the class library instead.

> **Use `net10.0`** (not the Windows TFM) for the test project. The Windows TFM causes MSTest to use AppContainer mode, which crashes the test host.

For tests that need XAML types at runtime, use the `dotnet new winui-unittest` template instead.

### Test Structure

#### AAA Pattern (Arrange / Act / Assert)
Every test follows this structure:
```csharp
[TestMethod]
public async Task LoadDataAsync_WithValidSource_PopulatesItems()
{
    // Arrange
    var mockService = new Mock<IDataService>();
    mockService.Setup(s => s.GetItemsAsync())
        .ReturnsAsync(new List<Item> { new("Test") });
    var viewModel = new MainViewModel(mockService.Object);

    // Act
    await viewModel.LoadDataCommand.ExecuteAsync(null);

    // Assert
    Assert.AreEqual(1, viewModel.Items.Count);
    Assert.AreEqual("Test", viewModel.Items[0].Name);
}
```

#### Naming Convention
`MethodName_Scenario_ExpectedResult` — examples:
- `CalculateTotal_WithEmptyCart_ReturnsZero`
- `SaveCommand_WhenFormInvalid_DoesNotPersist`
- `SearchAsync_WithNullQuery_ThrowsArgumentException`

#### File Structure — Mirror Main Project
```
<AppName>/                    <AppName>.Tests/
  ViewModels/                   ViewModels/
    MainViewModel.cs              MainViewModelTests.cs
  Services/                    Services/
    DataService.cs                DataServiceTests.cs
  Helpers/                     Helpers/
    StringHelper.cs               StringHelperTests.cs
```

### What to Test

| Test | Don't Test |
|------|-----------|
| All public methods in ViewModels | XAML layout / visual rendering |
| All public methods in Services | `InitializeComponent()` or framework internals |
| Edge cases: null, empty, boundary | Private methods (test via public API) |
| Error paths: exceptions, invalid state | Code-behind event wiring |
| Command execution and state changes | Third-party library internals |
| Property change notifications | |

### Async Test Patterns

```csharp
// Always use async Task, never async void
[TestMethod]
public async Task RefreshAsync_SetsIsLoadingDuringOperation()
{
    var tcs = new TaskCompletionSource<List<Item>>();
    var mockService = new Mock<IDataService>();
    mockService.Setup(s => s.GetItemsAsync()).Returns(tcs.Task);
    var vm = new MainViewModel(mockService.Object);

    var task = vm.RefreshCommand.ExecuteAsync(null);
    Assert.IsTrue(vm.IsLoading);

    tcs.SetResult(new List<Item>());
    await task;
    Assert.IsFalse(vm.IsLoading);
}
```

### Mocking with Moq

```csharp
// Setup interface mock
var mockSettings = new Mock<ISettingsService>();
mockSettings.Setup(s => s.GetValue("theme")).Returns("Dark");

// Verify method was called
mockSettings.Verify(s => s.Save(It.IsAny<string>(), It.IsAny<string>()), Times.Once);
```
Mock only external dependencies (services, repositories). Don't mock the class under test.

### Running Tests

```powershell
cd <AppName>.Tests

# Run all tests
dotnet test

# Run specific test class
dotnet test --filter "FullyQualifiedName~MainViewModelTests"

# Run specific namespace
dotnet test --filter "FullyQualifiedName~Tests.ViewModels"

# Verbose output
dotnet test --logger "console;verbosity=detailed"
```

### Coverage Targets

- **ViewModels:** 80%+ coverage
- **Services:** 80%+ coverage
- **Helpers/Utilities:** 100% coverage
- **Models:** Test validation logic and computed properties

### Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Test depends on another test's state | Each test must be fully independent |
| Testing multiple things in one test | One assertion per logical concept |
| Mocking too much | Mock only external dependencies |
| Async test without `await` | Always `await` and use `async Task` return type |
| Testing implementation details | Test behavior and outcomes, not internals |
| Hardcoded test data everywhere | Use helper methods or test data builders |

### References

| File | Read when... |
|------|-------------|
| `references/testing-patterns.md` | Setting up test projects, advanced Moq patterns, async testing, edge cases, folder mirroring, CI integration |