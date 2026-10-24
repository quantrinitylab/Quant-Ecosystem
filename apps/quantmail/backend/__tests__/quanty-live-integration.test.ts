// ============================================================================
// Quanty live integration — composites, undo, popup data
// ============================================================================
//
// Tests the wiring this integration PR adds on top of the four merged
// branches: real composite tools, the undo flow, and the popup dashboard
// data builder. All services are mocked; what is asserted is the WIRING
// (real tools compose real primitives, inverses run, empty states are
// honest) — not the underlying mail/git implementations (covered by their
// own suites).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearTools,
  getTool,
  registerRealTools,
  registerTool,
} from '../services/quanty-agent/tool-registry';
import { undoTaskSteps } from '../services/quanty-agent/undo';
import { buildPopupData, buildActivityFeed } from '../services/quanty-agent/popup-data';
import { InMemoryTaskStore, createTask, QuantyExecutor } from '../services/quanty-agent/executor';
import type { QuantyMailToolsDeps } from '../services/quanty-agent/tools/mail-tools';
import type { QuantyTask, QuantyToolContext } from '../services/quanty-agent/types';

const USER_ID = 'user-1';

function threadRow(threadId: string, subject: string) {
  return {
    id: `email-${threadId}`,
    threadId,
    subject,
    fromName: 'Boss',
    fromAddress: 'boss@example.com',
    bodyPlain: 'please review',
    receivedAt: new Date(),
  };
}

function mockDeps(unreadRows: Array<{ threadId: string; subject: string }> = []): QuantyMailToolsDeps & {
  emailService: any;
  threadService: any;
  prisma: any;
} {
  return {
    prisma: {
      emailFolder: { findFirst: vi.fn().mockResolvedValue({ id: 'folder-archive' }), create: vi.fn() },
      email: {
        findMany: vi.fn().mockResolvedValue(unreadRows.map((r) => threadRow(r.threadId, r.subject))),
        count: vi.fn().mockResolvedValue(unreadRows.length),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    } as any,
    emailService: {
      search: vi.fn(),
      batchArchive: vi.fn().mockImplementation(async (ids: string[]) => ({ count: ids.length })),
      batchStar: vi.fn().mockImplementation(async (ids: string[]) => ({ count: ids.length })),
      batchMarkRead: vi.fn().mockImplementation(async (ids: string[]) => ({ count: ids.length })),
      batchDelete: vi.fn(),
      sendEmail: vi.fn(),
      compose: vi.fn(),
    } as any,
    threadService: {
      getThread: vi.fn().mockImplementation(async (threadId: string) => ({
        id: threadId,
        userId: USER_ID,
        emails: [{ id: `e-${threadId}-1` }, { id: `e-${threadId}-2` }],
      })),
      snoozeThread: vi.fn(),
    } as any,
    summarizeService: null,
  };
}

function ctx(): QuantyToolContext {
  return {
    userId: USER_ID,
    taskId: 'task-1',
    prisma: null,
    signal: new AbortController().signal,
    audit: () => {},
  };
}

describe('quanty composite mail tools (real, wired)', () => {
  beforeEach(() => {
    clearTools();
  });

  it('mail.archiveUnread archives every unread thread and returns an undoToken', async () => {
    const deps = mockDeps([
      { threadId: 't1', subject: 'hello' },
      { threadId: 't2', subject: 'world' },
    ]);
    registerRealTools(deps);
    const tool = getTool('mail.archiveUnread')!;
    const res = await tool.handler({ limit: 20 }, ctx());
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('2');
    expect(deps.emailService.batchArchive).toHaveBeenCalledTimes(2);
    expect(res.undoToken).toEqual({ threadIds: ['t1', 't2'] });
    expect(res.reversible).toBe(true);
  });

  it('mail.archiveUnread is honest when the inbox is already empty', async () => {
    const deps = mockDeps([]);
    registerRealTools(deps);
    const tool = getTool('mail.archiveUnread')!;
    const res = await tool.handler({}, ctx());
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/no unread/i);
    expect(deps.emailService.batchArchive).not.toHaveBeenCalled();
    expect(res.reversible).toBe(false);
  });

  it('mail.starImportant stars only keyword-matching threads', async () => {
    const deps = mockDeps([
      { threadId: 't1', subject: 'Urgent: deploy tonight' },
      { threadId: 't2', subject: 'lunch plans' },
    ]);
    registerRealTools(deps);
    const tool = getTool('mail.starImportant')!;
    const res = await tool.handler({ limit: 10 }, ctx());
    expect(res.ok).toBe(true);
    expect(deps.emailService.batchStar).toHaveBeenCalledTimes(1);
    expect(deps.emailService.batchStar).toHaveBeenCalledWith(
      expect.arrayContaining(['e-t1-1']),
      USER_ID,
      true,
    );
    expect(res.undoToken).toEqual({ threadIds: ['t1'] });
  });

  it('mail.markAllRead marks every unread thread read', async () => {
    const deps = mockDeps([{ threadId: 't1', subject: 'a' }]);
    registerRealTools(deps);
    const tool = getTool('mail.markAllRead')!;
    const res = await tool.handler({}, ctx());
    expect(res.ok).toBe(true);
    expect(deps.emailService.batchMarkRead).toHaveBeenCalledTimes(1);
    // No "mark unread" primitive exists — the tool is honest about that.
    expect(res.reversible).toBe(false);
  });

  it('mail.summarizeLatest is honest on an empty inbox', async () => {
    const deps = mockDeps([]);
    registerRealTools(deps);
    const tool = getTool('mail.summarizeLatest')!;
    const res = await tool.handler({}, ctx());
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/nothing to summarize/i);
  });

  it('mail.deleteSpam is destructive (executor will ask for confirmation)', () => {
    registerRealTools(mockDeps([]));
    const tool = getTool('mail.deleteSpam')!;
    expect(tool.destructive).toBe(true);
  });
});

describe('quanty undo', () => {
  beforeEach(() => {
    clearTools();
  });

  it('reverses an archived task via unarchiveThread', async () => {
    const deps = mockDeps([]);
    registerRealTools(deps);
    const task = {
      id: 'task-1',
      userId: USER_ID,
      steps: [
        {
          id: 's1',
          toolName: 'mail.archiveUnread',
          label: 'Archiving unread emails',
          args: {},
          status: 'done' as const,
          reversible: true,
          undoToken: { threadIds: ['t1', 't2'] },
        },
      ],
    } as unknown as QuantyTask;

    const outcome = await undoTaskSteps(task, ctx);
    expect(outcome.undone).toBe(2);
    expect(deps.emailService.batchArchive).not.toHaveBeenCalled();
    // unarchive goes through the same userId-scoped thread path
    expect(deps.threadService.getThread).toHaveBeenCalledWith('t1', USER_ID);
    expect(deps.threadService.getThread).toHaveBeenCalledWith('t2', USER_ID);
  });

  it('returns undone: 0 when nothing is reversible (honest, caller 409s)', async () => {
    registerRealTools(mockDeps([]));
    const task = {
      id: 'task-2',
      userId: USER_ID,
      steps: [
        {
          id: 's1',
          toolName: 'mail.markAllRead',
          label: 'Marking everything as read',
          args: {},
          status: 'done' as const,
          reversible: false,
        },
      ],
    } as unknown as QuantyTask;

    const outcome = await undoTaskSteps(task, ctx);
    expect(outcome.undone).toBe(0);
    expect(outcome.details).toEqual([]);
  });
});

describe('quanty popup data', () => {
  it('buildActivityFeed groups finished tasks honestly', () => {
    const now = new Date().toISOString();
    const tasks = [
      { id: 'a', userId: USER_ID, command: 'archive unread', status: 'done', outcome: 'ok', planSummary: 'x', steps: [{ toolName: 'mail.archiveUnread' }], updatedAt: now },
      { id: 'b', userId: USER_ID, command: 'running job', status: 'running', planSummary: 'x', steps: [], updatedAt: now },
    ] as unknown as QuantyTask[];
    const feed = buildActivityFeed(tasks, (name) => (name === 'mail.archiveUnread' ? 'mail' : undefined));
    expect(feed.today).toHaveLength(1);
    expect(feed.today[0].title).toBe('archive unread');
    expect(feed.today[0].icon).toBe('📧');
    expect(feed.yesterday).toHaveLength(0);
    expect(feed.older).toHaveLength(0);
  });

  it('buildPopupData returns honest empty states when nothing happened yet', async () => {
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => undefined,
    });
    expect(data.activity).toEqual({ today: [], yesterday: [], older: [] });
    expect(data.approvals).toEqual([]);
    expect(data.browserTasks).toEqual([]);
    expect(data.schedule.daily.length).toBeGreaterThan(0); // real seeded crons
    expect(data.identity.soul.title).toBeTruthy();
    expect(data.status.status).toBe('idle');
  });

  it('buildPopupData never shows another user\'s live run in your popup status', async () => {
    clearTools();
    registerTool({
      name: 'test.slow',
      app: 'core',
      description: 'slow work',
      parameters: {},
      destructive: false,
      reversible: false,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 400));
        return { ok: true, summary: 'worked' };
      },
    });
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    const other = createTask('other-user', 'secret work', 'Other user plan summary', [
      { id: 's1', toolName: 'test.slow', label: 'Other user step label', args: {}, status: 'pending' },
    ]);
    const runPromise = executor.run(other, null, { onEvent: () => {}, onAudit: () => {} });
    await vi.waitFor(() => expect(executor.liveStatus('other-user').status).toBe('is working'));
    // The owner still sees their own run; the caller sees honest idle.
    // (Poll: the run registers before its step label is set.)
    await vi.waitFor(() => expect(executor.liveStatus('other-user').detail).toBe('Other user step label'));
    const ownerData = await buildPopupData({
      userId: 'other-user',
      store,
      executor,
      toolAppOf: () => undefined,
    });
    expect(ownerData.status.status).toBe('is working');
    expect(ownerData.status.detail).toBe('Other user step label');
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => undefined,
    });
    expect(data.status).toEqual({ status: 'idle', detail: 'Waiting for your command' });
    await runPromise;
  });

  it('buildPopupData surfaces real task history after a task runs', async () => {
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    const task = createTask(USER_ID, 'archive unread', 'Archive all unread emails', []);
    task.status = 'done';
    task.outcome = 'Archived 2 threads.';
    await store.save(task);
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => 'mail',
    });
    expect(data.activity.today).toHaveLength(1);
    expect(data.activity.today[0].description).toBe('Archived 2 threads.');
  });

  it('buildPopupData serves approvals from the durable per-user log when the durable DB is present', async () => {
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    const grantedAt = new Date('2026-10-20T10:00:00.000Z');
    const prisma = {
      quantyTask: {},
      quantyTaskEvent: {},
      quantyApprovalRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'appr-1',
            userId: USER_ID,
            taskId: 'task-9',
            toolName: 'mail.send',
            label: 'Send email to boss',
            scope: 'mail.send',
            grantedAt,
          },
        ]),
      },
      idempotencyOperation: {},
    };
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => undefined,
      prisma,
    });
    // Served per-user from the durable log, never the process-global list.
    expect(prisma.quantyApprovalRecord.findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { grantedAt: 'desc' },
      take: 50,
    });
    expect(data.approvals).toEqual([
      {
        id: 'appr-1',
        icon: '⚠️',
        title: 'Approved: mail.send',
        description: 'Send email to boss',
        grantedAt: grantedAt.toISOString(),
        scope: 'mail.send',
      },
    ]);
  });

  it('buildPopupData falls back to the in-memory approval list when the durable DB is absent', async () => {
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    // Prisma mock without the durability delegates (route tests register with
    // an empty prisma mock) → honest degradation to the in-memory mirror.
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => undefined,
      prisma: {},
    });
    expect(data.approvals).toEqual([]);
  });

  it('buildPopupData degrades to the in-memory list when the durable read fails', async () => {
    const store = new InMemoryTaskStore();
    const executor = new QuantyExecutor({ store });
    const prisma = {
      quantyTask: {},
      quantyTaskEvent: {},
      quantyApprovalRecord: { findMany: vi.fn().mockRejectedValue(new Error('db down')) },
      idempotencyOperation: {},
    };
    const data = await buildPopupData({
      userId: USER_ID,
      store,
      executor,
      toolAppOf: () => undefined,
      prisma,
    });
    // A durable failure must not break the popup — honest degradation.
    expect(data.approvals).toEqual([]);
  });
});
