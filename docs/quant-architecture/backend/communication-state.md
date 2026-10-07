# Communication State

Lifecycle:
CREATED → QUEUED → SENDING → ACCEPTED → DELIVERED

Failure branches:
DEFERRED, BOUNCED, FAILED, EXPIRED, SUPPRESSED, CANCELLED.

Accepted means the provider accepted responsibility; it does not necessarily mean user receipt.

Provider callbacks are reconciled before final state.
