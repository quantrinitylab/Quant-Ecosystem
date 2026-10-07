import { describe, it, expect, beforeEach } from 'vitest';
import {
  PrismaMemoryStore,
  type MemoryPrismaClient,
  type MemoryRecordRow,
  type MemoryRecordCreateData,
} from '../core/prisma-memory-store';
import { asKind, asLevel } from '../core/memory-port';
import type { MemoryRecord } from '../core/memory-port';

// ─── Fake Prisma client (emulates memory_records table + defaults) ─────────────

class FakeMemoryClient implements MemoryPrismaClient {
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
      let matches = this.rows.filter((r) => {
        if ('logicalId' in where && r.logicalId !== where['logicalId']) return false;
        if ('deletedAt' in where && where['deletedAt'] === null && r.deletedAt !== null)
          return false;
        return true;
      });
      if (orderBy?.['version'] === 'desc') {
        matches = matches.sort((a, b) => b.version - a.version);
      }
      return matches[0] ?? null;
    },
    deleteMany: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      const before = this.rows.length;
      this.rows = this.rows.filter(
        (r) => !('logicalId' in where && r.logicalId === where['logicalId']),
      );
      return { count: before - this.rows.length };
    },
  };
}

const input = (over: Partial<Omit<MemoryRecord, 'id' | 'createdAt' | 'version'>> = {}) => ({
  content: over.content ?? 'lives in Patna',
  kind: over.kind ?? asKind('fact'),
  level: over.level ?? asLevel('user'),
  owner: 'owner' in over ? (over.owner as string | null) : 'user_1',
  pinned: over.pinned ?? false,
  expiresAt: over.expiresAt ?? null,
  metadata: over.metadata ?? {},
});

describe('PrismaMemoryStore', () => {
  let client: FakeMemoryClient;
  let store: PrismaMemoryStore;

  beforeEach(() => {
    client = new FakeMemoryClient();
    store = new PrismaMemoryStore({ client });
  });

  describe('store', () => {
    it('persists a record and returns it with the logicalId as port id', async () => {
      const rec = await store.store(input());
      expect(rec.id).toBe('mem_1');
      expect(rec.version).toBe(1);
      expect(rec.owner).toBe('user_1');
      expect(rec.content).toBe('lives in Patna');
      expect(rec.kind).toBe('fact');
      expect(rec.level).toBe('user');
    });

    it('defaults ownerType to "user" and maps owner → ownerId', async () => {
      await store.store(input({ owner: 'user_42' }));
      expect(client.rows[0]?.ownerType).toBe('user');
      expect(client.rows[0]?.ownerId).toBe('user_42');
    });

    it('honors a configured defaultOwnerType', async () => {
      const orgStore = new PrismaMemoryStore({ client, defaultOwnerType: 'org' });
      await orgStore.store(input());
      expect(client.rows[0]?.ownerType).toBe('org');
    });

    it('lifts a string metadata.tenantId into the tenantId column', async () => {
      await store.store(input({ metadata: { tenantId: 'tenant_9', foo: 'bar' } }));
      expect(client.rows[0]?.tenantId).toBe('tenant_9');
    });

    it('leaves tenantId null when metadata has no tenantId', async () => {
      await store.store(input());
      expect(client.rows[0]?.tenantId).toBeNull();
    });

    it('converts an epoch expiresAt to a Date', async () => {
      const when = Date.UTC(2030, 0, 1);
      await store.store(input({ expiresAt: when }));
      expect(client.rows[0]?.expiresAt).toBeInstanceOf(Date);
      expect(client.rows[0]?.expiresAt?.getTime()).toBe(when);
    });

    it('preserves a null owner (shared/world memory)', async () => {
      await store.store(input({ owner: null }));
      expect(client.rows[0]?.ownerId).toBeNull();
    });
  });

  describe('get', () => {
    it('returns the stored record by logical id', async () => {
      const rec = await store.store(input());
      const got = await store.get(rec.id);
      expect(got?.id).toBe(rec.id);
      expect(got?.content).toBe('lives in Patna');
    });

    it('returns null for an unknown id', async () => {
      expect(await store.get('nope')).toBeNull();
    });

    it('maps expiresAt back to an epoch number', async () => {
      const when = Date.UTC(2031, 5, 15);
      const rec = await store.store(input({ expiresAt: when }));
      const got = await store.get(rec.id);
      expect(got?.expiresAt).toBe(when);
    });
  });

  describe('delete', () => {
    it('hard-deletes and reports true', async () => {
      const rec = await store.store(input());
      expect(await store.delete(rec.id)).toBe(true);
      expect(await store.get(rec.id)).toBeNull();
    });

    it('returns false when nothing matched', async () => {
      expect(await store.delete('nope')).toBe(false);
    });
  });
});
