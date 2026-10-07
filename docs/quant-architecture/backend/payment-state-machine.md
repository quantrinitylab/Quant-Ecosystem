# Payment State Machine

## Lifecycle
CREATED → REQUIRES_ACTION → AUTHORIZED → CAPTURED → FAILED, with CANCELLED, VOIDED, REFUNDED, and UNKNOWN branches as applicable.

## UNKNOWN
UNKNOWN means the provider outcome is not yet established. It is not failure and never permits blind retry.

Recovery:
1. persist timeout evidence
2. query provider by idempotency/reference
3. reconcile
4. transition to authoritative state
5. release or finalize dependent reservations

## Idempotency
Idempotency keys are scoped to operation + account + logical transaction. Reusing a key with different parameters is rejected.
