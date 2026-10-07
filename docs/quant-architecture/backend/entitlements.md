# Entitlements

Entitlements are the capability boundary between Economy and products.

## Shape
accountId + productId + featureKey + quantity + effective window + source + version.

## Evaluation
1. authenticate actor
2. resolve account/org scope
3. load active entitlement
4. apply product policy
5. apply quota/meter state
6. return allow/deny/remaining/next reset

## Caching
Entitlement reads may be cached briefly, but cache invalidation follows authoritative entitlement events. A stale cache must fail closed for security-sensitive paid capabilities.

## Changes
Plan changes, cancellations, refunds, chargebacks, and administrative grants can change entitlements. All changes are versioned and auditable.

Products may request checkEntitlement, but cannot grant themselves premium access.
