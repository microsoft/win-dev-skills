
### Verify
Note the PID from `winapp run --debug-output` output, then verify:
1. `winapp ui inspect -a <PID> --interactive` — check controls exist
2. `winapp ui screenshot -a <PID>` — check visual appearance
3. `winapp ui invoke <slug> -a <PID>` — test interactions
4. Fix issues, rebuild, and reverify

If the app crashes on startup, the `--debug-output` flag (already included in the run command) will show first-chance exceptions and debug messages — read them to diagnose the root cause.
