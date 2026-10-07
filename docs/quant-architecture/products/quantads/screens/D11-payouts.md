# D11 — Payouts

Product: QuantAds
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: /economy/wallet, /economy/creator (creator-side)

## Purpose

Inventory intent: advertiser-side payouts (refunds, credits) — and creator payouts for the marketplace.

## Data contract

- API: `economy/wallet APIs (creator-side)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Role-separated: advertisers vs creators.

## Reality

Partial and one-sided: `/economy/wallet` + `/economy/creator` serve CREATOR payouts. No advertiser payout/refund screen was found. Inventory 'Payouts' is ambiguous about which side it means.

## Ambiguity

Inventory does not say whether Payouts = advertiser refunds or creator earnings. Creator side exists; advertiser side does not.

