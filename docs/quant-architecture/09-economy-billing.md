# 09 — Economy and Billing

Quant Credits are the economic source of truth.

Flow: estimate → reserve → execute → settle.

Ledger properties: append-only, idempotent, auditable, owner-scoped and fail-closed for metered actions.

Services: wallet, ledger, pricing, plans, subscriptions, top-up, payout, marketplace, refunds, commissions, tax metadata, fraud and reconciliation.

QuantTrinity controls policy: credit value, free allowance, plans, commission and overage defaults. It cannot bypass the ledger.

QuantCooks can charge for generation/rendering; QuanTube can pay creators; QuantAds can charge advertisers; Quanty can consume credits; marketplace transactions use the same ledger.

Never mutate a balance directly, trust client pricing, settle twice, spend without reservation, or use floating-point money arithmetic.