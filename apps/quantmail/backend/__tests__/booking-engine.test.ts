// @vitest-environment node
// ============================================================================
// Tasks W39-CAL03 & W39-CAL04: QuantMail Calendar Booking Engine & Concurrency Lock
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import {
  BookingLinkService,
  generateIcsInvite,
  formatIcsDateTime,
  globalSlotLockStore,
} from '../services/booking-link.service';

function createInMemoryPrisma() {
  const bookingLinks = new Map<string, any>();
  const events = new Map<string, any>();
  const users = new Map<string, any>();

  users.set('host-user-1', {
    id: 'host-user-1',
    email: 'alex.host@quantmail.io',
    displayName: 'Alex Host',
  });

  return {
    bookingLink: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const id = data.id || `blink-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const record = { ...data, id };
        bookingLinks.set(id, record);
        bookingLinks.set(data.slug, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return bookingLinks.get(where.slug) || null;
        if (where.id) return bookingLinks.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { userId?: string } } = {}) => {
        const unique = Array.from(new Set(bookingLinks.values()));
        if (where?.userId) return unique.filter((l) => l.userId === where.userId);
        return unique;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const item = bookingLinks.get(where.id);
        if (item) {
          bookingLinks.delete(where.id);
          bookingLinks.delete(item.slug);
        }
        return item;
      }),
    },
    event: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const id = data.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const record = { ...data, id };
        events.set(id, record);
        return record;
      }),
      findMany: vi.fn(async (args: any) => {
        const all = Array.from(events.values());
        const { where } = args || {};
        return all.filter((evt) => {
          if (where?.userId && evt.userId !== where.userId) return false;
          if (where?.recurrenceRule === null && evt.recurrenceRule !== null) return false;
          if (where?.recurrenceRule && where.recurrenceRule.not !== null && !evt.recurrenceRule)
            return false;
          if (where?.startTime?.lt && !(new Date(evt.startTime) < new Date(where.startTime.lt)))
            return false;
          if (where?.startTime?.lte && !(new Date(evt.startTime) <= new Date(where.startTime.lte)))
            return false;
          if (where?.endTime?.gt && !(new Date(evt.endTime) > new Date(where.endTime.gt)))
            return false;
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return events.get(where.id) || null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const item = events.get(where.id);
        if (item) {
          const updated = { ...item, ...data };
          events.set(where.id, updated);
          return updated;
        }
        return null;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const item = events.get(where.id);
        if (item) events.delete(where.id);
        return item;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return users.get(where.id) || null;
      }),
    },
    _store: { bookingLinks, events, users },
  };
}

describe('QuantMail Calendar Booking Engine & Slot Lock Concurrency (Tasks W39-CAL03 & W39-CAL04)', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let service: BookingLinkService;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    BookingLinkService.clearLocks();
    prisma = createInMemoryPrisma();
    service = new BookingLinkService(prisma as any);

    app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request: any) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'host-user-1' };
    });
    await app.register(calendarRoutes);
    await app.ready();
  });

  afterEach(async () => {
    BookingLinkService.clearLocks();
    await app.close();
  });

  describe('1. Booking Link Creation with Custom Hours and Duration', () => {
    it('creates booking links with custom hours, duration, and available days via service', async () => {
      const link = await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'strategy-45m',
        title: 'Strategy Consultation',
        description: 'Deep dive 45-minute architectural review',
        duration: 45,
        availableDays: [1, 2, 3, 4], // Mon to Thu
        startHour: 10,
        endHour: 16,
      });

      expect(link.slug).toBe('strategy-45m');
      expect(link.title).toBe('Strategy Consultation');
      expect(link.hostTitle).toBe('Strategy Consultation');
      expect(link.duration).toBe(45);
      expect(link.availableDays).toEqual([1, 2, 3, 4]);
      expect(link.startHour).toBe(10);
      expect(link.endHour).toBe(16);
      expect(link.isActive).toBe(true);

      const fetched = await service.getBookingLink('strategy-45m');
      expect(fetched.id).toBe(link.id);
      expect(fetched.duration).toBe(45);
    });

    it('creates booking link via HTTP POST /calendar/booking/links and lists via GET /calendar/booking/links', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/calendar/booking/links',
        payload: {
          slug: 'quick-coffee',
          title: 'Coffee Chat',
          description: 'Casual catchup',
          duration: 15,
          availableDays: [1, 3, 5],
          startHour: 13,
          endHour: 17,
        },
      });

      expect(createRes.statusCode).toBe(201);
      const createBody = JSON.parse(createRes.body);
      expect(createBody.success).toBe(true);
      expect(createBody.data.slug).toBe('quick-coffee');
      expect(createBody.data.duration).toBe(15);
      expect(createBody.data.startHour).toBe(13);
      expect(createBody.data.endHour).toBe(17);

      const listRes = await app.inject({
        method: 'GET',
        url: '/calendar/booking/links',
      });

      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      expect(listBody.success).toBe(true);
      expect(listBody.data.length).toBeGreaterThanOrEqual(1);
      expect(listBody.data.some((l: any) => l.slug === 'quick-coffee')).toBe(true);
    });

    it('returns booking link metadata and host title via GET /calendar/booking/:slug', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'founder-sync',
        title: 'Founder Sync',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/calendar/booking/founder-sync',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe('founder-sync');
      expect(body.data.title).toBe('Founder Sync');
      expect(body.data.hostTitle).toBe('Founder Sync');
      expect(body.data.duration).toBe(30);
      expect(body.data.availableDays).toEqual([1, 2, 3, 4, 5]);
      expect(body.data.startHour).toBe(9);
      expect(body.data.endHour).toBe(17);
    });

    it('deletes booking link via DELETE /calendar/booking/links/:id', async () => {
      const link = await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'delete-me',
        title: 'Temporary Link',
        duration: 30,
      });

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/calendar/booking/links/${link.id}`,
      });

      expect(delRes.statusCode).toBe(200);
      const delBody = JSON.parse(delRes.body);
      expect(delBody.success).toBe(true);

      const getRes = await app.inject({
        method: 'GET',
        url: '/calendar/booking/delete-me',
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('2. Calculating Open Slots for a Given Day', () => {
    it('calculates open slots accurately based on startHour, endHour, and duration', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'hourly-sync',
        title: 'Hourly Consultation',
        duration: 60,
        availableDays: [1, 2, 3, 4, 5], // Mon to Fri
        startHour: 9,
        endHour: 13, // 4 slots: 9-10, 10-11, 11-12, 12-13
      });

      // Target date: A Monday in the future (2028-10-02 is Monday)
      const targetMonday = new Date('2028-10-02T00:00:00.000Z');
      const slots = await service.getAvailableSlots('hourly-sync', targetMonday);

      expect(slots).toHaveLength(4);
      expect(slots.map((s) => s.start.getHours())).toEqual([9, 10, 11, 12]);
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('returns empty slots array on unavailable days (e.g. Sunday when weekdays only)', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'weekday-only',
        title: 'Weekday Catchup',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      // 2028-10-01 is Sunday (day 0)
      const sunday = new Date('2028-10-01T00:00:00.000Z');
      const slots = await service.getAvailableSlots('weekday-only', sunday);
      expect(slots).toHaveLength(0);
    });

    it('marks conflicting slots as unavailable when an existing event exists in database', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'meeting-30m',
        title: '30m Meeting',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 11, // 4 slots: 9:00, 9:30, 10:00, 10:30
      });

      const targetMonday = new Date('2028-10-02T00:00:00.000Z');

      // Create an existing database event for 09:30 - 10:00
      const busyStart = new Date(targetMonday);
      busyStart.setHours(9, 30, 0, 0);
      const busyEnd = new Date(targetMonday);
      busyEnd.setHours(10, 0, 0, 0);

      await prisma.event.create({
        data: {
          userId: 'host-user-1',
          title: 'Existing Standup',
          startTime: busyStart,
          endTime: busyEnd,
          recurrenceRule: null,
        },
      });

      const slots = await service.getAvailableSlots('meeting-30m', targetMonday);
      expect(slots).toHaveLength(4);

      const availability = slots.map((s) => ({
        hour: s.start.getHours(),
        min: s.start.getMinutes(),
        available: s.available,
      }));

      expect(availability).toEqual([
        { hour: 9, min: 0, available: true },
        { hour: 9, min: 30, available: false }, // Busy!
        { hour: 10, min: 0, available: true },
        { hour: 10, min: 30, available: true },
      ]);
    });

    it('queries slots via HTTP GET /calendar/booking/:slug/slots', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'api-slots',
        title: 'API Slots Test',
        duration: 60,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 10,
        endHour: 12, // 2 slots: 10:00, 11:00
      });

      const targetMonday = new Date(2028, 9, 2);
      const res = await app.inject({
        method: 'GET',
        url: `/calendar/booking/api-slots/slots?date=${targetMonday.toISOString()}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].available).toBe(true);
      expect(body.data[1].available).toBe(true);
    });
  });

  describe('3. Slot Locking and Concurrency Conflict Detection (409 SLOT_UNAVAILABLE)', () => {
    it('locks a slot with 10-minute TTL and prevents double-locking by another booker (409 SLOT_UNAVAILABLE)', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'concurrency-demo',
        title: 'High Concurrency Demo',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      const targetMonday = new Date(2028, 9, 2);
      const targetSlot = new Date(targetMonday);
      targetSlot.setHours(14, 0, 0, 0);

      // Booker A locks the slot
      const lockA = await service.lockSlot('concurrency-demo', targetSlot, 'alice@crypto.org');
      expect(lockA.lockId).toMatch(/^lock_/);
      expect(lockA.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
      expect(lockA.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);

      // Verifying getAvailableSlots now reports available: false for 14:00 slot
      const slots = await service.getAvailableSlots('concurrency-demo', targetMonday);
      const slot14 = slots.find((s) => s.start.getHours() === 14 && s.start.getMinutes() === 0);
      expect(slot14?.available).toBe(false);

      // Booker B attempts to lock the same slot -> 409 SLOT_UNAVAILABLE
      await expect(
        service.lockSlot('concurrency-demo', targetSlot, 'bob@competitor.com'),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'SLOT_UNAVAILABLE',
      });

      // Booker A can refresh their own lock
      const refreshedLock = await service.lockSlot(
        'concurrency-demo',
        targetSlot,
        'alice@crypto.org',
      );
      expect(refreshedLock.lockId).toBe(lockA.lockId);

      // Booker A releases the lock
      await service.releaseLock(lockA.lockId);

      // Now Booker B can acquire the lock!
      const lockB = await service.lockSlot('concurrency-demo', targetSlot, 'bob@competitor.com');
      expect(lockB.lockId).toBeDefined();
    });

    it('rejects concurrent lock via HTTP POST /calendar/booking/:slug/lock with 409', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'http-lock-test',
        title: 'HTTP Lock Test',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      const targetMonday = new Date(2028, 9, 2);
      const targetSlot = new Date(targetMonday);
      targetSlot.setHours(11, 0, 0, 0);
      const slotIso = targetSlot.toISOString();

      // 1. First lock succeeds
      const res1 = await app.inject({
        method: 'POST',
        url: '/calendar/booking/http-lock-test/lock',
        payload: {
          slot: slotIso,
          email: 'first.booker@example.com',
        },
      });

      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body);
      expect(body1.success).toBe(true);
      expect(body1.lockId).toBeDefined();
      expect(body1.expiresAt).toBeDefined();

      // 2. Second booker tries to lock same slot -> 409
      const res2 = await app.inject({
        method: 'POST',
        url: '/calendar/booking/http-lock-test/lock',
        payload: {
          slot: slotIso,
          email: 'second.booker@example.com',
        },
      });

      expect(res2.statusCode).toBe(409);
      const body2 = JSON.parse(res2.body);
      expect(body2.error.code).toBe('SLOT_UNAVAILABLE');
    });
  });

  describe('4. Confirm Booking & RFC 5545 .ics Payload Generation', () => {
    it('confirms booking, creates event in database, and returns valid RFC 5545 .ics string', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'advisory-call',
        title: 'Advisory Call',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      const targetMonday = new Date(2028, 9, 2);
      const targetSlot = new Date(targetMonday);
      targetSlot.setHours(11, 0, 0, 0);

      // 1. Lock slot first
      const { lockId } = await service.lockSlot('advisory-call', targetSlot, 'clara@client.com');

      // 2. Another booker cannot book without lock
      await expect(
        service.confirmBooking('advisory-call', targetSlot, {
          name: 'Dave Imposter',
          email: 'dave@imposter.com',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'SLOT_UNAVAILABLE',
      });

      // 3. Booker with valid lock confirms booking
      const result = await service.confirmBooking(
        'advisory-call',
        targetSlot,
        {
          name: 'Clara Client',
          email: 'clara@client.com',
          notes: 'Quarterly compliance audit and scaling milestones',
        },
        lockId,
      );

      expect(result.event).toBeDefined();
      const event = result.event as any;
      expect(event.title).toBe('Advisory Call with Clara Client');
      expect(event.description).toBe('Quarterly compliance audit and scaling milestones');
      expect(event.userId).toBe('host-user-1');
      expect(event.status).toBe('confirmed');

      const attendees = JSON.parse(event.attendees);
      expect(attendees).toEqual([
        { userId: '', email: 'clara@client.com', name: 'Clara Client', status: 'accepted' },
      ]);

      // 4. Validate RFC 5545 .ics content format
      expect(result.icsContent).toBeDefined();
      const ics = result.icsContent;

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//QuantMail//Calendar Booking Engine//EN');
      expect(ics).toContain('CALSCALE:GREGORIAN');
      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('UID:');
      expect(ics).toContain('@quantmail.io');
      expect(ics).toContain('DTSTAMP:');
      expect(ics).toContain(`DTSTART:${formatIcsDateTime(targetSlot)}`);
      expect(ics).toContain(
        `DTEND:${formatIcsDateTime(new Date(targetSlot.getTime() + 30 * 60 * 1000))}`,
      );
      expect(ics).toContain('SUMMARY:Advisory Call with Clara Client');
      expect(ics).toContain('DESCRIPTION:Quarterly compliance audit and scaling milestones');
      expect(ics).toContain('ORGANIZER;CN=Alex Host:mailto:alex.host@quantmail.io');
      expect(ics).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Clara Client:mailto:clara@client.com',
      );
      expect(ics).toContain('STATUS:CONFIRMED');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');

      // 5. Subsequent attempts to book or lock this slot are rejected because event is persisted in db
      await expect(
        service.lockSlot('advisory-call', targetSlot, 'someone@else.com'),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'SLOT_UNAVAILABLE',
      });
    });

    it('books slot via HTTP POST /calendar/booking/:slug/book with { event, icsContent } response', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'http-book',
        title: 'Executive Sync',
        duration: 45,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 9,
        endHour: 17,
      });

      const targetMonday = new Date(2028, 9, 2);
      const targetSlot = new Date(targetMonday);
      targetSlot.setHours(11, 0, 0, 0);
      const slotIso = targetSlot.toISOString();

      // 1. Lock slot
      const lockRes = await app.inject({
        method: 'POST',
        url: '/calendar/booking/http-book/lock',
        payload: {
          slot: slotIso,
          email: 'elena@enterprise.io',
        },
      });
      expect(lockRes.statusCode).toBe(200);
      const lockBody = JSON.parse(lockRes.body);

      // 2. Book slot
      const bookRes = await app.inject({
        method: 'POST',
        url: '/calendar/booking/http-book/book',
        payload: {
          slot: slotIso,
          name: 'Elena Enterprise',
          email: 'elena@enterprise.io',
          notes: 'Contract signing',
          lockId: lockBody.lockId,
        },
      });

      expect(bookRes.statusCode).toBe(201);
      const bookBody = JSON.parse(bookRes.body);
      expect(bookBody.success).toBe(true);
      expect(bookBody.data.event).toBeDefined();
      expect(bookBody.data.event.title).toBe('Executive Sync with Elena Enterprise');
      expect(bookBody.data.icsContent).toBeDefined();
      expect(bookBody.data.icsContent).toContain('BEGIN:VCALENDAR');
      expect(bookBody.data.icsContent).toContain('ATTENDEE;CUTYPE=INDIVIDUAL');
      expect(bookBody.data.icsContent).toContain(
        'ORGANIZER;CN=Alex Host:mailto:alex.host@quantmail.io',
      );
    });

    it('rejects confirmation outside available hours or on invalid slot date', async () => {
      await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'valid-range-test',
        title: 'Range Test',
        duration: 30,
        availableDays: [1, 2, 3, 4, 5],
        startHour: 10,
        endHour: 14,
      });

      const targetMonday = new Date(2028, 9, 2);
      // 07:00 is outside startHour 10:00
      const earlySlot = new Date(targetMonday);
      earlySlot.setHours(7, 0, 0, 0);

      await expect(
        service.confirmBooking('valid-range-test', earlySlot, {
          name: 'Early Bird',
          email: 'early@bird.com',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_BOOKING_SLOT',
      });
    });
  });

  describe('5. RFC 5545 Invite Helper Unit Tests', () => {
    it('formats date to UTC standard YYYYMMDDTHHMMSSZ', () => {
      const d = new Date(Date.UTC(2026, 9, 25, 12, 30, 45));
      expect(formatIcsDateTime(d)).toBe('20261025T123045Z');
    });

    it('generates fully compliant RFC 5545 VCALENDAR VEVENT block', () => {
      const ics = generateIcsInvite({
        uid: 'evt-custom-123@quantmail.io',
        summary: 'Demo Call',
        description: 'Line 1\nLine 2',
        startTime: new Date('2028-11-01T15:00:00.000Z'),
        endTime: new Date('2028-11-01T15:30:00.000Z'),
        organizer: { name: 'Host Team', email: 'team@quantmail.io' },
        attendee: { name: 'Guest User', email: 'guest@external.com' },
      });

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('UID:evt-custom-123@quantmail.io\r\n');
      expect(ics).toContain('DTSTART:20281101T150000Z\r\n');
      expect(ics).toContain('DTEND:20281101T153000Z\r\n');
      expect(ics).toContain('SUMMARY:Demo Call\r\n');
      expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2\r\n');
      expect(ics).toContain('ORGANIZER;CN=Host Team:mailto:team@quantmail.io\r\n');
      expect(ics).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Guest User:mailto:guest@external.com\r\n',
      );
      expect(ics).toContain('END:VCALENDAR');
    });
  });
});
