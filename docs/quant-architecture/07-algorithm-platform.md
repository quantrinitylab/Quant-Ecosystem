# 07 — Algorithm Platform

Create a dedicated algorithm platform rather than scattering ranking logic through apps.

Engines:
- Search: parse → retrieve → permission filter → rank → explain.
- Recommendation: candidates → retrieval → ranking → policy → personalization → exploration → feedback.
- Feed: signal ingestion → candidates → quality/safety → ranking → pagination → feedback.
- Matching: eligibility → safety → compatibility → exploration → ranking.
- Trust: identity + behavior + device/account signals → risk → policy.
- Fraud: payment, velocity, graph, device and behavior anomalies → investigation.
- Moderation: extraction → classifiers → policy → human review → enforcement → appeal.
- Ads: eligibility → auction → budget → relevance → policy → pacing → attribution.
- Pricing: cost → entitlement → credits → margin rules.

Feature definitions must record owner, source event, window, freshness, privacy class and version.

Training/serving parity tests are mandatory. Every production ranking change needs an experiment, guardrails and rollback.

Production intelligence cannot depend on canned responses, fake counts, demo users or keyword-only pseudo-AI. Test mocks must be impossible to activate accidentally in production.