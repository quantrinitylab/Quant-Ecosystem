# ADR-007: Hybrid Vector Retrieval (semantic + recency + pin + keyword)

## Status

ACCEPTED (implemented in PR-M05: VectorMemoryRetriever + VectorMemoryIndexer)

## Date

2026-07-08

## Context

PR-M04C proved the memory vertical slice with a keyword/recency retriever. That
retriever misses semantically-related-but-lexically-different memories (the core
finding of `MEMORY_AUDIT.md`, bottleneck #2). PR-M05 adds semantic retrieval
behind the SAME frozen `MemoryRetriever` port (ADR-005), so nothing above it
changes.

Two model-agnostic ports are introduced (ADR-003): `EmbeddingProvider` (text →
vector) and `VectorBackend` (Qdrant / pgvector / Pinecone). No default
implementation ships — providers are injected at the composition root.

## Options Considered

### Option A — Pure semantic (cosine similarity only)

**Pros:** simplest.
**Cons:** ignores recency (stale facts rank as high as fresh ones), ignores
explicit pins, and ignores exact keyword hits. Poor real-world quality.

### Option B — Hybrid score (semantic + recency + pin + keyword)

**Pros:** balances meaning, freshness, user intent (pins), and exact matches.
Weights are tunable per deployment.
**Cons:** weights need tuning; more moving parts.

### Option C — Replace the keyword retriever entirely

**Pros:** one retriever.
**Cons:** loses the graceful-fallback path — if the vector backend is down there
is nothing to answer from. Rejected.

## Decision

**Option B**, wired ALONGSIDE the keyword retriever (Option C rejected).

Hybrid score:

```
final = 0.65·semantic + 0.20·recency + 0.10·pinBoost + 0.05·keywordBoost
```

- `semantic` — cosine similarity from the vector backend (0-1).
- `recency` — linear decay over a configurable window (default 30 days).
- `pinBoost` — 1 if pinned, else 0.
- `keywordBoost` — substring-tolerant word overlap with the query.

Weights are configurable (`RetrievalWeights`); the defaults above are exported as
`DEFAULT_RETRIEVAL_WEIGHTS`.

### Graceful fallback

`VectorMemoryRetriever` does not catch backend failures — it throws. The
orchestrator (`DefaultMemoryService`) runs retrievers with `Promise.allSettled`
and drops throwers, so a vector outage degrades to the keyword retriever with no
user-visible error. The composition root puts the vector retriever AHEAD of the
keyword one; merge keeps the higher-relevance copy on id collision.

### Observability

`RetrievalTrace { backend, latencyMs, candidates, selected, weights }` is emitted
through an injected `onTrace` sink (the frozen port is untouched — the trace is a
side channel, not a return value).

### Re-embedding

`VectorMemoryIndexer` embeds on store, upserts the vector (point id = memory
`logicalId`), and writes a `memory_embeddings` row carrying
`provider / model / dimension / embeddingVersion`. A model upgrade = background
insert of rows with a higher `embeddingVersion`; no migration.

### Schema amendment to ADR-006

`memory_embeddings` was made **relation-free** (`memoryId` = `MemoryRecord.logicalId`,
indexed, no FK) and gained `embeddingVersion`. Reason: the frozen port exposes only
`logicalId`, which is non-unique across versions, so a hard FK to the surrogate PK
was both unwritable from the indexer and inconsistent with the repo's relation-free
additive convention. The unique key is now
`(memoryId, provider, model, embeddingVersion)`. Migration 0049 was updated in place
(unshipped).

## Consequences

- Easier: semantic recall; per-deployment tuning; provider swaps; re-embedding;
  observability.
- Harder: weight tuning becomes an evaluation concern (PR-M09); an extra vector
  round trip per recall.
- New constraint: the vector retriever must stay owner-scoped and must throw (not
  swallow) on backend failure so fallback works.

## Future Impact

- 1yr: real Qdrant + OpenAI/Bedrock embedders behind these ports.
- 3yr: learned/blended weights per query objective; a Quant embedding model.
- Revisit trigger: if a reranker model replaces the linear hybrid score, or if
  vectors move into Postgres (native pgvector) from Qdrant.

## Complexity Assessment

REDUCES complexity where it matters: retrieval quality is now a tunable,
observable, model-agnostic layer behind a frozen port, rather than a hardcoded
lexical scan. The added ports are the minimum needed to keep model choice out of
the orchestrator.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO_
