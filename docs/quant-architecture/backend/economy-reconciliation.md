# Economy Reconciliation

Reconciliation compares independent records:
- provider transactions vs internal payment state
- subscription provider state vs subscription state
- invoice arithmetic vs persisted lines/tax
- credit ledger vs derived balances
- usage events vs billable aggregates
- entitlements vs active subscription/policy

## Schedule
Near-real-time webhook reconciliation plus periodic full reconciliation.

## Mismatch handling
DETECTED → CLASSIFIED → INVESTIGATING → CORRECTING → VERIFIED → CLOSED.

Corrections are compensating records. Never rewrite financial history to hide a mismatch.

## Evidence
Each reconciliation run stores scope, source snapshots/references, mismatches, actions, operator/automation identity, and verification result.
