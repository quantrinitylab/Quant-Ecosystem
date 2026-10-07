# M18 — Unit Economics

## Canonical units
Use measurable units rather than vague monthly infrastructure totals:
- cost per active user
- cost per mailbox
- cost per million messages processed
- cost per GB stored
- cost per GB delivered
- cost per million search operations
- cost per million queue jobs
- cost per realtime connection-hour
- cost per Quanty tool/inference unit

## Attribution
Every major infrastructure bill must map to a product, workload class, organization tier, or shared-platform pool.

## Shared platform
Shared costs are allocated using transparent drivers such as active users, storage, compute time, requests, connections, or events.

## Guardrail
Do not optimize a unit metric by degrading correctness, security, or user experience.
