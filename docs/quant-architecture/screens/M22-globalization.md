# M22 — QuantMail Globalization & Multi-Region

## Goal
Make QuantMail globally usable without making regional data boundaries ambiguous.

## Global layers
- locale and language
- timezone and calendar semantics
- regional routing
- data residency
- mail delivery locality
- regional capacity
- cross-region control plane
- disaster recovery

## Principles
1. A timestamp is meaningless without its timezone semantics.
2. Residency is a policy, not an inference from network location.
3. Cross-region transfer requires an explicit allowed path.
4. Regional failure must have a documented degraded mode.
5. Global control-plane metadata must not accidentally become unrestricted user-content replication.
