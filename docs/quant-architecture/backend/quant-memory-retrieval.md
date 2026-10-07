# Quant Memory Retrieval

## Retrieval stages

1. Authenticate requester and agent capability.
2. Determine task and product scope.
3. Apply sensitivity/privacy policy.
4. Retrieve structured candidates.
5. Retrieve graph context.
6. Retrieve semantic/vector candidates.
7. Apply source authorization.
8. Rank by relevance, freshness, confidence, provenance, and task fit.
9. Deduplicate and compress.
10. Return bounded context with provenance.

## Ranking

Memory retrieval is not nearest-neighbor-only. A high-similarity stale inference must not outrank a recent authoritative fact.

Suggested ranking dimensions: authorization, source authority, explicitness, confidence, freshness, relevance, recurrence, user confirmation, sensitivity, and contradiction state.

## Context budget

The retrieval service returns a bounded context package. Quanty should receive only what the current task requires.

## Explainability

For durable memory, the UI may show why Quanty remembered something and where it came from without exposing protected internal scoring rules.
