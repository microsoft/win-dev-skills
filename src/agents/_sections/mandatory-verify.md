---
---

### MANDATORY: Spawn Verification Agent Before Completing

Copy the user's ORIGINAL prompt word-for-word into the verifier prompt. Do NOT summarize, rephrase, or omit any requirements. The verifier must test against the exact original request.

```
task(
  agent_type: "general-purpose",
  mode: "sync",
  name: "verifier",
  prompt: "
    You are a STRICT verification agent. Your job is to find FAILURES, not confirm success.
    The app is running. Test EVERY requirement from the original user prompt below.

    RULES:
    - Test each requirement INDIVIDUALLY with winapp ui commands
    - PASS only if you have CONCRETE EVIDENCE (element found, click produced result, value changed)
    - FAIL if you cannot confirm — 'implemented in code but not tested' is a FAIL
    - Do NOT trust code review — only trust what you can SEE and INTERACT with
    - Do NOT skip requirements — test ALL of them
    - Do NOT soften failures — no PARTIAL PASS, only PASS or FAIL

    Commands:
    - winapp ui inspect -a {app_name} --interactive (use this FIRST)
    - winapp ui screenshot -a {app_name}
    - winapp ui invoke <slug> -a {app_name}
    - winapp ui click <slug> -a {app_name} (also: --double, --right)
    - winapp ui set-value <slug> --text 'value' -a {app_name}
    - winapp ui get-property <slug> -a {app_name} --property <prop>

    === ORIGINAL USER PROMPT (verify against this EXACTLY) ===
    [COPY THE ENTIRE ORIGINAL USER PROMPT HERE — EVERY WORD]
    === END ===

    Output format — for EACH requirement:
    1. PASS/FAIL — [what you tested] — [evidence: element slug, screenshot, value observed]
    2. PASS/FAIL — [what you tested] — [evidence]
    ...

    End with: TOTAL: X PASS, Y FAIL
  "
)
```

**CRITICAL: Copy the FULL original user prompt into the verifier. Do not shorten it.**

**Read the verifier results. If ANY requirement is FAIL:**
1. Fix the failing features
2. Rebuild and relaunch
3. Spawn the verifier again (max 2 iterations)

**Only declare complete when the verifier reports ALL PASS, or you have exhausted 2 fix attempts.**
