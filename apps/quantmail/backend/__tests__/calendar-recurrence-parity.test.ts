// @vitest-environment node
// ============================================================================
// Phase C Wave 6 Parity Suite: Recurrence Parity, Exceptions, Timezones & ICS
// Tasks C06, C08, C09, C11, C13, C16, C17, C22
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';

interface StoredEvent {
  id: string;
  userId: string;
  calendarId: string | null;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string;
  status: string;
  attendees: string;
  reminders: string;
  recurrenceRule: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createInMemoryPrisma() {
  const events = new Map<string, StoredEvent>();
  let autoId = 100;

  return {
    event: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        const found = events.get(where.id);
        return found ? { ...found } : null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: { where: any }) => {
        const list = Array.from(events.values()).filter((e) => {
          if (where.userId && e.userId !== where.userId) return false;
          if (where.recurrenceRule === null && e.recurrenceRule !== null) return false;
          if (
            where.recurrenceRule &&
            where.recurrenceRule.not === null &&
            e.recurrenceRule === null
          )
            return false;
          if (where.calendarId && e.calendarId !== where.calendarId) return false;
          if (where.startTime?.gte && e.startTime < where.startTime.gte) return false;
          if (where.startTime?.lte && e.startTime > where.startTime.lte) return false;
          if (where.startTime?.lt && e.startTime >= where.startTime.lt) return false;
          if (where.startTime?.gt && e.startTime <= where.startTime.gt) return false;
          return true;
        });
        return list.map((e) => ({ ...e }));
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
        const id = data.id || `evt-${autoId++}`;
        const record: StoredEvent = {
          id,
          userId: data.userId,
          calendarId: data.calendarId ?? null,
          title: data.title,
          description: data.description ?? '',
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          allDay: data.allDay ?? false,
          location: data.location ?? '',
          status: data.status ?? 'confirmed',
          attendees: data.attendees ?? '[]',
          reminders: data.reminders ?? '[]',
          recurrenceRule: data.recurrenceRule ?? null,
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
        };
        events.set(id, record);
        return { ...record };
      }),
      update: vi
        .fn()
        .mockImplementation(async ({ where, data }: { where: { id: string }; data: any }) => {
          const existing = events.get(where.id);
          if (!existing) throw new Error('Record not found');
          const updated: StoredEvent = {
            ...existing,
            ...data,
            updatedAt: data.updatedAt ?? new Date(),
          };
          events.set(where.id, updated);
          return { ...updated };
        }),
      delete: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        const existing = events.get(where.id);
        events.delete(where.id);
        return existing ? { ...existing } : null;
      }),
    },
    calendar: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cal-primary',
        userId: 'user-parity-1',
        name: 'Primary',
        isPrimary: true,
      }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'cal-primary', name: 'Primary', isPrimary: true }]),
      create: vi.fn().mockResolvedValue({
        id: 'cal-auto',
        name: 'Primary',
        isPrimary: true,
      }),
    },
    _eventsMap: events,
  };
}

describe('Wave 6 (Phase C) Calendar Recurrence Parity & Exceptions Suite', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    prisma = createInMemoryPrisma();
    app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request: any) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-parity-1' };
    });
    await app.register(calendarRoutes);
    await app.ready();
  });

  describe('1. Single-Occurrence Delete (Task C08 & C09)', () => {
    it('DELETE /events/:syntheticId excludes date from series via EXDATE and removes from expanded occurrences', async () => {
      // Seed a daily repeating event from 2026-09-20 to 2026-09-25
      await prisma.event.create({
        data: {
          id: 'series-parent-1',
          userId: 'user-parity-1',
          calendarId: 'cal-primary',
          title: 'Daily Standup',
          description: 'Team standup',
          startTime: new Date('2026-09-20T09:00:00.000Z'),
          endTime: new Date('2026-09-20T09:30:00.000Z'),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      // Verify that initially the expansion returns occurrences for 20, 21, 22
      const initialGet = await app.inject({
        method: 'GET',
        url: '/events?start=2026-09-20T00:00:00.000Z&end=2026-09-23T23:59:59.000Z',
      });
      expect(initialGet.statusCode).toBe(200);
      const initialEvents = initialGet.json().data;
      const initialDates = initialEvents.map((e: any) => e.startTime.slice(0, 10));
      expect(initialDates).toContain('2026-09-20');
      expect(initialDates).toContain('2026-09-21');
      expect(initialDates).toContain('2026-09-22');

      // Delete occurrence for 2026-09-21
      const occurrenceId = 'series-parent-1_2026-09-21T09:00:00.000Z';
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/events/${occurrenceId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      const deleteJson = deleteRes.json();
      expect(deleteJson.success).toBe(true);
      expect(deleteJson.data.message).toBe('Occurrence deleted from series');
      expect(deleteJson.data.excludedDate).toBe('2026-09-21T09:00:00.000Z');

      // Check updated parent event has EXDATE in its recurrenceRule
      const updatedParent = await prisma.event.findUnique({ where: { id: 'series-parent-1' } });
      expect(updatedParent?.recurrenceRule).toContain('EXDATE=20260921T090000Z');

      // Expanding occurrences should now OMIT 2026-09-21
      const subsequentGet = await app.inject({
        method: 'GET',
        url: '/events?start=2026-09-20T00:00:00.000Z&end=2026-09-23T23:59:59.000Z',
      });
      expect(subsequentGet.statusCode).toBe(200);
      const subsequentDates = subsequentGet.json().data.map((e: any) => e.startTime.slice(0, 10));
      expect(subsequentDates).toContain('2026-09-20');
      expect(subsequentDates).not.toContain('2026-09-21');
      expect(subsequentDates).toContain('2026-09-22');
    });

    it('returns 404 when deleting a synthetic occurrence whose parent is not owned by caller', async () => {
      await prisma.event.create({
        data: {
          id: 'foreign-series',
          userId: 'user-other',
          title: 'Private Series',
          startTime: new Date('2026-09-20T09:00:00.000Z'),
          endTime: new Date('2026-09-20T09:30:00.000Z'),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/events/foreign-series_2026-09-21T09:00:00.000Z',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
    });
  });

  describe('2. Single-Occurrence Edit (Task C06 & C09)', () => {
    it('PUT /events/:syntheticId adds EXDATE to parent, creates standalone modified single event, and returns 200', async () => {
      // Seed a weekly recurring series
      await prisma.event.create({
        data: {
          id: 'series-parent-2',
          userId: 'user-parity-1',
          calendarId: 'cal-primary',
          title: 'Sprint Planning',
          description: 'Weekly backlog sprint planning',
          location: 'Conference Room B',
          startTime: new Date('2026-09-21T10:00:00.000Z'),
          endTime: new Date('2026-09-21T11:00:00.000Z'),
          recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
          attendees: JSON.stringify([
            { email: 'lead@quantmail.in', name: 'Lead', status: 'accepted' },
          ]),
          reminders: JSON.stringify([
            { type: 'push', minutesBefore: 15, label: '15 minutes before' },
          ]),
        },
      });

      // Edit only the occurrence on 2026-09-21 to be rescheduled to 14:00 with modified title
      const occurrenceId = 'series-parent-2_2026-09-21T10:00:00.000Z';
      const putRes = await app.inject({
        method: 'PUT',
        url: `/events/${occurrenceId}`,
        payload: {
          title: 'Sprint Planning (Rescheduled for Leadership Sync)',
          start: '2026-09-21T14:00:00.000Z',
          end: '2026-09-21T15:30:00.000Z',
          location: 'Executive Boardroom',
        },
      });

      expect(putRes.statusCode).toBe(200);
      const putJson = putRes.json();
      expect(putJson.success).toBe(true);
      expect(putJson.data.title).toBe('Sprint Planning (Rescheduled for Leadership Sync)');
      expect(putJson.data.startTime).toBe('2026-09-21T14:00:00.000Z');
      expect(putJson.data.endTime).toBe('2026-09-21T15:30:00.000Z');
      expect(putJson.data.location).toBe('Executive Boardroom');
      expect(putJson.data.recurrence).toBeNull(); // Standalone single event

      // Verify parent now excludes 2026-09-21
      const parent = await prisma.event.findUnique({ where: { id: 'series-parent-2' } });
      expect(parent?.recurrenceRule).toContain('EXDATE=20260921T100000Z');

      // Verify standalone event was persisted in Prisma
      const createdId = putJson.data.id;
      const standalone = await prisma.event.findUnique({ where: { id: createdId } });
      expect(standalone).not.toBeNull();
      expect(standalone?.recurrenceRule).toBeNull();
      expect(standalone?.title).toBe('Sprint Planning (Rescheduled for Leadership Sync)');
    });

    it('PATCH /events/:syntheticId also works for single occurrence updates', async () => {
      await prisma.event.create({
        data: {
          id: 'series-parent-patch',
          userId: 'user-parity-1',
          title: '1-on-1 Sync',
          startTime: new Date('2026-09-22T09:00:00.000Z'),
          endTime: new Date('2026-09-22T09:30:00.000Z'),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      const patchRes = await app.inject({
        method: 'PATCH',
        url: '/events/series-parent-patch_2026-09-22T09:00:00.000Z',
        payload: {
          title: 'Special 1-on-1 Review',
        },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().data.title).toBe('Special 1-on-1 Review');
      expect(patchRes.json().data.recurrence).toBeNull();

      const parent = await prisma.event.findUnique({ where: { id: 'series-parent-patch' } });
      expect(parent?.recurrenceRule).toContain('EXDATE=20260922T090000Z');
    });
  });

  describe('3. Reject Unparseable RRULE with 400 (Task C13)', () => {
    it('POST /events rejects malformed RRULE string with 400 and code INVALID_RRULE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Bad Recurrence Event',
          start: '2026-09-20T10:00:00.000Z',
          end: '2026-09-20T11:00:00.000Z',
          recurrenceRule: 'rubbish;invalid',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVALID_RRULE');
      expect(json.error.message).toContain('malformed RRULE string');
    });

    it('PUT /events/:id rejects malformed RRULE string with 400 and code INVALID_RRULE', async () => {
      await prisma.event.create({
        data: {
          id: 'evt-update-rrule',
          userId: 'user-parity-1',
          title: 'Valid Event',
          startTime: new Date('2026-09-20T10:00:00.000Z'),
          endTime: new Date('2026-09-20T11:00:00.000Z'),
        },
      });

      const res = await app.inject({
        method: 'PUT',
        url: '/events/evt-update-rrule',
        payload: {
          recurrence: 'FREQ=INVALID_FREQ_NAME',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_RRULE');
    });
  });

  describe('4. Timezone-aware /events/today with Recurring Expansion (Task C11)', () => {
    it('GET /events/today with timeZone=Asia/Kolkata expands recurring events for today', async () => {
      // Seed a recurring daily event starting 5 days ago
      const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
      await prisma.event.create({
        data: {
          id: 'recurring-today-series',
          userId: 'user-parity-1',
          title: 'Daily Morning Standup',
          startTime: fiveDaysAgo,
          endTime: new Date(fiveDaysAgo.getTime() + 1_800_000),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/events/today?timeZone=Asia/Kolkata',
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const found = json.data.find((e: any) => e.title === 'Daily Morning Standup');
      expect(found).toBeDefined();
      expect(found.id).toContain('recurring-today-series_');
    });

    it('GET /events/today respects x-timezone header and falls back cleanly on invalid timezone', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events/today',
        headers: {
          'x-timezone': 'Invalid/Timezone_Name',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });

  describe('5. Return Rich Attendee Details in toEventDto (Task C16)', () => {
    it('toEventDto returns attendees with email, name, and status', async () => {
      const event = await prisma.event.create({
        data: {
          id: 'evt-rich-attendees',
          userId: 'user-parity-1',
          title: 'Design Review with Team',
          startTime: new Date('2026-09-25T15:00:00.000Z'),
          endTime: new Date('2026-09-25T16:00:00.000Z'),
          attendees: JSON.stringify([
            { email: 'alex@quantmail.in', name: 'Alex Rivera', status: 'accepted' },
            { email: 'sarah@quantmail.in', name: 'Sarah Chen', status: 'declined' },
            'bare-email@quantmail.in',
          ]),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/events/${event.id}`,
      });

      expect(res.statusCode).toBe(200);
      const attendees = res.json().data.attendees;
      expect(attendees).toHaveLength(3);
      expect(attendees[0]).toEqual({
        email: 'alex@quantmail.in',
        name: 'Alex Rivera',
        status: 'accepted',
      });
      expect(attendees[1]).toEqual({
        email: 'sarah@quantmail.in',
        name: 'Sarah Chen',
        status: 'declined',
      });
      expect(attendees[2]).toEqual({
        email: 'bare-email@quantmail.in',
        name: '',
        status: 'pending',
      });
    });
  });

  describe('6. ICS Export Route GET /events/:id/ics (Task C17)', () => {
    it('returns RFC 5545 iCalendar format with text/calendar content-type and filename', async () => {
      const event = await prisma.event.create({
        data: {
          id: 'evt-ics-test-1',
          userId: 'user-parity-1',
          title: 'Executive Architecture Review & Strategy',
          description: 'Q3 Ecosystem Roadmaps & Parity Check',
          location: 'QuantMeet Room Alpha',
          startTime: new Date('2026-09-28T14:00:00.000Z'),
          endTime: new Date('2026-09-28T15:30:00.000Z'),
          recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/events/${event.id}/ics`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="executive_architecture_review_strategy.ics"',
      );

      const body = res.body;
      expect(body).toContain('BEGIN:VCALENDAR');
      expect(body).toContain('VERSION:2.0');
      expect(body).toContain('PRODID:-//Quant Ecosystem//QuantCalendar//EN');
      expect(body).toContain('BEGIN:VEVENT');
      expect(body).toContain(`UID:${event.id}@quantmail.in`);
      expect(body).toContain('DTSTART:20260928T140000Z');
      expect(body).toContain('DTEND:20260928T153000Z');
      expect(body).toContain('SUMMARY:Executive Architecture Review & Strategy');
      expect(body).toContain('DESCRIPTION:Q3 Ecosystem Roadmaps & Parity Check');
      expect(body).toContain('LOCATION:QuantMeet Room Alpha');
      expect(body).toContain('STATUS:CONFIRMED');
      expect(body).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1');
      expect(body).toContain('END:VEVENT');
      expect(body).toContain('END:VCALENDAR');
    });

    it('exports ICS for synthetic recurring occurrence ID', async () => {
      await prisma.event.create({
        data: {
          id: 'evt-ics-parent',
          userId: 'user-parity-1',
          title: 'Daily Standup',
          startTime: new Date('2026-09-20T09:00:00.000Z'),
          endTime: new Date('2026-09-20T09:30:00.000Z'),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/events/evt-ics-parent_2026-09-22T09:00:00.000Z/ics',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('DTSTART:20260922T090000Z');
      expect(res.body).toContain('DTEND:20260922T093000Z');
      expect(res.body).toContain('SUMMARY:Daily Standup');
    });

    it('returns 404 when exporting ICS for non-existent event or another user event', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events/non-existent-event/ics',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
    });
  });
});
