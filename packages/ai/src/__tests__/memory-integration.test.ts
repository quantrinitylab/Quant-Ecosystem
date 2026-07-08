import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import type { DefaultMemoryService } from '../core/default-memory-service';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';

// ─── A faithful in-memory fake of the memory_records table ─────────────────────
// Emulates the delegate methods createMemoryService actually uses. This lets the
// FULL real object graph (DefaultMemoryService + PrismaMemoryStore +
// PrismaMemoryRetriever + DefaultMemoryExtractor + InMemoryConversationLog) run
// end-to-end without a live Postgres. Integration semantics, unit-test speed.

class FakeMemoryDb implements MemoryDbClient {
  public rows: MemoryRecordRow[] = [];
  private seq = 0;

  memoryRecord = {
    create: async ({ data }: { data: MemoryRecordCreateData }): Promise<MemoryRecordRow> => {
      const n = ++this.seq;
      const now = new Date();
      const row: MemoryRecordRow = {
        id: `row_${n}`,
        logicalId: `mem_${n}`,
        version: 1,
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        tenantId: data.tenantId,
        kind: data.kind,
        level: data.level,
        content: data.content,
        pinned: data.pinned,
        metadata: data.metadata,
        expiresAt: data.expiresAt,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.rows.push(row);
      return row;
    },

    findFirst: async ({
      where,
      orderBy,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<MemoryRecordRow | null> => {
      let matches = this.rows.filter((r) => matchWhere(r, where));
      if (orderBy?.['version'] === 'desc') matches = matches.sort((a, b) => b.version - a.version);
      return matches[0] ?? null;
    },

    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }): Promise<MemoryRecordRow[]> => {
      let matches = this.rows.filter((r) => matchWhere(r, where));
      if (orderBy?.['createdAt'] === 'desc') {
        matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return typeof take === 'number' ? matches.slice(0, take) : matches;
    },

    deleteMany: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => !matchWhere(r, where));
      return { count: before - this.rows.length };
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { archivedAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const r of this.rows) {
        if (matchWhere(r, where)) {
          r.archivedAt = data.archivedAt;
          count++;
        }
      }
      return { count };
    },
  };
}

function matchWhere(row: MemoryRecordRow, where: Record<string, unknown>): boolean {
  if ('logicalId' in where && row.logicalId !== where['logicalId']) return false;
  if ('ownerId' in where && row.ownerId !== where['ownerId']) return false;
  if ('deletedAt' in where && where['deletedAt'] === null && row.deletedAt !== null) return false;
  if ('archivedAt' in where && where['archivedAt'] === null && row.archivedAt !== null)
    return false;
  return true;
}

// ─── The first vertical slice: observe → store → recall ────────────────────────

describe('memory vertical slice (composition root)', () => {
  let db: FakeMemoryDb;
  let service: DefaultMemoryService;

  beforeEach(() => {
    db = new FakeMemoryDb();
    service = createMemoryService({ prisma: db });
  });

  it('remembers a preference and recalls it by query', async () => {
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'My favorite language is Rust',
    });

    // It was extracted and durably stored.
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.content).toContain('Rust');

    const memories = await service.recall({ actor: 'user_1', query: 'favorite language' });
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0]?.content).toContain('Rust');
    expect(memories[0]?.backend).toBe('postgres');
  });

  it('remembers a fact and recalls it (I live in Patna → where do I live)', async () => {
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'I live in Patna',
    });

    const memories = await service.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Patna'))).toBe(true);
  });

  it('does not leak memories across owners', async () => {
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'I live in Patna',
    });

    const other = await service.recall({ actor: 'user_2', query: 'where do I live' });
    expect(other).toHaveLength(0);
  });

  it('ignores acknowledgements (nothing stored)', async () => {
    await service.observe({ actor: 'user_1', session: 's1', role: 'user', content: 'thanks!' });
    expect(db.rows).toHaveLength(0);
  });

  it('recall returns [] when the user has no memories', async () => {
    expect(await service.recall({ actor: 'ghost', query: 'anything' })).toEqual([]);
  });

  it('explicit remember() is durable and recallable', async () => {
    await service.remember({
      actor: 'user_1',
      content: 'prefers dark mode',
      kind: 'preference' as never,
      level: 'user' as never,
    });
    const memories = await service.recall({ actor: 'user_1', query: 'dark mode preference' });
    expect(memories[0]?.content).toBe('prefers dark mode');
  });

  it('falls back to the keyword retriever when the vector backend is down', async () => {
    // Wire a vector layer whose backend always throws. The orchestrator must
    // drop it and still answer from the keyword retriever.
    const embedder = {
      provider: 'fake',
      model: 'fake',
      dimension: 3,
      embed: async () => [0, 0, 0],
    };
    const brokenBackend = {
      name: 'qdrant',
      upsert: async () => {},
      query: async () => {
        throw new Error('qdrant down');
      },
    };
    const embeddingClient = {
      memoryEmbedding: { create: async ({ data }: { data: unknown }) => data },
    };

    const svc = createMemoryService({
      prisma: db,
      vector: { embedder, vectorBackend: brokenBackend, embeddingClient },
    });

    await svc.observe({ actor: 'user_1', session: 's1', role: 'user', content: 'I live in Patna' });
    const memories = await svc.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Patna'))).toBe(true);
  });

  it('low-confidence memory is stored Pending and excluded from recall', async () => {
    // remember() with confidence/trust below the activate threshold → Pending.
    await service.remember({
      actor: 'user_1',
      content: 'maybe lives in Goa',
      kind: 'fact' as never,
      level: 'user' as never,
      metadata: { confidence: 0.4, trust: 1 },
    });
    // Stored, but with pending state.
    expect(db.rows).toHaveLength(1);
    expect((db.rows[0]?.metadata as Record<string, unknown>)?.['state']).toBe('pending');
    // Not returned by default recall.
    expect(await service.recall({ actor: 'user_1', query: 'where do I live' })).toEqual([]);
  });

  it('high-confidence memory is stored Active and recalled', async () => {
    await service.remember({
      actor: 'user_1',
      content: 'lives in Goa',
      kind: 'fact' as never,
      level: 'user' as never,
      metadata: { confidence: 0.95, trust: 1 },
    });
    expect((db.rows[0]?.metadata as Record<string, unknown>)?.['state']).toBe('active');
    const memories = await service.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Goa'))).toBe(true);
  });

  it('forget(hard) removes a stored memory', async () => {
    const rec = await (async () => {
      await service.remember({
        actor: 'user_1',
        content: 'lives in Patna',
        kind: 'fact' as never,
        level: 'user' as never,
      });
      return db.rows[0]!;
    })();

    const ok = await service.forget(rec.logicalId, { mode: 'hard', reason: 'test' });
    expect(ok).toBe(true);
    expect(db.rows).toHaveLength(0);
    expect(await service.recall({ actor: 'user_1', query: 'Patna' })).toEqual([]);
  });
});
