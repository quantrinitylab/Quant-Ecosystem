# ADR-005: Memory Port Architecture (MemoryService Facade + Capability Ports)

## Status

ACCEPTED

## Date

2026-07-08

## Context

The `MEMORY_AUDIT.md` (CEO Order #0029) found the AI engine operated in complete
amnesia: 6 memory systems held cross-request user state in in-process `Map<>`s,
lost on every pod restart. Persistent models (`AISession`, `AIMessage`,
`DocumentChunk`) existed but were never read during inference.

Before writing the persistent implementation (PR-M02), we needed a stable
interface layer so the engine depends on a contract, not a concrete store. The
contract went through several review rounds (v2 → v2.3) and is now frozen.

The forces at play:

- The Engine must never know which backend (Postgres, Qdrant, Redis, graph)
  served a memory.
- Storage model and retrieval model diverge over time (a retriever may source
  from a vector DB that never returns a full stored record).
- New modalities (image, audio, document) and new capabilities (compression,
  graph retrieval) must be addable without breaking the Engine.

## Options Considered

### Option A — Single `MemoryPort` interface (read/write/history)

**Pros:** Simple, one thing to implement.
**Cons:** Violates SRP; storage, retrieval, history, lifecycle, and compression
all collapse into one fat interface. Adding a capability forces every
implementor to change. This was the original PR-M01 shape and was rejected.

### Option B — Capability ports + a `MemoryService` facade

**Pros:** Each port has one responsibility (`MemoryStore`, `MemoryRetriever`,
`ConversationLog`, `MemoryExtractor`, `MemoryMaintenance`, `MemoryCompressor`).
The Engine sees only `MemoryService`, which orchestrates the ports. New
backends/capabilities plug in without touching the Engine.
**Cons:** More interfaces up front; requires an orchestration layer
(`DefaultMemoryService`) to be useful.

### Option C — Fat `MemoryService` with no ports

**Pros:** Fewer types.
**Cons:** No seam for swapping backends; orchestration and storage logic tangle;
untestable in isolation.

## Decision

Option B. `Engine → MemoryService → [capability ports] → [backends]`.

Key contract decisions (frozen at PR-M01 v2.3):

1. **Engine depends only on `MemoryService`.** It never touches ports directly.
   `observe(turn)` is the primary facade — the Engine says "I observed this
   turn" and the service runs the pipeline (log append → extract → store →
   optional indexing) internally.
2. **Storage model ≠ retrieval model.** `MemoryStore` deals in `MemoryRecord`;
   `MemoryRetriever` returns `RetrievedMemory` (with provenance: `backend`,
   `reason`, `confidence`) — decoupled so retrieval can merge multiple backends.
3. **Request objects over positional args.** `RememberRequest`,
   `ConversationTurn` — new fields never break callers.
4. **Forgetting is a policy, not a delete.** `ForgetPolicy { mode: 'archive' |
'hard', reason, requestedBy }` — archive by default for audit/rollback,
   hard-delete for GDPR erasure.
5. **`kind`/`level` are branded strings** (`MemoryKind`, `MemoryLevel` via
   `asKind`/`asLevel`) — extensible like strings, typo-safe like enums.
6. **Compression is its own capability** (`MemoryCompressor`); `MemoryService`
   keeps `compress()` as the orchestration entrypoint and delegates.

### Rejected: `content: unknown` for multimodal payloads

We explicitly kept `MemoryRecord.content: string`. Retrieval, embedding, and LLM
context almost always operate on a textual representation. Non-text is handled by
`modality` + `ref` (pointer to the binary payload) + `metadata`, with `content`
as the caption/text. `unknown` would force a cast at every read site for no gain.
A binary-first payload abstraction can be introduced later _if_ a binary-first
memory system is actually built.

## Consequences

- Easier: swapping/adding a backend is a new port implementation; the Engine and
  all 9 apps are untouched. Explainability comes free from `RetrievedMemory`
  provenance fields.
- Harder: requires `DefaultMemoryService` (PR-M02) to wire ports before anything
  runs. More interfaces to learn up front.
- New constraint: the interface layer is **frozen**. Further changes require a
  new ADR plus evidence from a concrete implementation, not speculative polish.

## Future Impact

- 1yr: Prisma store + pgvector retriever + Redis cache behind the same ports.
- 3yr: GraphRAG / episodic / workspace memory added as new retriever/extractor
  implementations without an Engine rewrite.
- 5yr: Multi-agent + reasoning memory. The `MemoryService` facade remains the
  single seam; backends remain plugins.
- Revisit trigger: a binary-first memory system, or evidence that the
  request-object/facade design blocks a real feature.

## Complexity Assessment

REDUCES long-term complexity. Up-front cost is more interfaces; the payoff is
that the Engine and every app depend on one stable facade, and all future memory
evolution happens behind it. The alternative (fat port, direct backend coupling)
pushes churn into every consumer on every change.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO_
