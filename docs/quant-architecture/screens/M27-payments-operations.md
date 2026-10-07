# M27 — Payments, Provider Abstraction & Economy Operations

## Purpose
Define the production payment-control plane behind Economy without coupling Quant products to a payment vendor.

## Surfaces
- Checkout
- Payment method management
- Subscription payment status
- Quant Credit purchases
- Coupons/promotions
- Failed-payment recovery
- Refunds/disputes
- Provider health
- Finance operations
- Reconciliation

## Core laws
1. Provider APIs are adapters, never product contracts.
2. Provider state is external evidence; Economy state is authoritative business state.
3. Every payment mutation is idempotent.
4. A provider timeout after authorization/charge is an UNKNOWN state until reconciled.
5. No UI may claim payment success from a client callback alone.
6. Raw payment credentials remain with the payment provider/tokenization boundary.
7. Finance operators receive least-privilege capabilities and immutable audit trails.
8. Provider outage must not corrupt subscription, credit, or invoice history.
