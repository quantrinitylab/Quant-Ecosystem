# M28 — Cross-Product Economy Integration

## Goal
Make Quant Credits, plans, entitlements, metering, and monetization work consistently across all nine products without creating nine billing systems.

## Products
QuantMail, QuantChat, QuantAI, QuantGram, QuantWave, QuanTube, QuantMax, QuantCooks, QuantAds.

## Integration contract
Each product declares:
- productId
- billable features
- entitlement keys
- usage meters
- credit costs
- free-tier allowances
- graceful degradation behavior
- revenue owner
- refund/reversal behavior

Products call Economy APIs and emit usage events. They never mutate Economy tables.

## User experience
A user sees one wallet, one subscription center, one transaction history, and product-specific explanations of usage.

## Principle
Pricing may differ by product, but economic primitives remain platform-consistent.
