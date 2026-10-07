# Credit Administration

Credit grants, adjustments, expirations, and reversals are controlled operations.

Requirements:
- exact account/org scope
- amount and currency
- reason code
- actor
- approval where required
- idempotency
- ledger entry
- verification

Operators never edit a historical ledger entry. Corrections use compensating entries.
