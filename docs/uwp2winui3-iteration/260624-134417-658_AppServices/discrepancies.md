# Discrepancies — `AppServices` migration

**Verdict: non-functional migration. Score 0/100. Every feature FAIL.**

## Build break (blocking)
The migrated WinUI 3 project `app/AppServices/AppServices.csproj` does **not build**
(`dotnet build` → **173,913 errors**).

**Root cause:** the SDK-style WinUI project globs `**/*.cs` and pulls in leftover
**.NET-Native ILC-generated** source from the original UWP sub-projects that were
copied into the migrated tree but never removed/excluded:

- `AppServicesClient/{bin,obj}/x64/Release/ilc/**/*.g.cs`
- `AppServicesProvider/{bin,obj}/x64/Release/ilc/**/*.g.cs`

These produce duplicate-type (`CS0101`), missing-namespace (`CS0234`), and
unsafe-code (`CS0227`) errors, plus a XAML compiler internal error
(`WMC9999: Object reference not set to an instance of an object`).

Because it never builds, the app never launches, so no scenario can be exercised.

## Per-scenario

| # | Scenario | Verdict | Coverage | Detail |
|---|----------|---------|----------|--------|
| 1 | Open/Close Connection | FAIL | 0/3 | App unreachable (build failed). MinValue, MaxValue, GenerateRandomNumber not captured; Result/StatusBlock unverifiable. |
| 2 | Keep Connection Open | FAIL | 0/5 | App unreachable (build failed). OpenConnection, CloseConnection, MinValue, MaxValue, GenerateRandomNumber not captured. |

## UWP baseline note
The original UWP app **did launch** (Release) — window "App Service Client C# sample" —
and a golden screenshot of Scenario 1 was captured
(`parity/baseline/screenshots/01_Open_Close_Connection.png`). However, UI Automation
could not enumerate the UWP **CoreWindow** element tree on this machine (`winapp` UIA
reported 0 elements for both the CoreWindow and its `ApplicationFrameWindow` host), so
title-driven navigation to Scenario 2 and per-control actuation could not be driven
against the UWP golden. Pixel screenshots work; the UIA-driven behavioral baseline is
empty. This does not change the score: the WinUI candidate fails on **reachability**
(it never launched), independent of the behavioral overlay.
