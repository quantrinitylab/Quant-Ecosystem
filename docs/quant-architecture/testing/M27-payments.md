# M27 Testing — Payments

## Contract
Every provider adapter passes the same normalized contract suite.

## Critical scenarios
- duplicate checkout request
- provider timeout after charge
- duplicate webhook
- out-of-order webhook
- webhook signature failure
- provider SDK failure
- provider failover
- concurrent refund
- coupon over-redemption
- dunning retry after successful external payment
- chargeback effect
- credit purchase reconciliation

## Financial invariants
No duplicate capture, no phantom refund, no unauthorized entitlement, no lost ledger effect, no blind retry from UNKNOWN.
