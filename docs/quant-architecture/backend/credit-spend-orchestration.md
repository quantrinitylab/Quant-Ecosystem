# Credit Spend Orchestration

## Flow
Product requests quote → Economy returns price/availability → optional user approval → reserve credits → product operation → commit spend or release reservation → emit usage/economic event.

## Rules
- Quote has short expiry.
- Reservation has short TTL and owner.
- Operation carries correlation ID.
- Product failure releases reservation.
- Economy timeout never causes the product to assume spend succeeded.
- Reconciliation resolves ambiguous outcomes.

## Quanty
Quanty may prepare a quote or explain cost. Explicit approval is required where policy classifies the operation as financial/high impact.
