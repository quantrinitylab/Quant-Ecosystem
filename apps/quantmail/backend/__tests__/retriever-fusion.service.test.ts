// ============================================================================
// Answers module — Retriever RRF fusion + rerank tests
// quantmail-superhub · Task 15.2 (Requirement 8.5)
// ============================================================================
//
// Covers the Task 15.2 behaviour layered on top of the Task 15.1 ownership +
// provenance guarantees:
//   • Reciprocal Rank Fusion of the vector + keyword ranked lists.
//   • A chunk ranked highly by BOTH stores outranks a chunk ranked highly by
//     only one store.
//   • Configurable RRF constant + per-store weights (ctor dep AND per-call
//     override) actually change the fused ranking.
//   • The optional cross-encoder RerankPort seam re-orders the fused list.
//   • Ownership (Req 8.1) + provenance (Req 8.4) guarantees still hold — and
//     dropped chunks do not perturb the surviving chunks' ranks.

import { describe, it, expect, vi } from 'vitest';
import {
  Retriever,
  DEFAULT_RRF_K,
  type EmbeddingPort,
  type FusionConfig,
  type KeywordSearchPort,
  type RankedChunk,
  type RerankPort,
  type SourceType,
  type StoreHit,
  type VectorSearchPort,
} from '../modules/answers/services/retriever.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fixedEmbedder: EmbeddingPort = {
  async embedQuery() {
    return [1, 0, 0];
  },
};

function emailHit(id: string, userId: string, score: number): StoreHit {
  return {
    chunk: {
      id,
      userId,
      sourceType: 'email' as SourceType,
      sourceRef: { emailId: `em-${id}` },
      text: `text ${id}`,
    },
    score,
  };
}

/**
 * Build a Retriever whose stores return FIXED ordered hit lists, so the test
 * controls each chunk's per-store rank directly (the fusion is rank-based).
 */
function retrieverWith(
  vectorList: StoreHit[],
  keywordList: StoreHit[],
  extra?: { fusion?: FusionConfig; reranker?: RerankPort },
): Retriever {
  const vectorStore: VectorSearchPort = { async search() { return vectorList; } };
  const keywordStore: KeywordSearchPort = { async search() { return keywordList; } };
  return new Retriever({ embedder: fixedEmbedder, vectorStore, keywordStore, ...(extra ?? {}) });
}

// ---------------------------------------------------------------------------
// RRF fusion semantics
// ---------------------------------------------------------------------------

describe('Retriever RRF fusion (Req 8.5)', () => {
  it('ranks a chunk surfaced by BOTH stores above chunks surfaced by only one', async () => {
    // "both" is rank #2 in each store (never #1 anywhere) yet should win because
    // its two RRF contributions sum above either single top-rank contribution.
    const vector = [emailHit('v-only', 'alice', 0.99), emailHit('both', 'alice', 0.5)];
    const keyword = [emailHit('k-only', 'alice', 0.99), emailHit('both', 'alice', 0.5)];

    const retriever = retrieverWith(vector, keyword);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10);

    expect(results[0]!.chunkId).toBe('both');
    expect(results[0]!.retrievedBy.sort()).toEqual(['keyword', 'vector']);

    // Sanity: the fused score equals the sum of the two rank-2 contributions.
    const expected = 1 / (DEFAULT_RRF_K + 2) + 1 / (DEFAULT_RRF_K + 2);
    expect(results[0]!.score).toBeCloseTo(expected, 12);
  });

  it('scores single-store chunks by their rank within that store', async () => {
    const vector = [emailHit('a', 'alice', 0.9), emailHit('b', 'alice', 0.8)];
    const keyword: StoreHit[] = [];

    const retriever = retrieverWith(vector, keyword);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10);

    const a = results.find((r) => r.chunkId === 'a')!;
    const b = results.find((r) => r.chunkId === 'b')!;
    expect(a.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1), 12);
    expect(b.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 2), 12);
    expect(a.score).toBeGreaterThan(b.score); // earlier rank wins
    expect(a.retrievedBy).toEqual(['vector']);
  });

  it('breaks ties deterministically by chunkId', async () => {
    // Two chunks each appear at the same rank in exactly one store → equal score.
    const vector = [emailHit('zzz', 'alice', 0.5)];
    const keyword = [emailHit('aaa', 'alice', 0.5)];

    const retriever = retrieverWith(vector, keyword);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10);

    expect(results.map((r) => r.chunkId)).toEqual(['aaa', 'zzz']);
    expect(results[0]!.score).toBeCloseTo(results[1]!.score, 12);
  });
});

// ---------------------------------------------------------------------------
// Configurability: RRF constant + per-store weights
// ---------------------------------------------------------------------------

describe('Retriever fusion is configurable', () => {
  it('per-store weights can bias the fused ranking (keyword over vector)', async () => {
    // Each chunk is the sole rank-1 hit of one store, so equal-weight fusion ties.
    // Up-weighting keyword should float the keyword-only chunk to the top.
    const vector = [emailHit('vchunk', 'alice', 0.5)];
    const keyword = [emailHit('kchunk', 'alice', 0.5)];

    const retriever = retrieverWith(vector, keyword);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10, {
      fusion: { weights: { keyword: 5, vector: 1 } },
    });

    expect(results[0]!.chunkId).toBe('kchunk');
    expect(results[0]!.score).toBeCloseTo(5 / (DEFAULT_RRF_K + 1), 12);
  });

  it('honours a constructor-level fusion config and a per-call override wins over it', async () => {
    const vector = [emailHit('vchunk', 'alice', 0.5)];
    const keyword = [emailHit('kchunk', 'alice', 0.5)];

    // Constructor biases toward vector; the per-call override flips to keyword.
    const retriever = retrieverWith(vector, keyword, {
      fusion: { weights: { vector: 9 } },
    });

    const ctorBiased = await retriever.retrieve('alice', 'q', ['email'], 10);
    expect(ctorBiased[0]!.chunkId).toBe('vchunk');

    const overridden = await retriever.retrieve('alice', 'q', ['email'], 10, {
      fusion: { weights: { keyword: 50 } },
    });
    expect(overridden[0]!.chunkId).toBe('kchunk');
  });

  it('the rrfK constant changes the absolute fused score', async () => {
    const vector = [emailHit('a', 'alice', 0.5)];
    const keyword: StoreHit[] = [];

    const retriever = retrieverWith(vector, keyword);
    const small = await retriever.retrieve('alice', 'q', ['email'], 10, { fusion: { rrfK: 1 } });
    const large = await retriever.retrieve('alice', 'q', ['email'], 10, { fusion: { rrfK: 1000 } });

    expect(small[0]!.score).toBeCloseTo(1 / (1 + 1), 12);
    expect(large[0]!.score).toBeCloseTo(1 / (1000 + 1), 12);
    expect(small[0]!.score).toBeGreaterThan(large[0]!.score);
  });

  it('falls back to defaults for invalid rrfK / weights', async () => {
    const vector = [emailHit('a', 'alice', 0.5)];
    const retriever = retrieverWith(vector, []);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10, {
      fusion: { rrfK: -5, weights: { vector: -1 } },
    });
    // Negative rrfK and negative weight both rejected → default behaviour.
    expect(results[0]!.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1), 12);
  });
});

// ---------------------------------------------------------------------------
// Optional cross-encoder reranker seam
// ---------------------------------------------------------------------------

describe('Retriever optional reranker seam', () => {
  it('applies an injected reranker to the fused candidate list, then caps at k', async () => {
    const vector = [emailHit('a', 'alice', 0.9), emailHit('b', 'alice', 0.8)];
    const keyword: StoreHit[] = [];

    // A reranker that reverses the fused order.
    const reranker: RerankPort = {
      rerank: vi.fn(async (_q: string, candidates: RankedChunk[]) => [...candidates].reverse()),
    };

    const retriever = retrieverWith(vector, [], { reranker });
    const results = await retriever.retrieve('alice', 'q', ['email'], 1);

    expect(reranker.rerank).toHaveBeenCalledTimes(1);
    // RRF order is [a, b]; reversed is [b, a]; cap at k=1 → [b].
    expect(results.map((r) => r.chunkId)).toEqual(['b']);
  });

  it('without a reranker, the RRF ordering is the final order', async () => {
    const vector = [emailHit('a', 'alice', 0.9), emailHit('b', 'alice', 0.8)];
    const retriever = retrieverWith(vector, []);
    const results = await retriever.retrieve('alice', 'q', ['email'], 10);
    expect(results.map((r) => r.chunkId)).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// Ownership / provenance preserved through fusion (Req 8.1, 8.4)
// ---------------------------------------------------------------------------

describe('Retriever fusion preserves ownership + provenance', () => {
  it('drops foreign chunks BEFORE rank assignment so they never perturb ranks', async () => {
    // Bob's chunk is rank #1 in the vector store; Alice's owned chunk is rank #2.
    // After dropping Bob, Alice's chunk must be treated as rank #1 (not #2).
    const vector = [emailHit('bob-top', 'bob', 0.99), emailHit('alice-owned', 'alice', 0.5)];
    const retriever = retrieverWith(vector, []);

    const results = await retriever.retrieve('alice', 'q', ['email'], 10);

    expect(results.map((r) => r.chunkId)).toEqual(['alice-owned']);
    // Rank collapses to 1 after the foreign chunk is removed.
    expect(results[0]!.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1), 12);
  });

  it('drops unattributable chunks and keeps provenance on the survivors', async () => {
    const vector: StoreHit[] = [
      {
        chunk: {
          id: 'orphan',
          userId: 'alice',
          sourceType: 'email',
          sourceRef: {}, // no emailId → no provenance
          text: 'orphan',
        },
        score: 0.99,
      },
      emailHit('good', 'alice', 0.5),
    ];
    const retriever = retrieverWith(vector, []);

    const results = await retriever.retrieve('alice', 'q', ['email'], 10);

    expect(results.map((r) => r.chunkId)).toEqual(['good']);
    expect(results[0]!.provenance).toEqual({ kind: 'email', emailId: 'em-good' });
    // Orphan removed before ranking → survivor is rank #1.
    expect(results[0]!.score).toBeCloseTo(1 / (DEFAULT_RRF_K + 1), 12);
  });
});
