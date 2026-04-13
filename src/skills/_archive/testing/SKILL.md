---
name: testing
description: 'Unit testing standards for WinUI 3 apps — MSTest, Moq, AAA pattern, naming conventions, and coverage goals. Use when writing or modifying tests.'
---

# Testing — Unit Tests for WinUI 3

Every public method and class must have corresponding unit tests.

---

## Quick Reference

- **Stack:** MSTest + Moq. Test project: `<ProjectName>.Tests/`
- **Pattern:** Arrange → Act → Assert (AAA) in every test
- **Naming:** `MethodName_Scenario_ExpectedResult`
- **Coverage:** 80%+ on ViewModels/Services, 100% on helpers
- **Run:** `dotnet test -c Debug -p:Platform=x64`
- **Filter:** `--filter "FullyQualifiedName~MainViewModelTests"`

---

## Key Rules

### What to Test
- All public methods in ViewModels, Services, Helpers, Models
- Edge cases: null inputs, empty collections, boundary values
- Error paths: exception handling, invalid state transitions

### What NOT to Test
- XAML layout / visual rendering (use UI tests)
- Framework internals (`InitializeComponent()`)
- Private methods — test indirectly through public API

### Test Naming
Use `MethodName_Scenario_ExpectedResult` — e.g., `CalculateTotal_WithEmptyCart_ReturnsZero`.

### AAA Structure
Every test follows Arrange → Act → Assert. Use `Mock<T>` from Moq for dependencies. Always `await` async methods with `async Task` return type.

### File Structure — Mirror Main Project
One test class per class under test. Mirror folder structure: `ViewModels/MainViewModel.cs` → `ViewModels/MainViewModelTests.cs`.

### Running Tests

```powershell
cd <ProjectName>.Tests

# Specific class
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~MainViewModelTests"

# Specific namespace
dotnet test -c Debug -p:Platform=x64 --filter "FullyQualifiedName~Tests.ViewModels"

# Full suite
dotnet test -c Debug -p:Platform=x64
```

### Agent Workflow

1. Implement feature/fix in main project
2. Write unit tests for every new/changed public method
3. Build — fix all errors
4. Run tests — ensure all pass
5. When modifying existing code: run existing tests first for baseline

### Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Test depends on another test's state | Each test must be fully independent |
| Testing multiple things in one test | One assertion per logical concept |
| Mocking too much | Mock only external dependencies |
| Testing implementation details | Test behaviour and outcomes |
| Async tests without `await` | Always `await` and use `async Task` |

---

## Verification Checklist

- [ ] All ViewModels have corresponding unit tests
- [ ] AAA pattern in every test
- [ ] Edge cases covered (null, empty, boundary)
- [ ] Dependencies mocked via interfaces (Moq)
- [ ] Names follow `MethodName_Scenario_ExpectedResult`

## References

- [Detailed testing patterns, project setup, and code examples](references/testing-patterns.md)

## External Resources

- [MSTest docs](https://learn.microsoft.com/dotnet/core/testing/unit-testing-with-mstest)
- [Unit testing best practices](https://learn.microsoft.com/dotnet/core/testing/unit-testing-best-practices)
- [Moq Quickstart](https://github.com/devlooped/moq/wiki/Quickstart)
