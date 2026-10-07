# Quant Memory Subsystem — Architecture Review (v1)

> One document to understand the whole subsystem without reading six ADRs.
> Companion to ADR-005–010 (contracts) and MEMORY_AUDIT.md (origin).
> Status: v1 feature-complete. Next phase is validation (M11d) and quality (M12–M13).

---

## 1. Overview

The memory subsystem lets Quant's AI remember durable facts about a user across
sessions, keep them current as they change, and recall the relevant ones for a
query — model-agnostic and backend-agnostic behind frozen ports.

Design principles (held across 14 PRs):

- **Hexagonal / ports-and-adapters.** The Engine depends only on `MemoryService`.
- **Frozen contracts (ADR-005).** Ports never changed after freeze; features rode
  metadata + new adjacent ports.
- **Evaluation-driven.** Every behavioral PR was justified by a measured gap.
- **Model-agnostic (ADR-003).** Embeddings, vector store, and extraction are ports.
- **Separation of classification vs policy.** The conflict resolver is a pure
  classifier; business policy lives in a separate acceptance layer.

## 2. Module map (dependency DAG)

```
memory-port ──────────────────────────── (leaf: frozen contracts)
memory-conflict ───────────────────────── (leaf: verdicts + slot registry)
memory-acceptance-policy → memory-conflict
default-memory-extractor → memory-port
extraction-schema → memory-port, default-memory-extractor
prisma-memory-store → memory-port
prisma-memory-retriever → memory-port, prisma-memory-store
vector-memory-retriever → memory-port, prisma-memory-store, prisma-memory-retriever
vector-memory-indexer → memory-port, default-memory-service(type), vector-memory-retriever
default-memory-service → memory-port, memory-conflict, memory-acceptance-policy
memory-composition → (everything above — the single composition root)
```

No cycles. `memory-composition.createMemoryService` is the only place that knows
concrete backends.

## 3. Data flow

### Write (observe → durable memory)

```
Engine.observe(turn)
  → ConversationLog.append(turn)                         (raw dialogue)
  → MemoryExtractor.extract(turn)                        (rule or LLM → candidates)
      candidate carries metadata: operation, slot, polarity, confidence,
      trust, provenance, subject, evidence, fingerprint
  → for each candidate: DefaultMemoryService.persist()
      ├─ operation === 'retract'? → applyRetraction (archive slot, store nothing)
      ├─ MemoryConflictResolver.resolve(candidate, existing)   (pure classify)
      ├─ MemoryAcceptancePolicy.decide(candidate, conflicts)   (PolicyDecision)
      └─ execute action:
           store_active   → storeWithState('active')  → indexer
           store_pending  → storeWithState('pending') (not recalled, not indexed)
           supersede      → retire(old) + storeWithState('active')
           duplicate_skip | drop | reject → no-op
```

`storeWithState` stamps `metadata.state`, `metadata.policyVersion`, and an
append-only `metadata.transitions[]` entry. `store.store()` is called ONLY here —
nothing bypasses the acceptance policy.

### Read (recall)

```
Engine.recall(ctx)
  → retrievers run in parallel (Promise.allSettled — a failing backend is dropped)
      VectorMemoryRetriever (semantic, hybrid score) + PrismaMemoryRetriever (keyword)
      each excludes: archived, expired, pending/rejected, wrong owner/level
  → MergeStrategy → Deduplicator → limit → BudgetAllocator
  → RetrievedMemory[]  (Active/Verified only)
```

## 4. State machine (ADR-009)

```
Observed → Extracted → Candidate → {Pending ⇄ Verified | Rejected} → Active
Active → {Updated | Superseded | Retracted | Archived | Deleted}
```

- Only `Active`/`Verified` are recalled.
- `Pending` = uncertain (below activate threshold or would overwrite stronger);
  `Rejected` = known-wrong (retained for learning); both excluded from recall.
- `Superseded`/`Retracted`/`Archived` realized via `archivedAt`; the _reason_ lives
  in `metadata.transitions`. `Deleted` = row removed (GDPR).
- Invariants (9) are enumerated in ADR-009 and asserted by replay property tests.

## 5. Acceptance policy (ADR-009)

Pure engine → `PolicyDecision { action, reason, effectiveWeight, policyVersion, supersedeIds }`.

- **effective weight = min(confidence, trust)** — a barely-trusted source cannot
  overwrite a trusted one (confidence ≠ trust ≠ provenance).
- Guards: Verified never overwritten by unverified/LLM (→ Pending); weaker candidate
  → Pending not destructive; duplicate/fingerprint → idempotent skip; below
  `pendingThreshold` → drop.
- `MemoryPolicy { version, activateThreshold=0.70, pendingThreshold=0.35, epsilon=0.10 }`
  — versioned so runs are reproducible; no hardcoded constants.

## 6. Conflict resolution (ADR-007/008)

Pure classifier over a **slot registry** (`SlotDefinition`: residence, employer,
name, favourite:_, sentiment:_). Verdicts: `supersedes | contradicts | duplicate |
retracts | unrelated`. Retraction is a metadata `operation` the service acts on;
negative facts are structured polarity (not natural-language). Adding a slot needs
no resolver change.

## 7. Retrieval (ADR-007)

Hybrid score `0.65·semantic + 0.20·recency + 0.10·pin + 0.05·keyword` (configurable
`RetrievalWeights`). Vector similarity from the injected `VectorBackend`; graceful
fallback to keyword when the backend fails. `RetrievalTrace` for observability.
Re-embedding via `MemoryEmbedding` rows (provider/model/embeddingVersion).

## 8. Persistence (ADR-006)

Three additive, relation-free tables: `memory_records` (polymorphic
ownerType/ownerId/tenantId, immutable-append logicalId+version, archivedAt/deletedAt,
JSONB metadata), `memory_embeddings` (per provider/model/version, Qdrant pointer),
`memory_relations` (reserved for graph, M-future). Migration `0049` is additive and
reversible; pgvector already enabled.

## 9. Evaluation methodology

- **Retrieval eval** — core (gated, must stay 100%) vs frontier (measured, not
  gated): facts/preferences/noise/isolation/employment/corrections/temporal/negation/
  departure/transient (core), hinglish/typos/temporal-complex/multi-current/
  hallucination (frontier). CI regression gate on core.
- **Extraction eval** — candidate precision/recall, hallucination rate, ECE, Brier,
  tokens, cost, latency; rule vs LLM on one dataset.
- **Acceptance eval** — action histogram, pending/reject/supersede/drop rates,
  avg effective weight, calibration by provenance.

## 10. Replay system (ADR-009 / M11b-2)

Every acceptance decision is a pure function of (candidate, conflicts), so decisions
are recorded (`ReplayRecord`) and replayed under any policy WITHOUT touching the DB.
`diffPolicies(v1, v2)` gives a per-transition breakdown; replay property tests assert
the ADR-009 invariants. Enables offline A/B on millions of historical decisions
without regenerating LLM outputs.

## 11. Production adapters (M10/M11)

- `OpenAIEmbeddingProvider` (embeddings API, model→dimension map).
- `QdrantVectorBackend` (REST, owner-scoped filter, cuid→UUID point ids).
- `LlmExtractionModel` (chat JSON mode, zod-validated, metrics).
  All over injectable `fetch`, zod-validated env, no SDK coupling, unit-tested with
  fakes. **Not yet run against live services** — that is M11d.

## 12. Known limitations

1. **Core datasets are partially overfitted** to the rule extractor (they were
   authored to its capabilities). Real robustness is unproven until M11d runs live
   conversations. Frontier scenarios honestly fail today.
2. **Adapters are contract-tested, not live-tested** (no API key / Qdrant in CI).
3. **ConversationLog default is in-memory** (dev/test); a durable log is a follow-up.
4. **Retraction/negative-fact for sentiment** deferred (needs object extraction; M11d LLM).
5. **`persist` is growing** — retraction + policy orchestration + metadata helpers.
   Acceptable now; refactor if it accretes further.
6. **Transition history on retired memories** is minimal (archivedAt only); the full
   transition log is written on the new memory, not the retired one.
7. **Full fingerprint idempotency** relies on the conflict recall surfacing the prior
   memory; a dedicated fingerprint index would make it bulletproof.

## 13. Roadmap

- **M11d** — run a real LLM (and live Qdrant via docker-compose) against the frontier;
  compare candidate/final precision, recall, hallucination, ECE/Brier, cost, latency
  vs the rule baseline using the existing eval + replay framework.
- **M12** — hybrid retrieval + reranking with ranking metrics (MRR, Recall@k, nDCG).
- **M13** — human feedback loop (confirm/reject/edit) moving Pending → Verified/Rejected,
  feeding calibration and acceptance-policy tuning.

## 14. ADR index

| ADR | Topic                                                           |
| --- | --------------------------------------------------------------- |
| 005 | Memory port architecture (facade + capability ports)            |
| 006 | Memory persistence (schema, ownership, versioning)              |
| 007 | Hybrid vector retrieval (score, fallback, re-embedding)         |
| 008 | Negation, temporal precedence, confidence                       |
| 009 | Memory state machine, acceptance policy, precedence, invariants |
| 010 | Extraction output schema (subject, evidence, provenance)        |

---

_Compiled by: Kiro (Principal Systems Engineer) | Pre-M11d architecture review_
