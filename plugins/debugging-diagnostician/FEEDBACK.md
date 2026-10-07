# Public feedback

Feedback destination:
[microsoft/WinDbg-Feedback issues](https://github.com/microsoft/WinDbg-Feedback/issues).

Use this procedure for feedback about these debugging skills or WinDbg. For
general application-debugging help, consult that repository's
[support guidance](https://github.com/microsoft/WinDbg-Feedback/blob/master/SUPPORT.md).

## Procedure for assistants

1. Collect the skill ID, public package version, the user's own verdict, and
   what was confusing, incorrect, or missing. Do not invent the user's verdict
   or claim a diagnosis is confirmed when it is not.
2. Check for an existing relevant issue before drafting a new one, when search
   is available. Do not add labels or choose assignees without authorization.
3. Prepare a minimal sanitized title and body using the template below. Exclude
   secrets, customer data, usernames, private paths, hostnames, proprietary source,
   internal links, memory contents, and complete diagnostic transcripts.
4. Show the exact draft and state that it will be publicly visible in
   `microsoft/WinDbg-Feedback`. Obtain explicit approval before posting. Re-review
   material changes to the approved draft. Declining or cancelling creates no
   issue.
5. Use the host's supported GitHub issue-creation tool when available and
   authorized. Otherwise provide the approved text and
   [new-issue page](https://github.com/microsoft/WinDbg-Feedback/issues/new)
   for manual submission. Tool/authentication failure is an explicit failure,
   not a successful submission or an excuse to silently use another destination.
6. Return a confirmed issue URL only after creation succeeds. Never fabricate a
   receipt. For manual submission, say that the issue has not been submitted yet.

Do not automatically attach or upload dumps, CABs, ETLs, TTD recordings, source
code, or diagnosis files. Permission to share an artifact privately does not
authorize public disclosure. Do not put unreviewed diagnostic text into
issue-URL query parameters. Report sensitive vulnerabilities through the approved
private security reporting channel, not this public feedback flow.

## Suggested issue template

Title: `[Debugging skills][<skill-id>] <short feedback summary>`

```markdown
### Skill and version
Plugin: debugging-diagnostician
Package version: <public version from plugin.json>
Skill: <skill-id>

### Category and verdict
Category: <incorrect guidance / missing coverage / unclear instructions / packaging / positive feedback>
My verdict: <helpful / partly helpful / incorrect / unclear>

### Expected behavior
<What the guidance should help me do>

### Observed behavior
<Relevant step and minimal sanitized evidence; label uncertain conclusions>

### Environment
<Relevant WinDbg version, Windows version, architecture; omit identifying information>

### Suggested improvement
<Optional correction, missing explanation, or synthetic repro>
```

Only include information the user approves for public disclosure. There is no
bundled uploader, credential store, private share, or notification service.
