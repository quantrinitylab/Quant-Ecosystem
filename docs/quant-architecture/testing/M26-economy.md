# M26 Testing — Economy

## Unit
- ledger arithmetic and invariants
- reservation races
- meter dedupe/versioning
- entitlement evaluation
- proration
- invoice arithmetic
- refund state machine
- tax result persistence
- fraud policy boundaries

## Integration
- provider webhook authentication/reconciliation
- checkout → subscription → entitlement
- usage → invoice
- credit purchase → ledger
- spend → reservation → operation → commit/release
- refund → provider → ledger/entitlement effect

## Failure tests
- duplicate webhook
- out-of-order webhook
- provider timeout after charge
- duplicate usage event
- concurrent credit spend
- stale entitlement cache
- tax provider unavailable
- partial invoice generation
- reconciliation mismatch

## Invariants
No double charge, no phantom credits, no unauthorized entitlement, no destructive financial rewrite, and no client-authoritative balance.
