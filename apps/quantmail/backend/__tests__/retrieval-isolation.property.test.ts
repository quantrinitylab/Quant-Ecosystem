// @vitest-environment node
// ============================================================================
// Task 15.3 — Property test: retrieval never returns another user's documents
// quantmail-superhub · Phase 5 — Perplexity Answer Engine (Pillar 4)
// ============================================================================
//
// Feature: quantmail-superhub, Property 5: retrieval never returns another user's documents
//
// **Property P5 (retrieval isolation)** — for ANY multi-user corpus and ANY
// query issued by an asking user U (with any source subset and any k), EVERY
// chunk returned by `Retriever.retrieve(U, ...)` is owned by U. No chunk owned
// by another user/tenant can ever leak through retrieval.
//
// **Validates: Requirements 8.1, 22.1, 22.3**
//   - 8.1  — the Answer_Engine restricts retrieval to documents the asking user
//            owns and SHALL NOT retrieve documents owned by any other user.
//   - 22.1 — every pillar data query is filtered by the requesting principal's
//            ownership so another owner's/tenant's data is never returned.
//   - 22.3 — the Answer_Engine inherits the mail-domain ownership filter; the
//            Retriever is where that filter is enforced for RAG.
//
// HARNESS: tests the REAL `Retriever.retrieve()` implementation from tasks 15.1
// (`modules/answers/services/retriever.service.ts`) + 15.2 (RRF fusion). Two
// properties are checked:
//
//   (P5-a) against the REAL in-memory store ports (`InMemoryVectorSearchPort` /
//          `InMemoryKeywordSearchPort`), which apply the ownership + source
//          filter at the source exactly as a production store must, over a
//          RANDOM multi-user corpus; and
//
//   (P5-b) against ROGUE store ports that DELIBERATELY ignore the ownership
//          filter and hand back every chunk (including other users') — the
//          Retriever's defensive re-check must still drop every foreign chunk
//          so none is ever returned (defence-in-depth, Req 8.1 layer (b)).
//
// No mocks of the Retriever itself, no network. Library: fast-check, >= 100
// runs per property (the ecosystem's JS property-testing tool).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  Retriever,
  ALL_SOURCE_TYPES,
  type EmbeddingPort,
  type KeywordSearchPort,
  type RetrievableChunk,
  type SourceType,
  type StoreHit,
  type VectorSearchPort,
} from '../modules/answers/services/retriever.service';
import {
  InMemoryKeywordSearchPort,
  InMemoryVectorSearchPort,
  type InMemoryChunk,
} from '../modules/answers/services/retriever-adapters';

// ---------------------------------------------------------------------------
// Deterministic, offline embedder (the @quant/ai seam). The actual vector is
// irrelevant to the isolation property — ownership is enforced regardless of
// relevance scoring — so a fixed 3-d vector keeps the test pure and fast.
// ---------------------------------------------------------------------------

const fixedEmbedder: EmbeddingPort = {
  async embedQuery() {
    return [1, 0, 0];
  },
};

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A small pool of distinct users so a random corpus is genuinely multi-user. */
const USER_POOL = ['user-0', 'user-1', 'user-2', 'user-3', 'user-4'] as const;
const userIdArb = fc.constantFrom(...USER_POOL);

const sourceTypeArb = fc.constantFrom<SourceType>('email', 'repo', 'web');

/** A tiny vocabulary so generated queries sometimes overlap chunk text. */
const VOCAB = [
  'revenue',
  'report',
  'quarterly',
  'secrets',
  'trends',
  'service',
  'handler',
  'invoice',
  'meeting',
  'roadmap',
] as const;
const wordArb = fc.constantFrom(...VOCAB);
const textArb = fc.array(wordArb, { minLength: 1, maxLength: 6 }).map((ws) => ws.join(' '));

/** Non-empty, non-whitespace token usable in a valid provenance ref. */
const tokenArb = fc.string({ minLength: 1, maxLength: 8 }).map((s) => `r${s}`);

/** A random 3-d embedding (values may be negative; NaNs excluded). */
const embeddingArb = fc.array(fc.double({ min: -1, max: 1, noNaN: true }), {
  minLength: 3,
  maxLength: 3,
});

/**
 * Build a VALID `sourceRef` arbitrary for a given source type, so every
 * generated chunk is attributable (provenance derivable) — otherwise the
 * Retriever would drop it for a reason unrelated to ownership, weakening the
 * property's coverage of the ownership path.
 */
function sourceRefArbFor(sourceType: SourceType) {
  switch (sourceType) {
    case 'email':
      return fc.record({ emailId: tokenArb });
    case 'repo':
      return fc.record({
        repo: tokenArb,
        path: tokenArb,
        commit: fc.option(tokenArb, { nil: undefined }),
      });
    case 'web':
      return fc.webUrl();
  }
}

/** A single chunk spec (id is assigned positionally in the test for uniqueness). */
interface ChunkSpec {
  userId: string;
  sourceType: SourceType;
  sourceRef: Record<string, unknown>;
  text: string;
  embedding: number[];
}

/** Chunk spec with an arbitrary (pool) owner. */
const chunkSpecArb: fc.Arbitrary<ChunkSpec> = fc
  .record({
    userId: userIdArb,
    sourceType: sourceTypeArb,
    text: textArb,
    embedding: embeddingArb,
  })
  .chain((base) =>
    sourceRefArbFor(base.sourceType).map((sourceRef) => ({
      ...base,
      sourceRef: base.sourceType === 'web' ? { url: sourceRef } : (sourceRef as Record<string, unknown>),
    })),
  );

/** Chunk spec whose owner is forced to a specific user. */
function ownedChunkSpecArb(owner: string): fc.Arbitrary<ChunkSpec> {
  return fc
    .record({ sourceType: sourceTypeArb, text: textArb, embedding: embeddingArb })
    .chain((base) =>
      sourceRefArbFor(base.sourceType).map((sourceRef) => ({
        userId: owner,
        sourceType: base.sourceType,
        text: base.text,
        embedding: base.embedding,
        sourceRef:
          base.sourceType === 'web' ? { url: sourceRef } : (sourceRef as Record<string, unknown>),
      })),
    );
}

/** A non-empty query string (validation requires a non-empty query). */
const queryArb = fc.array(wordArb, { minLength: 1, maxLength: 4 }).map((ws) => ws.join(' '));

/** Optional source subset: either omitted (all corpora) or a non-empty subset. */
const sourcesArb = fc.oneof(
  fc.constant<undefined>(undefined),
  fc.subarray([...ALL_SOURCE_TYPES] as SourceType[], { minLength: 1 }),
);

const kArb = fc.integer({ min: 1, max: 15 });

/** Assign deterministic unique ids to a list of chunk specs. */
function withIds(specs: ChunkSpec[], prefix = 'c'): InMemoryChunk[] {
  return specs.map((s, i) => ({
    id: `${prefix}-${i}`,
    userId: s.userId,
    sourceType: s.sourceType,
    sourceRef: s.sourceRef,
    text: s.text,
    embedding: s.embedding,
  }));
}

// ---------------------------------------------------------------------------
// P5-a — against the real in-memory store ports over a random multi-user corpus
// ---------------------------------------------------------------------------

describe('Feature: quantmail-superhub, Property 5: retrieval never returns another user\'s documents', () => {
  it('every chunk returned by retrieve(U, ...) is owned by U, for any multi-user corpus / query / sources / k (Req 8.1, 22.1, 22.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(chunkSpecArb, { minLength: 1, maxLength: 30 }),
        userIdArb,
        queryArb,
        sourcesArb,
        kArb,
        async (specs, askingUser, query, sources, k) => {
          const corpus = withIds(specs);
          const ownedIds = new Set(corpus.filter((c) => c.userId === askingUser).map((c) => c.id));

          const retriever = new Retriever({
            embedder: fixedEmbedder,
            // Each store gets its own copy of the corpus (the ports mutate via add()).
            vectorStore: new InMemoryVectorSearchPort([...corpus]),
            keywordStore: new InMemoryKeywordSearchPort([...corpus]),
          });

          const results = await retriever.retrieve(askingUser, query, sources, k);

          // === THE INVARIANT (P5): no foreign chunk ever leaks ==============
          for (const r of results) {
            expect(r.userId).toBe(askingUser);
            // And it must be a chunk the asking user actually owns in the corpus.
            expect(ownedIds.has(r.chunkId)).toBe(true);
          }
          // Never more than k, and no duplicate chunk ids.
          expect(results.length).toBeLessThanOrEqual(k);
          expect(new Set(results.map((r) => r.chunkId)).size).toBe(results.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // P5-b — defensive re-check: even a ROGUE store that ignores the ownership
  // filter and returns other users' chunks cannot leak foreign data.
  // ---------------------------------------------------------------------------

  it('drops every foreign chunk even when both stores ignore the ownership filter (defensive re-check, Req 8.1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        // Owned chunks for the asking user (possibly zero).
        userIdArb.chain((u) => fc.array(ownedChunkSpecArb(u), { minLength: 0, maxLength: 8 })),
        // At least one FOREIGN chunk, owned by an intruder distinct from the pool.
        fc.array(
          fc.integer({ min: 0, max: 999 }).chain((n) => ownedChunkSpecArb(`intruder-${n}`)),
          { minLength: 1, maxLength: 12 },
        ),
        queryArb,
        sourcesArb,
        kArb,
        async (askingUser, ownedSpecsRaw, foreignSpecs, query, sources, k) => {
          // Re-stamp the owned specs to the asking user (the chained arb above
          // generated them for an independent pool user).
          const ownedSpecs: ChunkSpec[] = ownedSpecsRaw.map((s) => ({ ...s, userId: askingUser }));

          const owned = withIds(ownedSpecs, 'own');
          const foreign = withIds(foreignSpecs, 'foreign');
          const corpus = [...owned, ...foreign];
          const ownedIds = new Set(owned.map((c) => c.id));
          const foreignIds = new Set(foreign.map((c) => c.id));

          // ROGUE ports: hand back the ENTIRE corpus as hits, blatantly ignoring
          // the userId + source filters a real store is contracted to apply.
          const allHits: StoreHit[] = corpus.map((c, i) => {
            const { embedding: _embedding, ...rest } = c;
            void _embedding;
            return { chunk: rest as RetrievableChunk, score: corpus.length - i };
          });
          const rogueVector: VectorSearchPort = { async search() { return allHits; } };
          const rogueKeyword: KeywordSearchPort = { async search() { return allHits; } };

          const retriever = new Retriever({
            embedder: fixedEmbedder,
            vectorStore: rogueVector,
            keywordStore: rogueKeyword,
          });

          const results = await retriever.retrieve(askingUser, query, sources, k);

          // === THE INVARIANT (P5): foreign chunks are dropped defensively ===
          for (const r of results) {
            expect(r.userId).toBe(askingUser);
            expect(foreignIds.has(r.chunkId)).toBe(false);
            expect(ownedIds.has(r.chunkId)).toBe(true);
          }
          // No foreign id appears anywhere in the output.
          const returnedIds = new Set(results.map((r) => r.chunkId));
          for (const fid of foreignIds) {
            expect(returnedIds.has(fid)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
