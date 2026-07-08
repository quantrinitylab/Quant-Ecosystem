import { describe, it, expect, vi } from 'vitest';
import {
  VectorMemoryIndexer,
  type MemoryEmbeddingPrismaClient,
  type MemoryEmbeddingCreateData,
} from '../core/vector-memory-indexer';
import type { EmbeddingProvider, VectorBackend } from '../core/vector-memory-retriever';
import { asKind, asLevel } from '../core/memory-port';
import type { MemoryRecord } from '../core/memory-port';

const embedder: EmbeddingProvider = {
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimension: 1536,
  embed: vi.fn(async () => [0.1, 0.2, 0.3]),
};

function fakeBackend(): VectorBackend {
  return { name: 'qdrant', upsert: vi.fn(async () => {}), query: vi.fn(async () => []) };
}

function fakeEmbeddingClient(): {
  client: MemoryEmbeddingPrismaClient;
  created: MemoryEmbeddingCreateData[];
} {
  const created: MemoryEmbeddingCreateData[] = [];
  const client: MemoryEmbeddingPrismaClient = {
    memoryEmbedding: {
      create: async ({ data }) => {
        created.push(data);
        return data;
      },
    },
  };
  return { client, created };
}

const record: MemoryRecord = {
  id: 'mem_1',
  content: 'lives in Patna',
  kind: asKind('fact'),
  level: asLevel('user'),
  owner: 'user_1',
  createdAt: Date.now(),
  version: 1,
  pinned: false,
  expiresAt: null,
  metadata: {},
};

describe('VectorMemoryIndexer', () => {
  it('embeds, upserts to the vector backend, and records a memory_embeddings row', async () => {
    const backend = fakeBackend();
    const { client, created } = fakeEmbeddingClient();
    const indexer = new VectorMemoryIndexer({ embedder, vectorBackend: backend, client });

    await indexer.index(record);

    expect(embedder.embed).toHaveBeenCalledWith('lives in Patna');
    expect(backend.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mem_1', ownerId: 'user_1', vector: [0.1, 0.2, 0.3] }),
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      memoryId: 'mem_1',
      provider: 'openai',
      model: 'text-embedding-3-large',
      dimension: 1536,
      embeddingVersion: 1,
      embeddingRef: 'mem_1',
    });
  });

  it('stamps a custom embeddingVersion for re-embedding', async () => {
    const { client, created } = fakeEmbeddingClient();
    const indexer = new VectorMemoryIndexer({
      embedder,
      vectorBackend: fakeBackend(),
      client,
      embeddingVersion: 3,
    });
    await indexer.index(record);
    expect(created[0]?.embeddingVersion).toBe(3);
  });
});
