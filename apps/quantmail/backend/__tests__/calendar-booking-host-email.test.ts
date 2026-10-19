// @vitest-environment node
// ===========================================================================
// Booking host notification (fix/qm-booking-host-email) — the routes, not a service.
// ===========================================================================
//
// Pinned defect (finding line 1386, [P1][calendar]): confirming a booking
// through a public link created the event + the ICS invite and stopped there
// — zero mail calls — so the host had to open their calendar to discover the
// new booking. The fix (Gmail parity): handlePostBooking now notifies the
// host with a real SES email carrying the real .ics attachment, after the
// booking write succeeds.
//
// HARNESS: the REAL calendarRoutes on a bare Fastify app (same shape as the
// calendar.routes.test.ts harness). The booking write itself is a mocked
// BookingLinkService (confirmBooking returns a canned confirmation), and SES
// is a mocked `../lib/ses-sender` module — what handlePostBooking hands to
// sendViaSes is the thing under test. The mail path must never fail the
// booking: a send failure still returns 201 with an honest hostNotification.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';

vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: vi.fn(),
  sendViaSes: vi.fn(),
}));

vi.mock('../services/booking-link.service', () => {
  return {
    BookingLinkService: class {
      confirmBooking = vi.fn((..._args: unknown[]) =>
        Promise.resolve(confirmBookingImpl(..._args)),
      );
    },
  };
});

// Default confirmation: host resolvable. Tests override per case.
let confirmBookingImpl: (...args: unknown[]) => Promise<{
  event: { id: string; title: string; startTime: Date; endTime: Date };
  icsContent: string;
  hostName: string | null;
  hostEmail: string | null;
}> = () =>
  Promise.resolve({
    event: {
      id: 'e1',
      title: 'Intro call',
      startTime: new Date('2026-10-20T09:00:00.000Z'),
      endTime: new Date('2026-10-20T09:30:00.000Z'),
    },
    icsContent: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
    hostName: 'Kundan',
    hostEmail: 'kundan@quantmail.in',
  });

const prisma = {
  $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
};

async function buildApp() {
  const app = Fastify();
  app.decorate('prisma', prisma as never);
  await app.register(errorHandlerPlugin);
  await app.register(calendarRoutes);
  await app.ready();
  return app;
}

const BOOK_PAYLOAD = {
  slot: '2026-10-20T09:00:00.000Z',
  name: 'Asha Verma',
  email: 'asha@example.com',
  notes: 'bring the deck',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSesConfigured).mockReturnValue(true);
  vi.mocked(sendViaSes).mockResolvedValue('msg-1');
  confirmBookingImpl = () =>
    Promise.resolve({
      event: {
        id: 'e1',
        title: 'Intro call',
        startTime: new Date('2026-10-20T09:00:00.000Z'),
        endTime: new Date('2026-10-20T09:30:00.000Z'),
      },
      icsContent: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
      hostName: 'Kundan',
      hostEmail: 'kundan@quantmail.in',
    });
});

describe('booking host notification (fix/qm-booking-host-email)', () => {
  it('sends the host a real SES email with the .ics attached after the booking write', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/booking/links/demo-slug/book',
      payload: BOOK_PAYLOAD,
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(sendViaSes)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendViaSes).mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(call.to).toEqual(['kundan@quantmail.in']);
    expect(String(call.subject)).toContain('Asha Verma');
    expect(String(call.subject)).toContain('Intro call');
    expect(call.replyTo).toBe('asha@example.com');
    const attachments = call.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!.filename).toBe('booking.ics');
    expect(attachments[0]!.contentType).toBe('text/calendar');

    const body = res.json();
    expect(body.data.hostNotification).toEqual({
      notified: true,
      count: 1,
      reason: 'sent',
    });
  });

  it('never fails the booking when the mail send fails — honest status rides in the response', async () => {
    const app = await buildApp();
    vi.mocked(sendViaSes).mockRejectedValueOnce(new Error('SES down'));
    const res = await app.inject({
      method: 'POST',
      url: '/calendar/booking/demo-slug/book',
      payload: BOOK_PAYLOAD,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.hostNotification).toEqual({
      notified: false,
      count: 0,
      reason: 'send-failed',
    });
  });

  it('stays honest when no host email can be resolved — no send attempted', async () => {
    const app = await buildApp();
    confirmBookingImpl = () =>
      Promise.resolve({
        event: {
          id: 'e1',
          title: 'Intro call',
          startTime: new Date('2026-10-20T09:00:00.000Z'),
          endTime: new Date('2026-10-20T09:30:00.000Z'),
        },
        icsContent: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
        hostName: null,
        hostEmail: null,
      });
    const res = await app.inject({
      method: 'POST',
      url: '/booking/links/demo-slug/book',
      payload: BOOK_PAYLOAD,
    });

    expect(res.statusCode).toBe(201);
    expect(vi.mocked(sendViaSes)).not.toHaveBeenCalled();
    expect(res.json().data.hostNotification).toEqual({
      notified: false,
      count: 0,
      reason: 'no-host-email',
    });
  });
});
