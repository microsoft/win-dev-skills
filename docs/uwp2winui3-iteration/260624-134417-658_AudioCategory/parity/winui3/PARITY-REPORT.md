# Parity Report — Audio Category Sample

Generated 2026-06-25T23:44:02.1324391+08:00 by Compare-Parity.ps1.

**Parity score: 0 / 100**  ·  pass=0 partial=0 fail=10  ·  10 scenario(s)

| # | Scenario | Verdict | Coverage | Actions | Screenshot | Notes |
|---|----------|---------|----------|---------|------------|-------|
| 1 | Movie | FAIL | 0/1 | 0/1 live | 01_Movie.png | Missing 1/1 control(s): Button "Select Audio File" |
| 2 | Media | FAIL | 0/1 | 0/1 live | 02_Media.png | Missing 1/1 control(s): Button "Select Audio File" |
| 3 | Game Chat | FAIL | 0/1 | 0/1 live | 03_Game_Chat.png | Missing 1/1 control(s): Button "Select Audio File" |
| 4 | Speech | FAIL | 0/1 | 0/1 live | 04_Speech.png | Missing 1/1 control(s): Button "Select Audio File" |
| 5 | Communications | FAIL | 0/1 | 0/1 live | 05_Communications.png | Missing 1/1 control(s): Button "Select Audio File" |
| 6 | Alerts | FAIL | 0/1 | 0/1 live | 06_Alerts.png | Missing 1/1 control(s): Button "Select Audio File" |
| 7 | Sound Effects | FAIL | 0/1 | 0/1 live | 07_Sound_Effects.png | Missing 1/1 control(s): Button "Select Audio File" |
| 8 | Game Effects | FAIL | 0/1 | 0/1 live | 08_Game_Effects.png | Missing 1/1 control(s): Button "Select Audio File" |
| 9 | Game Media | FAIL | 0/1 | 0/1 live | 09_Game_Media.png | Missing 1/1 control(s): Button "Select Audio File" |
| 10 | Other | FAIL | 0/1 | 0/1 live | 10_Other.png | Missing 1/1 control(s): Button "Select Audio File" |

## Scenarios needing work

### Scenario 1 — Movie  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/01_Movie.png` against the baseline.

### Scenario 2 — Media  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/02_Media.png` against the baseline.

### Scenario 3 — Game Chat  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/03_Game_Chat.png` against the baseline.

### Scenario 4 — Speech  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/04_Speech.png` against the baseline.

### Scenario 5 — Communications  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/05_Communications.png` against the baseline.

### Scenario 6 — Alerts  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/06_Alerts.png` against the baseline.

### Scenario 7 — Sound Effects  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/07_Sound_Effects.png` against the baseline.

### Scenario 8 — Game Effects  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/08_Game_Effects.png` against the baseline.

### Scenario 9 — Game Media  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/09_Game_Media.png` against the baseline.

### Scenario 10 — Other  [FAIL]

- Missing 1/1 control(s): Button "Select Audio File"
- Controls not found in the WinUI 3 UIA tree:
  - Button "Select Audio File"
- Inspect: `winapp ui inspect -a <PID> --interactive` after navigating to this scenario, and compare `screenshots/10_Other.png` against the baseline.

> Coverage is a structural proxy (AutomationId / name / label text found in the
> captured UIA tree). A `pass` here is necessary but not sufficient: also confirm
> visually (screenshots) and behaviourally that each control does what the UWP
> source does. Set `AutomationProperties.AutomationId` on controls to make this
> check reliable.
