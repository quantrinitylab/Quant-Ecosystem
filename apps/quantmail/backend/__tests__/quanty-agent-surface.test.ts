import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSchedule,
  listScheduledTasks,
  registerScheduledTask,
  clearScheduledTasks,
} from '../services/quanty-agent/schedule-registry';
import { quantyAgentState } from '../services/quanty-agent/agent-state';
import {
  QuantyExecutor,
  InMemoryTaskStore,
  createTask,
} from '../services/quanty-agent/executor';
import { clearTools, registerTool } from '../services/quanty-agent/tool-registry';
import type { QuantyExecutorCallbacks, QuantyProgressEvent, QuantyAuditEntry } from '../services/quanty-agent/types';

describe('quanty-agent schedule-registry', () => {
  beforeEach(() => clearScheduledTasks());

  it('seeds the four real platform crons', () => {
    const tasks = listScheduledTasks();
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain('agent-coordination-watch');
    expect(ids).toContain('quant-deep-audit-daily');
    expect(ids).toContain('quant-deep-customer-audit');
    expect(ids).toContain('quantmail-weekly-health-check');
  });

  it('groups into daily / interval / weekly buckets', () => {
    const s = getSchedule();
    expect(s.daily.map((t) => t.id)).toEqual(['quant-deep-audit-daily']);
    expect(s.interval.map((t) => t.id).sort()).toEqual(
      ['agent-coordination-watch', 'quant-deep-customer-audit'].sort(),
    );
    expect(s.weekly.map((t) => t.id)).toEqual(['quantmail-weekly-health-check']);
  });

  it('exposes human schedule descriptions and next run times', () => {
    const s = getSchedule();
    expect(s.interval[0].schedule).toMatch(/Every/);
    expect(s.daily[0].schedule).toContain('09:41');
    for (const t of listScheduledTasks()) {
      expect(t.nextRunAt).toBeTruthy();
      expect(new Date(t.nextRunAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(t.enabled).toBe(true);
    }
  });

  it('registers extra tasks and rejects duplicates', () => {
    registerScheduledTask({ id: 'my-job', name: 'My Job', type: 'daily', schedule: 'Daily at 08:00' });
    expect(listScheduledTasks().some((t) => t.id === 'my-job')).toBe(true);
    expect(() =>
      registerScheduledTask({ id: 'my-job', name: 'Dup', type: 'daily', schedule: 'x' }),
    ).toThrow(/already registered/);
    expect(() =>
      registerScheduledTask({ id: 'agent-coordination-watch', name: 'Dup', type: 'interval', schedule: 'x' }),
    ).toThrow(/already registered/);
  });
});

describe('quanty-agent agent-state', () => {
  beforeEach(() => quantyAgentState.clear());

  it('logs and lists approvals newest-first', () => {
    quantyAgentState.logApproval({ icon: '⚠️', title: 'A1', description: 'd1', scope: 'This task only' });
    quantyAgentState.logApproval({ icon: '⚠️', title: 'A2', description: 'd2', scope: 'Site always allowed' });
    const list = quantyAgentState.listApprovals();
    expect(list.map((a) => a.title)).toEqual(['A2', 'A1']);
    expect(list[0].grantedAt).toBeTruthy();
    expect(list[0].id).toBeTruthy();
  });

  it('records and updates browser tasks', () => {
    const t = quantyAgentState.recordBrowserTask({ title: 'Research', url: 'https://example.com' });
    expect(t.status).toBe('running');
    const updated = quantyAgentState.updateBrowserTask(t.id, { status: 'done', thumbnailUrl: 'https://img/x.png' });
    expect(updated?.status).toBe('done');
    expect(updated?.thumbnailUrl).toBe('https://img/x.png');
    expect(quantyAgentState.updateBrowserTask('missing', { status: 'done' })).toBeNull();
  });

  it('returns placeholder identity cards', () => {
    const id = quantyAgentState.getIdentity();
    expect(id.soul.title).toBeTruthy();
    expect(id.memory.title).toBeTruthy();
    expect(id.soul.updatedAt).toBeTruthy();
  });
});

describe('quanty-agent executor live surface', () => {
  beforeEach(() => {
    clearTools();
    quantyAgentState.clear();
    registerTool({
      name: 'test.work',
      app: 'core',
      description: 'work',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 400));
        return { ok: true, summary: 'worked' };
      },
    });
    registerTool({
      name: 'test.nuke2',
      app: 'core',
      description: 'destructive',
      parameters: {},
      destructive: true,
      reversible: false,
      handler: async () => ({ ok: true, summary: 'nuked' }),
    });
  });

  function cb(): { events: QuantyProgressEvent[]; audits: QuantyAuditEntry[]; callbacks: QuantyExecutorCallbacks } {
    const events: QuantyProgressEvent[] = [];
    const audits: QuantyAuditEntry[] = [];
    return { events, audits, callbacks: { onEvent: (e) => events.push(e), onAudit: (a) => audits.push(a) } };
  }

  it('liveStatus reports idle when nothing runs', () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    expect(ex.liveStatus()).toEqual({ status: 'idle', detail: 'Waiting for your command' });
  });

  it('liveStatus reports the current step while working', async () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    const { callbacks } = cb();
    const task = createTask('u1', 'work', 'plan', [
      { id: 's1', toolName: 'test.work', label: 'Doing the work', args: {}, status: 'pending' },
    ]);
    const runPromise = ex.run(task, null, callbacks);
    await vi.waitFor(() => expect(ex.liveStatus().status).toBe('is working'));
    await vi.waitFor(() => expect(ex.liveStatus().detail).toBe('Doing the work'));
    await runPromise;
    expect(ex.liveStatus().status).toBe('idle');
  });

  it('confirm(true) logs an approval entry', async () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    const { callbacks } = cb();
    const task = createTask('u1', 'nuke', 'plan', [
      { id: 's1', toolName: 'test.nuke2', label: 'Nuking it', args: {}, status: 'pending' },
    ]);
    const runPromise = ex.run(task, null, callbacks);
    await vi.waitFor(async () => {
      // wait until waiting-confirm by polling liveStatus-independent state
      await new Promise((r) => setTimeout(r, 5));
      return true;
    });
    // give the executor a tick to reach the confirmation gate
    await new Promise((r) => setTimeout(r, 20));
    await ex.confirm(task.id, true);
    await runPromise;
    const approvals = quantyAgentState.listApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0].title).toContain('test.nuke2');
    expect(approvals[0].description).toBe('Nuking it');
  });

  it('confirm(false) logs no approval', async () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    const { callbacks } = cb();
    const task = createTask('u1', 'nuke', 'plan', [
      { id: 's1', toolName: 'test.nuke2', label: 'Nuking it', args: {}, status: 'pending' },
    ]);
    const runPromise = ex.run(task, null, callbacks);
    await new Promise((r) => setTimeout(r, 20));
    await ex.confirm(task.id, false);
    await runPromise;
    expect(quantyAgentState.listApprovals()).toHaveLength(0);
  });
});
