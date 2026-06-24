# App service client sample — behavioral baseline

Derived from UWP source by Extract-UwpFeatureChecklist.ps1. Each scenario below
is a feature point the migrated WinUI 3 app must preserve. Screenshots (when
captured) live in `screenshots/` named `NN_<slug>.png`.

## Scenario 1 - Open/Close Connection

- **Screenshot:** `screenshots/01_Open_Close_Connection.png`
- **Page class:** `OpenCloseConnectionScenario`
- **UI elements:**
  - TextBox, name=MinValue, label="0"
  - TextBox, name=MaxValue, label="10"
  - Button, name=GenerateRandomNumber, label="Generate Random Number"
- **Code behavior:** _(verify the page's handlers produce the analogous result; see source `OpenCloseConnectionScenario.xaml.cs`)_
- **Interactions to test (click/toggle, then check output):**
  - Generate Random Number "Generate Random Number" (Button)
- **Output elements:** MinValue, MaxValue, Result, StatusBorder, StatusBlock

## Scenario 2 - Keep Connection Open

- **Screenshot:** `screenshots/02_Keep_Connection_Open.png`
- **Page class:** `KeepConnectionOpenScenario`
- **UI elements:**
  - Button, name=OpenConnection, label="Open Connection"
  - Button, name=CloseConnection, label="Close Connection"
  - TextBox, name=MinValue, label="0"
  - TextBox, name=MaxValue, label="10"
  - Button, name=GenerateRandomNumber, label="Generate Random Number"
- **Code behavior:** _(verify the page's handlers produce the analogous result; see source `KeepConnectionOpenScenario.xaml.cs`)_
- **Interactions to test (click/toggle, then check output):**
  - Open Connection "Open Connection" (Button)
  - Close Connection "Close Connection" (Button)
  - Generate Random Number "Generate Random Number" (Button)
- **Output elements:** MinValue, MaxValue, Result, StatusBorder, StatusBlock

