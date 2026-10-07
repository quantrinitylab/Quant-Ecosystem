# M09 — Attention Testing

## Unit

- priority calculation
- dedupe key generation
- read vs resolved state
- expiry
- preference matching
- grouping

## Integration

- each source event
- at-least-once replay
- duplicate events
- stale event version
- delivery failure
- reconnect
- deep-link routing

## Security

- cross-user event injection
- forged source identity
- unauthorized deep link
- security alert suppression
- device-token abuse
- payload leakage

## E2E

1. receive new mail
2. receive duplicate event
3. receive calendar change
4. create Quanty approval request
5. read but do not resolve
6. resolve source task
7. reconnect
8. verify notification state
9. verify security event cannot be hidden

## Performance

Measure:
- ingestion latency
- list p95
- realtime propagation
- dedupe latency
- notification delivery latency
