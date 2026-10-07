# M26 — QuantMail Billing, Plans & Quant Credits Economy

## Goal
Define the production economy boundary for QuantMail and the wider Quant ecosystem: plans, subscriptions, entitlements, Quant Credits, metering, invoices, overages, refunds, taxation, and fraud controls.

## Core laws
- Economy is the source of truth for money, credits, subscriptions, invoices, and entitlements.
- Products consume entitlements; they do not implement billing policy.
- Quant Credits are a ledgered economic asset, never a client-side balance.
- Usage metering is append-only and reconcilable.
- Displayed balance is derived from authoritative ledger state.
- Quanty may explain plans and prepare changes, but cannot silently purchase, transfer, refund, or grant credits.
- Financial mutations are idempotent, auditable, and policy-gated.
- Tax calculation is an external/compliance boundary; tax results are persisted with the transaction.

## Main screens
1. Plans & pricing
2. Current subscription
3. Quant Credits wallet
4. Usage & metering
5. Invoices
6. Payment methods
7. Checkout
8. Refund/support request
9. Organization billing
10. Economy activity/audit

## Product integration
QuantMail, QuantChat, QuantAI, QuantGram, QuantWave, QuanTube, QuantMax, QuantCooks, and QuantAds request entitlement decisions through Economy APIs. No product writes subscription or credit tables directly.
