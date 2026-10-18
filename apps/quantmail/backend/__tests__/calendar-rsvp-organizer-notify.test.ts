// @vitest-environment node
// ============================================================================
// Organizer RSVP notifications (fix/qm-calendar-rsvp-organizer-notify).
//
// Regression pins: POST /events/:id/rsvp persisted the guest's
// accept/decline/tentative into the event attendee JSON and stopped there —
// the organizer was never told. The handler now emails the organizer a real
// notification through SES (Gmail parity: RSVP response emails) and reports
// the honest outcome as `rsvpNotification` in the response.
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
  attendees: JSON.stringify([
    { userId: 'user-2', email: GUEST_EMAIL, name: 'Guest', status: 'pending' },
  ]),
  reminders: '[]',
  recurrenceRule: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function fakePrisma() {
  const event = {
    findUnique: vi.fn().mockResolvedValue(ROW),
    findMany: vi.fn().mockResolvedValue([ROW]),
    create: vi.fn().mockImplementation(async ({ data }: any) => ({ ...ROW, ...data })),
    update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...ROW, ...data })),
    delete: vi.fn().mockResolvedValue(ROW),
  };
  const txQueryRaw = vi.fn().mockResolvedValue([]);
  return {
    event,
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === 'user-1') return { displayName: 'Org', email: ORGANIZER_EMAIL };
        if (where.id === 'user-2') return { email: GUEST_EMAIL };
        return null;
      }),
    },
    calendar: {
      findMany: vi.fn().mockResolvedValue([{ id: 'cal-1', name: 'My Calendar' }]),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ $queryRaw: txQueryRaw, event }),
    ),
  };
}

async function buildApp(authUserId: string) {
  const prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: authUserId };
  });
  await app.register(calendarRoutes);
  await app.ready();
  return { app, prisma };
}

beforeEach(() => {
  sendViaSes.mockClear();
  sendViaSes.mockResolvedValue('ses-msg-id');
  isSesConfigured.mockReturnValue(true);
});

describe('POST /events/:id/rsvp — organizer gets a real notification email', () => {
  it('emails the organizer when a guest accepts', async () => {
    const { app } = await buildApp('user-2');
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(200);
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    const opts = sendViaSes.mock.calls[0]![0];
    expect(opts.to).toEqual([ORGANIZER_EMAIL]);
    expect(opts.subject).toContain('Guest');
    expect(opts.subject).toContain('accepted');
    expect(opts.subject).toContain('Design review');
    expect(opts.replyTo).toBe(GUEST_EMAIL);
    // Never impersonate the guest — the guest's address is not a verified
    // SES identity. The mail goes out as the product identity.
    expect(String(opts.from)).toContain('no-reply@quantmail.in');
    expect(opts.bodyText).toContain('Design review');
    expect(res.json().data.rsvpNotification).toMatchObject({
      notified: true,
      count: 1,
      reason: 'sent',
    });
  });

  it('emails the organizer when a guest declines (and for tentative)', async () => {
    const { app } = await buildApp('user-2');
    const declined = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'declined' },
    });
    expect(declined.statusCode).toBe(200);
    expect(sendViaSes).toHaveBeenCalledTimes(1);
    expect(sendViaSes.mock.calls[0]![0].subject).toContain('declined');
    expect(declined.json().data.rsvpNotification).toMatchObject({ notified: true });

    sendViaSes.mockClear();
    const tentative = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'tentative' },
    });
    expect(tentative.statusCode).toBe(200);
    expect(sendViaSes.mock.calls[0]![0].subject).toContain('tentatively accepted');
    expect(tentative.json().data.rsvpNotification).toMatchObject({ notified: true });
  });

  it('does NOT email the organizer when the status is pending (not a response)', async () => {
    const { app } = await buildApp('user-2');
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'pending' },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.rsvpNotification).toMatchObject({
      notified: false,
      reason: 'not-a-response',
    });
  });

  it('does NOT email the organizer when the organizer RSVPs their own event', async () => {
    const { app } = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      // The organizer is not on the guest list in ROW, so they 403 here.
      // Patch the event row so the organizer is an attendee for this case.
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(403);

    // Rebuild with the organizer on the attendee list.
    const withOrgAttendee = {
      ...ROW,
      attendees: JSON.stringify([
        { userId: 'user-1', email: ORGANIZER_EMAIL, name: 'Org', status: 'pending' },
      ]),
    };
    const { app: app2, prisma: prisma2 } = await buildApp('user-1');
    prisma2.event.findUnique.mockResolvedValue(withOrgAttendee);
    const res2 = await app2.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'accepted' },
    });
    expect(res2.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res2.json().data.rsvpNotification).toMatchObject({
      notified: false,
      reason: 'self-rsvp',
    });
  });

  it('reports mail-not-configured honestly instead of throwing when SES is down', async () => {
    isSesConfigured.mockReturnValue(false);
    const { app } = await buildApp('user-2');
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    expect(sendViaSes).not.toHaveBeenCalled();
    expect(res.json().data.rsvpNotification).toMatchObject({
      notified: false,
      reason: 'mail-not-configured',
    });
    // The RSVP itself still landed.
    expect(res.json().data.attendees).toMatchObject([{ userId: 'user-2', status: 'accepted' }]);
  });

  it('a send failure never fails the RSVP — reported as send-failed', async () => {
    sendViaSes.mockRejectedValue(new Error('ses boom'));
    const { app } = await buildApp('user-2');
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.attendees).toMatchObject([{ userId: 'user-2', status: 'accepted' }]);
    expect(res.json().data.rsvpNotification).toMatchObject({
      notified: false,
      reason: 'send-failed',
    });
  });
});
