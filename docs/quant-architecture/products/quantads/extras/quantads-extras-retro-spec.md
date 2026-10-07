# QuantAds — Retro-spec'd extra surfaces (K15)

Decision record: `docs/quant-architecture/decisions/extras-retro-spec.md` (B9).

## Routes

| Route | Surface | Data contract | States |
|---|---|---|---|
| `/economy` | Economy hub | Backend economy endpoints; section navigation | loading, hub |
| `/economy/wallet` | Credit wallet | Real balances via backend; honestly gated sections where no durable endpoint exists yet (headers document the no-mock policy) | balances, gated |
| `/economy/store` | Virtual goods store | Backend endpoints; previously hardcoded `mockItems` already replaced | catalog, purchasing |
| `/economy/boost` | Boost purchases | Backend endpoints | list, purchasing |
| `/economy/creator` | Creator earnings | Backend endpoints | overview, payouts |
| `/economy/subscriptions` | Subscriptions | Backend endpoints | list, managing |

## Economy ownership

Per `decisions/economy-single-ownership.md` (K11): `@quant/credits` is the
canonical Quant Credit ledger; `@quant/payments` handles real-money movement.
These UI surfaces consume the ledger — they never reimplement wallet/payout
concepts. Any economy logic found reimplemented in `apps/quantads/backend` is a
violation to fix, not a second spec.

## Backend extras (kept, group verdict)

`boost, gifting, creator-economy, store, subscriptions, privacy-ads,
publisher-payout, serving, ai` — present under `apps/quantads/backend/routes/`,
spot-checked real. Endpoint-level contracts are a follow-up via
`18-backend-spec-template.md`.
