# Root-Cause Analysis Instructions

## Evidence ladder

Prefer direct evidence in this order:

1. Faulting instruction/context, bugcheck/exception parameters, and resource
   owners/waiters from the actual dump or trace.
2. Matching symbols and the user's authorized source for the involved build.
3. Allocation/free, Verifier, IRP, lock, ETW, WCT, or TTD history captured for
   the same failure.
4. Controlled reproduction and instrumentation.
5. Pattern guidance as a hypothesis only.

## First-pass normalization

- Confirm process dump versus kernel dump and target architecture/build.
- Load public Windows symbols and matching symbols for user/vendor modules.
- Record missing pages, symbols, related-process dumps, trace scope, and tool
  availability.
- User-mode exception: `.exr -1`, `.ecxr`, stack and registers.
- Kernel bugcheck: `.bugcheck`, `!analyze -v`, then documented context/trap
  recovery for that code.
- Hang: identify the affected operation, wait type, owner/server, and deepest
  supported blocker.
- Memory: distinguish corruption, address-space pressure, and commit/limit
  failures before choosing a fix.

## Quality bar

- Name the violated invariant and the parties/path that violate it.
- Separate detector/victim from original writer/freeing/holding actor.
- Test alternatives with direct evidence.
- Do not blame a module solely from a bucket or `MODULE_NAME`.
- Never claim commands, source access, or artifacts unavailable to the session.
- State whether the conclusion is final or pending verification and why.

## Safety and privacy

Dumps, traces, ETLs, CABs, source, paths, tokens, and memory contents can be
sensitive. Obtain authorization before capture, configuration changes, or
sharing. Verifier/Page Heap can disrupt workloads and must use a recoverable
test plan and restoration steps. Public feedback follows `FEEDBACK.md` and
defaults to a minimal reviewed summary with no automatic attachments.
