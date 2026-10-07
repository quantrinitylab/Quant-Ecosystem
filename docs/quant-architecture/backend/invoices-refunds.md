# Invoices, Refunds & Adjustments

## Invoices
Invoice creation snapshots plan, usage, discount, and tax inputs. Finalized invoices are immutable; corrections use credit notes or adjustment records.

## Refunds
Refund lifecycle:
REQUESTED → REVIEWING → APPROVED → PROCESSING → COMPLETED
with terminal REJECTED or FAILED.

Refunds reference an invoice/payment and never directly mutate balances without a ledger effect.

## Credits
A refund may return money, credits, or both only when policy explicitly allows it. Every refund effect is separately auditable.

## Disputes
Chargebacks/disputes are separate from voluntary refunds and can trigger entitlement review under risk policy.
