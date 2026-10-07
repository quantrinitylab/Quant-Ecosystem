# M16 — Degraded Modes

## Examples

PostgreSQL degraded:
- fail closed for mutations
- serve only safe cached metadata where policy allows

Search unavailable:
- canonical mailbox navigation remains available
- search reports unavailable rather than fabricated results

Calendar unavailable:
- mail remains usable
- calendar correlation is marked unavailable

Drive unavailable:
- attachment metadata remains visible
- save/preview/download actions degrade independently

Quanty unavailable:
- normal Mail workflows continue
- AI features show unavailable state

Provider unavailable:
- queue safe outbound work
- respect retry/backpressure policy
- never claim delivery

## Rule

Graceful degradation must not silently weaken security.
