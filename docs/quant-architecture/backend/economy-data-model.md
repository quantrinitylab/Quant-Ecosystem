# Economy Data Model

## Authoritative entities
Plan: planId, productFamily, version, status, currency, billingInterval, basePrice, creditAllowance, effectiveFrom, effectiveTo.

Subscription: subscriptionId, accountId, planVersionId, providerRef, status, currentPeriodStart, currentPeriodEnd, cancelAt, version.

Entitlement: entitlementId, accountId, productId, featureKey, quantity, source, effectiveFrom, effectiveTo, version.

CreditAccount: creditAccountId, ownerId, currency=QUANT_CREDIT, available, reserved, version.

CreditLedgerEntry: entryId, accountId, type, amount, balanceAfter, referenceType, referenceId, idempotencyKey, createdAt.

The ledger is immutable. Corrections create compensating entries.

UsageEvent: usageEventId, meterKey, accountId, productId, quantity, unit, occurredAt, sourceEventId, idempotencyKey.

Invoice: invoiceId, accountId, status, currency, subtotal, tax, total, providerRef, issuedAt, dueAt.

InvoiceLine: invoiceLineId, invoiceId, type, description, quantity, unitPrice, amount, taxClass, meterRef.

## Invariants
- available >= 0 unless an explicitly approved negative-balance policy exists.
- Ledger sum reconciles to account balance.
- Usage event idempotency prevents double charging.
- Invoice totals equal persisted line arithmetic plus persisted tax.
- Entitlements never outlive their source policy without explicit renewal.
