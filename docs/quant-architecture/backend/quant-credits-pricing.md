# Quant Credits Pricing

Credit costs are represented by versioned pricing references rather than hard-coded numbers in clients.

A price record contains:
- pricingRef
- productId
- featureKey
- creditAmount
- effectiveFrom/to
- region/currency context if applicable
- policy version

Historical operations retain the pricing reference used at execution time.

Clients may display cached prices, but server-side quote validation is authoritative.
