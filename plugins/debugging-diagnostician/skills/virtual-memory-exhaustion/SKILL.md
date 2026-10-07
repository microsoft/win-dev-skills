---
name: virtual-memory-exhaustion
description: 'Use when a native app, service, or user-mode driver host allocation fails; distinguish VA exhaustion, fragmentation, and commit pressure. Not for managed .NET heap growth, proving a leak from one snapshot, or corruption.'
---

# Virtual Memory Exhaustion

## Detection

Investigate `E_OUTOFMEMORY` (`0x8007000E`), `STATUS_NO_MEMORY` (`0xC0000017`),
`bad_alloc`, or failed heap/virtual allocations in an application, service, or
user-mode driver host (including UMDF). Record the actual API, requested
size/alignment, architecture, flags, and error. Free physical RAM does not rule
out insufficient virtual address space, commit pressure, or applicable limits.

## Workflow

### 1. Examine the process VA map

```text
!address -summary
!address
!heap -s
```

Compare available regions with the attempted allocation's contiguous range and
alignment requirements. Distinguish reserved, committed, free, image, mapped,
stack, and heap ranges. A large reservation consumes VA without committing its
entire range. Heap internals may require more than the user's requested bytes.

Report unavailable pages/map data rather than inferring completeness from a
limited dump.

### 2. Separate pressure mechanisms

| Mechanism | Evidence needed |
|---|---|
| VA exhaustion | Process address range/architecture and little usable free VA |
| Fragmentation | Free space exists, but no suitable contiguous/aligned region |
| System commit pressure | Commit usage/limit near the failure, not just free RAM |
| Process/job memory limit | Actual configured limit and relevant usage/accounting |
| Allocation policy/API failure | API-specific constraints, flags, or allocator policy |

Use contemporaneous system memory counters or an appropriate live/kernel
session for system commit data. A process PEB is not a documented
`MaximumCommit` source. A process's committed bytes alone do not establish a
system-wide or job limit.

For 32-bit targets inspect `/LARGEADDRESSAWARE` and the host architecture;
2 GB versus up to 4 GB depends on those settings. Verify current documented
limits for the target Windows version and architecture instead of applying
one 64-bit limit to every system.

### 3. Identify dominant consumers

```text
!address -f:Heap
!address -f:Stack
!heap -stat -h <heap-address>
```

Use `!address -?` and `!heap -?` for allocator/version-specific support.
Classify dominant heaps, stacks, mappings, images, and reserved arenas.
Large or numerous allocations are not automatically leaks: map them to cache
policy, owners, workload, and expected lifetimes.

### 4. Establish growth with history

Collect authorized time-series counters, repeated comparable snapshots, or
allocation/free tracing across the workload. Compare warm-up with steady-state
behavior and verify whether memory is reclaimed when work finishes.

One snapshot plus process uptime cannot prove a leak rate. For a suitable
user-mode recording use `ttd-reverse-debugging-triage`; for damaged allocations
use `heap-corruption-investigation` instead.

## Fix patterns

- Bound caches by an appropriate size/cost policy and verify eviction.
  Define the lifetime of any references returned before eviction.
- Match `VirtualAlloc` reservations with the correct `VirtualFree` release
  contract; distinguish decommit from release.
- Use RAII to release resources on all supported exit/error paths.
- Reduce large contiguous allocation requirements where the design permits.
- Do not blindly increase limits or stack reservations before finding the
  pressure source, and do not convert a failed allocation into a silent success.

## Validation

Name the failing allocation and pressure mechanism, identify the consumer with
evidence, and exercise the remedy through warm-up, sustained load, and cleanup.
Verify memory remains bounded or the intended allocation succeeds under the
required constraints. Document configured system/job limits separately.

## References

- [Address extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-address)
- [Heap extension](https://learn.microsoft.com/windows-hardware/drivers/debuggercmds/-heap)
- [Windows memory limits](https://learn.microsoft.com/windows/win32/memory/memory-limits-for-windows-releases)
- [Large-address-aware linker option](https://learn.microsoft.com/cpp/build/reference/largeaddressaware-handle-large-addresses)
- [VirtualFree](https://learn.microsoft.com/windows/win32/api/memoryapi/nf-memoryapi-virtualfree)

## Feedback

Follow `FEEDBACK.md` and submit reviewed, sanitized feedback to
[WinDbg-Feedback](https://github.com/microsoft/WinDbg-Feedback/issues).
Include `virtual-memory-exhaustion` and the package version from `plugin.json`;
no automatic dump or memory-content upload.
