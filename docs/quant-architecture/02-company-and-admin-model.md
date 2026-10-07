# 02 — Company and Admin Model

## Company functions
Executive/Strategy, Product, Engineering, AI Research, Infrastructure/SRE, Data/ML, Security, Trust & Safety, Finance, Legal/Compliance, People/HR, Support, Sales/Partnerships, Marketing/Growth and Developer Relations.

## Product-owned admin
QuantMail: domains, routing, identity, SSO, DLP, retention, legal hold, aliases, groups, security and audit.
QuantChat: organizations, channels, communities, calls, moderation, retention, bots, reports and safety.
QuantAI: models, providers, routing, agents, tools, budgets, memory, evaluations and safety.
QuantGram: creators, content, reports, recommendations, verification, copyright and monetization.
QuantWave: communities, posts, trends, ranking policy, moderation and anti-spam.
QuanTube: creators, video, music, live, copyright, transcoding, recommendations and monetization.
QuantMax: discovery, matching, safety, identity/age policy, live and anti-abuse.
QuantCooks: rendering, models, templates, assets, marketplace, usage and copyright.
QuantAds: advertisers, campaigns, auction, billing, fraud, brand safety, attribution and payouts.

The enterprise hub aggregates organization-level status and links but never re-implements product policy.

Sensitive admin operations require scoped permission, tenant isolation, audit, risk classification and step-up authentication where appropriate.

Build QuantMail admin first as the reference implementation; extract only proven shared admin primitives afterward.