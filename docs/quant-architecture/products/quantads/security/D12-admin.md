# QuantAds D12 Admin — Security Contract

## Baseline

- Quant Account SSO; advertiser accounts are org-scoped.
- Billing/payment instruments handled server-side via payments package; no card data in the browser.
- Spend changes require confirmation; destructive campaign actions are explicit.

## Screen threats

- when built: RBAC with separation of duties (billing ops vs policy); all actions audited

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

