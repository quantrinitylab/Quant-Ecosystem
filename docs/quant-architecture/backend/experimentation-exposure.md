# Experiment Exposure

Exposure is recorded only when the user actually reaches the evaluated experience.

Required:
- experiment/version
- subject scope
- variant
- timestamp
- client/version
- correlation ID

Assignment without exposure is not treatment exposure.

Duplicate exposure events are deduplicated according to experiment semantics.
