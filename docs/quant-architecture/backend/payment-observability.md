# Payment Observability

Metrics:
- checkout success/failure
- authorization/capture rate
- UNKNOWN duration
- webhook lag
- webhook duplicate/replay rate
- refund latency
- dunning recovery
- provider error/latency
- reconciliation mismatch count
- credit purchase conversion
- chargeback rate

Never log raw payment credentials or unnecessary financial-sensitive payloads.

Every financial trace carries a correlation ID without placing secrets in trace attributes.
