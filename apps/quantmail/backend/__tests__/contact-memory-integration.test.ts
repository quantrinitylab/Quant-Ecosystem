// ============================================================================
// AIContactContextService — relationship memory via the memory subsystem
//
// Proves: (1) default behavior unchanged without a store, (2) analyzed
// context is remembered, (3) a data-less follow-up call answers from memory
// instead of asking the model to analyze an empty history, (4) memory write
// failures never fail the request, (5) end-to-end restart survival through
// the REAL memory subsystem.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createMemoryService, type MemoryDbClient } from '@quant/ai';
import {
  AIContactContextService,
  MemoryBackedContactStore,
  type ContactContext,
} from '../services/ai-contact-context.service';

const ctx: ContactContext = {
  contactEmail: 'priya@example.com',
  totalInteractions: 12,
  firstContact: '2026-01-05',
  lastContact: '2026-07-01',
  relationship: 'close collaborator on the launch project',
  topTopics: ['launch', 'design reviews'],
  sentiment: 'warm and collaborative',
  confidence: 0.9,
};

const engineReturning = (payload: unknown, onInfer?: () => void) =>
  ({
    infer: async () => {
      onInfer?.();
      return { content: JSON.stringify(payload) };
    },
  }) as never;

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
  it('always analyzes, exactly like before', async () => {
    let inferCount = 0;
    const svc = new AIContactContextService(engineReturning(ctx, () => inferCount++));
    const result = await svc.getContactContext('priya@example.com', 'u1');
    expect(result.relationship).toContain('collaborator');
    expect(inferCount).toBe(1);
  });
});

describe('memory-backed contact context', () => {
  it('remembers the analysis; a data-less follow-up answers from memory (no model call)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedContactStore(memory);

    let inferCount = 0;
    const svc = new AIContactContextService(
      engineReturning(ctx, () => inferCount++),
      store,
    );

    // First call: has interaction data → analyzes and remembers.
    const first = await svc.getContactContext('priya@example.com', 'u1', [
      { date: '2026-07-01', subject: 'Launch', direction: 'received', snippet: 'ready?' },
    ]);
    expect(first.totalInteractions).toBe(12);
    expect(inferCount).toBe(1);

    // Second call, NO data (fresh service = restart): answers from memory.
    const svc2 = new AIContactContextService(
      engineReturning(ctx, () => inferCount++),
      new MemoryBackedContactStore(memory),
    );
    const remembered = await svc2.getContactContext('priya@example.com', 'u1');
    expect(remembered.sentiment).toBe('warm and collaborative');
    expect(inferCount).toBe(1); // ← no second model call: memory answered
  });

  it('scopes memories per user (no cross-user leakage)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedContactStore(memory);
    await store.set('u1', ctx);
    expect(await store.get('u2', 'priya@example.com')).toBeNull();
  });

  it('memory write failure never fails the request', async () => {
    const failingStore = {
      get: async () => null,
      set: async () => {
        throw new Error('memory backend down');
      },
    };
    const svc = new AIContactContextService(engineReturning(ctx), failingStore);
    const result = await svc.getContactContext('priya@example.com', 'u1', [
      { date: 'd', subject: 's', direction: 'sent', snippet: 'x' },
    ]);
    expect(result.contactEmail).toBe('priya@example.com'); // request succeeded
  });

  it('fresh interaction data still triggers re-analysis (memory never blocks new evidence)', async () => {
    const memory = createMemoryService({ prisma: fakeDbClient() });
    const store = new MemoryBackedContactStore(memory);
    await store.set('u1', ctx);

    let inferCount = 0;
    const updated = { ...ctx, totalInteractions: 13 };
    const svc = new AIContactContextService(
      engineReturning(updated, () => inferCount++),
      store,
    );
    const result = await svc.getContactContext('priya@example.com', 'u1', [
      { date: '2026-07-09', subject: 'New', direction: 'received', snippet: 'update' },
    ]);
    expect(inferCount).toBe(1); // analyzed because new data arrived
    expect(result.totalInteractions).toBe(13);
  });
});
