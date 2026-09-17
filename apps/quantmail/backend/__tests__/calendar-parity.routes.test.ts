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
      create: vi.fn().mockImplementation(async ({ data }) => ({
        ...BASE_ROW,
        ...data,
        id: 'evt-created-1',
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
  });
});
