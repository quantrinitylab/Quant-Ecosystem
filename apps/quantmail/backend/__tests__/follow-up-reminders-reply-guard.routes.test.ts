// @vitest-environment node
// ============================================================================
// fix/qm-followup-auto-dismiss-2 — delivery-time reply guard on
// GET /follow-up-reminders.
//
// Dismiss-on-reply in the ingest path resolves new replies, but rows can
// still be stale: reminders that predate the ingest hook, or rows written
// by importers that bypass ingest (imap-importer, mbox-parser). GET treats
// an ACTIVE row whose thread received an inbound reply (isSent: false)
// AFTER the reminder was set as resolved: it is skipped from the response
// and opportunistically dismissed so the People-home "Due reminders" strip
// and the thread banner never nudge about a replied thread.
//
// These tests pin the real route on a bare Fastify with a mocked prisma:
//
//   1. A row with an inbound reply after the reminder's createdAt is skipped
//      and followUpReminder.update is called (opportunistic dismiss).
//   2. A row whose thread's only inbound mail predates the reminder is kept.
//   3. A row with no inbound reply at all is kept.
//   4. Fail-open: an email-lookup fault keeps the row (no silent drop).
//   5. A legacy threadId-null row resolves the sent email's thread first.
//   6. A later SENT mail (isSent: true) is not a reply — the row is kept.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import followUpReminderRoutes from '../routes/follow-up-reminders';

interface ReminderArgs {
  where?: Record<string, unknown>;
  orderBy?: unknown;
}

interface EmailArgs {
  where?: {
    userId?: string;
    threadId?: string;
    id?: string;
    isSent?: boolean;
    receivedAt?: { gt: Date };
  };
}

function createMockPrisma() {
  return {
    followUpReminder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    email: {
      findFirst: vi.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

function makeReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rem-1',
    userId: 'user-1',
    emailId: 'email-1',
    threadId: 'thread-1',
    subject: 'Q3 planning',
    remindAt: new Date('2026-11-01T09:00:00Z'),
    dismissedAt: null,
    createdAt: new Date('2026-10-15T00:00:00Z'),
    ...overrides,
  };
}

async function buildApp(prisma: MockPrisma, userId: string | null = 'user-1') {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (request) => {
    if (userId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    }
  });
  app.decorate('prisma', prisma as unknown as never);
  await app.register(followUpReminderRoutes, { prefix: '/follow-up-reminders' });
  await app.ready();
  return app;
}

/** The reminder's row from makeReminder above. */
const REMINDER_CREATED = new Date('2026-10-15T00:00:00Z');

describe('GET /follow-up-reminders delivery-time reply guard', () => {
  let prisma: MockPrisma;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    app = await buildApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('skips a row with an inbound reply after the reminder was set, and dismisses it', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([makeReminder()]);
    // Inbound reply in the same thread, received after the reminder was set.
    prisma.email.findFirst.mockResolvedValue({
      id: 'email-2',
      isSent: false,
      receivedAt: new Date('2026-10-16T00:00:00Z'),
    });
    prisma.followUpReminder.update.mockResolvedValue({ id: 'rem-1' });

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    // Opportunistic dismiss so the row never resurfaces.
    expect(prisma.followUpReminder.update).toHaveBeenCalledWith({
      where: { id: 'rem-1' },
      data: { dismissedAt: expect.any(Date) },
    });
    // The reply probe is scoped: only inbound mail newer than the reminder.
    expect(prisma.email.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isSent: false,
        receivedAt: { gt: REMINDER_CREATED },
        threadId: 'thread-1',
      },
    });
  });

  it('keeps a row whose thread has no inbound reply at all', async () => {
    const reminder = makeReminder();
    prisma.followUpReminder.findMany.mockResolvedValue([reminder]);
    prisma.email.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].id).toBe('rem-1');
    expect(prisma.followUpReminder.update).not.toHaveBeenCalled();
  });

  it('keeps a row whose only inbound mail predates the reminder (user set it after seeing the reply)', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([makeReminder()]);
    // No inbound mail AFTER createdAt (2026-10-15): the older mail exists
    // but the user explicitly set the reminder later, so it stands.
    prisma.email.findFirst.mockResolvedValue(null);

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('fail-open: an email-lookup fault keeps the row instead of dropping it', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([makeReminder()]);
    prisma.email.findFirst.mockRejectedValue(new Error('DB down'));

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it('legacy threadId-null rows resolve the sent email\u2019s thread before probing for replies', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([
      makeReminder({ threadId: null, emailId: 'sent-9' }),
    ]);
    // First lookup: the sent email -> its thread. Second: the reply probe.
    prisma.email.findFirst
      .mockResolvedValueOnce({ id: 'sent-9', threadId: 'thread-9' })
      .mockResolvedValueOnce({
        id: 'email-10',
        isSent: false,
        receivedAt: new Date('2026-10-16T00:00:00Z'),
      });
    prisma.followUpReminder.update.mockResolvedValue({ id: 'rem-1' });

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(prisma.email.findFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: 'user-1', id: 'sent-9' },
    });
    expect(prisma.email.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        isSent: false,
        receivedAt: { gt: REMINDER_CREATED },
        threadId: 'thread-9',
      },
    });
  });

  it('a later SENT mail (isSent: true) is not a reply — the row is kept', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([makeReminder()]);
    // The probe only ever asks for isSent: false; a thread with only sent
    // mail returns null and the reminder stands.
    prisma.email.findFirst.mockImplementation(async (args: EmailArgs) => {
      expect(args.where?.isSent).toBe(false);
      return null;
    });

    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});
