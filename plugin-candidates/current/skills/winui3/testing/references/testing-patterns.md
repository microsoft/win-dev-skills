# Testing Patterns — Detailed Reference

Detailed code patterns for WinUI 3 unit testing. See [SKILL.md](../SKILL.md) for rules summary.

---

## Test Project Setup

### Recommended Stack

| Component | Package | Purpose |
|---|---|---|
| Test Framework | `MSTest` | Test runner & assertions |
| Mocking | `Moq` | Mock dependencies |
| UI Testing | `Microsoft.Windows.Apps.Test` | WinUI UI automation (optional) |

### Project Structure

Create a test project alongside the main project:

```
<SolutionRoot>/
  <ProjectName>/           ← Main app project
  <ProjectName>.Tests/     ← Unit test project
```

### Test Project .csproj

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Match TargetFramework to the main project's .csproj -->
    <TargetFramework><!-- same as the main project's .csproj TargetFramework --></TargetFramework>
    <UseWinUI>true</UseWinUI>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="MSTest.TestAdapter" Version="*" />
    <PackageReference Include="MSTest.TestFramework" Version="*" />
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="*" />
    <PackageReference Include="Moq" Version="*" />
  </ItemGroup>

  <ItemGroup>
    <ProjectReference Include="..\<ProjectName>\<ProjectName>.csproj" />
  </ItemGroup>
</Project>
```

---

## Test Naming Convention

Use the pattern: `MethodName_Scenario_ExpectedResult`

```csharp
[TestMethod]
public void CalculateTotal_WithEmptyCart_ReturnsZero() { }

[TestMethod]
public void LoadDataAsync_WhenServiceThrows_SetsErrorState() { }

[TestMethod]
public async Task SaveAsync_WithValidInput_ReturnsTrue() { }
```

---

## AAA Pattern (Arrange → Act → Assert)

### Basic Example

```csharp
[TestMethod]
public void Add_TwoPositiveNumbers_ReturnsSum()
{
    // Arrange
    var calculator = new Calculator();

    // Act
    int result = calculator.Add(2, 3);

    // Assert
    Assert.AreEqual(5, result);
}
```

### ViewModel Testing with Moq

```csharp
[TestMethod]
public async Task LoadItemsAsync_OnSuccess_PopulatesItems()
{
    // Arrange
    var mockService = new Mock<IDataService>();
    mockService
        .Setup(s => s.GetItemsAsync())
        .ReturnsAsync(new List<Item> { new("Test") });

    var viewModel = new MainViewModel(mockService.Object);

    // Act
    await viewModel.LoadItemsAsync();

    // Assert
    Assert.AreEqual(1, viewModel.Items.Count);
    Assert.IsFalse(viewModel.IsLoading);
}
```

---

## Async Test Patterns

Always `await` async methods and use `async Task` return type:

```csharp
[TestMethod]
public async Task SaveAsync_WithValidInput_ReturnsTrue()
{
    // Arrange
    var mockRepo = new Mock<IRepository>();
    mockRepo.Setup(r => r.SaveAsync(It.IsAny<Item>()))
        .ReturnsAsync(true);
    var service = new DataService(mockRepo.Object);

    // Act
    var result = await service.SaveAsync(new Item("Test"));

    // Assert
    Assert.IsTrue(result);
}
```

---

## File Organization — Mirror Main Project

Mirror the main project's folder structure in the test project:

```
<ProjectName>/                    <ProjectName>.Tests/
  Models/                           Models/
    User.cs                           UserTests.cs
  ViewModels/                       ViewModels/
    MainViewModelTests.cs             MainViewModelTests.cs
    Settings/                         Settings/
      ThemeViewModel.cs                 ThemeViewModelTests.cs
  Services/                         Services/
    DataService.cs                    DataServiceTests.cs
    Auth/                             Auth/
      AuthService.cs                    AuthServiceTests.cs
  Helpers/                          Helpers/
    StringHelper.cs                   StringHelperTests.cs
  Converters/                       Converters/
    BoolToVisibilityConverter.cs      BoolToVisibilityConverterTests.cs
```

### One Test Class per Class Under Test

```csharp
namespace <RootNamespace>.Tests.ViewModels;

[TestClass]
public class MainViewModelTests
{
    // All tests for MainViewModel go here
}
```

---

## Running Tests

### On-Demand Filtering

```powershell
cd <ProjectName>.Tests

# Run tests for a specific class
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~MainViewModelTests"

# Run a single test
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~MainViewModelTests.LoadItemsAsync_OnSuccess_PopulatesItems"

# Run all tests in a namespace (e.g., all ViewModel tests)
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~Tests.ViewModels"

# Run tests in a subfolder namespace
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~Tests.ViewModels.Settings"

# Run the full suite
dotnet test -c Debug -p:Platform=x64
```

### Build Only the Test Project

```powershell
cd <ProjectName>.Tests
dotnet build -c Debug -p:Platform=x64
```

### Run Tests with Verbose Output

```powershell
dotnet test -c Debug -p:Platform=x64 --verbosity normal
```

---

## Edge Case Testing Patterns

Always cover these scenarios:

- **Null inputs** — verify graceful handling or expected exceptions
- **Empty collections** — ensure no index-out-of-range errors
- **Boundary values** — min/max integers, empty strings, whitespace
- **Error paths** — exception handling, invalid state transitions

---

## Coverage Goals

- **80%+** code coverage on business logic (ViewModels, Services)
- **100%** coverage of utility/helper methods
- UI code-behind is exempt from unit test coverage (tested via integration/UI tests)

---

## Agent Workflow for Tests

1. **Implement the feature or fix** in the main project
2. **Write unit tests** for every new/changed public method
3. **Build** — fix all errors and warnings
4. **Run tests** — `dotnet test -c Debug -p:Platform=x64` and ensure all pass
5. **Review** — confirm tests cover happy path, edge cases, and error cases

### When Modifying Existing Code

1. **Run existing tests first** to establish a baseline
2. Make the code change
3. **Run tests again** — fix any failures
4. **Add new tests** if the change introduces new behaviour
