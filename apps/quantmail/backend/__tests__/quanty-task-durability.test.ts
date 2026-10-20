// @vitest-environment node
// ============================================================================
// WR-G Quanty task durability (fix/qm-quanty-task-durability) — the task
// store, step receipts and audit trail must survive a backend restart, so
// they are DB-backed with in-memory fakes standing in for Prisma here.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PrismaQuantyTaskStore,
  loadStepReceipt,
  storeStepReceipt,
  stepReceiptKey,
  stepFingerprint,
  persistAuditEvent,
  listTaskEvents,
  hasDurableDb,
} from '../services/quanty-agent/task-store';
import type { QuantyTask, QuantyAuditEntry } from '../services/quanty-agent/types';

function makeRows() {
  return new Map<string, any>();
}

function makeTaskDelegate(rows: Map<string, any>) {
  return {
    upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
      const cur = rows.get(where.id);
      const next = cur
        ? { ...cur, ...update }
        : { createdAt: new Date(), updatedAt: new Date(), ...create };
      rows.set(where.id, next);
      return next;
    }),
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => rows.get(where.id) ?? null),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      const out: any[] = [];
      for (const row of rows.values()) {
        if (where?.userId && row.userId !== where.userId) continue;
        out.push(row);
      }
      return out;
    }),
  };
}

function makeEventDelegate(rows: Map<string, any>) {
  return {
    create: vi.fn().mockImplementation(async ({ data }: any) => {
      const id = `ev-${rows.size + 1}`;
      const row = { id, createdAt: new Date(), ...data };
      rows.set(id, row);
      return row;
    }),
    findMany: vi.fn().mockImplementation(async ({ where }: any) => {
      const out: any[] = [];
      for (const row of rows.values()) {
        if (where?.taskId && row.taskId !== where.taskId) continue;
        out.push(row);
      }
      return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
  };
}

function makeReceiptDelegate(rows: Map<string, any>) {
  return {
    upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
      const cur = rows.get(where.operationId);
      const next = cur ? { ...cur, ...update } : { ...create };
      rows.set(where.operationId, next);
      return next;
    }),
    findUnique: vi.fn().mockImplementation(async ({ where }: any) => rows.get(where.operationId) ?? null),
  };
}

function makeApprovalsDelegate() {
  return { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) };
}

function makePrisma() {
  return {
    quantyTask: makeTaskDelegate(makeRows()),
    quantyTaskEvent: makeEventDelegate(makeRows()),
    quantyApprovalRecord: makeApprovalsDelegate(),
    idempotencyOperation: makeReceiptDelegate(makeRows()),
  };
}

function makeTask(overrides: Partial<QuantyTask> = {}): QuantyTask {
  return {
    id: 'task-1',
    userId: 'user-1',
    command: 'summarize my inbox',
    status: 'running',
    planSummary: 'plan',
    steps: [
      { id: 's1', toolName: 'mail.search', label: 'search', args: { q: 'x' }, status: 'done' },
    ],
    needsConfirmation: false,
    background: false,
    createdAt: new Date('2026-10-20T00:00:00Z').toISOString(),
    updatedAt: new Date('2026-10-20T00:00:00Z').toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Quanty task durability (WR-G)', () => {
  it('hasDurableDb is false when delegates are absent (graceful degrade)', () => {
    expect(hasDurableDb({})).toBe(false);
    expect(hasDurableDb(null)).toBe(false);
    expect(hasDurableDb(makePrisma())).toBe(true);
  });

  it('PrismaQuantyTaskStore survives a restart: save then load round-trips the task', async () => {
    const prisma = makePrisma();
    const store = new PrismaQuantyTaskStore(prisma);
    await store.save(makeTask());
    // "restart": a brand-new store instance over the same DB
    const store2 = new PrismaQuantyTaskStore(prisma);
    const loaded = await store2.get('task-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.command).toBe('summarize my inbox');
    expect(loaded!.status).toBe('running');
    expect(loaded!.steps).toHaveLength(1);
    expect(loaded!.steps[0]!.id).toBe('s1');
  });

  it('get returns null for an unknown task', async () => {
    const store = new PrismaQuantyTaskStore(makePrisma());
    expect(await store.get('nope')).toBeNull();
  });

  it('step receipt: store then replay returns the stored result for the same invocation', async () => {
    const prisma = makePrisma();
    const step = { id: 's1', toolName: 'mail.search', args: { q: 'x' } };
    await storeStepReceipt(prisma, 'task-1', step, {
      summary: 'found 3 messages',
      data: { ids: ['a', 'b', 'c'] },
      reversible: false,
    });
    const replayed = await loadStepReceipt(prisma, 'task-1', step);
    expect(replayed).not.toBeNull();
    expect(replayed!.summary).toBe('found 3 messages');
    expect(replayed!.data).toEqual({ ids: ['a', 'b', 'c'] });
  });

  it('step receipt: a re-run with DIFFERENT args does NOT replay (re-executes)', async () => {
    const prisma = makePrisma();
    const step = { id: 's1', toolName: 'mail.search', args: { q: 'x' } };
    await storeStepReceipt(prisma, 'task-1', step, { summary: 'old' });
    const replayed = await loadStepReceipt(prisma, 'task-1', {
      ...step,
      args: { q: 'DIFFERENT' },
    });
    expect(replayed).toBeNull();
  });

  it('stepReceiptKey is stable and namespaced per task+step', () => {
    expect(stepReceiptKey('t1', 's1')).toBe('quanty:step:t1:s1');
    expect(stepReceiptKey('t1', 's1')).not.toBe(stepReceiptKey('t1', 's2'));
  });

  it('stepFingerprint is stable across key order and sensitive to real changes', () => {
    const a = stepFingerprint('t1', { id: 's1', toolName: 'x', args: { a: 1, b: 2 } });
    const reordered = stepFingerprint('t1', { id: 's1', toolName: 'x', args: { b: 2, a: 1 } });
    expect(reordered).toBe(a);
    expect(stepFingerprint('t1', { id: 's1', toolName: 'x', args: { a: 1, b: 3 } })).not.toBe(a);
    expect(stepFingerprint('t1', { id: 's1', toolName: 'y', args: { a: 1, b: 2 } })).not.toBe(a);
  });

  it('audit events persist and list back in order (replayable progress)', async () => {
    const prisma = makePrisma();
    const mk = (kind: QuantyAuditEntry['kind'], seq: number): QuantyAuditEntry => ({
      kind,
      taskId: 'task-1',
      userId: 'user-1',
      timestamp: new Date('2026-10-20T00:00:00Z').toISOString(),
      detail: `detail-${seq}`,
    });
    await persistAuditEvent(prisma, mk('task.created', 1));
    await persistAuditEvent(prisma, mk('step.done', 2));
    const events = await listTaskEvents(prisma, 'task-1');
    expect(events).toHaveLength(2);
    expect(events[0]!.detail).toBe('detail-1');
    expect(events[1]!.detail).toBe('detail-2');
  });

  it('persistAuditEvent is a no-op without durable delegates (never breaks the task)', async () => {
    await expect(persistAuditEvent({}, { kind: 'task.created' } as QuantyAuditEntry)).resolves.toBeUndefined();
    await expect(loadStepReceipt({}, 't', { id: 's', toolName: 'x', args: {} })).resolves.toBeNull();
    await expect(
      storeStepReceipt({}, 't', { id: 's', toolName: 'x', args: {} }, { summary: 's' }),
    ).resolves.toBe(false);
  });
});
