# M19 — Production Disaster Boundaries

## Failure domains
Model failure at pod, node, availability zone, region, provider, database, object storage, and identity/secrets layers.

## Recovery
RPO/RTO targets come from M16 and data criticality. Derived indexes can be rebuilt; authoritative data requires tested recovery.

## Regional strategy
Do not claim active-active until conflict resolution, identity consistency, mail delivery behavior, and data sovereignty requirements are proven.

Start with a tested primary region plus documented recovery path, then evolve toward multi-region where measured requirements justify it.
