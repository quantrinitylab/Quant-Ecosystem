# Free Tier & Overage

## Model
Every product can define free allowances through versioned entitlement policy.

When allowance is exhausted:
1. warn user
2. apply configured behavior: block, degrade, consume credits, or bill overage
3. expose next reset/upgrade path

No product silently converts a free action into paid usage.

## Fairness
Usage windows and resets are server-authoritative and timezone-aware.
