# M17 — Queue Throughput & Worker Scaling

## Work classes
Outbound delivery, inbound processing, search indexing, notification projection, attachment scanning, lifecycle/deletion, Quanty jobs, and analytics/enrichment.

## Rules
Every externally meaningful job has an idempotency key. Consumers use bounded retries with jitter, dead-letter handling, lease/visibility timeouts, poison-message detection, tenant fairness, and graceful shutdown.

## Scaling
Scale from queue depth, queue age, service time, and dependency saturation—not queue depth alone.

## Backpressure
When downstream providers or databases saturate, workers reduce intake rather than accumulating unlimited concurrency.

## Capacity evidence
Record jobs/sec, service time, queue age, retry ratio, DLQ rate, worker utilization, and dependency saturation.
