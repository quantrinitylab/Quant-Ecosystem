import { describe, it, expect, vi } from 'vitest';
import {
  Retriever,
  deriveProvenance,
  type EmbeddingPort,
  type KeywordSearchPort,
  type RetrievableChunk,
  type SourceType,
  type StoreHit,
  type StoreSearchParams,
  type VectorSearchPort,
} from '../modules/answers/services/retriever.service';
import {
  InMemoryKeywordSearchPort,
  InMemoryVectorSearchPort,
  createUnifiedEmbeddingPort,
  type InMemoryChunk,
} from '../modules/answers/services/retriever-adapters';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A deterministic embedder: maps text length-ish to a tiny fixed vector. */
const fixedEmbedder: EmbeddingPort = {
  async embedQuery() {
    return [1, 0, 0];
  },
};

function chunk(
  id: string,
  userId: string,
  sourceType: SourceType,
  sourceRef: Record<string, unknown>,
  text: string,
  embedding?: number[],
): InMemoryChunk {
  return { id, userId, sourceType, sourceRef, text, embedding };
}

const CORPUS: InMemoryChunk[] = [
  chunk('c-alice-email', 'alice', 'email', { emailId: 'em-1' }, 'quarterly revenue report', [
    1, 0, 0,
  ]),
  chunk(
    'c-alice-repo',
    'alice',
    'repo',
    { repo: 'acme/api', path: 'src/index.ts', commit: 'abc123' },
    'revenue service handler',
    [0.9, 0.1, 0],
  ),
  chunk('c-bob-email', 'bob', 'email', { emailId: 'em-9' }, 'bob revenue secrets', [1, 0, 0]),
  chunk('c-alice-web', 'alice', 'web', { url: 'https://example.com/revenue' }, 'revenue trends', [
    0.2, 0.2, 0,
  ]),
];

function buildRetriever(corpus: InMemoryChunk[] = CORPUS): Retriever {
  return new Retriever({
    embedder: fixedEmbedder,
    vectorStore: new InMemoryVectorSearchPort([...corpus]),
    keywordStore: new InMemoryKeywordSearchPort([...corpus]),
  });
}

// ---------------------------------------------------------------------------
// Ownership filtering (Requirement 8.1)
// ---------------------------------------------------------------------------

describe('Retriever.retrieve — per-user ownership filtering (Req 8.1)', () => {
  it('returns only chunks owned by the asking user', async () => {
    const retriever = buildRetriever();

    const results = await retriever.retrieve('alice', 'revenue');

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.userId).toBe('alice');
    }
    expect(results.map((r) => r.chunkId)).not.toContain('c-bob-email');
  });

  it('never returns another user\'s chunk even if a store ignores the filter (defensive re-check)', async () => {
    // A rogue vector store that returns Bob's chunk regardless of userId.
    const rogueVector: VectorSearchPort = {
      async search(): Promise<StoreHit[]> {
        return [
          {
            chunk: {
              id: 'c-bob-email',
              userId: 'bob',
              sourceType: 'email',
              sourceRef: { emailId: 'em-9' },
              text: 'bob revenue secrets',
            },
            score: 99,
          },
        ];
      },
    };
    const emptyKeyword: KeywordSearchPort = { async search() { return []; } };

    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: rogueVector,
      keywordStore: emptyKeyword,
    });

    const results = await retriever.retrieve('alice', 'revenue');
    expect(results).toEqual([]); // Bob's leaked chunk is dropped
  });

  it('pushes the userId ownership filter down into both store queries', async () => {
    const vectorSpy = vi.fn(async (_p: StoreSearchParams & { embedding: number[] }) => [] as StoreHit[]);
    const keywordSpy = vi.fn(async (_p: StoreSearchParams) => [] as StoreHit[]);

    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: { search: vectorSpy },
      keywordStore: { search: keywordSpy },
    });

    await retriever.retrieve('alice', 'revenue', ['email']);

    expect(vectorSpy).toHaveBeenCalledTimes(1);
    expect(keywordSpy).toHaveBeenCalledTimes(1);
    expect(vectorSpy.mock.calls[0]![0]).toMatchObject({ userId: 'alice', sources: ['email'] });
    expect(keywordSpy.mock.calls[0]![0]).toMatchObject({ userId: 'alice', sources: ['email'] });
  });
});

// ---------------------------------------------------------------------------
// Provenance (Requirement 8.4)
// ---------------------------------------------------------------------------

describe('Retriever.retrieve — source provenance (Req 8.4)', () => {
  it('attaches the right provenance shape per source type', async () => {
    const retriever = buildRetriever();
    const results = await retriever.retrieve('alice', 'revenue', ['email', 'repo', 'web'], 10);

    const byId = new Map(results.map((r) => [r.chunkId, r]));

    expect(byId.get('c-alice-email')!.provenance).toEqual({ kind: 'email', emailId: 'em-1' });
    expect(byId.get('c-alice-repo')!.provenance).toEqual({
      kind: 'repo',
      repo: 'acme/api',
      path: 'src/index.ts',
      commit: 'abc123',
    });
    expect(byId.get('c-alice-web')!.provenance).toEqual({
      kind: 'web',
      url: 'https://example.com/revenue',
    });
  });

  it('drops chunks whose stored sourceRef cannot be resolved into provenance', async () => {
    const badVector: VectorSearchPort = {
      async search(): Promise<StoreHit[]> {
        return [
          {
            chunk: {
              id: 'c-bad',
              userId: 'alice',
              sourceType: 'email',
              sourceRef: {}, // missing emailId → no provenance
              text: 'orphan chunk',
            },
            score: 50,
          },
        ];
      },
    };
    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: badVector,
      keywordStore: { async search() { return []; } },
    });

    const results = await retriever.retrieve('alice', 'revenue');
    expect(results).toEqual([]);
  });

  it('every returned chunk carries a provenance (postcondition holds)', async () => {
    const retriever = buildRetriever();
    const results = await retriever.retrieve('alice', 'revenue', undefined, 10);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.provenance).toBeDefined();
      expect(['email', 'repo', 'web']).toContain(r.provenance.kind);
    }
  });
});

// ---------------------------------------------------------------------------
// Merge / source filtering / validation
// ---------------------------------------------------------------------------

describe('Retriever.retrieve — merge, source filter, validation', () => {
  it('unions vector + keyword hits and records which store(s) surfaced each chunk', async () => {
    const retriever = buildRetriever();
    const results = await retriever.retrieve('alice', 'revenue report', undefined, 10);

    const emailChunk = results.find((r) => r.chunkId === 'c-alice-email');
    expect(emailChunk).toBeDefined();
    // The email chunk matches the embedding (vector) and the words "revenue report" (keyword).
    expect(emailChunk!.retrievedBy.sort()).toEqual(['keyword', 'vector']);
  });

  it('restricts retrieval to the requested sources', async () => {
    const retriever = buildRetriever();
    const results = await retriever.retrieve('alice', 'revenue', ['email']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.sourceType).toBe('email');
    }
  });

  it('caps the result count at k', async () => {
    const retriever = buildRetriever();
    const results = await retriever.retrieve('alice', 'revenue', undefined, 1);
    expect(results).toHaveLength(1);
  });

  it('rejects empty userId, empty query, and non-positive k', async () => {
    const retriever = buildRetriever();
    await expect(retriever.retrieve('', 'q')).rejects.toMatchObject({ code: 'USER_REQUIRED' });
    await expect(retriever.retrieve('alice', '   ')).rejects.toMatchObject({
      code: 'QUERY_REQUIRED',
    });
    await expect(retriever.retrieve('alice', 'q', undefined, 0)).rejects.toMatchObject({
      code: 'INVALID_K',
    });
    await expect(
      retriever.retrieve('alice', 'q', [] as unknown as SourceType[]),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCES' });
  });

  it('embeds the query via the injected embedder (fail-closed @quant/ai seam)', async () => {
    const engine = { generateEmbedding: vi.fn(async () => [1, 0, 0]) };
    const retriever = new Retriever({
      embedder: createUnifiedEmbeddingPort(engine),
      vectorStore: new InMemoryVectorSearchPort([...CORPUS]),
      keywordStore: new InMemoryKeywordSearchPort([...CORPUS]),
    });

    await retriever.retrieve('alice', 'revenue');
    expect(engine.generateEmbedding).toHaveBeenCalledWith('revenue');
  });

  it('propagates a fail-closed embedder error rather than retrieving with a fake vector', async () => {
    const failing: EmbeddingPort = {
      async embedQuery() {
        throw new Error('AI provider unavailable');
      },
    };
    const retriever = new Retriever({
      embedder: failing,
      vectorStore: new InMemoryVectorSearchPort([...CORPUS]),
      keywordStore: new InMemoryKeywordSearchPort([...CORPUS]),
    });
    await expect(retriever.retrieve('alice', 'revenue')).rejects.toThrow('AI provider unavailable');
  });
});

// ---------------------------------------------------------------------------
// deriveProvenance unit coverage
// ---------------------------------------------------------------------------

describe('deriveProvenance', () => {
  it('resolves email/repo/web refs and rejects malformed ones', () => {
    expect(deriveProvenance('email', { emailId: 'e1' })).toEqual({ kind: 'email', emailId: 'e1' });
    expect(deriveProvenance('repo', { repo: 'o/r', path: 'a.ts' })).toEqual({
      kind: 'repo',
      repo: 'o/r',
      path: 'a.ts',
    });
    expect(deriveProvenance('web', { url: 'https://x.test' })).toEqual({
      kind: 'web',
      url: 'https://x.test',
    });

    expect(deriveProvenance('email', {})).toBeNull();
    expect(deriveProvenance('repo', { repo: 'o/r' })).toBeNull(); // missing path
    expect(deriveProvenance('web', { url: '' })).toBeNull();
    expect(deriveProvenance('email', null as unknown as Record<string, unknown>)).toBeNull();
  });
});
