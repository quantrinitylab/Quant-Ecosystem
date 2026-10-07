# M20 — Security Threat Model

## Trust boundaries
1. public internet → edge
2. edge → application
3. application → product domains
4. services → data stores
5. users/admins → privileged operations
6. Quanty → tools
7. external providers → inbound/outbound mail
8. CI/CD → production

## Threat methodology
For every boundary identify assets, actors, entry points, trust assumptions, abuse cases, detection signals, preventive controls, containment actions, and recovery.

Threat models are living artifacts and change with architecture.
