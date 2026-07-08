import { describe, it, expect, vi } from 'vitest';
import {
  VectorMemoryRetriever,
  DEFAULT_RETRIEVAL_WEIGHTS,
  type EmbeddingProvider,
  type VectorBackend,
  type VectorQueryHit,
  type RetrievalTrace,
} from '../core/vector-memory-retriever';
import type { MemoryRetrieverPrismaClient } from '../core/prisma-memory-retriever';
import type { MemoryRecordRow } from '../core/prisma-memory-store';

// ─── Fakes ─────────────────────────────────────────────────────────────────

const embedder: EmbeddingProvider = {
  provider: 'fake',
  model: 'fake-embed',
  dimension: 3,
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
};

function fakeBackend(hits: VectorQueryHit[], name = 'qdrant'): VectorBackend {
  return {
    name,
    upsert: vi.fn(async () => {}),
    query: vi.fn(async () => hits),
  };
}

function row(over: Partial<MemoryRecordRow>): MemoryRecordRow {
  const now = new Date();
  return {
    id: over.id ?? 'row',
    logicalId: over.logicalId ?? 'mem',
    version: over.version ?? 1,
    ownerType: 'user',
    ownerId: over.ownerId ?? 'user_1',
    tenantId: null,
    kind: over.kind ?? 'fact',
    level: over.level ?? 'user',
    content: over.content ?? 'content',
    pinned: over.pinned ?? false,
    metadata: {},
    expiresAt: over.expiresAt ?? null,
    archivedAt: over.archivedAt ?? null,
    deletedAt: over.deletedAt ?? null,
    createdAt: over.createdAt ?? now,
    updatedAt: now,
  };
}

function fakeClient(rows: MemoryRecordRow[]): MemoryRetrieverPrismaClient {
  return {
    memoryRecord: {
      findMany: async ({ where }) => {
        const inList = (where['logicalId'] as { in?: string[] })?.in ?? [];
        return rows.filter((r) => inList.includes(r.logicalId) && r.deletedAt === null);
      },
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('VectorMemoryRetriever', () => {
  it('returns [] when the backend has no hits', async () => {
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([]),
      client: fakeClient([]),
    });
    expect(await r.retrieve({ actor: 'user_1', query: 'q' })).toEqual([]);
  });

  it('hydrates hits and returns them ranked, tagged with backend + hybrid reason', async () => {
    const rows = [row({ logicalId: 'a', content: 'A' }), row({ logicalId: 'b', content: 'B' })];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([
        { id: 'a', score: 0.5 },
        { id: 'b', score: 0.9 },
      ]),
      client: fakeClient(rows),
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q' });
    expect(out.map((m) => m.id)).toEqual(['b', 'a']); // higher semantic ranks first
    expect(out[0]?.backend).toBe('qdrant');
    expect(out[0]?.reason).toBe('hybrid');
    expect(out[0]?.confidence).toBe(0.9);
    expect(out[0]?.source).toBe('vector');
  });

  it('pin boost lifts a lower-similarity memory above a higher one', async () => {
    // default weights: semantic .65, pin .10. b: sim .60. a: sim .55 + pinned.
    // score(b) = .65*.60 = .390 ; score(a) = .65*.55 + .10*1 = .4575 → a wins.
    const rows = [
      row({ logicalId: 'a', content: 'A', pinned: true }),
      row({ logicalId: 'b', content: 'B', pinned: false }),
    ];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([
        { id: 'a', score: 0.55 },
        { id: 'b', score: 0.6 },
      ]),
      client: fakeClient(rows),
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q' });
    expect(out[0]?.id).toBe('a');
  });

  it('excludes archived and expired rows', async () => {
    const past = new Date(Date.now() - 1000);
    const rows = [
      row({ logicalId: 'archived', archivedAt: new Date() }),
      row({ logicalId: 'expired', expiresAt: past }),
      row({ logicalId: 'ok', content: 'keep me' }),
    ];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([
        { id: 'archived', score: 0.99 },
        { id: 'expired', score: 0.98 },
        { id: 'ok', score: 0.5 },
      ]),
      client: fakeClient(rows),
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q' });
    expect(out.map((m) => m.id)).toEqual(['ok']);
  });

  it('filters by requested levels', async () => {
    const rows = [
      row({ logicalId: 'u', level: 'user' }),
      row({ logicalId: 'k', level: 'knowledge' }),
    ];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([
        { id: 'u', score: 0.9 },
        { id: 'k', score: 0.8 },
      ]),
      client: fakeClient(rows),
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q', levels: ['knowledge' as never] });
    expect(out.map((m) => m.id)).toEqual(['k']);
  });

  it('respects ctx.limit', async () => {
    const rows = [row({ logicalId: 'a' }), row({ logicalId: 'b' }), row({ logicalId: 'c' })];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([
        { id: 'a', score: 0.9 },
        { id: 'b', score: 0.8 },
        { id: 'c', score: 0.7 },
      ]),
      client: fakeClient(rows),
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q', limit: 2 });
    expect(out).toHaveLength(2);
  });

  it('emits a RetrievalTrace with candidate/selected counts and weights', async () => {
    const traces: RetrievalTrace[] = [];
    const rows = [row({ logicalId: 'a' })];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([{ id: 'a', score: 0.9 }]),
      client: fakeClient(rows),
      onTrace: (t) => traces.push(t),
    });
    await r.retrieve({ actor: 'user_1', query: 'q' });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ backend: 'qdrant', candidates: 1, selected: 1 });
    expect(traces[0]?.weights).toEqual(DEFAULT_RETRIEVAL_WEIGHTS);
    expect(traces[0]?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('propagates a backend failure (so the orchestrator can fall back)', async () => {
    const backend: VectorBackend = {
      name: 'qdrant',
      upsert: vi.fn(async () => {}),
      query: vi.fn(async () => {
        throw new Error('qdrant down');
      }),
    };
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: backend,
      client: fakeClient([]),
    });
    await expect(r.retrieve({ actor: 'user_1', query: 'q' })).rejects.toThrow('qdrant down');
  });

  it('honors custom weights', async () => {
    const rows = [row({ logicalId: 'a', content: 'A' })];
    const r = new VectorMemoryRetriever({
      embedder,
      vectorBackend: fakeBackend([{ id: 'a', score: 1 }]),
      client: fakeClient(rows),
      weights: { semantic: 1, recency: 0, pin: 0, keyword: 0 },
    });
    const out = await r.retrieve({ actor: 'user_1', query: 'q' });
    expect(out[0]?.relevance).toBe(1); // pure semantic
  });
});
