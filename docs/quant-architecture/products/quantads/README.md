# QuantAds — Product Screen Specs

App: `apps/quantads`
Routers: Next.js app router + pages router (legacy /create-campaign, /creative-studio, /fraud, /brand-safety, /pixels)

Role: ecosystem advertising platform — advertiser campaign management, real-time bidding, billing, analytics, fraud review. Money-moving surfaces (billing, payouts) are server-side; the UI never handles payment instruments directly. Note: `/economy/*` pages are creator-side economy surfaces reused in this app, not advertiser payouts.

Mobile: Flutter app at `flutter_apps/apps/quant_ads` plus responsive web.

Desktop: no native desktop client in the repo; desktop is the responsive web build.

## Screen inventory (from `docs/quant-architecture/12-screen-inventory.md`)

| ID | Screen | Status | Route |
|----|--------|--------|-------|
| D01 | Advertiser Home | IMPLEMENTED | `/` |
| D02 | Campaigns | IMPLEMENTED | `/campaigns` |
| D03 | Campaign Builder | IMPLEMENTED | `/create-campaign (pages router)` |
| D04 | Creative | IMPLEMENTED | `/creatives (app); /creative-studio (pages router)` |
| D05 | Audience | IMPLEMENTED | `/audiences` |
| D06 | Auction/Bid | PARTIAL | `(no auction UI page)` |
| D07 | Billing | IMPLEMENTED | `/billing` |
| D08 | Analytics | IMPLEMENTED | `/analytics` |
| D09 | Attribution | PARTIAL | `/pixels (pages router)` |
| D10 | Fraud/Review | IMPLEMENTED | `/fraud, /brand-safety (pages router)` |
| D11 | Payouts | PARTIAL | `/economy/wallet, /economy/creator (creator-side)` |
| D12 | Admin | MISSING | `(none)` |

Status meanings: IMPLEMENTED = real UI + real data path; PARTIAL = incomplete;
EMBEDDED = panel inside another screen; MISSING = no UI in the repo.

## Layout

- `screens/` — per-screen spec: purpose, route, data contract, states, permissions, reality
- `desktop/` — desktop adaptation notes (responsive web; no native client)
- `mobile/` — mobile notes (Flutter app where it exists + responsive web)
- `web/` — web route, shell, auth boundary
- `security/` — per-screen security contract
- `testing/` — per-screen test plan
