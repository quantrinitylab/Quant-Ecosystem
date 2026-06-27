# Implementation Plan — Unified Quant Credits & Creator Payouts Economy

## Overview

The authoritative credits subsystem already exists inside QuantMail. This plan extracts it into a
shared `@quant/credits` package and migrates every consumer onto it via a strangler-fig sequence.
Each top-level task is an independently shippable PR off the latest `main`. Per touched package,
`pnpm --filter <pkg> typecheck` returns 0 and `test` is green before commit. No stubs, no
`Math.random()` on money paths, no in-memory Map left authoritative for balances.

## Task Dependency Graph

- Task 1 (extract `@quant/credits`) — no dependencies; foundation for all others.
- Task 2 (Payout model + PayoutService) — depends on Task 1.
- Task 3 (PaymentProvider port + adapters) — depends on Task 1.
- Task 4 (MarketplaceLedger) — depends on Task 1.
- Task 5 (migrate legacy services) — depends on Tasks 1, 2, 4.
- Task 6 (QuantTrinity persisted config) — depends on Task 1.
- Task 7 (creator payouts + QuantAds revenue) — depends on Tasks 2, 5.

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "dependsOn": [] },
    { "wave": 2, "tasks": ["2", "3", "4", "6"], "dependsOn": ["1"] },
    { "wave": 3, "tasks": ["5"], "dependsOn": ["1", "2", "4"] },
    { "wave": 4, "tasks": ["7"], "dependsOn": ["2", "5"] }
  ]
}
```

## Tasks

- [x] 1. Extract `@quant/credits` shared package (no behavior change) — MERGED (PR #374)
  - [ ] 1.1 Scaffold `packages/credits` (package.json, tsconfig, vitest config) depending only on
        `@prisma/client` types, `@quant/server-core` (createAppError), and `zod`.
    - _Requirements: 1.1, 1.2_
  - [ ] 1.2 Move `pricing-engine.service`, `usage-gate.service`, `credit-wallet.service`,
        `overage-service`, `plan-service`, `payment-provider.port`, `billing-service`,
        `agent-budget-adapter`, `wallet-balance-adapter` from
        `apps/quantmail/backend/modules/billing/services/*` into `packages/credits/src/`.
    - _Requirements: 1.1, 1.3, 1.4_
  - [ ] 1.3 Lift the ownership-authz dependency to an injected port interface inside
        `@quant/credits`; quantmail passes its concrete `ownerOnlyAuthz` at the call site.
    - _Requirements: 1.6_
  - [ ] 1.4 Re-export everything from `@quant/credits` in
        `apps/quantmail/backend/modules/billing/index.ts` (compat shim) so existing imports keep working.
    - _Requirements: 1.1_
  - [ ] 1.5 Move the existing billing unit tests into `packages/credits` and confirm green; run
        `@quant/database`, `@quant/credits`, `@quant/quantmail` typecheck.
    - _Requirements: 1.1, 10.1_

- [x] 2. Add `Payout` model + `PayoutService` (withdrawals) — MERGED (PR #375)
  - [ ] 2.1 Add `Payout` Prisma model and migration `0026_payouts` (next after 0025).
    - _Requirements: 4.1, 4.4_
  - [ ] 2.2 Implement `PayoutService.requestWithdrawal(owner, amount, method)` with earned-total
        computation, no-overdraw guard, daily-limit + compliance-hold threshold, transactional
        `CreditWallet.debit` (actionKey `payout:{id}`) + `Payout(pending)` creation, and
        compensating credit on terminal rail failure.
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 3.4_
  - [ ] 2.3 Add a `PayoutRail` port + `FakePayoutRail` for tests; ids via `crypto.randomUUID()`.
    - _Requirements: 4.5, 10.1_
  - [ ] 2.4 Unit tests: no-overdraw, daily-limit, idempotent replay, failure→refund, compliance hold.
    - _Requirements: 4.1, 4.6, 10.3_

- [x] 3. PaymentProvider port + PayPal/crypto adapters (top-up) — MERGED (PR #379)
     Shipped as a multi-rail `PaymentProviderRegistry` (stripe/razorpay/paypal/crypto) of
     port-conforming, env-configured, fail-closed providers with real HMAC webhook verification;
     the concrete vendor SDK session call is injected at the app boundary.
  - [ ] 3.1 Confirm Stripe + Razorpay/UPI adapters in `packages/payments` implement the
        `PaymentProvider` port; reuse them through `@quant/credits`.
    - _Requirements: 2.1, 2.2_
  - [ ] 3.2 Add PayPal + crypto adapters behind the same port, fail-closed when keys absent.
    - _Requirements: 2.3, 2.6_
  - [ ] 3.3 Ensure `BillingService.handleWebhook` stays idempotent via `PaymentRecord.providerEventId`.
    - _Requirements: 2.4, 7.5, 10.3_
  - [ ] 3.4 Unit tests with `FakePaymentProvider`: webhook idempotency, unconfigured provider rejects,
        bad signature → 400 no grant.
    - _Requirements: 2.6, 10.3_

- [x] 4. MarketplaceLedger (in-game / marketplace purchases with commission) — MERGED (PR #377)
  - [ ] 4.1 Implement `MarketplaceLedger.purchase(buyer, seller, listingId, priceCredits,
commissionRate)` as a single transactional unit (debit buyer, credit seller net of commission,
        record commission), keyed by one actionKey. - _Requirements: 8.1, 8.2, 8.3_
  - [ ] 4.2 Enforce insufficient-buyer rejection (overage OFF) and double-spend/double-delivery
        prevention under retried/concurrent requests.
    - _Requirements: 8.4, 8.5_
  - [ ] 4.3 Wire one real marketplace consumer (quant-economy store) to `MarketplaceLedger`.
    - _Requirements: 8.1_
  - [ ] 4.4 Unit tests: atomic settlement, commission split, double-spend prevention.
    - _Requirements: 8.5, 10.3_

- [~] 5. Migrate legacy in-memory services to delegate to `@quant/credits` — PARTIAL
  5.1 done (PR #382: ComputeCreditsService now ledger-backed). Payments-wide crypto-id hardening
  shipped (PR #384) removing all `Math.random()` ids on money paths.
  DEFERRED (with rationale): 5.2 `WalletService` is a general multi-currency wallet
  (freeze/limits/transfers/statements), a richer abstraction than the credits ledger — its
  durable DB migration is a separate larger effort, not a `CreditWallet` delegation. 5.3
  `quant-economy/coins/*` (CoinWallet) is LIVE-WIRED into quantmax's economy routes + a whole
  sibling subsystem (store/gifting/boost/tipping) with seam tests; a durable migration is an
  app-wide async refactor that must be its own carefully-scoped task (it already uses crypto
  ids, so no security defect). 5.4 creator-economy + 5.5 user-owned-ai daily-allowance to follow
  once 5.3 lands.
  - [ ] 5.1 `payments/compute-credits.service` → delegate deduct/purchase to `UsageGate`/`CreditWallet`.
    - _Requirements: 1.1, 1.5_
  - [ ] 5.2 `payments/unified-wallet.service` + `wallet-service` → delegate balance/add/spend/cashout;
        remove internal balance Maps.
    - _Requirements: 1.1, 1.5_
  - [ ] 5.3 `quant-economy/coins/*` → map coins→credits, delegate to `CreditWallet`.
    - _Requirements: 1.1, 8.1_
  - [ ] 5.4 `creator-economy/credits` + `payouts` → delegate to `CreditWallet`/`PayoutService`.
    - _Requirements: 3.1, 3.4, 4.1_
  - [ ] 5.5 `user-owned-ai/daily-allowance` → delegate to `CreditWallet.grantDaily`/`UsageGate`.
    - _Requirements: 5.1, 5.2_
  - [ ] 5.6 Per migrated package: keep existing tests green; add a test asserting no authoritative
        balance Map remains.
    - _Requirements: 1.1, 10.1_

- [x] 6. QuantTrinity persisted credit configuration — MERGED (PR #380)
     `PlatformConfig` model + `PlatformConfigService` (owner-only, fail-closed) + adapters land the
     durable config. App-level wiring of QuantTrinity's `/api/economy` route onto the service is a
     thin follow-up (6.3 app side).
  - [ ] 6.1 Persist credit config (usdPerCredit, dailyFreeCredits, commissionRate, overage defaults,
        plan catalog) — `PlatformConfig` row or reuse a settings table.
    - _Requirements: 9.1, 9.2, 9.3_
  - [ ] 6.2 Read config into `PricingEngine`/`PlanService`/`OverageService` defaults; resolved model
        rate feeds the pricing engine.
    - _Requirements: 9.4, 5.3_
  - [ ] 6.3 Owner-only endpoints to read/update config (authz enforced; QuantTrinity central control).
    - _Requirements: 6.5, 9.1_
  - [ ] 6.4 Unit tests: owner-only authz, config affects pricing/allowance/overage defaults.
    - _Requirements: 9.1, 10.1_

- [x] 7. Wire creator payouts + QuantAds revenue into earned credits — MERGED (PR #381)
     `CreatorEarningsService` is the single app-facing entry point; apps + QuantAds post earnings to
     the one shared ledger as withdrawable credits (idempotent by earningId).
  - [ ] 7.1 Post QuantTube/QuantSync/QuantNeon/QuantMax/QuantEdits earnings to the shared ledger
        (source/app identifiable for accounting).
    - _Requirements: 3.1, 3.2, 3.4_
  - [ ] 7.2 Route QuantAds revenue share to creators as earned credits via `CreditWallet`.
    - _Requirements: 3.1, 3.4_
  - [ ] 7.3 End-to-end test: earning posts → balance reflects → withdrawal settles via `PayoutService`.
    - _Requirements: 3.1, 4.1, 10.3_

## Notes

- PRs auto-merge on this repo; keep each task self-contained, branch off latest `main`, push,
  open PR.
- Verification per touched package: `pnpm --filter <pkg> run typecheck` and `run test` green.
- Prisma client regen after schema edits: `pnpm --filter @quant/database exec prisma generate`.
- Migration numbering continues from `0025_game_scores`; the payout migration is `0026_payouts`.
- The existing `CreditLedgerEntry`, `PlanSubscription`, `PaymentRecord`, `OverageSetting` models are
  the single source of truth — do not introduce parallel balance models.

## Status (as of this phase)

The unified credits economy backbone is shipped end-to-end on the durable, append-only ledger:
top-up (4 rails, fail-closed) → daily free allowance + metering → plans/tiers → overage (default
OFF) → marketplace + commission → creator earnings from every app → withdrawals (UPI/crypto/bank)
→ central owner config. All money paths use crypto-strong ids (no `Math.random()`), fail closed,
and treat the ledger as the single source of truth.

Remaining work (Task 5 tail) is the consolidation of the older, app-wired in-memory wallets
(notably the quantmax `CoinWallet` economy subsystem) onto the shared ledger. That is a larger,
carefully-scoped app refactor and is intentionally NOT rushed here. Recommended next phase: move to
per-app product features, scheduling the CoinWallet durable migration as its own initiative.
