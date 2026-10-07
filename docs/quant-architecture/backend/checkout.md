# Checkout

## Flow
Plan/credit package selection → entitlement/pricing snapshot → risk evaluation → tax calculation → checkout session → provider action → webhook/reconciliation → invoice/payment state → entitlement or credit effect.

## Snapshot
Checkout persists:
- plan/package version
- price
- currency
- discount/promotion
- tax result
- provider selection
- risk decision
- expiration

Later catalog changes cannot rewrite an in-flight checkout.

## Client security
The client receives opaque checkout/session identifiers. It never receives provider secrets and cannot directly grant itself an entitlement.
