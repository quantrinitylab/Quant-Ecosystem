# M16 — QuantMail SLOs

## Critical journeys

- inbox read
- thread open
- search
- compose autosave
- send preparation
- outbound submission
- inbound acceptance
- realtime notification
- attachment download
- Drive save
- Quanty task recovery

Each journey defines:
- availability target
- latency target
- freshness target
- error budget
- measurement window

Targets must be set from measured baseline and product criticality, not arbitrary marketing numbers.

## Error budget

When an SLO burns too quickly:
- reduce risky releases
- prioritize reliability work
- investigate dependency failures
- communicate degradation when user impact exists
