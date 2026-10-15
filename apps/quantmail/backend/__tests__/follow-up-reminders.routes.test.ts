// @vitest-environment node
// ============================================================================
// fix/qm-followup-reminders — follow-up reminder backend CRUD.
//
// The EmailFollowUpReminder component was dead code: "Set reminder" flipped
// local state and toasted, persisting nothing. These tests pin the real
// server-backed contract on a bare Fastify with the REAL route, the REAL
// error handler, and a mocked prisma delegate:
//
//   1. Unauthenticated requests are rejected (401), never persisting.
//   2. Invalid bodies are 400, not silent stores.
//   3. A remindAt in the past is 400 (the backend refuses time travel).
//   4. POST creates when nothing is active for the thread (201) and MOVES
//      the existing active row when one exists (200) — never stacks
//      duplicates for the same (user, thread).
//   5. GET returns only the caller's active (non-dismissed) reminders.
//   6. DELETE is tenant-walled (another user's row is 404, not a dismissal)
//      and soft-dismisses (dismissedAt), it does not hard-delete.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import followUpReminderRoutes from '../routes/follow-up-reminders';

function createMockPrisma() {
  return {
    followUpReminder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

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

async function buildApp(
  prisma: ReturnType<typeof createMockPrisma>,
  userId: string | null = 'user-1',
) {
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

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('follow-up-reminders routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    app = await buildApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated POST with 401', async () => {
    const unauth = await buildApp(prisma, null);
    try {
      const res = await unauth.inject({
        method: 'POST',
        url: '/follow-up-reminders',
        payload: { emailId: 'e1', remindAt: FUTURE },
      });
      expect(res.statusCode).toBe(401);
      expect(prisma.followUpReminder.create).not.toHaveBeenCalled();
    } finally {
      await unauth.close();
    }
  });

  it('rejects unauthenticated GET with 401', async () => {
    const unauth = await buildApp(prisma, null);
    try {
      const res = await unauth.inject({ method: 'GET', url: '/follow-up-reminders' });
      expect(res.statusCode).toBe(401);
    } finally {
      await unauth.close();
    }
  });

  it('rejects an invalid body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/follow-up-reminders',
      payload: { emailId: '', remindAt: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.followUpReminder.create).not.toHaveBeenCalled();
  });

  it('rejects a remindAt in the past with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/follow-up-reminders',
      payload: { emailId: 'e1', remindAt: PAST },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.followUpReminder.create).not.toHaveBeenCalled();
  });

  it('creates a new reminder (201) when none is active for the thread', async () => {
    prisma.followUpReminder.findFirst.mockResolvedValue(null);
    const created = makeReminder();
    prisma.followUpReminder.create.mockResolvedValue(created);

    const res = await app.inject({
      method: 'POST',
      url: '/follow-up-reminders',
      payload: { emailId: 'email-1', threadId: 'thread-1', subject: 'Q3 planning', remindAt: FUTURE },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.followUpReminder.create).toHaveBeenCalled();
    expect(res.json().data.id).toBe('rem-1');
  });

  it('moves the existing active reminder (200) instead of stacking a duplicate', async () => {
    const existing = makeReminder();
    prisma.followUpReminder.findFirst.mockResolvedValue(existing);
    const moved = makeReminder({ remindAt: new Date(FUTURE) });
    prisma.followUpReminder.update.mockResolvedValue(moved);

    const res = await app.inject({
      method: 'POST',
      url: '/follow-up-reminders',
      payload: { emailId: 'email-1', threadId: 'thread-1', remindAt: FUTURE },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.followUpReminder.create).not.toHaveBeenCalled();
    expect(prisma.followUpReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rem-1' } }),
    );
  });

  it('matches the existing reminder on emailId when no threadId is given', async () => {
    prisma.followUpReminder.findFirst.mockResolvedValue(makeReminder({ threadId: null }));
    prisma.followUpReminder.update.mockResolvedValue(makeReminder({ threadId: null }));

    const res = await app.inject({
      method: 'POST',
      url: '/follow-up-reminders',
      payload: { emailId: 'email-1', remindAt: FUTURE },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.followUpReminder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ emailId: 'email-1', threadId: null }),
      }),
    );
  });

  it('GET lists the caller\'s active reminders only', async () => {
    prisma.followUpReminder.findMany.mockResolvedValue([makeReminder()]);
    const res = await app.inject({ method: 'GET', url: '/follow-up-reminders' });
    expect(res.statusCode).toBe(200);
    expect(prisma.followUpReminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', dismissedAt: null },
        orderBy: { remindAt: 'asc' },
      }),
    );
    expect(res.json().data).toHaveLength(1);
  });

  it('DELETE is tenant-walled: another user\'s row is 404, not a dismissal', async () => {
    prisma.followUpReminder.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: 'DELETE', url: '/follow-up-reminders/rem-other' });
    expect(res.statusCode).toBe(404);
    expect(prisma.followUpReminder.update).not.toHaveBeenCalled();
  });

  it('DELETE soft-dismisses the caller\'s own reminder', async () => {
    prisma.followUpReminder.findFirst.mockResolvedValue(makeReminder());
    prisma.followUpReminder.update.mockResolvedValue(makeReminder({ dismissedAt: new Date() }));

    const res = await app.inject({ method: 'DELETE', url: '/follow-up-reminders/rem-1' });
    expect(res.statusCode).toBe(200);
    expect(prisma.followUpReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-1' },
        data: expect.objectContaining({ dismissedAt: expect.any(Date) }),
      }),
    );
    expect(res.json().data.message).toBe('Reminder dismissed');
  });
});
