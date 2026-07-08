# ADR-006: Memory Persistence (PrismaMemoryStore schema design)

## Status

ACCEPTED (implemented in PR-M04B: migration 0049_memory_records + PrismaMemoryStore)

## Date

2026-07-08

## Context

PR-M01→M03 delivered the frozen memory contract (ADR-005), the
`DefaultMemoryService` orchestrator, and the `DefaultMemoryExtractor` pipeline —
all backend-independent. PR-M04 introduces the first durable backend: a
`PrismaMemoryStore` implementing the `MemoryStore` port.

Persistence is the most expensive layer to change later, so this ADR designs the
schema **before** any migration is written (PR-M04A). Implementation
(PR-M04B) follows only after this is reviewed.

### Schema audit findings (grounding)

Read from `packages/database/prisma/schema.prisma`:

| Finding                                    | Evidence                                                                                                                                  | Implication                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Memory` / `memories` table is **taken**   | QuantNeon media model (`mediaUrl`, `caption`, `location`)                                                                                 | AI memory needs a **different** model/table name                                   |
| Vectors live **outside** Postgres          | `DocumentChunk.embeddingId` points to a Qdrant point; `search-indexer` populates Qdrant + Meilisearch                                     | Follow the pointer pattern; keep vectors out of the memory row                     |
| pgvector **already enabled**               | `extensions = [vector]`, `previewFeatures = ["postgresqlExtensions"]`                                                                     | No extension migration needed (the audit's assumption was stale)                   |
| Polymorphic ownership **precedent exists** | `CreditLedgerEntry`: `ownerRef` + `ownerType` (`user`/`org`) + `tenantId`, **relation-free**                                              | Adopt the same shape; supports user/org/workspace/agent/system without a `User` FK |
| Immutable append-only **precedent exists** | `CreditLedgerEntry` documented immutable/append-only                                                                                      | Versioning-by-append is idiomatic here                                             |
| House conventions                          | `cuid()` ids; `createdAt`/`updatedAt`; `deletedAt?` soft delete; `Json @default("{}")`; string-typed statuses to keep migrations additive | Match them                                                                         |

## Options Considered

### Option A — One fat `MemoryRecord` table (content + embedding + relations)

**Pros:** Fewest tables; simplest joins.
**Cons:** Couples the embedding model to the memory row (can't re-embed or run
multiple providers without a migration); couples graph edges to the row;
contradicts the repo's external-vector convention. Rejected.

### Option B — `MemoryRecord` + separate `MemoryEmbedding` + separate `MemoryRelation`

**Pros:** Memory data, vector data, and graph data evolve independently.
Re-embedding = insert new `MemoryEmbedding` rows. Multi-provider = multiple rows
per memory. Graph can later move to Neo4j without touching memory rows. Matches
the `DocumentChunk`→Qdrant pattern and the CEO's stated preference.
**Cons:** More tables; recall does a lookup/join. Accepted.

### Option C — Reuse `DocumentChunk`

**Pros:** Zero new tables.
**Cons:** `DocumentChunk` is RAG evidence (email/repo/web provenance), not
agent memory (kind/level/pin/decay/versioning). Overloading it would conflate
two domains. Rejected.

## Decision

**Option B.** Three additive, relation-free tables. Vectors stay in the external
store (Qdrant), pointed to by `MemoryEmbedding`. Graph deferred to PR-M06 but its
shape is reserved here so it is not an afterthought.

### Ownership: polymorphic from day one (columns present, port unchanged)

The frozen `MemoryStore` port carries `owner: string | null`. To avoid a costly
future migration, the schema is **future-proofed** with `ownerType` + `ownerId`

- `tenantId` (mirroring `CreditLedgerEntry`). PR-M04B's `PrismaMemoryStore`
  defaults `ownerType = 'user'` when mapping the current port. When memory becomes
  multi-owner (org/workspace/agent/system), the port evolves via a new ADR and
  **no migration is required** — the columns already exist. This keeps the frozen
  port (ADR-005) intact while the storage layer is ready for the multi-agent
  platform.

### Versioning: immutable append (columns present, activated later)

Columns `logicalId` + `version` are included now. PR-M04B writes `version = 1`
on every `store()` (the frozen port only creates; `update()` was deferred in
ADR-005). When an update/archive capability lands, a logical update inserts a new
row with the same `logicalId` and `version + 1`; `get(id)` resolves the highest
version. Never an in-place mutation. This matches the `CreditLedgerEntry`
immutable-append precedent.

> Port-mapping note: `MemoryRecord.id` (port) ↔ `logicalId` (DB). The DB `id` is
> an internal surrogate row key. `get`/`delete`/`forget` operate on `logicalId`.

### Archive vs delete

Two distinct nullable timestamps give ADR-005's `ForgetPolicy` a real home:

- `archivedAt` — soft, reversible (ForgetPolicy `archive`). Row retained, hidden
  from default recall.
- `deletedAt` — hard erase intent / GDPR (ForgetPolicy `hard` may also hard-drop
  the row).
  Enabling true store-level archive still needs a `MemoryStore.archive()`/
  `updateMetadata()` method (deferred in ADR-005); the **column exists now** so
  that capability is a code change, not a migration.

### Expiry / TTL

`expiresAt DateTime?` + index. Postgres has no native TTL: recall filters
`expiresAt IS NULL OR expiresAt > now()`, and a scheduled BullMQ janitor
hard-deletes expired, unpinned rows. `pinned = true` overrides expiry/decay.

### Proposed models (NOT yet written to schema.prisma)

```prisma
// ==================== AI/AGENT MEMORY (packages/ai MemoryStore) ====================
// Durable home for the frozen MemoryStore port (ADR-005/006). Relation-free and
// additive (polymorphic owner like CreditLedgerEntry) — no User FK, safe for the
// shared schema. Vectors live in Qdrant, pointed to by MemoryEmbedding. Graph
// edges live in MemoryRelation (reserved; populated in PR-M06).

model MemoryRecord {
  id         String    @id @default(cuid()) // internal surrogate row id
  logicalId  String    @default(cuid())     // stable identity across versions (port `id`)
  version    Int       @default(1)          // immutable-append version
  ownerType  String    @default("user")     // user | org | workspace | agent | system
  ownerId    String?                        // null = shared/world memory
  tenantId   String?                        // authz/isolation boundary (null = self-owned)
  kind       String                         // fact | preference | episodic | entity | document | custom
  level      String                         // working | conversation | user | knowledge | org | world | custom
  content    String                         // canonical text/caption (non-text via metadata.ref)
  pinned     Boolean   @default(false)
  metadata   Json      @default("{}")
  expiresAt  DateTime?
  archivedAt DateTime?                       // soft archive (ForgetPolicy 'archive')
  deletedAt  DateTime?                       // hard/GDPR intent
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  embeddings MemoryEmbedding[]

  @@unique([logicalId, version])
  @@index([ownerType, ownerId])
  @@index([ownerType, ownerId, level])
  @@index([ownerType, ownerId, kind])
  @@index([ownerId, createdAt])
  @@index([expiresAt])
  @@index([archivedAt])
  @@index([tenantId])
  @@map("memory_records")
}

// One row per (memory, provider, model). Re-embedding = insert a new row; the
// vector itself lives in Qdrant (embeddingRef = point id), matching the
// DocumentChunk convention. `vector` column is reserved as an OPTIONAL native
// pgvector path (extension already enabled) if we later co-locate small vectors.

model MemoryEmbedding {
  id           String   @id @default(cuid())
  memoryId     String                        // FK -> MemoryRecord.id
  provider     String                        // openai | bedrock | google | quant | local
  model        String                        // e.g. text-embedding-3-large
  dimension    Int
  embeddingRef String?                       // Qdrant point id (external vector store)
  createdAt    DateTime @default(now())

  memory MemoryRecord @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  @@unique([memoryId, provider, model])
  @@index([memoryId])
  @@index([provider, model])
  @@map("memory_embeddings")
}

// RESERVED for PR-M06 (graph retrieval). Relationships between memories/entities,
// e.g. (Alice)-[works_at]->(OpenAI). Kept relation-light so a future Neo4j or PG
// graph extension can back it. Included here so the graph is designed-in, not
// bolted-on. (Create in PR-M06, not PR-M04B.)

// model MemoryRelation {
//   id        String   @id @default(cuid())
//   ownerType String   @default("user")
//   ownerId   String?
//   fromRef   String   // memory logicalId or entity key
//   toRef     String
//   relation  String   // works_at | located_in | knows | derived_from | ...
//   weight    Float    @default(1)
//   metadata  Json     @default("{}")
//   createdAt DateTime @default(now())
//   @@index([ownerType, ownerId])
//   @@index([fromRef])
//   @@index([toRef])
//   @@index([relation])
//   @@map("memory_relations")
// }
```

### Required indexes (rationale)

| Index                                             | Serves                                        |
| ------------------------------------------------- | --------------------------------------------- |
| `@@unique([logicalId, version])`                  | version integrity; latest-version lookup      |
| `[ownerType, ownerId]`                            | tenant-scoped recall (no cross-owner leakage) |
| `[ownerType, ownerId, level]` / `[..., kind]`     | level/kind-filtered retrieval                 |
| `[ownerId, createdAt]`                            | recency ranking / decay scans                 |
| `[expiresAt]`                                     | TTL janitor sweeps                            |
| `[archivedAt]`                                    | exclude archived from default recall          |
| `[tenantId]`                                      | authz isolation                               |
| `MemoryEmbedding [memoryId]`, `[provider, model]` | join-back + re-embed by provider              |

## Consequences

- **Easier:** re-embedding and multi-provider embeddings (new rows, no
  migration); graph added later without touching memory rows; multi-tenant
  ownership ready without a future migration; archive/expiry have real columns.
- **Harder:** recall now does a store lookup + (later) a vector-store round trip;
  more tables to reason about.
- **New constraints:** `PrismaMemoryStore` must always scope by `ownerType`+
  `ownerId` (never leak across owners); writes are append-only (no in-place
  update until the port grows one); recall must filter `expiresAt`/`archivedAt`.

### Migration impact analysis

- **Purely additive.** New tables only: `memory_records`, `memory_embeddings`
  (+ `memory_relations` in PR-M06). No existing table/column is altered.
- **No `User` model change.** Relation-free ownership (like `CreditLedgerEntry`)
  means no new relation field on `User`, no FK back-pressure.
- **No extension migration.** pgvector already enabled.
- **Reversible.** `prisma migrate` down = drop the new tables; nothing else
  touched. Command (PR-M04B): `prisma migrate dev --name add_memory_records`.

### Backward compatibility report

- Existing `Memory` (QuantNeon media) and its `memories` table: **untouched**.
- `AISession`/`AIMessage`/`DocumentChunk`: **untouched**.
- `DefaultMemoryService`: `PrismaMemoryStore` is opt-in via DI. Nothing wires it
  until a caller injects it, so current behavior (in-memory/no-store) is
  unchanged. **Zero breaking changes.**

## Future Impact

- 1yr: `MemoryEmbedding` + Qdrant retriever (PR-M05) make semantic recall real.
- 3yr: `MemoryRelation` (PR-M06) enables GraphRAG; multi-owner memory activates
  with no migration (columns already present).
- 5yr: agent/system-owned memory and cross-tenant knowledge levels ride the same
  tables. Revisit trigger: co-locating vectors in Postgres (native pgvector
  column) if Qdrant is dropped, or sharding `memory_records` by `ownerId`.

## Complexity Assessment

REDUCES long-term complexity. Three focused tables cost more up front than one,
but they decouple the three axes that evolve at different rates (facts,
embeddings, relationships). The alternative — one fat table — forces a migration
every time the embedding model, provider, or graph strategy changes, which for a
memory system is often.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO_
