// @vitest-environment node
// ============================================================================
// WR-G Quanty task durability (fix/qm-quanty-task-durability) — the task
// store, step receipts and audit trail must survive a backend restart, so
// they are DB-backed with in-memory fakes standing in for Prisma here.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PrismaQuantyTaskStore,
  claimStepReceipt,
  loadStepReceipt,
  recoverInterruptedTasks,
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
    create: vi.fn().mockImplementation(async ({ data }: any) => {
      if (rows.has(data.operationId)) {
        const err = new Error('Unique constraint failed on operationId');
        (err as any).code = 'P2002';
        throw err;
      }
      rows.set(data.operationId, { ...data });
      return data;
    }),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => {
      const cur = rows.get(where.operationId);
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...data };
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

  it('claimStepReceipt: first claim wins, completed replays, fresh claim contends', async () => {
    const prisma = makePrisma();
    const step = { id: 's1', toolName: 'x', args: { a: 1 } };
    // First attempt claims.
    const first = await claimStepReceipt(prisma, 't1', step);
    expect(first.outcome).toBe('claimed');
    // Second attempt sees a fresh claim -> contended (must not duplicate).
    const second = await claimStepReceipt(prisma, 't1', step);
    expect(second.outcome).toBe('contended');
    // Once completed, a later attempt replays instead of re-executing.
    await storeStepReceipt(prisma, 't1', step, { summary: 'did it', data: 42 });
    const third = await claimStepReceipt(prisma, 't1', step);
    expect(third.outcome).toBe('replay');
    if (third.outcome === 'replay') {
      expect(third.receipt.summary).toBe('did it');
      expect(third.receipt.data).toBe(42);
    }
  });

  it('claimStepReceipt: a stale claim is taken over (crashed owner)', async () => {
    const prisma = makePrisma();
    const step = { id: 's2', toolName: 'x', args: {} };
    await claimStepReceipt(prisma, 't1', step);
    // Age the claim past the TTL.
    const rows = (prisma.idempotencyOperation as any);
    const key = stepReceiptKey('t1', 's2');
    const row = await rows.findUnique({ where: { operationId: key } });
    row.expiresAt = new Date(Date.now() - 1000);
    const retake = await claimStepReceipt(prisma, 't1', step);
    expect(retake.outcome).toBe('claimed');
  });

  it('recoverInterruptedTasks: only old orphans, never fresh or live-owned tasks', async () => {
    const taskRows = new Map<string, any>();
    const old = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const fresh = new Date(Date.now() - 60 * 1000); // 1m ago
    const mk = (id: string, updatedAt: Date, ownerId: string | null) => ({
      id, userId: 'u1', command: 'c', status: 'running', planSummary: 'p',
      steps: '[]', needsConfirmation: false, pendingToolName: null,
      outcome: null, background: false, ownerId,
      createdAt: old, updatedAt,
    });
    taskRows.set('orphan', mk('orphan', old, 'dead-worker'));
    taskRows.set('fresh', mk('fresh', fresh, 'dead-worker'));
    taskRows.set('live', mk('live', fresh, 'live-worker'));
    const prisma = {
      quantyTask: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const out: any[] = [];
          for (const row of taskRows.values()) {
            if (where?.status?.in && !where.status.in.includes(row.status)) continue;
            if (where?.updatedAt?.lt && !(row.updatedAt < where.updatedAt.lt)) continue;
            if (where?.ownerId?.not && row.ownerId === where.ownerId.not) continue;
            out.push(row);
          }
          return out.sort((a: any, b: any) => a.updatedAt - b.updatedAt).slice(0, 1000);
        }),
        updateMany: vi.fn().mockImplementation(async ({ where }: any) => {
          let count = 0;
          for (const row of taskRows.values()) {
            const idMatch = !where?.id || (where.id.in ? where.id.in.includes(row.id) : row.id === where.id);
            const statusMatch = !where?.status?.in || where.status.in.includes(row.status);
            if (idMatch && statusMatch) {
              row.status = 'interrupted';
              count += 1;
            }
          }
          return { count };
        }),
      },
      quantyTaskEvent: makeEventDelegate(new Map()),
      quantyApprovalRecord: makeApprovalsDelegate(),
      idempotencyOperation: makeReceiptDelegate(new Map()),
    };
    const n = await recoverInterruptedTasks(prisma, 'live-worker');
    expect(n).toBe(1);
    expect(taskRows.get('orphan').status).toBe('interrupted');
    expect(taskRows.get('fresh').status).toBe('running');
    expect(taskRows.get('live').status).toBe('running');
  });
});
