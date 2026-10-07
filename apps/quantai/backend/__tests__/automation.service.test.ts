import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutomationService,
  type ActionDispatcher,
  type AutomationAction,
  type AutomationPrismaClient,
} from '../services/automation.service';

// ---------------------------------------------------------------------------
// In-memory fake of the structural Prisma slice used by AutomationService.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: unknown;
  actions: unknown;
  conditions: unknown;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RunRow {
  id: string;
  automationId: string;
  userId: string;
  status: string;
  currentStep: number;
  checkpoints: unknown;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

function createFakePrisma(): AutomationPrismaClient & {
  _rows: Map<string, Row>;
  _runs: Map<string, RunRow>;
} {
  const rows = new Map<string, Row>();
  const runs = new Map<string, RunRow>();
  let seq = 0;

  return {
    _rows: rows,
    _runs: runs,
    aiAutomation: {
      async findMany(args: Record<string, unknown>) {
        const where = (args['where'] as { userId?: string }) ?? {};
        return [...rows.values()].filter((r) => !where.userId || r.userId === where.userId);
      },
      async findUnique(args: { where: { id: string } }) {
        return rows.get(args.where.id) ?? null;
      },
      async create(args: { data: Record<string, unknown> }) {
        seq += 1;
        const now = new Date();
        const row: Row = {
          id: `auto-${seq}`,
          userId: String(args.data['userId']),
          name: String(args.data['name']),
          description: String(args.data['description'] ?? ''),
          trigger: args.data['trigger'] ?? {},
          actions: args.data['actions'] ?? [],
          conditions: args.data['conditions'] ?? [],
          isActive: (args.data['isActive'] as boolean) ?? true,
          executionCount: 0,
          lastExecutedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(row.id, row);
        return row;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const row = rows.get(args.where.id);
        if (!row) throw new Error('not found');
        const updated = { ...row, ...args.data, updatedAt: new Date() } as Row;
        rows.set(row.id, updated);
        return updated;
      },
      async delete(args: { where: { id: string } }) {
        rows.delete(args.where.id);
        return {};
      },
    },
    aiAutomationRun: {
      async create(args: { data: Record<string, unknown> }) {
        seq += 1;
        const run: RunRow = {
          id: `run-${seq}`,
          automationId: String(args.data['automationId']),
          userId: String(args.data['userId']),
          status: String(args.data['status'] ?? 'running'),
          currentStep: Number(args.data['currentStep'] ?? 0),
          checkpoints: args.data['checkpoints'] ?? [],
          error: null,
          startedAt: new Date(),
          finishedAt: null,
        };
        runs.set(run.id, run);
        return run;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const run = runs.get(args.where.id);
        if (!run) throw new Error('run not found');
        const updated = { ...run, ...args.data } as RunRow;
        runs.set(run.id, updated);
        return updated;
      },
    },
  };
}

const manualTrigger = { type: 'manual' as const, config: {} };

function action(over: Partial<AutomationAction> = {}): AutomationAction {
  return {
    id: over.id ?? 'a1',
    type: over.type ?? 'mail.send',
    params: over.params ?? {},
    order: over.order ?? 0,
    retryOnFail: over.retryOnFail ?? false,
    timeout: over.timeout ?? 30000,
    ...(over.app ? { app: over.app } : {}),
  };
}

describe('AutomationService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: AutomationService;

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new AutomationService(prisma);
  });

  it('creates and lists per-user automations', async () => {
    const created = await service.create('user-1', {
      name: 'Daily summary',
      description: 'send a summary',
      trigger: manualTrigger,
      actions: [action()],
    });
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Daily summary');
    expect(created.isActive).toBe(true);
    expect(created.executionCount).toBe(0);

    await service.create('user-2', { name: 'Other', trigger: manualTrigger });

    const list = await service.list('user-1');
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Daily summary');
  });

  it('rejects creation without a name', async () => {
    await expect(
      service.create('user-1', { name: '   ', trigger: manualTrigger }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('enforces ownership on get/update/delete', async () => {
    const created = await service.create('owner', { name: 'Mine', trigger: manualTrigger });
    await expect(service.get(created.id, 'intruder')).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.update(created.id, 'intruder', { name: 'hax' })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(service.delete(created.id, 'intruder')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('toggles the active flag', async () => {
    const created = await service.create('user-1', { name: 'Toggle me', trigger: manualTrigger });
    const off = await service.toggle(created.id, 'user-1');
    expect(off.isActive).toBe(false);
    const on = await service.toggle(created.id, 'user-1');
    expect(on.isActive).toBe(true);
  });

  it('returns 404 for a missing automation', async () => {
    await expect(service.get('nope', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('keeps actions sorted by order', async () => {
    const created = await service.create('user-1', {
      name: 'Ordered',
      trigger: manualTrigger,
      actions: [
        action({ id: 'b', type: 't2', order: 2 }),
        action({ id: 'a', type: 't1', order: 1 }),
      ],
    });
    expect(created.actions.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('AutomationService.execute (durable runs)', () => {
  let prisma: ReturnType<typeof createFakePrisma>;

  beforeEach(() => {
    prisma = createFakePrisma();
  });

  it('runs all actions in order via the dispatcher and records a completed run', async () => {
    const dispatched: string[] = [];
    const dispatcher: ActionDispatcher = {
      async dispatch(a) {
        dispatched.push(a.id);
        return { success: true, output: { ok: a.id } };
      },
    };
    const service = new AutomationService(prisma, dispatcher);
    const created = await service.create('user-1', {
      name: 'Multi',
      trigger: manualTrigger,
      actions: [action({ id: 'a', order: 0 }), action({ id: 'b', order: 1 })],
    });

    const run = await service.execute(created.id, 'user-1');

    expect(dispatched).toEqual(['a', 'b']);
    expect(run.status).toBe('completed');
    expect(run.currentStep).toBe(2);
    expect(run.checkpoints).toHaveLength(2);
    expect(run.checkpoints.every((c) => c.status === 'completed')).toBe(true);

    const after = await service.get(created.id, 'user-1');
    expect(after.executionCount).toBe(1);
    expect(after.lastExecuted).toBeTruthy();
  });

  it('stops at the first failing step and marks the run failed', async () => {
    const dispatcher: ActionDispatcher = {
      async dispatch(a) {
        if (a.id === 'b') return { success: false, error: 'boom' };
        return { success: true };
      },
    };
    const service = new AutomationService(prisma, dispatcher);
    const created = await service.create('user-1', {
      name: 'Failing',
      trigger: manualTrigger,
      actions: [
        action({ id: 'a', order: 0 }),
        action({ id: 'b', order: 1 }),
        action({ id: 'c', order: 2 }),
      ],
    });

    const run = await service.execute(created.id, 'user-1');
    expect(run.status).toBe('failed');
    expect(run.error).toContain('boom');
    expect(run.checkpoints).toHaveLength(2); // a completed, b failed; c never ran
    expect(run.checkpoints[1]!.status).toBe('failed');
  });

  it('records steps as failed when no dispatcher is configured (no fabrication)', async () => {
    const service = new AutomationService(prisma); // no dispatcher
    const created = await service.create('user-1', {
      name: 'Undispatched',
      trigger: manualTrigger,
      actions: [action({ id: 'a' })],
    });
    const run = await service.execute(created.id, 'user-1');
    expect(run.status).toBe('failed');
    expect(run.checkpoints[0]!.error).toContain('NO_DISPATCHER');
  });

  it('refuses to execute an inactive automation', async () => {
    const service = new AutomationService(prisma, {
      async dispatch() {
        return { success: true };
      },
    });
    const created = await service.create('user-1', {
      name: 'Inactive',
      trigger: manualTrigger,
      actions: [action()],
      isActive: false,
    });
    await expect(service.execute(created.id, 'user-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('retries a failing step when retryOnFail is set', async () => {
    let calls = 0;
    const dispatcher: ActionDispatcher = {
      async dispatch() {
        calls += 1;
        return calls >= 2 ? { success: true } : { success: false, error: 'transient' };
      },
    };
    const service = new AutomationService(prisma, dispatcher);
    const created = await service.create('user-1', {
      name: 'Retry',
      trigger: manualTrigger,
      actions: [action({ id: 'a', retryOnFail: true })],
    });
    const run = await service.execute(created.id, 'user-1');
    expect(calls).toBe(2);
    expect(run.status).toBe('completed');
  });
});
