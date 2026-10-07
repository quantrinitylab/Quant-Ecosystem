# M29 Testing — Marketplace

## Critical tests
- package signature verification
- scope escalation rejection
- install/uninstall lifecycle
- revoked package
- malicious artifact quarantine
- duplicate callback
- provider/economy integration
- publisher payout reconciliation
- suspension behavior
- rollback/version compatibility

## Invariants
No unreviewed package becomes trusted, no install silently expands permission, no publisher can access private user content outside granted scope, and marketplace financial records reconcile to Economy.
