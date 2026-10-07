# `@quant/quant-economy` dependency & money-integrity audit

Capstone of the money-integrity chapter (Batches 12–18). This is the ecosystem
map of who still consumes the **in-memory** `@quant/quant-economy` engines,
whether each consumer is **money-touching**, and the **durability-gate trigger**
that would require migrating it to the durable append-only `@quant/credits`
ledger.

> **Why this matters.** `@quant/quant-economy`'s `CoinWallet` (and the store /
> gifting / payout engines built on it) keep state in a per-process `Map` that
> is wiped on every restart. That is fine for gamified / non-money state, but a
> **real-money** balance (funded by a payment, or withdrawable to cash) on an
> ephemeral wallet is a data-loss / double-spend hazard. The rule the chapter
> established: **money-touching ⇒ durable `@quant/credits` ledger; otherwise
> leave it (migrating non-money state is speculative durability).**

_Last verified: main `57ab41f9` (post-#482). Regenerate with:_
`rg "from '@quant/quant-economy'"`

---

## Consumers (current main)

| App                                                                         | Import                                                                                                                                                    | Kind                                                                                      | Money-touching?                            | Status                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| **quantads** `backend/services/economy-container.ts`                        | `VirtualGoodsCatalog`, `CrossAppInventory`, `BoostPackRegistry`, `SubscriptionManager`, `EntitlementService` (runtime)                                    | Non-money helpers (catalog / inventory / boost-packs / subscription tiers / entitlements) | **No**                                     | Keep. No ledger concern.                                     |
| **quantads** `backend/services/coin-services.ts`, `coin-payment-adapter.ts` | `Gift`, `Tip`, `BoostRequest`, `BoostAnalytics`, `PaymentGatewayAdapter` + helper classes (mostly **type-only**)                                          | Money moved onto the credits ledger; only types/helpers remain                            | **No (migrated)**                          | Money is durable — see below.                                |
| **quantads** `src/app/economy/*.tsx`                                        | `VirtualGood`, `CoinTransaction`, `SubscriptionTier`, `CreatorListing`, `PayoutRequest`, `BoostPack`, `BoostAnalytics`                                    | **Type-only** (frontend shapes)                                                           | **No**                                     | Keep (types only).                                           |
| **quantmax** `backend/routes/economy.ts`                                    | `CoinWallet`, `VirtualGoodsCatalog`, `CrossAppInventory`, `StorePurchaseService`, `SubscriptionManager`, `EntitlementService`, `GiftingService` (runtime) | Coin wallet + store + gifting + tiers                                                     | **Money-touching BY INTENT, but UNFUNDED** | **Documented non-money as wired** (#481). See trigger below. |
| **quantmax** `src/services/live-gifting.service.ts`                         | (local class, not a quant-economy import)                                                                                                                 | In-memory gamified gifting; `estimatedRevenue` is analytics only                          | **No (unwired)**                           | Keep. Not route-wired.                                       |

---

## quantads — money already durable (migrated off the ephemeral wallet)

QuantAds no longer keeps any **money** in `@quant/quant-economy`. It only uses the
package for **non-money helpers** and **shared types**. All money flows are on the
durable `@quant/credits` ledger:

- **Buy / earn / store / gift / tip / boost** → credits ledger (#474).
- **Publisher ad-revenue payout** → withdrawable `creator_payout` earn-kind on the ledger, idempotent, boot-wired trigger (#475).
- **Subscriptions / creator-economy** confirmed non-money at the time (#476), then creator-economy became real:
  - **Durable creator listings** (Prisma `CreatorListing`, migration 0047) (#478).
  - **Marketplace purchase** → `MarketplaceLedger` (buyer debit + seller withdrawable `marketplace_sale` 70% + treasury 30%), atomic/idempotent/fail-closed (#479).
  - **Buyer entitlement / "my purchases"** (Prisma `CreatorPurchase`, migration 0048), idempotent-with-ledger via shared `purchaseId` (#480).
- **Withdrawals** → durable `PayoutService` (no-overdraw, daily limit, compliance hold). Real UPI/crypto/bank rail = **needs-staging** (fail-closed `NullPayoutRail`, never faked).

---

## quantmax — money-touching-but-unfunded (the one to watch)

QuantMax wires the `@quant/quant-economy` engines as `fastify.economy`, and the
code comments intend coin top-ups / cashouts to settle through Stripe. **But as
wired today there is no real money path** (verified #481):

- **No money-IN**: there is no top-up / buy-coins route. `/economy` only spends
  (store/purchase, gifts) or reads. Nothing credits the `CoinWallet`, so a wallet
  stays at 0 and spends fail closed — inert.
- **No money-OUT**: there is no withdraw / cashout route anywhere in quantmax.
- `LiveGiftingService` is unwired (referenced only by its own test); its
  `estimatedRevenue` (coins × $0.005) is an analytics estimate, not a cash move.

So there is no funded balance to lose today → migrating now would be speculative.

### 🚨 Durability-gate trigger (quantmax)

The moment **either** of these is wired, the quantmax coin wallet becomes
money-touching and **must** migrate to the `@quant/credits` ledger before ship:

1. A **payment-gated coin top-up** (Stripe/Razorpay/UPI) that credits the wallet, **or**
2. A **withdrawal / cashout** route that pays coins out to a real rail.

Migration pattern to follow (proven in quantads): buy/spend on `CreditWallet`
(#474), transfers/tips via `CreditTransferService`, marketplace via
`MarketplaceLedger` (#479), withdrawals via `PayoutService`. Add a
balance-preserving backfill **only if** a durable balance exists at migration
time (quantads had none — the wallet was ephemeral — so no backfill was needed).

---

## Not a blocker: keeping the `@quant/quant-economy` dependency

Removing the dependency entirely from quantads/quantmax is **not** required and is
**deferred**: the remaining usage is non-money in-memory helpers + shared types
with no ledger/dual-ledger concern. Relocating them would be churn with no
durability gain. Do it only if/when a specific helper needs to become durable
(e.g. a persistent catalog/subscription), at which point it gets its own Prisma
model — not a blanket dep-removal.
