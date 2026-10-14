// @vitest-environment node
// ============================================================================
// Guest notifications on event edit/delete (fix/qm-calendar-event-guest-notify).
//
// Regression pins: editing or deleting an event used to touch only prisma +
// the call-alert service — invitees silently missed moved/cancelled meetings.
// The handlers now send a real METHOD:REQUEST (update) / METHOD:CANCEL
// (cancellation) ICS email through SES and report the honest outcome as
// `guestNotification` in the response.
//
// HARNESS: the REAL calendarRoutes on a bare Fastify app (no prefix, like
// backend/app.ts) + the REAL error handler. Prisma is a spy object;
// ../lib/ses-sender is vi.mock'ed so no real email ever leaves the test.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';

const { sendViaSes, isSesConfigured } = vi.hoisted(() => ({
  sendViaSes: vi.fn().mockResolvedValue('ses-msg-id'),
  isSesConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/ses-sender', () => ({ sendViaSes, isSesConfigured }));

// Imported AFTER the mock so the route file picks up the mocked SES sender.
const { default: calendarRoutes } = await import('../routes/calendar');

const ORGANIZER_EMAIL = 'org@quantmail.in';
const GUEST_EMAIL = 'guest@example.com';

const ATTENDEES_JSON = JSON.stringify([
  { userId: '', email: GUEST_EMAIL, name: 'Guest', status: 'pending' },
  { userId: '', email: ORGANIZER_EMAIL, name: 'Org', status: 'accepted' },
]);

const ROW = {
  id: 'e1',
  userId: 'user-1',
  title: 'Design review',
  description: 'agenda lives in the doc',
  startTime: new Date('2026-09-10T09:00:00.000Z'),
  endTime: new Date('2026-09-10T10:00:00.000Z'),
  allDay: false,
  location: 'Meet',
  status: 'confirmed',
  attendees: ATTENDEES_JSON,
  reminders: '[]',
  recurrenceRule: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function fakePrisma() {
  const event = {
    findUnique: vi.fn().mockResolvedValue(ROW),
    findMany: vi.fn().mockResolvedValue([ROW]),
    create: vi.fn().mockResolvedValue(ROW),
    // Echo the write back into the returned row (minus the where clause), the
    // way a real Prisma update does — tests that write attendees: [] must see
    // a row with no attendees afterwards.
    update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...ROW, ...data })),
    delete: vi.fn().mockResolvedValue(ROW),
  };
  const txQueryRaw = vi.fn().mockResolvedValue([]);
  return {
    event,
    user: {
      findUnique: vi.fn().mockResolvedValue({ displayName: 'Org', email: ORGANIZER_EMAIL }),
    },
    calendar: {
      findMany: vi.fn().mockResolvedValue([{ id: 'cal-1', name: 'My Calendar' }]),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ $queryRaw: txQueryRaw, event }),
    ),
    __txQueryRaw: txQueryRaw,
  };
}

async function buildApp() {
  const prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(calendarRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  sendViaSes.mockClear();
  isSesConfigured.mockReturnValue(true);
});

describe('PUT /events/:id guest update notification', () => {
  it('sends a METHOD:REQUEST update email to guests (organizer excluded) when sendUpdate is true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Design review (moved)', sendUpdate: true },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    const opts = sendViaSes.mock.calls[0]![0];
    expect(opts.to).toEqual([GUEST_EMAIL]);
    expect(opts.subject).toContain('Updated');
    expect(opts.subject).toContain('Design review');
    expect(opts.attachments).toHaveLength(1);
    expect(opts.attachments[0].contentType).toContain('text/calendar');
    expect(String(opts.attachments[0].content)).toContain('METHOD:REQUEST');
    const body = res.json();
    expect(body.data.guestNotification).toMatchObject({ notified: true, count: 1, reason: 'sent' });
  });

  it('does not email guests when sendUpdate is not requested', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Design review (moved)' },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.guestNotification).toMatchObject({
      notified: false,
      reason: 'not-requested',
    });
  });

  it('reports no-guests honestly when the event has no attendees', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Solo work', attendees: [], sendUpdate: true },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.guestNotification).toMatchObject({
      notified: false,
      reason: 'no-guests',
    });
  });

  it('reports mail-not-configured honestly when SES is unavailable', async () => {
    isSesConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Design review (moved)', sendUpdate: true },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.guestNotification).toMatchObject({
      notified: false,
      reason: 'mail-not-configured',
    });
  });
});

describe('DELETE /events/:id guest cancellation notification', () => {
  it('sends a METHOD:CANCEL cancellation email to guests by default', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    const opts = sendViaSes.mock.calls[0]![0];
    expect(opts.to).toEqual([GUEST_EMAIL]);
    expect(opts.subject).toContain('Cancelled');
    expect(String(opts.attachments[0].content)).toContain('METHOD:CANCEL');
    expect(String(opts.attachments[0].content)).toContain('STATUS:CANCELLED');
    const body = res.json();
    expect(body.data.guestNotification).toMatchObject({ notified: true, count: 1, reason: 'sent' });
  });

  it('skips the cancellation email when notifyGuests=false (delete still succeeds)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/events/e1?notifyGuests=false' });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.guestNotification).toMatchObject({
      notified: false,
      reason: 'declined',
    });
  });

  it('still deletes when SES is unavailable, reporting honestly', async () => {
    isSesConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.guestNotification).toMatchObject({
      notified: false,
      reason: 'mail-not-configured',
    });
  });
});
