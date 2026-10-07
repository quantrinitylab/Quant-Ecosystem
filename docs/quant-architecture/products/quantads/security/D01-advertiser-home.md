# QuantAds D01 Advertiser Home — Security Contract

## Baseline

- Quant Account SSO; advertiser accounts are org-scoped.
- Billing/payment instruments handled server-side via payments package; no card data in the browser.
- Spend changes require confirmation; destructive campaign actions are explicit.

## Screen threats

- dashboard data strictly org-scoped; no cross-org leakage via IDs

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

