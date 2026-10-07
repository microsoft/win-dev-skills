# Changelog

## 1.0.0 - Initial contribution

- Included the curated debugging skill inventory in `skills.json`.
- Added the auxiliary `validate-diagnosis-output` skill, contrarian agent,
  and two reasoning instruction files required for the complete workflow.
- Kept the runtime package limited to the inventory in `skills.json`.
- Removed owner and metadata fields from every skill header.
- Added public WinDbg-Feedback guidance.
- Added explicit diagnosis/fix confidence separation and fix-path coverage
  calibration for the contrarian review gate.
