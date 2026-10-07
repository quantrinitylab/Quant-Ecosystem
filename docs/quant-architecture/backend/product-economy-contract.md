# Product Economy Contract

Each product publishes a versioned economy manifest.

Example fields:
productId, manifestVersion, featureKeys, meterKeys, creditPricingRefs, entitlementRequirements, freeAllowance, overagePolicy, refundPolicyRef.

## Validation
Manifest registration checks:
- unique keys
- valid product ownership
- valid meter dimensions
- pricing references
- compatible entitlement semantics
- declared reversal behavior

A product cannot deploy a new billable capability until its manifest passes validation.
