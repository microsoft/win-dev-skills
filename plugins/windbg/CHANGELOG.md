# Changelog

## 1.0.0 - Initial contribution

- Included the curated debugging skill inventory in `skills.json`.
- Added the shared `windbg-diagnostic-method` skill with deterministic report
  validation and the contrarian agent required for the complete workflow.
- Kept the runtime package limited to the inventory in `skills.json`.
- Removed owner and metadata fields from every skill header.
- Added public WinDbg-Feedback guidance.
- Added explicit diagnosis/fix confidence separation and fix-path coverage
  calibration for the contrarian review gate.
