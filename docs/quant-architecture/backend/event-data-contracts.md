# Event Data Contracts

Analytical ingestion consumes versioned domain events.

Required metadata:
- eventId
- eventType/version
- producer
- occurredAt
- ingestedAt
- account/org scope where applicable
- correlationId
- privacy classification
- schema version

Breaking schema changes require a new version. Consumers must tolerate additive evolution according to contract policy.
