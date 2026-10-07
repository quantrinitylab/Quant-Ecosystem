import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '../core/memory-composition';
import type { MemoryRecordRow, MemoryRecordCreateData } from '../core/prisma-memory-store';
import { UserInboxCategoryMemory } from '../adapters/user-inbox-category-memory';

// A minimal in-memory fake of the memory_records table — enough for the real
// DefaultMemoryService object graph to observe/recall without a live Postgres.
class FakeMemoryDb implements MemoryDbClient {
  public rows: MemoryRecordRow[] = [];
  private seq = 0;

  memoryRecord = {
    create: async ({ data }: { data: MemoryRecordCreateData }): Promise<MemoryRecordRow> => {
      const n = ++this.seq;
      const now = new Date(Date.now() + n); // strictly increasing createdAt
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
      let matches = this.rows.filter((r) => match(r, where));
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
      let matches = this.rows.filter((r) => match(r, where));
      if (orderBy?.['createdAt'] === 'desc') {
        matches = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return typeof take === 'number' ? matches.slice(0, take) : matches;
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
      for (const r of this.rows) {
        if (match(r, where)) {
          r.archivedAt = data.archivedAt;
          count++;
        }
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

describe('UserInboxCategoryMemory', () => {
  let db: FakeMemoryDb;
  let channel: UserInboxCategoryMemory;

  beforeEach(() => {
    db = new FakeMemoryDb();
    channel = new UserInboxCategoryMemory(createMemoryService({ prisma: db }));
  });

  it('returns null for a sender the user never corrected', async () => {
    expect(await channel.get('user-1', 'unknown@example.com')).toBeNull();
  });

  it('remembers a correction and recalls it by sender', async () => {
    await channel.set('user-1', 'notifications@facebook.com', 'updates');
    const got = await channel.get('user-1', 'notifications@facebook.com');
    expect(got?.category).toBe('updates');
    expect(got?.sender).toBe('notifications@facebook.com');
  });

  it('normalizes the sender so display-name form matches the bare address', async () => {
    await channel.set('user-1', 'Facebook <notifications@facebook.com>', 'social');
    const got = await channel.get('user-1', 'NOTIFICATIONS@Facebook.com');
    expect(got?.category).toBe('social');
  });

  it('most-recent correction wins for the same sender', async () => {
    await channel.set('user-1', 'news@store.com', 'promotions');
    await channel.set('user-1', 'news@store.com', 'updates');
    const got = await channel.get('user-1', 'news@store.com');
    expect(got?.category).toBe('updates');
  });

  it('is scoped per user — one user cannot read another user corrections', async () => {
    await channel.set('user-1', 'boss@company.com', 'primary');
    expect(await channel.get('user-2', 'boss@company.com')).toBeNull();
  });
});
