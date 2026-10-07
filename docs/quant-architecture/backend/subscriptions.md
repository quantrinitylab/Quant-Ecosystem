# Subscriptions

## Lifecycle
PENDING → ACTIVE → PAST_DUE → PAUSED → CANCELLING → CANCELLED.

Provider state and internal state are distinct. Reconciliation maps provider facts through Economy policy.

## Plan changes
Changes define effective time and proration policy. Existing period history remains immutable.

## Cancellation
Cancellation records requestedAt, effectiveAt, actor, reason, and whether renewal is disabled. It does not erase historical invoices.

## Webhook reconciliation
A provider webhook is evidence, not blindly trusted business truth. Authenticate it, dedupe it, compare version/timestamp, reconcile against provider state, then update Economy.

## Failure
Payment failure can suspend future paid actions according to policy while preserving access to data and recovery paths.
