// ============================================================================
// Quanty mail tools — unit tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '@quant/ai';
import type { AssistantContext } from '@quant/ai';
import {
  buildQuantyMailTools,
  type QuantyMailTool,
  type QuantyMailToolsDeps,
  type MailAuditEntry,
} from '../services/quanty-agent/tools/mail-tools';
import {
  buildQuantyMailToolRegistry,
  registerQuantyMailTools,
} from '../services/quanty-agent/tool-registry';

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';

function makeContext(userId = USER_ID): AssistantContext {
  return {
    userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: {},
  };
}

function makeDeps(overrides: Partial<QuantyMailToolsDeps> = {}): QuantyMailToolsDeps & {
  prisma: any;
  emailService: any;
  threadService: any;
  auditLog: MailAuditEntry[];
} {
  const auditLog: MailAuditEntry[] = [];
  return {
    prisma: {
      emailFolder: { findFirst: vi.fn(), create: vi.fn() },
      email: { updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    },
    emailService: {
      search: vi.fn(),
      batchArchive: vi.fn(),
      batchStar: vi.fn(),
      batchMarkRead: vi.fn(),
      batchDelete: vi.fn(),
      sendEmail: vi.fn(),
      compose: vi.fn(),
    },
    threadService: {
      getThread: vi.fn(),
      snoozeThread: vi.fn(),
    },
    summarizeService: null,
    audit: (entry: MailAuditEntry) => {
      auditLog.push(entry);
    },
    auditLog,
    ...overrides,
  } as any;
}

const THREAD_ID = 'thread-1';
const EMAIL_IDS = ['email-1', 'email-2'];

function mockThread(threadService: any, emails = EMAIL_IDS) {
  threadService.getThread.mockResolvedValue({
    id: THREAD_ID,
    userId: USER_ID,
    emails: emails.map((id, i) => ({
      id,
      subject: `Subject ${i}`,
      fromName: 'Alice',
      fromAddress: 'alice@test.com',
      bodyPlain: `Body ${i}`,
      isRead: i === 0,
    })),
    unreadCount: 1,
  });
}

describe('quanty mail tools', () => {
  let deps: ReturnType<typeof makeDeps>;
  let tools: QuantyMailTool[];
  let byName: Map<string, QuantyMailTool>;

  beforeEach(() => {
    deps = makeDeps();
    tools = buildQuantyMailTools(deps);
    byName = new Map(tools.map((t) => [t.name, t]));
    mockThread(deps.threadService);
  });

  it('exposes exactly the 12 mail tools', () => {
    expect(tools).toHaveLength(12);
    for (const name of [
      'search_emails',
      'archive_thread',
      'unarchive_thread',
      'star_thread',
      'pin_thread',
      'mark_read',
      'delete_thread',
      'snooze_thread',
      'send_email',
      'create_draft',
      'summarize_thread',
      'list_unread',
    ]) {
      expect(byName.has(name), `missing tool ${name}`).toBe(true);
    }
  });

  it('marks safety flags correctly', () => {
    expect(byName.get('search_emails')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('summarize_thread')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('list_unread')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('archive_thread')).toMatchObject({ destructive: false, reversible: true });
    expect(byName.get('delete_thread')).toMatchObject({ destructive: true, reversible: true, requiresConfirmation: true });
    expect(byName.get('send_email')).toMatchObject({ destructive: true, reversible: false, requiresConfirmation: true });
    expect(byName.get('create_draft')).toMatchObject({ destructive: false, reversible: true, requiresConfirmation: false });
  });

  it('search_emails returns thread rows and scopes by userId', async () => {
    deps.emailService.search.mockResolvedValue({
      data: [
        { id: 'e1', threadId: 't1', subject: 'Hello', fromName: 'Bob', fromAddress: 'b@t.com', bodyPlain: 'hi there', receivedAt: new Date('2026-10-01') },
        { id: 'e2', threadId: 't1', subject: 'Hello', fromName: 'Bob', fromAddress: 'b@t.com', bodyPlain: 'follow up', receivedAt: new Date('2026-10-02') },
      ],
      total: 2,
    });
    const res = await byName.get('search_emails')!.handler({ query: 'hello' }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.emailService.search).toHaveBeenCalledWith(USER_ID, 'hello', { pageSize: 10 });
    const threads = (res.data as any).threads;
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ threadId: 't1', subject: 'Hello', from: 'Bob', messageCount: 2 });
  });

  it('search_emails requires a query', async () => {
    const res = await byName.get('search_emails')!.handler({}, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toContain('query');
  });

  it('archive_thread archives via EmailService with the Archive folder', async () => {
    deps.prisma.emailFolder.findFirst.mockResolvedValue({ id: 'folder-archive' });
    deps.emailService.batchArchive.mockResolvedValue({ count: 2 });
    const res = await byName.get('archive_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.emailService.batchArchive).toHaveBeenCalledWith(EMAIL_IDS, 'folder-archive', USER_ID);
    expect((res.data as any).archivedMessages).toBe(2);
  });

  it('unarchive_thread moves messages back to the Inbox folder', async () => {
    deps.prisma.emailFolder.findFirst.mockResolvedValue({ id: 'folder-inbox' });
    deps.prisma.email.updateMany.mockResolvedValue({ count: 2 });
    const res = await byName.get('unarchive_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.prisma.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) }),
    );
  });

  it('star_thread stars and unstars', async () => {
    deps.emailService.batchStar.mockResolvedValue({ count: 2 });
    const starred = await byName.get('star_thread')!.handler({ threadId: THREAD_ID, starred: true }, makeContext());
    expect(starred.success).toBe(true);
    expect(deps.emailService.batchStar).toHaveBeenCalledWith(EMAIL_IDS, USER_ID, true);
    const unstarred = await byName.get('star_thread')!.handler({ threadId: THREAD_ID, starred: false }, makeContext());
    expect(deps.emailService.batchStar).toHaveBeenCalledWith(EMAIL_IDS, USER_ID, false);
    expect(unstarred.success).toBe(true);
  });

  it('pin_thread pins with a userId-scoped update', async () => {
    deps.prisma.email.updateMany.mockResolvedValue({ count: 2 });
    const res = await byName.get('pin_thread')!.handler({ threadId: THREAD_ID, pinned: true }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.prisma.email.updateMany).toHaveBeenCalledWith(
      { where: { threadId: THREAD_ID, userId: USER_ID, deletedAt: null }, data: expect.objectContaining({ isPinned: true }) },
    );
  });

  it('mark_read marks all thread messages read', async () => {
    deps.emailService.batchMarkRead.mockResolvedValue({ count: 1 });
    const res = await byName.get('mark_read')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.emailService.batchMarkRead).toHaveBeenCalledWith(EMAIL_IDS, USER_ID, true);
  });

  it('delete_thread trashes (soft delete, reversible)', async () => {
    deps.emailService.batchDelete.mockResolvedValue({ count: 2 });
    const res = await byName.get('delete_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect(deps.emailService.batchDelete).toHaveBeenCalledWith(EMAIL_IDS, USER_ID, false);
  });

  it('snooze_thread snoozes until the given timestamp', async () => {
    deps.threadService.snoozeThread.mockResolvedValue({ snoozedUntil: '2026-10-07T10:00:00.000Z' });
    const res = await byName.get('snooze_thread')!.handler(
      { threadId: THREAD_ID, until: '2026-10-07T10:00:00.000Z' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.threadService.snoozeThread).toHaveBeenCalledWith(THREAD_ID, USER_ID, new Date('2026-10-07T10:00:00.000Z'));
  });

  it('snooze_thread rejects invalid timestamps', async () => {
    const res = await byName.get('snooze_thread')!.handler({ threadId: THREAD_ID, until: 'not-a-date' }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid');
  });

  it('send_email sends via EmailService with the Sent folder', async () => {
    deps.prisma.emailFolder.findFirst.mockResolvedValue({ id: 'folder-sent' });
    deps.emailService.sendEmail.mockResolvedValue({ id: 'sent-1' });
    const res = await byName.get('send_email')!.handler(
      { to: 'bob@test.com', subject: 'Hi', body: 'Hello Bob' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
      USER_ID,
      { toAddresses: ['bob@test.com'], subject: 'Hi', bodyPlain: 'Hello Bob', bodyHtml: 'Hello Bob' },
      'folder-sent',
    );
  });

  it('create_draft composes without sending', async () => {
    deps.emailService.compose.mockResolvedValue({ id: 'draft-1' });
    const res = await byName.get('create_draft')!.handler(
      { to: 'bob@test.com', subject: 'Hi', body: 'Hello Bob' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.emailService.compose).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, toAddresses: ['bob@test.com'] }),
    );
    expect(deps.emailService.sendEmail).not.toHaveBeenCalled();
    expect((res.data as any).draftId).toBe('draft-1');
  });

  it('summarize_thread uses the AI port when available', async () => {
    const summarizeService = {
      summarizeThread: vi.fn().mockResolvedValue({ summary: 'AI summary', keyPoints: ['p1'] }),
    };
    const d2 = makeDeps({ summarizeService });
    const t2 = new Map(buildQuantyMailTools(d2).map((t) => [t.name, t]));
    mockThread(d2.threadService);
    const res = await t2.get('summarize_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect(summarizeService.summarizeThread).toHaveBeenCalled();
    expect((res.data as any).summary).toBe('AI summary');
  });

  it('summarize_thread falls back to an honest extractive summary without AI', async () => {
    const res = await byName.get('summarize_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).extractive).toBe(true);
    expect((res.data as any).keyPoints.length).toBeGreaterThan(0);
  });

  it('list_unread returns threads plus the total count', async () => {
    deps.prisma.email.findMany.mockResolvedValue([
      { id: 'e1', threadId: 't1', subject: 'A', fromName: 'Ann', fromAddress: 'a@t.com', bodyPlain: 'x', receivedAt: new Date() },
      { id: 'e2', threadId: 't1', subject: 'A', fromName: 'Ann', fromAddress: 'a@t.com', bodyPlain: 'y', receivedAt: new Date() },
      { id: 'e3', threadId: 't2', subject: 'B', fromName: 'Ben', fromAddress: 'b@t.com', bodyPlain: 'z', receivedAt: new Date() },
    ]);
    deps.prisma.email.count.mockResolvedValue(3);
    const res = await byName.get('list_unread')!.handler({}, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).totalUnread).toBe(3);
    const threads = (res.data as any).threads;
    expect(threads).toHaveLength(2);
    expect(threads[0]).toMatchObject({ threadId: 't1', unreadCount: 2 });
    expect(deps.prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID, isRead: false }) }),
    );
  });

  it('rejects when the agent context has no userId', async () => {
    const res = await byName.get('search_emails')!.handler({ query: 'x' }, makeContext(''));
    expect(res.success).toBe(false);
    expect(deps.emailService.search).not.toHaveBeenCalled();
  });

  it('returns failure (not throw) when a service throws, and audits it', async () => {
    deps.emailService.batchArchive.mockRejectedValue(new Error('DB down'));
    deps.prisma.emailFolder.findFirst.mockResolvedValue({ id: 'folder-archive' });
    const res = await byName.get('archive_thread')!.handler({ threadId: THREAD_ID }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toBe('DB down');
    const last = deps.auditLog[deps.auditLog.length - 1];
    expect(last).toMatchObject({ tool: 'archive_thread', userId: USER_ID, success: false, error: 'DB down' });
  });

  it('audits successful invocations with sanitized args', async () => {
    deps.prisma.emailFolder.findFirst.mockResolvedValue({ id: 'folder-sent' });
    deps.emailService.sendEmail.mockResolvedValue({ id: 'sent-1' });
    const longBody = 'x'.repeat(500);
    await byName.get('send_email')!.handler({ to: 'b@t.com', subject: 's', body: longBody }, makeContext());
    const last = deps.auditLog[deps.auditLog.length - 1];
    expect(last).toMatchObject({ tool: 'send_email', userId: USER_ID, success: true });
    expect(String(last.args['body'])).toContain('[truncated]');
    expect(String(last.args['body']).length).toBeLessThan(longBody.length);
  });

  it('never passes another user\'s id to services', async () => {
    deps.emailService.batchMarkRead.mockResolvedValue({ count: 0 });
    await byName.get('mark_read')!.handler({ threadId: THREAD_ID }, makeContext(OTHER_USER));
    expect(deps.threadService.getThread).toHaveBeenCalledWith(THREAD_ID, OTHER_USER);
    expect(deps.emailService.batchMarkRead).toHaveBeenCalledWith(EMAIL_IDS, OTHER_USER, true);
  });
});

describe('quanty mail tool registry', () => {
  it('buildQuantyMailToolRegistry registers all 12 tools under quantmail', () => {
    const deps = makeDeps();
    const registry = buildQuantyMailToolRegistry(deps);
    const tools = registry.getToolsForApp('quantmail');
    expect(tools).toHaveLength(12);
    expect(registry.findTool('quantmail', 'send_email')?.name).toBe('send_email');
  });

  it('registerQuantyMailTools adds to an existing registry', () => {
    const deps = makeDeps();
    const registry = new ToolRegistry();
    registerQuantyMailTools(registry, deps);
    expect(registry.getToolsForApp('quantmail')).toHaveLength(12);
    expect(registry.getAllTools()).toHaveLength(12);
  });

  it('generates prompt descriptions for the LLM', () => {
    const deps = makeDeps();
    const registry = buildQuantyMailToolRegistry(deps);
    const prompt = registry.getToolDescriptionsForPrompt();
    expect(prompt).toContain('search_emails');
    expect(prompt).toContain('send_email');
    expect(prompt).toContain('[quantmail]');
  });
});
