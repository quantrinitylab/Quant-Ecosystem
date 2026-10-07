# 01 — System Topology

Target layers:
1. Quant Company — strategy, finance, legal, HR, security, support and governance.
2. Product Portfolio — nine independent products.
3. Quant Platform — identity, data, realtime, economy, search, storage, notifications and shared contracts.
4. Quant Intelligence — Quanty, memory, knowledge graph, models, agents and safety.
5. Algorithm Engines — search, ranking, recommendation, matching, fraud, moderation, ads and personalization.
6. Client Platform — web, Android, iOS, Windows, macOS and Linux.
7. Infrastructure — databases, event bus, object storage, GPU/compute, observability and deployment.

Products communicate through typed APIs, versioned events, projections and Quanty tools. They do not use hidden database joins.

Failure isolation is mandatory: an unavailable mail service must not stop social products; a media-transcoding backlog must not stop chat; an AI-provider outage must degrade Quanty without making core product functions unusable.

Every remote dependency needs timeout, bounded retry, idempotency where required, telemetry and an explicit fallback.