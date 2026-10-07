# M40 — Memory Contract & Evaluation Tests

## Contract tests

Every product context request must match a registered contract. Unknown memory types or unauthorized source products fail closed.

## Authorization tests

Test cross-user retrieval, organization/personal separation, revoked source, expired permission, delegated admin, and high-sensitivity memory.

## Retrieval tests

Measure source authority preference, freshness, contradiction handling, semantic relevance, graph relevance, deduplication, and context budget.

## Deletion tests

Delete source → revoke memory → remove graph edges → invalidate vector/lexical indexes → verify no retrieval path returns the deleted memory.

## Feed tests

Test opt-out, low-signal mood inference, diversity, novelty, repeated content, sensitive-topic boundaries, and feedback loops.

## Agent tests

Prompt injection, malicious memory content, unauthorized tool escalation, mutation approval, and false-memory correction.
