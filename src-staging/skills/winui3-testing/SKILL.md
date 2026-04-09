---
name: winui3-testing
description: "Unit testing for WinUI 3 apps — MSTest and Moq test stack, project setup, AAA pattern (Arrange/Act/Assert), naming conventions (MethodName_Scenario_Expected), testing ViewModels and Services, async test patterns, folder mirroring, coverage targets, and test execution with dotnet test. Use when writing, modifying, or running unit tests."
---

### Test Project Setup

```powershell
# Create test project alongside main project
dotnet new mstest -n <AppName>.Tests
cd <AppName>.Tests
dotnet add reference ..\<AppName>\<AppName>.csproj
dotnet add package Moq
```

Ensure the test project targets the same `<TargetFramework>` and `<Platform>` as the main project. Add to the test `.csproj`:
```xml
<PropertyGroup>
    <TargetFramework>net10.0-windows10.0.26100.0</TargetFramework>
    <Platforms>x64;ARM64</Platforms>
</PropertyGroup>
```

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
dotnet test -c Debug -p:Platform=x64

# Run specific test class
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~MainViewModelTests"

# Run specific namespace
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~Tests.ViewModels"

# Verbose output
dotnet test -c Debug -p:Platform=x64 --logger "console;verbosity=detailed"
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

For detailed test patterns, project configuration, and advanced scenarios, see `references/` directory.