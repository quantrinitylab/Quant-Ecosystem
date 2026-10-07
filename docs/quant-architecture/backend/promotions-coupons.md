# Promotions & Coupons

## Model
Promotion definitions are versioned with:
- code
- eligibility rule
- product/plan/package scope
- discount type
- amount/rate
- usage limit
- account limit
- start/end
- combinability
- funding owner

## Evaluation
Eligibility is evaluated server-side at checkout. A client-provided discount is only a hint.

## Abuse
Repeated redemption, account farming, referral manipulation, and unusual coupon velocity feed Economy fraud controls.

Historical invoices retain the applied promotion snapshot.
