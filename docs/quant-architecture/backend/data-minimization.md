# M21 — Data Minimization

## Collection
Every persistent field should have:
- purpose
- owner
- retention class
- sensitivity
- access policy
- deletion behavior

Fields without a valid purpose should not be collected.

## Derived data
Embeddings, summaries, classifications, relationship signals, ranking features, and analytics are derived data and must reference their source policy.

## Telemetry
Prefer counters, durations, dimensions, and opaque IDs over message bodies, attachment contents, search queries, or sensitive identifiers.
