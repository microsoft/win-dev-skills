# Dev-agent slips — `AppServices`

The agent's repeated rebuilds against the poisoned tree look like a slip, but the skill
did not prominently cover the symptom and the bootstrap itself introduced the bad files.
It is therefore treated as **downstream of the skill-defect**, not an independent slip
warranting (or excluded from) a skill change. The remedy is in `skill-defects.json`:
stop copying `bin`/`obj`, and document the CS0101/ilc build-error class.
