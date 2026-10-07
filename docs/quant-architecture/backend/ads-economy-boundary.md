# QuantAds Economy Boundary

QuantAds owns ad inventory, campaign delivery, auction/budget logic, advertiser policy, and impression/click evidence.

Economy owns advertiser billing, payment, credits, invoices, and financial ledger.

Ad delivery must emit billable evidence with idempotency. A campaign UI cannot directly mutate an invoice or credit balance.

Invalid traffic and fraud adjustments are explicit corrections, never silent rewrites.
