# Economy API

## Read APIs
- GET /economy/plans
- GET /economy/subscription
- GET /economy/entitlements
- GET /economy/credits/balance
- GET /economy/credits/ledger?cursor=...
- GET /economy/usage
- GET /economy/invoices?cursor=...
- GET /economy/payment-methods

## Mutation APIs
- POST /economy/checkout/session
- POST /economy/subscription/change
- POST /economy/subscription/cancel
- POST /economy/credits/purchase
- POST /economy/refunds/request

## Contract rules
- Cursor pagination for histories.
- Monetary values use integer minor units plus ISO currency.
- Quant Credits use integer atomic units; never floating point.
- Every mutation accepts an idempotency key.
- Authorization and organization scope are checked server-side.
- Responses expose state and next action, not provider internals.
- Provider webhooks are authenticated and reconciled before authoritative state changes.
