// @vitest-environment node
// ============================================================================
// Phase C Parity Suite: Tasks C01–C04 (CalendarId Persistence, Filtering & Backfill)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import * as fs from 'fs';
import * as path from 'path';

const BASE_ROW = {
  id: 'evt-1',
  userId: 'user-cal-1',
  calendarId: 'cal-primary-1',
  title: 'Engineering All-Hands',
  description: 'Monthly sync',
  startTime: new Date('2026-09-20T10:00:00.000Z'),
  endTime: new Date('2026-09-20T11:00:00.000Z'),
  allDay: false,
  location: 'QuantMeet Room 1',
  status: 'confirmed',
  attendees: '[]',
  reminders: '[]',
  recurrenceRule: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function createFakePrisma() {
  return {
    event: {
      findUnique: vi.fn().mockResolvedValue(BASE_ROW),
      findMany: vi.fn().mockResolvedValue([BASE_ROW]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...BASE_ROW,
        ...data,
        id: data.id || 'evt-created-1',
      })),
      update: vi.fn().mockImplementation(async ({ data }) => ({
        ...BASE_ROW,
        ...data,
      })),
      delete: vi.fn().mockResolvedValue(BASE_ROW),
    },
    calendar: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cal-primary-1',
        userId: 'user-cal-1',
        name: 'Primary',
        isPrimary: true,
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'cal-primary-1', name: 'Primary', isPrimary: true },
        { id: 'cal-work-2', name: 'Work', isPrimary: false },
      ]),
      create: vi.fn().mockResolvedValue({
        id: 'cal-auto-1',
        name: 'Primary',
        isPrimary: true,
      }),
    },
    bookingLink: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'link-1',
        userId: 'user-cal-1',
        slug: 'quick-sync',
        title: 'Quick 30min Sync',
        description: 'Sync meeting',
        duration: 30,
        availableDays: '[1, 2, 3, 4, 5]',
        startHour: 9,
        endHour: 17,
        isActive: true,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: 'link-created-1',
        ...data,
        isActive: true,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      })),
    },
  };
}

describe('Phase C Parity: C01–C04 CalendarId Suite', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    prisma = createFakePrisma();
    app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request: any) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-cal-1' };
    });
    await app.register(calendarRoutes);
    await app.ready();
  });

  describe('Task C01: Persist calendarId in event.create and event.update', () => {
    it('creates an event with explicit calendarId and persists to database', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Sprint Planning',
          start: '2026-09-22T14:00:00.000Z',
          end: '2026-09-22T15:00:00.000Z',
          calendarId: 'cal-work-2',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.calendarId).toBe('cal-work-2');

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.event.create.mock.calls[0]![0];
      expect(createArg.data.calendarId).toBe('cal-work-2');
    });

    it('creates an event without calendarId and defaults to user primary calendar', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Doctor Appointment',
          start: '2026-09-23T11:00:00.000Z',
          end: '2026-09-23T12:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.calendarId).toBe('cal-primary-1');

      expect(prisma.calendar.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-cal-1', isPrimary: true },
        select: { id: true },
      });

      const createArg = prisma.event.create.mock.calls[0]![0];
      expect(createArg.data.calendarId).toBe('cal-primary-1');
    });

    it('provisions a default Primary calendar if user has none when creating event', async () => {
      prisma.calendar.findFirst.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'First Event on Fresh Account',
          start: '2026-09-25T10:00:00.000Z',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(prisma.calendar.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-cal-1',
          name: 'Primary',
          color: '#3B82F6',
          isPrimary: true,
        },
        select: { id: true },
      });

      const createArg = prisma.event.create.mock.calls[0]![0];
      expect(createArg.data.calendarId).toBe('cal-auto-1');
    });

    it('updates event calendarId via PUT /events/:id', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/events/evt-1',
        payload: {
          calendarId: 'cal-moved-99',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.event.update).toHaveBeenCalledTimes(1);
      const updateArg = prisma.event.update.mock.calls[0]![0];
      expect(updateArg.data.calendarId).toBe('cal-moved-99');
    });

    it('updates event calendarId via PATCH /events/:id', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/events/evt-1',
        payload: {
          calendarId: 'cal-archived-1',
        },
      });

      expect(response.statusCode).toBe(200);
      const updateArg = prisma.event.update.mock.calls[0]![0];
      expect(updateArg.data.calendarId).toBe('cal-archived-1');
    });
  });

  describe('Task C02: Filter GET /events by calendarId', () => {
    it('filters standard GET /events by calendarId parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events?calendarId=cal-work-2',
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-cal-1',
            calendarId: 'cal-work-2',
          }),
        }),
      );
    });

    it('filters range query GET /events?start=...&end=...&calendarId=...', async () => {
      const start = '2026-09-01T00:00:00.000Z';
      const end = '2026-09-30T23:59:59.000Z';

      const response = await app.inject({
        method: 'GET',
        url: `/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&calendarId=cal-special`,
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-cal-1',
            calendarId: 'cal-special',
            recurrenceRule: null,
          }),
        }),
      );
    });

    it('returns all user events when calendarId query parameter is omitted', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events',
      });

      expect(response.statusCode).toBe(200);
      const callArg = prisma.event.findMany.mock.calls[0]![0];
      expect(callArg.where.calendarId).toBeUndefined();
    });
  });

  describe('Task C03 & C04: Backfill Migration and Schema Verification', () => {
    it('verifies migration 0063_add_event_calendar_id contains valid SQL and backfill logic', () => {
      const migrationPath = path.resolve(
        __dirname,
        '../../../../packages/database/prisma/migrations/0063_add_event_calendar_id/migration.sql',
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      expect(sqlContent).toContain(
        'ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "calendarId" TEXT;',
      );
      expect(sqlContent).toContain(
        'CREATE INDEX IF NOT EXISTS "calendar_events_calendarId_idx" ON "calendar_events"("calendarId");',
      );
      expect(sqlContent).toContain('INSERT INTO "calendars"');
      expect(sqlContent).toContain('UPDATE "calendar_events"');
      expect(sqlContent).toContain('FOREIGN KEY ("calendarId") REFERENCES "calendars"("id")');
    });

    it('verifies toEventDto returns calendarId in entity envelope', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/events/evt-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('evt-1');
      expect(body.data.calendarId).toBe('cal-primary-1');
    });

    it('verifies GET /events and GET /events/:id response envelope contract (startTime/endTime canonical, start/end absent)', async () => {
      // 1. Single event route GET /events/:id
      const singleRes = await app.inject({
        method: 'GET',
        url: '/events/evt-1',
      });
      expect(singleRes.statusCode).toBe(200);
      const singleBody = JSON.parse(singleRes.body);
      expect(singleBody.success).toBe(true);
      const event = singleBody.data;

      // Contract assertions for canonical fields
      expect(event).toHaveProperty('id', 'evt-1');
      expect(event).toHaveProperty('title', 'Engineering All-Hands');
      expect(typeof event.startTime).toBe('string');
      expect(typeof event.endTime).toBe('string');
      expect(new Date(event.startTime).toISOString()).toBe('2026-09-20T10:00:00.000Z');
      expect(new Date(event.endTime).toISOString()).toBe('2026-09-20T11:00:00.000Z');
      expect(event).toHaveProperty('allDay', false);
      expect(event).toHaveProperty('status', 'confirmed');
      expect(Array.isArray(event.attendees)).toBe(true);
      expect(Array.isArray(event.reminders)).toBe(true);
      expect(event).toHaveProperty('recurrence', null);
      expect(event).toHaveProperty('calendarId', 'cal-primary-1');

      // Crucial negative assertions: legacy 4-key DTO keys 'start' and 'end' must be absent
      expect((event as any).start).toBeUndefined();
      expect((event as any).end).toBeUndefined();

      // 2. Collection route GET /events
      const listRes = await app.inject({
        method: 'GET',
        url: '/events',
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      expect(listBody.success).toBe(true);
      expect(Array.isArray(listBody.data)).toBe(true);
      expect(listBody.data.length).toBeGreaterThan(0);

      const firstItem = listBody.data[0];
      expect(typeof firstItem.startTime).toBe('string');
      expect(typeof firstItem.endTime).toBe('string');
      expect(firstItem).toHaveProperty('title');
      expect(firstItem).toHaveProperty('status');
      expect(firstItem).toHaveProperty('allDay');
      expect(Array.isArray(firstItem.attendees)).toBe(true);
      expect(Array.isArray(firstItem.reminders)).toBe(true);
      expect(firstItem).toHaveProperty('recurrence');
      expect((firstItem as any).start).toBeUndefined();
      expect((firstItem as any).end).toBeUndefined();
    });
  });

  describe('Tasks X04 & C19: RFC 5545 ICS Bulk Import Engine', () => {
    it('imports a standard .ics payload with multiple VEVENT blocks (JSON format)', async () => {
      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Test Corp//EN',
        'BEGIN:VEVENT',
        'UID:evt-import-1@test.com',
        'DTSTART:20261010T090000Z',
        'DTEND:20261010T100000Z',
        'SUMMARY:Product Kickoff\\, Q4 \\; Planning',
        'DESCRIPTION:Roadmap discussion\\nDeliverables review',
        'LOCATION:Conference Room A',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:evt-import-2@test.com',
        'DTSTART:20261011T140000Z',
        'DURATION:PT1H30M',
        'SUMMARY:Design Critique',
        'DESCRIPTION:Reviewing new UI components',
        'LOCATION:Design Lab',
        'STATUS:TENTATIVE',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: {
          icsData,
          calendarId: 'cal-work-2',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.importedCount).toBe(2);
      expect(body.data.eventIds).toEqual(['evt-import-1@test.com', 'evt-import-2@test.com']);

      expect(prisma.event.create).toHaveBeenCalledTimes(2);
      const firstCall = prisma.event.create.mock.calls[0]![0];
      expect(firstCall.data.title).toBe('Product Kickoff, Q4 ; Planning');
      expect(firstCall.data.description).toBe('Roadmap discussion\nDeliverables review');
      expect(firstCall.data.location).toBe('Conference Room A');
      expect(firstCall.data.status).toBe('confirmed');
      expect(firstCall.data.calendarId).toBe('cal-work-2');
      expect(new Date(firstCall.data.startTime).toISOString()).toBe('2026-10-10T09:00:00.000Z');
      expect(new Date(firstCall.data.endTime).toISOString()).toBe('2026-10-10T10:00:00.000Z');

      const secondCall = prisma.event.create.mock.calls[1]![0];
      expect(secondCall.data.title).toBe('Design Critique');
      expect(secondCall.data.status).toBe('tentative');
      expect(new Date(secondCall.data.startTime).toISOString()).toBe('2026-10-11T14:00:00.000Z');
      expect(new Date(secondCall.data.endTime).toISOString()).toBe('2026-10-11T15:30:00.000Z');
    });

    it('imports raw text/calendar payload and unfolds continuation lines', async () => {
      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:evt-folded-1@test.com',
        'DTSTART:20261012T080000Z',
        'DTEND:20261012T090000Z',
        'SUMMARY:Security Syn',
        ' c and Compliance',
        'DESCRIPTION:This is a very long folded line th',
        '\tat continues here with a tab.',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        headers: {
          'content-type': 'text/calendar',
        },
        payload: icsData,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.importedCount).toBe(1);

      const createArg = prisma.event.create.mock.calls[0]![0];
      expect(createArg.data.title).toBe('Security Sync and Compliance');
      expect(createArg.data.description).toBe(
        'This is a very long folded line that continues here with a tab.',
      );
      expect(createArg.data.calendarId).toBe('cal-primary-1');
    });

    it('imports recurring events with RRULE', async () => {
      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:evt-recurring-1@test.com',
        'DTSTART:20261015T110000Z',
        'DTEND:20261015T120000Z',
        'SUMMARY:Weekly Sprint Sync',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: {
          icsData,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.importedCount).toBe(1);

      const createArg = prisma.event.create.mock.calls[0]![0];
      expect(createArg.data.title).toBe('Weekly Sprint Sync');
      expect(createArg.data.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10');
    });

    it('handles deduplication on repeated imports (idempotency)', async () => {
      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:evt-dedup-1@test.com',
        'DTSTART:20261020T100000Z',
        'DTEND:20261020T110000Z',
        'SUMMARY:Quarterly All Hands',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      // First import - event does not exist yet
      prisma.event.findMany.mockResolvedValueOnce([BASE_ROW]);
      const firstRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData },
      });

      expect(firstRes.statusCode).toBe(201);
      const firstBody = JSON.parse(firstRes.body);
      expect(firstBody.data.importedCount).toBe(1);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);

      // Second import - simulate database now containing the imported event
      prisma.event.findMany.mockResolvedValueOnce([
        BASE_ROW,
        {
          id: 'evt-dedup-1@test.com',
          userId: 'user-cal-1',
          title: 'Quarterly All Hands',
          startTime: new Date('2026-10-20T10:00:00.000Z'),
          endTime: new Date('2026-10-20T11:00:00.000Z'),
          status: 'confirmed',
        },
      ]);

      const secondRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData },
      });

      expect(secondRes.statusCode).toBe(201);
      const secondBody = JSON.parse(secondRes.body);
      expect(secondBody.data.importedCount).toBe(0);
      expect(secondBody.data.eventIds).toEqual([]);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed or empty .ics payloads with 400 VALIDATION_ERROR', async () => {
      // 1. Empty string
      const emptyRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData: '' },
      });
      expect(emptyRes.statusCode).toBe(400);
      const emptyBody = JSON.parse(emptyRes.body);
      expect(emptyBody.success).toBe(false);
      expect(emptyBody.error.code).toBe('VALIDATION_ERROR');

      // 2. Missing icsData property
      const missingRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: {},
      });
      expect(missingRes.statusCode).toBe(400);
      const missingBody = JSON.parse(missingRes.body);
      expect(missingBody.success).toBe(false);
      expect(missingBody.error.code).toBe('VALIDATION_ERROR');

      // 3. Malformed content without VEVENT blocks
      const malformedRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData: 'INVALID_NOT_AN_ICS' },
      });
      expect(malformedRes.statusCode).toBe(400);
      const malformedBody = JSON.parse(malformedRes.body);
      expect(malformedBody.success).toBe(false);
      expect(malformedBody.error.code).toBe('VALIDATION_ERROR');

      // 4. VCALENDAR without any VEVENT entries
      const noVeventRes = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR' },
      });
      expect(noVeventRes.statusCode).toBe(400);
      const noVeventBody = JSON.parse(noVeventRes.body);
      expect(noVeventBody.success).toBe(false);
      expect(noVeventBody.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects oversized payloads (> 5MB)', async () => {
      const hugeData = 'A'.repeat(5 * 1024 * 1024 + 10);
      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData: hugeData },
      });
      expect([400, 413]).toContain(response.statusCode);
    });

    it('supports TZID timezone and date-only VALUE=DATE formats', async () => {
      const icsData = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:evt-tz-1@test.com',
        'DTSTART;TZID=America/New_York:20261025T090000',
        'DTEND;TZID=America/New_York:20261025T100000',
        'SUMMARY:New York Meeting',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:evt-allday-1@test.com',
        'DTSTART;VALUE=DATE:20261026',
        'DTEND;VALUE=DATE:20261027',
        'SUMMARY:All Day Conference',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.importedCount).toBe(2);

      const nyCall = prisma.event.create.mock.calls[0]![0];
      expect(nyCall.data.title).toBe('New York Meeting');
      expect(nyCall.data.timeZone).toBe('America/New_York');
      expect(new Date(nyCall.data.startTime).toISOString()).toBe('2026-10-25T13:00:00.000Z');
      expect(new Date(nyCall.data.endTime).toISOString()).toBe('2026-10-25T14:00:00.000Z');

      const allDayCall = prisma.event.create.mock.calls[1]![0];
      expect(allDayCall.data.title).toBe('All Day Conference');
      expect(allDayCall.data.allDay).toBe(true);
      expect(new Date(allDayCall.data.startTime).toISOString()).toBe('2026-10-26T00:00:00.000Z');
      expect(new Date(allDayCall.data.endTime).toISOString()).toBe('2026-10-27T00:00:00.000Z');
    });

    it('rejects ICS import when parsed event count exceeds MAX_ICS_EVENTS (500) with 400 TOO_MANY_EVENTS', async () => {
      const vevents: string[] = [];
      for (let i = 1; i <= 501; i++) {
        vevents.push(
          'BEGIN:VEVENT',
          `UID:evt-overflow-${i}@test.com`,
          'DTSTART:20261101T100000Z',
          'DTEND:20261101T110000Z',
          `SUMMARY:Overflow Event ${i}`,
          'END:VEVENT',
        );
      }
      const icsData = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...vevents, 'END:VCALENDAR'].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/events/import/ics',
        payload: { icsData },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('TOO_MANY_EVENTS');
      expect(body.error.message).toContain('exceeds the limit of 500');
    });
  });

  describe('Tasks C26 & C28: Cursor Pagination & Booking Route Deduplication', () => {
    describe('Task C28: GET /events with Cursor Pagination', () => {
      it('returns paginated events with limit, hasMore, nextCursor, and totalCount', async () => {
        const fakeRows = [
          {
            ...BASE_ROW,
            id: 'evt-page-1',
            title: 'Page Event 1',
            startTime: new Date('2026-10-01T10:00:00.000Z'),
          },
          {
            ...BASE_ROW,
            id: 'evt-page-2',
            title: 'Page Event 2',
            startTime: new Date('2026-10-02T10:00:00.000Z'),
          },
          {
            ...BASE_ROW,
            id: 'evt-page-3',
            title: 'Page Event 3',
            startTime: new Date('2026-10-03T10:00:00.000Z'),
          },
        ];
        prisma.event.findMany.mockResolvedValueOnce(fakeRows);
        prisma.event.count.mockResolvedValueOnce(10);

        const response = await app.inject({
          method: 'GET',
          url: '/events?limit=2',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(2);
        expect(body.data[0].id).toBe('evt-page-1');
        expect(body.data[1].id).toBe('evt-page-2');
        expect(body.hasMore).toBe(true);
        expect(body.nextCursor).toBe('evt-page-2');
        expect(body.totalCount).toBe(10);

        expect(prisma.event.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ userId: 'user-cal-1' }),
            orderBy: { startTime: 'asc' },
            take: 3,
          }),
        );
      });

      it('fetches next page when cursor is provided', async () => {
        const fakeRows = [
          {
            ...BASE_ROW,
            id: 'evt-page-3',
            title: 'Page Event 3',
            startTime: new Date('2026-10-03T10:00:00.000Z'),
          },
        ];
        prisma.event.findMany.mockResolvedValueOnce(fakeRows);
        prisma.event.count.mockResolvedValueOnce(10);

        const response = await app.inject({
          method: 'GET',
          url: '/events?cursor=evt-page-2&limit=2',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].id).toBe('evt-page-3');
        expect(body.hasMore).toBe(false);
        expect(body.nextCursor).toBeNull();
        expect(body.totalCount).toBe(10);

        expect(prisma.event.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ userId: 'user-cal-1' }),
            orderBy: { startTime: 'asc' },
            take: 3,
            cursor: { id: 'evt-page-2' },
            skip: 1,
          }),
        );
      });
    });

    describe('Task C26: Booking Route Deduplication (D16)', () => {
      it('returns identical booking link details from /booking/links/:slug and /calendar/booking/:slug', async () => {
        const res1 = await app.inject({
          method: 'GET',
          url: '/booking/links/quick-sync',
        });
        const res2 = await app.inject({
          method: 'GET',
          url: '/calendar/booking/quick-sync',
        });

        expect(res1.statusCode).toBe(200);
        expect(res2.statusCode).toBe(200);
        expect(JSON.parse(res1.body)).toEqual(JSON.parse(res2.body));
        const body = JSON.parse(res1.body);
        expect(body.success).toBe(true);
        expect(body.data.slug).toBe('quick-sync');
        expect(body.data.duration).toBe(30);
      });

      it('validates date parameter and returns identical slots from both slot endpoints', async () => {
        // Missing date parameter validation error check
        const err1 = await app.inject({
          method: 'GET',
          url: '/booking/links/quick-sync/slots',
        });
        const err2 = await app.inject({
          method: 'GET',
          url: '/calendar/booking/quick-sync/slots',
        });

        expect(err1.statusCode).toBe(400);
        expect(err2.statusCode).toBe(400);
        expect(JSON.parse(err1.body)).toEqual(JSON.parse(err2.body));
        expect(JSON.parse(err1.body).error.code).toBe('VALIDATION_FAILED');

        // Valid date query
        prisma.event.findMany.mockResolvedValue([]);
        const slots1 = await app.inject({
          method: 'GET',
          url: '/booking/links/quick-sync/slots?date=2026-09-22T00:00:00.000Z',
        });
        const slots2 = await app.inject({
          method: 'GET',
          url: '/calendar/booking/quick-sync/slots?date=2026-09-22T00:00:00.000Z',
        });

        expect(slots1.statusCode).toBe(200);
        expect(slots2.statusCode).toBe(200);
        expect(JSON.parse(slots1.body)).toEqual(JSON.parse(slots2.body));
        const body = JSON.parse(slots1.body);
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('confirms bookings via shared handler on both /booking/links/:slug/book and /calendar/booking/:slug/book', async () => {
        prisma.event.findMany.mockResolvedValue([]);
        const payload1 = {
          slot: '2026-09-22T10:00:00.000Z',
          name: 'Bob Smith',
          email: 'bob@example.com',
          notes: 'Discussing project',
        };
        const res1 = await app.inject({
          method: 'POST',
          url: '/booking/links/quick-sync/book',
          payload: payload1,
        });

        expect(res1.statusCode).toBe(201);
        const body1 = JSON.parse(res1.body);
        expect(body1.success).toBe(true);

        prisma.event.findMany.mockResolvedValue([]);
        const payload2 = {
          slot: '2026-09-22T11:00:00.000Z',
          name: 'Alice Wonder',
          email: 'alice@example.com',
        };
        const res2 = await app.inject({
          method: 'POST',
          url: '/calendar/booking/quick-sync/book',
          payload: payload2,
        });

        expect(res2.statusCode).toBe(201);
        const body2 = JSON.parse(res2.body);
        expect(body2.success).toBe(true);
      });
    });
  });
});
