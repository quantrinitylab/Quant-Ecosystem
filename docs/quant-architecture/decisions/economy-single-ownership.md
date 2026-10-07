# Decision: Economy single-ownership (K11)

**Status:** proposed (Phase 1 implemented in this PR; Phases 2–4 await approval)
**Date:** 2026-10-08
**Context:** gap-audit D3/V2 — four live packages own overlapping wallet/ledger/payout/credit concepts:
`@quant/payments`, `@quant/creator-economy`, `@quant/credits`, `@quant/quant-economy`,
plus economy concerns inside `apps/quantmail/backend` (`modules/billing`, `modules/company`).

## Decision

**Two canonical owners with a crisp boundary — not one mega-package:**

| Owner | Owns | Rationale |
|---|---|---|
| `@quant/credits` | **The Quant Credit ledger** — the economic source of truth: `CreditWallet` (owner-scoped, append-only, idempotent), the estimate → reserve → execute → settle flow (`PricingEngine`, `UsageGate`), plans/subscriptions/entitlements, overage, marketplace ledger, peer transfers (gifting/tipping/spends), creator-earnings posting, payout/withdrawal dispatch + scheduler, top-up rail ports, and QuantTrinity **policy config** (`PlatformConfigService`: credit value, free allowance, commission, overage defaults) | 09-economy-billing: "Quant Credits are the economic source of truth… QuantTrinity controls policy… It cannot bypass the ledger." The metering choke point must stay dependency-light and fail-closed. |
| `@quant/payments` | **Money movement** — real-money rails (Stripe / Razorpay / UPI / PayPal / crypto / IAP), the `PaymentEngine` facade (K8), provider-hosted subscription billing, invoices, tax calculation + tax documents, disputes, fraud detection, ad-billing charges, agent spending limits, and purchase surfaces that settle **into** the ledger | Keeps heavy third-party money SDKs (`stripe`, `razorpay`) out of the ledger every app imports. Existing dependency direction already encodes this: `payments → credits`. |

**Why not a single `@quant/economy`?** Merging would drag gateway SDKs into the
ledger package that quantmail's usage-gate, the ad-engine, and agent budgets import on
the hot path — widening the blast radius of exactly the component the spec requires to
stay fail-closed and minimal. The two-package split mirrors the spec's own separation:
the **ledger** (credits) vs **money in/out** (payments) vs **policy** (QuantTrinity,
implemented as persisted config *read* by the ledger, never bypassing it).

**Deprecated (phased fold, see below):** `@quant/creator-economy`, `@quant/quant-economy`.

**Product-backend rule:** no app backend may own ledger/wallet/payout concepts.
`apps/quantmail/backend/modules/billing` is already a compat shim over `@quant/credits`
(keep until Phase 4). `modules/company/services/org-budget-reservation.port.ts` already
consumes credits only via that barrel (keep; repoint to `@quant/credits` directly in
Phase 4). Per `03-product-boundaries-and-domains.md`, products use the ledger — they
never reimplement it.

**Dependency law (enforced from here on):** `@quant/payments` may depend on
`@quant/credits`; `@quant/credits` must **never** depend on `@quant/payments`
(the ledger cannot know about money rails). No other package may introduce
wallet/ledger/payout/credit-mint concepts.

**K8 note:** PR #591 merged `@quant/payment` (PaymentEngine) into `@quant/payments`;
this decision preserves that — the engine stays in `@quant/payments`.

## Target ownership map

| Legacy module | Canonical owner | Disposition |
|---|---|---|
| creator-economy: `TaxReportingService`, `Tax1099`, `WithholdingStatus` | `@quant/payments` | **Phase 1 (this PR): moved** — tax metadata is a payments concern (09 lists it); joins `TaxService`/`TaxDocumentService`. Deprecated re-export shim left in place. |
| creator-economy: `PayoutService` (in-memory) | `@quant/credits` `PayoutService` | Phase 2 — migrate `apps/quantube/backend/routes/payouts.ts`; legacy kept as deprecated shim until then |
| creator-economy: `QuantCreditsService` | `@quant/credits` (`CreditWallet` + `CreatorEarningsService`) | Phase 2 — consumer: quantube `routes/creator.ts` |
| creator-economy: `MonetizationEngine`, `RemixRoyaltyTracker` | `@quant/credits` (`CreatorEarningsService` accruals) | Phase 2 — consumer: quantube `routes/creator.ts` |
| creator-economy: `TierService` | `@quant/credits` `PlanService` | Phase 3 — consumers: quantube creator routes, `useMonetization`, monetization page, tier tests |
| creator-economy: `BrandPartnershipService` | product domain (QuanTube/QuantAds backends) | Phase 3 — partnership agreements are product data, not ledger |
| creator-economy: `CreatorDashboardService` | product domain (QuanTube) | Phase 3 — dashboard projections belong to the app |
| quant-economy: `CoinWallet`, `TransactionLedger` | `@quant/credits` `CreditWallet` | Phase 2 — consumers: quantmax `routes/economy.ts`, quantads `coin-services`/`credits-wallet`/`economy-container`; balance migration needed |
| quant-economy: `BuyCoinService` | `@quant/payments` (`BillingService` top-up) | Phase 2 |
| quant-economy: `EarnCoinService` | `@quant/credits` `CreatorEarningsService` | Phase 2 |
| quant-economy: `GiftingService`, `TippingService` | `@quant/credits` `CreditTransferService` | Phase 2 — consumers: quantmax `routes/economy.ts`, `live-gifting.service` |
| quant-economy: `StorePurchaseService`, `VirtualGoodsCatalog`, `CrossAppInventory` | `@quant/credits` `MarketplaceLedger` | Phase 3 — consumers: quantads `economy-container`/`coin-services`, quantmax `routes/economy.ts`, ads economy pages |
| quant-economy: `SubscriptionManager`, `EntitlementService` | `@quant/credits` `PlanService` | Phase 3 |
| quant-economy: `CreatorListingService`, `RevenueSplitEngine`, `CreatorPayoutService` | `@quant/credits` (`MarketplaceLedger`, `PayoutService`, `CreatorEarningsService`) | Phase 3 |
| quant-economy: `SelfBoostEngine`, `BoostPackRegistry` | `@quant/credits` `CreditTransferService.spend` | Phase 3 — consumers: quantads `coin-services`, `economy-container`, boost page |
| quant-economy: `CompanyAdManager`, `ImpressionClickTracker` | `@quant/payments` `AdBillingService` (charges) + `@quant/credits` (metered spend) | Phase 3 |
| quantmail `modules/billing` barrel | `@quant/credits` | done (already a shim); retire barrel in Phase 4, repoint `org-budget-reservation.port.ts` to `@quant/credits` directly |

## Phased migration checklist

- [x] **Phase 1 — decision + first safe move (this PR):** this decision doc; deprecation
      notices on both legacy package barrels; `TaxReportingService` moved to
      `@quant/payments` with a deprecated re-export shim in `@quant/creator-economy`;
      tests green; no live consumer broken.
- [ ] **Phase 2 — ledger consolidation:** move/supersede `CoinWallet`,
      `TransactionLedger`, `BuyCoinService`, `EarnCoinService`, `GiftingService`,
      `TippingService`, `QuantCreditsService`, `MonetizationEngine`,
      `RemixRoyaltyTracker`, and quantube's `PayoutService` usage — each with a
      deprecated shim in the old package; balance-migration path for live wallets.
- [ ] **Phase 3 — commerce/subscription surfaces:** store/catalog/inventory,
      subscriptions/entitlements, creator listings/revshare/payouts, boost,
      ads metering, `TierService`, and the product-domain moves
      (`BrandPartnershipService`, `CreatorDashboardService` → app backends).
- [ ] **Phase 4 — retirement:** repoint quantmail's `org-budget-reservation.port.ts`
      to `@quant/credits`; retire the `modules/billing` barrel; delete the two
      deprecated packages once they have zero importers; add a CI guard that fails
      on new imports of the deprecated packages or new wallet/ledger/payout
      concepts outside the two owners.

## Non-goals

- No big-bang rewrite. Each phase ships as its own PR with shims, and each phase is
  independently approvable — this PR only asks for the decision + Phase 1.
- No behavior change in Phase 1: the moved service is byte-for-byte the same class;
  the shim re-exports it, so existing imports keep working.
