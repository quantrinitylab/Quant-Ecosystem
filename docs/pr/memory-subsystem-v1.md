# PR: Memory Subsystem v1 (feat/memory-port-v2)

Full architecture: `docs/MEMORY_ARCHITECTURE.md`. ADRs: `docs/adr/005`–`010`.

## Summary

Builds the Quant memory subsystem from frozen ports to a complete write/read path:
extraction → conflict resolution → acceptance policy → persistence, with hybrid
retrieval, a full lifecycle state machine, and an evaluation + replay framework.
Delivered across 13 implementation PRs + 6 ADRs, ports frozen throughout.

## Implemented

- **Contracts (ADR-005):** `MemoryService` facade + capability ports (Store,
  Retriever, ConversationLog, Extractor, Compressor, Maintenance). Frozen.
- **Persistence (ADR-006):** `memory_records` + `memory_embeddings` (additive,
  relation-free, polymorphic ownership, immutable-append versioning). Migration 0049.
- **Retrieval (ADR-007):** hybrid score (semantic+recency+pin+keyword), graceful
  fallback, `RetrievalTrace`, re-embedding support.
- **Conflict resolution (ADR-007/008):** slot-registry classifier; supersede /
  contradict / duplicate / retract / unrelated.
- **State machine + acceptance policy (ADR-009):** Pending/Verified/Rejected/
  Active/Superseded/Retracted/Archived; confidence/trust/provenance; precedence
  matrix; idempotency; append-only transitions; versioned policy.
- **Extraction (ADR-010):** frozen `ExtractedFact`/`ExtractionResult`, structured
  Evidence, hierarchical provenance, `subject` anti-hallucination field.
- **Production adapters:** `OpenAIEmbeddingProvider`, `QdrantVectorBackend`,
  `LlmExtractionModel` (all over injectable fetch, zod env, no SDK coupling).
- **Evaluation + replay:** retrieval eval (core-gated + frontier), extraction
  quality (precision/recall/hallucination/ECE/Brier/cost/latency), acceptance
  metrics, deterministic policy replay + diff.

## Validated (in this PR)

- 463 unit + integration tests passing; typecheck clean.
- Replay determinism + ADR-009 invariants (verified protection, idempotency,
  below-threshold-never-stored) asserted via property tests.
- CI regression gate on core eval scenarios (must stay ≥ thresholds).
- Adapter contracts (request shape, response parsing, error paths, owner scoping)
  verified with fake `fetch`.

## NOT yet validated (next phase — M11d+)

- **Live OpenAI extraction** — `LlmExtractionModel` is contract-tested only; no
  real API call has run.
- **Live Qdrant behavior** — `QdrantVectorBackend` is contract-tested only; no real
  instance exercised.
- **Real-world conversation corpus** — core eval datasets are partially tailored to
  the rule extractor (they pass at 100%); real robustness is unproven. Frontier
  scenarios (Hinglish, typos, "used to…now", multi-clause, hallucination) fail today
  by design and are the M11d target.
- **Hybrid retrieval ranking quality** — MRR/Recall@k/nDCG not yet measured (M12).

## Known limitations

See `docs/MEMORY_ARCHITECTURE.md` §12 (in-memory ConversationLog default, sentiment
retraction deferred, transition history minimal on retired memories, fingerprint
idempotency relies on recall surfacing the prior memory, `persist` growth).

## Risk

Low for merge: additive schema migration (reversible), frozen ports (no consumer
breakage), rule-extractor behavior preserved (all prior tests green). The variability
(live models/services) is intentionally deferred to a fresh M11d branch.
