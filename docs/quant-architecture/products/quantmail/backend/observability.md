# M16 — Observability

## Three pillars

Metrics:
- request rate
- errors
- latency
- queue depth
- delivery outcomes
- index lag
- sync lag
- dependency health

Logs:
- structured
- correlation IDs
- actor/service
- operation
- outcome
- bounded metadata

Traces:
- HTTP
- realtime
- queue
- database
- external provider
- Quanty tool execution

## Privacy

Never log:
- passwords
- tokens
- private keys
- raw message bodies by default
- full attachment content
- unnecessary recipient data

Sensitive diagnostics use controlled references.
