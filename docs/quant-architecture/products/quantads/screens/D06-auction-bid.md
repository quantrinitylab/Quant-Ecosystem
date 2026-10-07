# D06 — Auction/Bid

Product: QuantAds
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: (no auction UI page)

## Purpose

Inventory intent: real-time bidding controls — bid strategies, auction insights.

## Data contract

- API: `POST /api/bidding/ad-request`
- API: `GET /api/bidding/stats`
- API: `GET /api/bidding/models`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped.

## Reality

Backend-only: `/api/bidding/*` routes exist but no auction/bid screen was found.

