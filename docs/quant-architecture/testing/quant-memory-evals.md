# Quant Memory Evaluation & Testing

## Correctness

- source provenance preserved
- canonical facts not confused with inference
- contradictions handled without silent overwrite
- deleted source propagates to derived memory/indexes
- duplicate events are idempotent

## Retrieval

Measure precision, recall, freshness, provenance correctness, authorization violation rate, irrelevant-context rate, context budget adherence, and stale-memory usage.

## Safety

Test prompt injection in source content, malicious instructions embedded in documents/mail, cross-user retrieval attempts, sensitive-memory leakage, revoked-source retrieval, and unauthorized cross-product context.

## Personalization

Test recommendation relevance, diversity, novelty, filter compliance, cold-start behavior, personalization opt-out, and sensitivity boundaries.

## Memory lifecycle

Test candidate→active promotion, correction, suppression, expiry, source deletion, legal hold interaction, export, restore, and index rebuild.

## Human evaluation

Evaluate whether users perceive memory as useful, accurate, controllable, unsurprising, and privacy-respecting.
