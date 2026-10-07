# Economy Domain

## Ownership
Economy owns:
- products/plans/plan versions
- subscriptions and subscription items
- entitlements
- credit accounts and immutable credit ledger
- usage meters and usage events
- invoices and invoice lines
- payment intent references
- refunds/adjustments
- tax transaction references/results
- economy audit records

Economy does not own:
- product business objects
- authentication/session truth
- raw payment credentials
- product authorization policy
- tax law interpretation

## Boundary
Payment providers are external processors. Economy stores provider customer/payment/subscription identifiers and normalized states, not card numbers or bank secrets.

## Commands
subscription.start, subscription.change, subscription.cancel, credits.purchase, credits.adjust, refund.request, invoice.finalize, entitlement.reconcile.

Every financial command requires actor, scope, idempotency key, policy decision, and audit record.

## Events
- economy.subscription.created.v1
- economy.subscription.changed.v1
- economy.subscription.cancelled.v1
- economy.entitlement.changed.v1
- economy.usage.recorded.v1
- economy.credits.ledgered.v1
- economy.invoice.finalized.v1
- economy.refund.completed.v1

Consumers must be idempotent and must not infer payment success from an emitted request event.
