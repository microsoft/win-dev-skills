# Parity Report — App service client sample

Generated 2026-06-25T07:47:02.6683093+08:00 by Compare-Parity.ps1.

**Parity score: 0 / 100**  ·  pass=0 partial=0 fail=2  ·  2 scenario(s)

| # | Scenario | Verdict | Coverage | Actions | Screenshot | Notes |
|---|----------|---------|----------|---------|------------|-------|
| 1 | Open/Close Connection | FAIL | 0/3 | — | 01_Open_Close_Connection.png | Scenario not reachable — no screenshot/UIA captured. |
| 2 | Keep Connection Open | FAIL | 0/5 | — | 02_Keep_Connection_Open.png | Scenario not reachable — no screenshot/UIA captured. |

## Scenarios needing work

### Scenario 1 — Open/Close Connection  [FAIL]

- Scenario not reachable — no screenshot/UIA captured.
- Controls not found in the WinUI 3 UIA tree:
  - TextBox "0"
  - TextBox "10"
  - Button "Generate Random Number"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/01_Open_Close_Connection.png` against the baseline.

### Scenario 2 — Keep Connection Open  [FAIL]

- Scenario not reachable — no screenshot/UIA captured.
- Controls not found in the WinUI 3 UIA tree:
  - Button "Open Connection"
  - Button "Close Connection"
  - TextBox "0"
  - TextBox "10"
  - Button "Generate Random Number"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/02_Keep_Connection_Open.png` against the baseline.

> Coverage is a structural proxy (AutomationId / name / label text found in the
> captured UIA tree). A `pass` here is necessary but not sufficient: also confirm
> visually (screenshots) and behaviourally that each control does what the UWP
> source does. Set `AutomationProperties.AutomationId` on controls to make this
> check reliable.
