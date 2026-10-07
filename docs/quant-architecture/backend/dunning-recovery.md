# Dunning & Payment Recovery

## Lifecycle
Payment failure → grace policy → customer notification → retry schedule → recovery or restricted state.

## Rules
- Retry schedules are policy-versioned.
- Do not retry indefinitely.
- Preserve user data even when paid capabilities are restricted.
- Explain exactly what is restricted and how to recover.
- Avoid duplicate provider charges through idempotent retry/reconciliation.
- Fraud/abuse holds override normal dunning only through explicit policy.

## Quanty
Quanty may explain a failed payment and prepare a recovery action. It cannot silently change payment methods or execute financial mutations.
