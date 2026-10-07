# M20 — Security Automation

## Automation tiers

### Tier 0 — Observe
No user-state mutation.

### Tier 1 — Low-risk containment
Rate-limit, add temporary detection markers, increase telemetry, or isolate a replaceable queue.

### Tier 2 — Significant containment
Revoke sessions, suspend sending, quarantine objects, or restrict capabilities under explicit policy.

### Tier 3 — Critical action
Organization-wide restrictions, destructive remediation, or broad data access require authorized human/security approval unless a previously approved emergency policy explicitly permits automatic execution.

## Verification
Every automated action records policy version, trigger, scope, actor identity, expiry, and verification result.
