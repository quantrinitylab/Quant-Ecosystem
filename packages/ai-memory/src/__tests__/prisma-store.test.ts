// ============================================================================
// PrismaAIMemoryStore tests — durable CRUD over ai_memory_entries.
//
// The narrow structural client is faked in-memory; the SAME fake database is
// shared across store instances to simulate a process restart (new instance,
// same rows). A separate integration path (real Postgres) is out of scope for
// unit tests — the delegate surface is exactly what PrismaClient satisfies.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { PrismaAIMemoryStore } from '../prisma-store';
import type {
  AiMemoryEntryDelegate,
  AiMemoryEntryRow,
  AiMemoryPrismaClient,
} from '../prisma-store';
import type { CreateMemoryInput } from '../store-port';

function createFakeDb(): { client: AiMemoryPrismaClient; rows: Map<string, AiMemoryEntryRow> } {
  const rows = new Map<string, AiMemoryEntryRow>();
  let seq = 0;

  const matches = (row: AiMemoryEntryRow, where: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(where)) {
      if (k === 'tags' && v !== null && typeof v === 'object' && 'has' in (v as object)) {
        if (!row.tags.includes((v as { has: string }).has)) return false;
        continue;
      }
      if ((row as unknown as Record<string, unknown>)[k] !== v) return false;
    }
    return true;
  };

  const delegate: AiMemoryEntryDelegate = {
    create: async ({ data }) => {
      const now = new Date();
      const row: AiMemoryEntryRow = {
        ...(data as Omit<AiMemoryEntryRow, 'id' | 'createdAt' | 'updatedAt'>),
        id: `cuid_${++seq}`,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }) => rows.get(where.id) ?? null,
    findMany: async ({ where, orderBy }) => {
      let list = [...rows.values()].filter((r) => matches(r, where));
      if (orderBy?.['createdAt'] === 'desc') {
        list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return list;
    },
    update: async ({ where, data }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error('not found');
      const updated: AiMemoryEntryRow = {
        ...row,
        ...(data as Partial<AiMemoryEntryRow>),
        updatedAt: new Date(),
      };
      rows.set(row.id, updated);
      return updated;
    },
    delete: async ({ where }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error('not found');
      rows.delete(where.id);
      return row;
    },
    deleteMany: async ({ where }) => {
      let count = 0;
      for (const [id, row] of [...rows]) {
        if (matches(row, where)) {
          rows.delete(id);
          count++;
        }
      }
      return { count };
    },
  };

  return { client: { aiMemoryEntry: delegate }, rows };
}

const entryInput = (overrides: Partial<CreateMemoryInput> = {}): CreateMemoryInput => ({
  userId: 'user-1',
  category: 'preferences',
  content: 'User prefers dark mode',
  source: 'conversation',
  sourceApp: 'quantai',
  explanation: 'User mentioned dark mode',
  writeSignal: 'explicit',
  status: 'active',
  accessScopes: ['quantai'],
  tags: ['ui'],
  ...overrides,
});

describe('PrismaAIMemoryStore', () => {
  it('persists across a simulated restart (new instance, same database)', async () => {
    const { client } = createFakeDb();
    const storeA = new PrismaAIMemoryStore({ client, appId: 'quantai' });
    const created = await storeA.create(entryInput());

    // "Restart": a brand-new store instance over the same database.
    const storeB = new PrismaAIMemoryStore({ client, appId: 'quantai' });
    const fetched = await storeB.get(created.id);

    expect(fetched).toBeDefined();
    expect(fetched!.content).toBe('User prefers dark mode');
    expect(fetched!.userId).toBe('user-1');
    const listed = await storeB.getUserMemories('user-1');
    expect(listed).toHaveLength(1);
  });

  it('isolates by (appId, userId): one table serves every app', async () => {
    const { client } = createFakeDb();
    const quantai = new PrismaAIMemoryStore({ client, appId: 'quantai' });
    const other = new PrismaAIMemoryStore({ client, appId: 'other-app' });

    await quantai.create(entryInput({ userId: 'u1' }));
    await other.create(entryInput({ userId: 'u1', content: 'other app secret' }));
    await quantai.create(entryInput({ userId: 'u2', content: 'u2 memory' }));

    expect(await quantai.getUserMemories('u1')).toHaveLength(1);
    expect((await quantai.getUserMemories('u1'))[0]!.content).toBe('User prefers dark mode');
    expect(await other.getUserMemories('u1')).toHaveLength(1);
    expect(await quantai.getUserMemories('u2')).toHaveLength(1);
    expect(await quantai.getUserMemories('nobody')).toHaveLength(0);
  });

  it('get() refuses rows from another app namespace', async () => {
    const { client } = createFakeDb();
    const a = new PrismaAIMemoryStore({ client, appId: 'a' });
    const b = new PrismaAIMemoryStore({ client, appId: 'b' });
    const created = await a.create(entryInput());

    expect(await b.get(created.id)).toBeUndefined();
    expect(await a.get(created.id)).toBeDefined();
  });

  it('enforces the anti-creep writeSignal rule like the in-memory store', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client });
    await expect(store.create(entryInput({ writeSignal: 'digest-approved' }))).rejects.toThrow(
      'writeSignal must be "explicit"',
    );
  });

  it('runs the candidate approve/reject workflow', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client });

    const candidate = await store.createCandidate({
      userId: 'u1',
      category: 'goals',
      content: 'Learn Rust',
      source: 'pattern',
      sourceApp: 'quantai',
      explanation: 'Detected',
      accessScopes: [],
      tags: [],
    });
    expect(candidate.status).toBe('pending');
    expect(candidate.writeSignal).toBe('pending-review');

    expect(await store.getPendingCandidates('u1')).toHaveLength(1);
    // Pending candidates are NOT in the active list
    expect(await store.getUserMemories('u1')).toHaveLength(0);

    const approved = await store.approveCandidate(candidate.id);
    expect(approved!.status).toBe('active');
    expect(approved!.writeSignal).toBe('digest-approved');
    expect(await store.getUserMemories('u1')).toHaveLength(1);
    expect(await store.getPendingCandidates('u1')).toHaveLength(0);

    // Approving twice is a no-op
    expect(await store.approveCandidate(candidate.id)).toBeUndefined();

    const doomed = await store.createCandidate({
      userId: 'u1',
      category: 'goals',
      content: 'Learn Go',
      source: 'pattern',
      sourceApp: 'quantai',
      explanation: 'Detected',
      accessScopes: [],
      tags: [],
    });
    expect(await store.rejectCandidate(doomed.id)).toBe(true);
    expect(await store.get(doomed.id)).toBeUndefined();
  });

  it('excludes expired memories from listings', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client });
    await store.create(entryInput({ expiresAt: Date.now() - 1000 }));
    await store.create(entryInput({ content: 'fresh', expiresAt: Date.now() + 60000 }));
    await store.create(entryInput({ content: 'immortal' }));

    const listed = await store.getUserMemories('user-1');
    expect(listed.map((m) => m.content).sort()).toEqual(['fresh', 'immortal']);
  });

  it('purgeByTag and deleteUserMemories scope to the callers namespace', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client, appId: 'quantai' });
    await store.create(entryInput({ userId: 'u1', tags: ['x'] }));
    await store.create(entryInput({ userId: 'u1', tags: ['x', 'y'] }));
    await store.create(entryInput({ userId: 'u2', tags: ['x'] }));

    expect(await store.purgeByTag('u1', 'x')).toBe(2);
    expect(await store.getUserMemories('u1')).toHaveLength(0);
    expect(await store.getUserMemories('u2')).toHaveLength(1);
    expect(await store.deleteUserMemories('u2')).toBe(1);
  });

  it('caps the access log', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client, maxAccessLogEntries: 5 });
    const created = await store.create(entryInput());
    for (let i = 0; i < 8; i++) {
      await store.logAccess(created.id, {
        accessedAt: Date.now(),
        reason: `r${i}`,
        requestingApp: 'quantai',
      });
    }
    const log = await store.getAccessLog(created.id);
    expect(log).toHaveLength(5);
    expect(log[4]!.reason).toBe('r7');
    expect(await store.logAccess('missing', { accessedAt: 1, reason: 'x', requestingApp: 'y' })).toBe(
      false,
    );
  });

  it('updates, deletes, and searches', async () => {
    const { client } = createFakeDb();
    const store = new PrismaAIMemoryStore({ client });
    const created = await store.create(entryInput());

    const updated = await store.update(created.id, { content: 'Updated', tags: ['new'] });
    expect(updated!.content).toBe('Updated');
    expect(updated!.tags).toEqual(['new']);
    expect(await store.update('missing', { content: 'x' })).toBeUndefined();

    expect(await store.searchByContent('user-1', 'updated')).toHaveLength(1);
    expect(await store.searchByContent('user-1', 'nope')).toHaveLength(0);
    expect(await store.searchByCategory('user-1', 'preferences')).toHaveLength(1);
    expect(await store.searchByCategory('user-1', 'skills')).toHaveLength(0);

    expect(await store.delete(created.id)).toBe(true);
    expect(await store.get(created.id)).toBeUndefined();
    expect(await store.delete(created.id)).toBe(false);
  });
});
