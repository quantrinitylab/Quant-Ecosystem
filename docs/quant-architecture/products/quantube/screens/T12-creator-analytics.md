# T12 — Creator Analytics

Product: QuanTube
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P1
Route: /monetization

## Purpose

Creator earnings: revenue, tier, payout history and balance, tips.

## Data contract

- API: `GET /api/creator/earnings`
- API: `GET /api/payouts`
- API: `GET /api/payouts/balance`
- API: `GET /api/creator/tier`
- API: `POST /api/creator/monetization/tip`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Channel owner only.

## Reality

Implemented at `src/pages/monetization.tsx` — and honestly: the page header documents that it USED to be fabricated (hardcoded MOCK_EARNINGS behind a fake delay) and now reads the real engine endpoints. Three sections had no backend at all (revenue time series, sellable membership tiers, payout settings) and are NOT re-faked — they state unavailability instead.

## Evidence

- `apps/quantube/src/pages/monetization.tsx` (header documents the de-faking)

