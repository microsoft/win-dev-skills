---
skills: [ui-automation]
---

Once you are done building the application, validate the built app against its requirements and design specification using winapp ui commands. Consider the original prompt from the user, and any design or architecture specs that you might have created in this validation.

Summary of commands:
Note the PID from `winapp run --debug-output` output, then verify:
1. `winapp ui inspect -a <PID> --interactive` — check controls exist (`--interactive` option only shows invocable elements, remove for the full tree)
2. `winapp ui screenshot -a <PID>` — check visual appearance
3. `winapp ui invoke <automationid/slug> -a <PID>` — test interactions
4. `winapp ui set-value <autopmationId/slug> <value> -a <PID>` - enter text or change value 
5. Prefer usage of automationId over slug as slugs change between runs or ui refreshes

WORKFLOW:
1. Take screenshots of every page
2. Verify layout matches design spec (content fills window, correct navigation, right controls)
3. Test functionality (click buttons, fill inputs, navigate pages)
4. Spot-check accessibility (AutomationProperties via inspect)

If the app crashes on startup, the `--debug-output` flag (already included in the run command) will show first-chance exceptions and debug messages — read them to diagnose the root cause.

If something is not completed like a requirement missing, a feature not implemented, UI unfinished, something is not working, crashing, etc, go back to the Code and Build phase to resolve issues and then revalidate/reverify again.
