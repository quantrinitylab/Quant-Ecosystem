import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QuantyExecutor,
  InMemoryTaskStore,
  createTask,
  MAX_STEPS_PER_TASK,
} from '../services/quanty-agent/executor';
import {
  clearTools,
  registerTool,
} from '../services/quanty-agent/tool-registry';
import type {
  QuantyAuditEntry,
  QuantyExecutorCallbacks,
  QuantyProgressEvent,
  QuantyStep,
  QuantyTask,
} from '../services/quanty-agent/types';

function step(toolName: string, label = toolName): QuantyStep {
  return { id: `step-${toolName}-${Math.random().toString(36).slice(2, 8)}`, toolName, label, args: {}, status: 'pending' };
}

function harness() {
  const events: QuantyProgressEvent[] = [];
  const audits: QuantyAuditEntry[] = [];
  const cb: QuantyExecutorCallbacks = {
    onEvent: (e) => events.push(e),
    onAudit: (a) => audits.push(a),
  };
  return { events, audits, cb };
}

describe('quanty-agent executor', () => {
  beforeEach(() => {
    clearTools();
    registerTool({
      name: 'test.echo',
      app: 'core',
      description: 'echo',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async (args) => ({ ok: true, summary: `echoed`, data: { args } }),
    });
    registerTool({
      name: 'test.boom',
      app: 'core',
      description: 'fails',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async () => ({ ok: false, summary: 'kaboom' }),
    });
    registerTool({
      name: 'test.nuke',
      app: 'core',
      description: 'destructive',
      parameters: {},
      destructive: true,
      reversible: false,
      handler: async () => ({ ok: true, summary: 'nuked' }),
    });
    registerTool({
      name: 'test.slow',
      app: 'core',
      description: 'slow',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async (_args, ctx) => {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 50);
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          });
        });
        return { ok: true, summary: 'slow done' };
      },
    });
  });

  it('runs steps sequentially and marks the task done', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { events, audits, cb } = harness();
    const task = createTask('u1', 'do it', 'plan', [step('test.echo'), step('test.echo')]);

    const done = await ex.run(task, null, cb);

    expect(done.status).toBe('done');
    expect(done.steps.every((s) => s.status === 'done')).toBe(true);
    expect(events.filter((e) => e.type === 'step.start')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'step.done')).toHaveLength(2);
    expect(events.some((e) => e.type === 'task.done')).toBe(true);
    expect(audits.map((a) => a.kind)).toContain('task.done');
    // persisted
    expect((await store.get(task.id))?.status).toBe('done');
  });

  it('fails the task when a tool reports failure', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { events, cb } = harness();
    const task = createTask('u1', 'do it', 'plan', [step('test.echo'), step('test.boom'), step('test.echo')]);

    const done = await ex.run(task, null, cb);

    expect(done.status).toBe('failed');
    expect(done.steps[0].status).toBe('done');
    expect(done.steps[1].status).toBe('failed');
    expect(done.steps[1].error).toContain('kaboom');
    expect(done.steps[2].status).toBe('pending'); // never ran
    expect(events.some((e) => e.type === 'task.failed')).toBe(true);
  });

  it('fails fast on unknown tools', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { cb } = harness();
    const task = createTask('u1', 'do it', 'plan', [step('nope.missing')]);

    const done = await ex.run(task, null, cb);
    expect(done.status).toBe('failed');
    expect(done.steps[0].error).toContain('Unknown tool');
  });

  it('pauses for confirmation on destructive tools and resumes on approve', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { events, cb } = harness();
    const task = createTask('u1', 'nuke it', 'plan', [step('test.nuke')]);

    const runPromise = ex.run(task, null, cb);
    // wait until the executor is waiting for confirmation
    await vi.waitFor(async () => {
      const t = await store.get(task.id);
      expect(t?.status).toBe('waiting-confirm');
    });
    expect(events.some((e) => e.type === 'waiting-confirm')).toBe(true);

    expect(await ex.confirm(task.id, true)).toBe(true);
    const done = await runPromise;
    expect(done.status).toBe('done');
    expect(done.steps[0].status).toBe('done');
  });

  it('skips the destructive step when confirmation is denied', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { cb } = harness();
    const task = createTask('u1', 'nuke it', 'plan', [step('test.nuke')]);

    const runPromise = ex.run(task, null, cb);
    await vi.waitFor(async () => {
      const t = await store.get(task.id);
      expect(t?.status).toBe('waiting-confirm');
    });
    await ex.confirm(task.id, false);
    const done = await runPromise;
    expect(done.status).toBe('done');
    expect(done.steps[0].status).toBe('skipped');
    expect(done.outcome).toContain('skipped');
  });

  it('interrupt() cancels a running task', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { events, cb } = harness();
    const task = createTask('u1', 'slow', 'plan', [step('test.slow'), step('test.echo')]);

    const runPromise = ex.run(task, null, cb);
    await new Promise((r) => setTimeout(r, 10));
    expect(await ex.interrupt(task.id)).toBe(true);
    const done = await runPromise;

    expect(done.status).toBe('interrupted');
    expect(events.some((e) => e.type === 'task.interrupted')).toBe(true);
    expect(await ex.interrupt(task.id)).toBe(false); // already finished
  });

  it('rejects tasks exceeding the max step count', async () => {
    const store = new InMemoryTaskStore();
    const ex = new QuantyExecutor({ store });
    const { cb } = harness();
    const steps = Array.from({ length: MAX_STEPS_PER_TASK + 1 }, (_, i) => step(`test.echo`, `s${i}`));
    const task = createTask('u1', 'too many', 'plan', steps);

    const done = await ex.run(task, null, cb);
    expect(done.status).toBe('failed');
    expect(done.outcome).toContain('max steps');
  });

  it('InMemoryTaskStore lists tasks by user, newest first', async () => {
    const store = new InMemoryTaskStore();
    const t1 = createTask('u1', 'a', 'p', []);
    await new Promise((r) => setTimeout(r, 5));
    const t2 = createTask('u1', 'b', 'p', []);
    const t3 = createTask('u2', 'c', 'p', []);
    await store.save(t1);
    await store.save(t2);
    await store.save(t3);

    const list = await store.listByUser('u1');
    expect(list.map((t) => t.command)).toEqual(['b', 'a']);
    expect(await store.get('missing')).toBeNull();
  });
});
