import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import type { DefaultMemoryService } from '../core/default-memory-service';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';

// ============================================================================
// Memory Safety Benchmark (review item #6: catastrophic overwrite)
//
// Proves the architecture's core promise: a low/limited-trust LLM extraction
// CANNOT silently overwrite an established, trusted memory. The conflicting
// candidate is held Pending (coexists, excluded from recall) instead of
// destroying the trusted value. Deterministic; no live model.
// ============================================================================

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
    }) => {
      let m = this.rows.filter((r) => match(r, where));
      if (orderBy?.['version'] === 'desc') m = m.sort((a, b) => b.version - a.version);
      return m[0] ?? null;
    },
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    }) => {
      let m = this.rows.filter((r) => match(r, where));
      if (orderBy?.['createdAt'] === 'desc')
        m = m.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return typeof take === 'number' ? m.slice(0, take) : m;
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => !match(r, where));
      return { count: before - this.rows.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { archivedAt: Date };
    }) => {
      let count = 0;
      for (const r of this.rows)
        if (match(r, where)) {
          r.archivedAt = data.archivedAt;
          count++;
        }
      return { count };
    },
  };
}

function match(row: MemoryRecordRow, where: Record<string, unknown>): boolean {
  if ('logicalId' in where && row.logicalId !== where['logicalId']) return false;
  if ('ownerId' in where && row.ownerId !== where['ownerId']) return false;
  if ('deletedAt' in where && where['deletedAt'] === null && row.deletedAt !== null) return false;
  if ('archivedAt' in where && where['archivedAt'] === null && row.archivedAt !== null)
    return false;
  return true;
}

const state = (row: MemoryRecordRow | undefined): unknown =>
  (row?.metadata as Record<string, unknown> | undefined)?.['state'];

describe('memory safety: catastrophic overwrite prevention', () => {
  let db: FakeMemoryDb;
  let service: DefaultMemoryService;

  beforeEach(() => {
    db = new FakeMemoryDb();
    service = createMemoryService({ prisma: db });
  });

  it('a lower-trust LLM extraction does NOT overwrite an established fact', async () => {
    // Established (rule/user, effective weight 1.0).
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'I live in Patna',
    });

    // "100 chats later" the LLM mistakenly extracts a different residence, at
    // llm trust (0.8) and modest confidence (0.6) → effective weight 0.6.
    await service.remember({
      actor: 'user_1',
      content: 'lives in Delhi',
      kind: 'fact' as never,
      level: 'user' as never,
      metadata: { confidence: 0.6, trust: 0.8, provenance: 'llm.gpt' },
    });

    // The mistaken extraction is held Pending, not activated.
    const delhi = db.rows.find((r) => r.content.includes('Delhi'));
    expect(state(delhi)).toBe('pending');

    // Recall still returns Patna; Delhi never surfaces.
    const memories = await service.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Patna'))).toBe(true);
    expect(memories.some((m) => m.content.includes('Delhi'))).toBe(false);
  });

  it('even a confident LLM extraction cannot overwrite within the trust ceiling', async () => {
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'I live in Patna',
    });

    // High model confidence (0.99) but llm trust caps effective weight at 0.8,
    // below the established 1.0 minus epsilon (0.9) → still Pending.
    await service.remember({
      actor: 'user_1',
      content: 'lives in Delhi',
      kind: 'fact' as never,
      level: 'user' as never,
      metadata: { confidence: 0.99, trust: 0.8, provenance: 'llm.gpt' },
    });

    const delhi = db.rows.find((r) => r.content.includes('Delhi'));
    expect(state(delhi)).toBe('pending');
    const memories = await service.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Patna'))).toBe(true);
    expect(memories.some((m) => m.content.includes('Delhi'))).toBe(false);
  });

  it('an equally-trusted correction is allowed to supersede', async () => {
    await service.observe({
      actor: 'user_1',
      session: 's1',
      role: 'user',
      content: 'I live in Patna',
    });

    // A user-trust correction (trust 1.0, confidence 1.0) SHOULD supersede.
    await service.remember({
      actor: 'user_1',
      content: 'lives in Bangalore',
      kind: 'fact' as never,
      level: 'user' as never,
      metadata: { confidence: 1, trust: 1, provenance: 'user.explicit' },
    });

    const memories = await service.recall({ actor: 'user_1', query: 'where do I live' });
    expect(memories.some((m) => m.content.includes('Bangalore'))).toBe(true);
    expect(memories.some((m) => m.content.includes('Patna'))).toBe(false);
  });
});
