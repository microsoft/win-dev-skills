---
name: mutex-held-across-co-await
description: 'Use when app, service, or user-mode driver C++ coroutine code holds a thread-affine lock across suspension and later hangs or fails. Not for all coroutine crashes or choosing lock performance.'
version: 1.0.0
---

# Mutex Held Across co_await

## Detection

This pattern can occur in native application, service, or user-mode driver
code, including UMDF components that use C++ coroutines. Look for a lock
acquired before `co_await` and released after resumption or
coroutine destruction. Mutex ownership belongs to the acquiring thread, not
the coroutine frame. A resumption on another thread can violate that contract.
Even same-thread resumption can create reentrancy or progress problems when
the awaited operation needs a lock the coroutine still holds.

## Workflow

1. Identify the exact lock primitive and acquisition/release scope in source.
   Audit every suspension point while the RAII guard or ownership is alive.
2. Establish the acquire and resume threads using trace/source evidence.
   Standard mutexes and SRW locks do not provide a universally queryable owner
   field; do not fabricate an owning TID from undocumented layouts.
3. Verify the awaiter's resumption contract. C++/WinRT can preserve apartment
   context for particular awaitables; `resume_background` intentionally switches.
   Do not assume every WinRT awaitable always resumes on a worker or always on
   the originating thread.
4. Distinguish wrong-thread release, a dependency cycle, state changed during
   suspension, lifetime failure, and unrelated memory corruption.
5. Move the thread-affine lock into synchronous scopes. Revalidate relevant
   state after the await rather than treating the pre-await snapshot as current.

If the symptom is general blocking use `wait-chain-analysis`. For damaged
heap objects use `heap-corruption-investigation`. If a recording is available,
`ttd-reverse-debugging-triage` can help establish the ownership timeline.

## Fix pattern

Conceptual sequence, not a promise about any particular scheduler:

```text
under lock:
    take a snapshot and its generation
release lock
await work using that snapshot
under lock on the resumed thread:
    revalidate generation, lifetime, and assumptions
    apply result or explicitly handle a stale/cancelled operation
release lock
```

Use RAII for each synchronous scope. If invariants cannot tolerate unlocking,
redesign the operation or use a specifically designed asynchronous coordination
primitive with cancellation/lifetime rules. Switching to a recursive mutex or
`shared_mutex` does not make a thread-affine lock coroutine-safe.

Do not recommend a blanket mutex-type replacement. Shared locking is a separate
design decision; changing the primitive does not repair suspension ownership.
Keep the object and any captured interfaces alive across asynchronous work.

## Validation

- No thread-affine lock ownership survives a suspension in the corrected path.
- Each awaiter's thread/apartment contract is understood.
- State invariants are revalidated after suspension.
- Cancellation, concurrent mutation, shutdown, and failed awaited work are tested.
- The remedy removes the demonstrated cause, not just an observed exception.

## References

- [Holding a lock across coroutine suspension](https://devblogs.microsoft.com/oldnewthing/20210707-00/?p=105417)
- [C++/WinRT concurrency and asynchronous operations](https://learn.microsoft.com/windows/uwp/cpp-and-winrt-apis/concurrency)
- [Slim reader/writer locks](https://learn.microsoft.com/windows/win32/sync/slim-reader-writer--srw--locks)

## Feedback

Follow `FEEDBACK.md` and report reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `mutex-held-across-co-await` and package version `1.0.0`; no automatic
source, dump, or transcript upload.
