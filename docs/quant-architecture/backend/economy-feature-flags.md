# Economy Feature Flags

Economic experiments require:
- versioned pricing/entitlement policy
- explicit population
- exposure logging
- rollback
- maximum financial impact
- audit owner

Do not use a generic UI feature flag to silently change money or credit semantics.

Any economic flag affecting charge, entitlement, or price is a typed economic policy with validation.
