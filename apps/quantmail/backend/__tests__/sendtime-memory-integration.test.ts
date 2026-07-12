// ============================================================================
// SmartSendTimeService — recipient engagement patterns as user memories
//
// Proves: (1) default behavior unchanged (stub fallback intact), (2) learned
// patterns survive restarts through the REAL memory subsystem and replace the
// stub, (3) per-user scoping, (4) best-effort writes never throw.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '@quant/ai';
import {
  SmartSendTimeService,
  MemoryBackedPatternStore,
  type RecipientPattern,
} from '../services/smart-send-time.service';

const learned: RecipientPattern = {
  recipientEmail: 'priya@example.com',
  averageResponseTimeMinutes: 12,
  mostActiveHours: [7, 8, 21],
  mostActiveDays: ['Saturday', 'Sunday'],
  timezone: 'Asia/Kolkata',
};

const noopEngine = { infer: async () => ({ content: '{}' }) } as never;

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

describe('default behavior (no store)', () => {
  it('returns the original default pattern', async () => {
    const svc = new SmartSendTimeService(noopEngine);
    const p = await svc.getRecipientPatterns('x@y.z', 'u1');
    expect(p.averageResponseTimeMinutes).toBe(45); // the original stub values
    expect(p.timezone).toBe('America/New_York');
  });
});

describe('memory-backed patterns', () => {
  it('learned pattern survives restart and replaces the stub', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });

    const svc1 = new SmartSendTimeService(noopEngine, new MemoryBackedPatternStore(memory));
    await svc1.saveRecipientPattern('u1', learned);

    // Fresh instance = simulated restart.
    const svc2 = new SmartSendTimeService(noopEngine, new MemoryBackedPatternStore(memory));
    const restored = await svc2.getRecipientPatterns('priya@example.com', 'u1');
    expect(restored.timezone).toBe('Asia/Kolkata');
    expect(restored.averageResponseTimeMinutes).toBe(12);
  });

  it('unknown recipients still get the default (fallback intact)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const svc = new SmartSendTimeService(noopEngine, new MemoryBackedPatternStore(memory));
    const p = await svc.getRecipientPatterns('stranger@x.y', 'u1');
    expect(p.averageResponseTimeMinutes).toBe(45);
  });

  it('scopes patterns per user', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedPatternStore(memory);
    await store.set('u1', learned);
    expect(await store.get('u2', 'priya@example.com')).toBeNull();
  });

  it('saveRecipientPattern is best-effort (never throws)', async () => {
    const svc = new SmartSendTimeService(noopEngine, {
      get: async () => null,
      set: async () => {
        throw new Error('backend down');
      },
    });
    await expect(svc.saveRecipientPattern('u1', learned)).resolves.toBeUndefined();
  });
});
