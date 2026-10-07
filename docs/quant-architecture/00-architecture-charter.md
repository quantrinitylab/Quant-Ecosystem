# 00 — Architecture Charter

## Mission
Build Quant as a company-scale digital operating system, not a collection of clones.

## Five planes
1. Product plane — user experiences and product domain logic.
2. Platform plane — identity, authorization, APIs, events, search, storage, realtime, notifications, billing primitives, experimentation and shared UI.
3. Intelligence plane — Quanty, models, memory, graph, ranking, recommendation, matching, fraud, moderation.
4. Company plane — finance, legal, HR, support, security governance and compliance.
5. Infrastructure plane — compute, networking, databases, queues, storage, observability, deployment and disaster recovery.

## Ownership
Each product owns its domain model, APIs, events, UI, admin, analytics and product policy.
The platform owns reusable primitives. Products may consume them but may not bypass them.

## Source of truth
Identity, wallet balance, permissions, mail, calendar, files, Git objects, media ownership and financial settlement each have one authoritative owner. Search indexes, caches and projections are derived and rebuildable.

## Build law
Architecture → contracts → backend → UI → integrations → optimization. Do not build polished screens against invented backend behavior.