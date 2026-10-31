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
    const t = quantyAgentState.recordBrowserTask({ userId: 'user-1', title: 'Research', url: 'https://example.com' });
    expect(t.status).toBe('running');
    expect(t.userId).toBe('user-1');
    const updated = quantyAgentState.updateBrowserTask(t.id, 'user-1', { status: 'done', thumbnailUrl: 'https://img/x.png' });
    expect(updated?.status).toBe('done');
    expect(updated?.thumbnailUrl).toBe('https://img/x.png');
    expect(quantyAgentState.updateBrowserTask('missing', 'user-1', { status: 'done' })).toBeNull();
  });

  it('never leaks browser tasks across users: list, update, and browsing flag are owner-scoped', () => {
    // Distinct surfaced values per user so ANY leak is detectable on every field.
    const alice = quantyAgentState.recordBrowserTask({
      userId: 'alice',
      title: 'Alice secret research',
      url: 'https://alice-private.example/research',
      thumbnailUrl: 'https://img/alice-thumb.png',
    });
    quantyAgentState.recordBrowserTask({
      userId: 'bob',
      title: 'Bob secret research',
      url: 'https://bob-private.example/research',
      thumbnailUrl: 'https://img/bob-thumb.png',
    });
    const aliceDone = quantyAgentState.recordBrowserTask({
      userId: 'alice',
      title: 'Alice finished read',
      url: 'https://alice-private.example/done',
    });
    quantyAgentState.updateBrowserTask(aliceDone.id, 'alice', { status: 'done' });

    // Alice sees ONLY her own tasks — zero Bob influence on any surfaced field.
    const aliceList = quantyAgentState.listBrowserTasks('alice');
    expect(aliceList.map((t) => t.title).sort()).toEqual(['Alice finished read', 'Alice secret research'].sort());
    expect(aliceList.every((t) => t.userId === 'alice')).toBe(true);
    const aliceBlob = JSON.stringify(aliceList);
    expect(aliceBlob).not.toContain('Bob secret research');
    expect(aliceBlob).not.toContain('bob-private.example');
    expect(aliceBlob).not.toContain('bob-thumb.png');
    // Bob sees ONLY his own task, with its own running status.
    const bobList = quantyAgentState.listBrowserTasks('bob');
    expect(bobList).toHaveLength(1);
    expect(bobList[0].title).toBe('Bob secret research');
    expect(bobList[0].url).toBe('https://bob-private.example/research');
    expect(bobList[0].thumbnailUrl).toBe('https://img/bob-thumb.png');
    expect(bobList[0].status).toBe('running');
    const bobBlob = JSON.stringify(bobList);
    expect(bobBlob).not.toContain('Alice secret research');
    expect(bobBlob).not.toContain('alice-private.example');
    expect(bobBlob).not.toContain('alice-thumb.png');
    // A user with no tasks sees none — not a neighbour's list, not an error.
    expect(quantyAgentState.listBrowserTasks('carol')).toEqual([]);

    // Filter-before-limit: Bob's newer entries must not crowd Alice's out
    // of a small window (a slice-first implementation would return Bob's).
    expect(quantyAgentState.listBrowserTasks('alice', 1).map((t) => t.title)).toEqual(['Alice finished read']);

    // Browsing flag is owner-scoped: both owners browse, Carol does not.
    expect(quantyAgentState.hasRunningBrowserTask('alice')).toBe(true);
    expect(quantyAgentState.hasRunningBrowserTask('bob')).toBe(true);
    expect(quantyAgentState.hasRunningBrowserTask('carol')).toBe(false);
    // Finishing Alice's running task clears ONLY Alice's flag.
    quantyAgentState.updateBrowserTask(alice.id, 'alice', { status: 'done' });
    expect(quantyAgentState.hasRunningBrowserTask('alice')).toBe(false);
    expect(quantyAgentState.hasRunningBrowserTask('bob')).toBe(true);

    // Cross-user update is rejected AND leaves the owner's record untouched.
    const bobTask = quantyAgentState.listBrowserTasks('bob')[0];
    expect(quantyAgentState.updateBrowserTask(bobTask.id, 'alice', { status: 'done', title: 'Hijacked' })).toBeNull();
    const bobAfter = quantyAgentState.listBrowserTasks('bob')[0];
    expect(bobAfter.status).toBe('running');
    expect(bobAfter.title).toBe('Bob secret research');
    expect(bobAfter.thumbnailUrl).toBe('https://img/bob-thumb.png');
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
    expect(ex.liveStatus('u1')).toEqual({ status: 'idle', detail: 'Waiting for your command' });
  });

  it('liveStatus reports the current step while working', async () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    const { callbacks } = cb();
    const task = createTask('u1', 'work', 'plan', [
      { id: 's1', toolName: 'test.work', label: 'Doing the work', args: {}, status: 'pending' },
    ]);
    const runPromise = ex.run(task, null, callbacks);
    await vi.waitFor(() => expect(ex.liveStatus('u1').status).toBe('is working'));
    await vi.waitFor(() => expect(ex.liveStatus('u1').detail).toBe('Doing the work'));
    await runPromise;
    expect(ex.liveStatus('u1').status).toBe('idle');
  });

  it('liveStatus is scoped per user: another user\'s run never leaks into your popup', async () => {
    const ex = new QuantyExecutor({ store: new InMemoryTaskStore() });
    const { callbacks } = cb();
    const alice = createTask('alice', 'work', 'Alice plan summary', [
      { id: 's1', toolName: 'test.work', label: 'Alice step label', args: {}, status: 'pending' },
    ]);
    const bob = createTask('bob', 'work', 'Bob plan summary', [
      { id: 's1', toolName: 'test.work', label: 'Bob step label', args: {}, status: 'pending' },
    ]);
    const aliceRun = ex.run(alice, null, callbacks);
    const bobRun = ex.run(bob, null, callbacks);
    await vi.waitFor(() => expect(ex.liveStatus('alice').status).toBe('is working'));
    await vi.waitFor(() => expect(ex.liveStatus('bob').status).toBe('is working'));
    // Each caller sees ONLY their own run's step label — never the other's.
    // (Poll: the run registers before its step label is set, like the
    // existing 'current step while working' test.)
    await vi.waitFor(() => expect(ex.liveStatus('alice').detail).toBe('Alice step label'));
    await vi.waitFor(() => expect(ex.liveStatus('bob').detail).toBe('Bob step label'));
    // A third user with no run gets honest idle, even while both run.
    expect(ex.liveStatus('carol')).toEqual({ status: 'idle', detail: 'Waiting for your command' });
    await Promise.all([aliceRun, bobRun]);
    expect(ex.liveStatus('alice').status).toBe('idle');
    expect(ex.liveStatus('bob').status).toBe('idle');
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
