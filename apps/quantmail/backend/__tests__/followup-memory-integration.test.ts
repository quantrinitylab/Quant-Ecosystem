// ============================================================================
// AIFollowupService — reminders persist as episodic user memories
//
// Proves: (1) default behavior unchanged, (2) reminders survive service
// re-instantiation through the REAL memory subsystem, (3) per-user scoping,
// (4) append-only status semantics: the LAST row per reminder id wins
// (Law 2 — history appends, state is a projection).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '@quant/ai';
import {
  AIFollowupService,
  InMemoryReminderStore,
  MemoryBackedReminderStore,
  type Commitment,
} from '../services/ai-followup.service';

const commitment: Commitment = {
  description: 'Send the launch deck by Friday',
  dueDate: '2026-07-11T09:00:00.000Z',
  assignee: 'user',
  confidence: 0.9,
  emailId: 'em_1',
};

const noopEngine = { infer: async () => ({ content: '[]' }) } as never;

function fakeDbClient(): MemoryDbClient {
  interface Row {
    [k: string]: unknown;
    ownerId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }
  const rows: Row[] = [];
  let seq = 0;
  return {
    memoryRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = {
          id: `r${++seq}`,
          logicalId: `m${seq}`,
          version: 1,
          archivedAt: null,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as unknown as Row;
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        rows.filter((r) => {
          const w = where ?? {};
          if ('ownerId' in w && r.ownerId !== w['ownerId']) return false;
          if ('archivedAt' in w && w['archivedAt'] === null && r.archivedAt !== null) return false;
          if ('deletedAt' in w && w['deletedAt'] === null && r.deletedAt !== null) return false;
          return true;
        }),
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as MemoryDbClient;
}

describe('default store (backwards compatibility)', () => {
  it('creates and lists reminders like the original Map', async () => {
    const svc = new AIFollowupService(noopEngine);
    const created = await svc.createReminder(commitment, 'u1');
    expect(created.status).toBe('active');
    expect(await svc.getActiveReminders('u1')).toHaveLength(1);
    expect(await svc.getActiveReminders('u2')).toHaveLength(0);
  });
});

describe('memory-backed reminders', () => {
  it('reminders survive service re-instantiation (restart semantics)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });

    const svc1 = new AIFollowupService(noopEngine, new MemoryBackedReminderStore(memory));
    const created = await svc1.createReminder(commitment, 'u1');

    // Fresh service instance = simulated restart.
    const svc2 = new AIFollowupService(noopEngine, new MemoryBackedReminderStore(memory));
    const active = await svc2.getActiveReminders('u1');
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(created.id);
    expect(active[0]?.commitmentDescription).toContain('launch deck');
  });

  it('scopes reminders per user', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedReminderStore(memory);
    const svc = new AIFollowupService(noopEngine, store);
    await svc.createReminder(commitment, 'u1');
    expect(await svc.getActiveReminders('u2')).toHaveLength(0);
  });

  it('append-only status updates: last row per id wins (Law 2 projection)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedReminderStore(memory);

    const svc = new AIFollowupService(noopEngine, store);
    const created = await svc.createReminder(commitment, 'u1');
    expect(await svc.getActiveReminders('u1')).toHaveLength(1);

    // Status change = append a new row with the same id (history preserved).
    await store.save({ ...created, status: 'completed' });
    expect(await svc.getActiveReminders('u1')).toHaveLength(0);
  });
});

describe('InMemoryReminderStore', () => {
  it('save + listActive filter by user and status', async () => {
    const s = new InMemoryReminderStore();
    await s.save({
      id: 'r1',
      commitmentDescription: 'x',
      dueDate: 'd',
      userId: 'u1',
      status: 'active',
      createdAt: 'c',
    });
    await s.save({
      id: 'r2',
      commitmentDescription: 'y',
      dueDate: 'd',
      userId: 'u1',
      status: 'dismissed',
      createdAt: 'c',
    });
    expect(await s.listActive('u1')).toHaveLength(1);
  });
});
