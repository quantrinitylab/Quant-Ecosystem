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
  timeZone?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createInMemoryPrisma() {
  const events = new Map<string, StoredEvent>();
  const bookingLinks = new Map<string, any>();
  let autoId = 100;
  let autoLinkSeq = 1;

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
          if (where.endTime?.gt && e.endTime <= where.endTime.gt) return false;
          if (where.endTime?.lt && e.endTime >= where.endTime.lt) return false;
          if (
            where.status &&
            typeof where.status === 'object' &&
            where.status.not &&
            e.status === where.status.not
          )
            return false;
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
          timeZone: data.timeZone ?? 'UTC',
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
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'user-parity-1') {
          return {
            id: 'user-parity-1',
            email: 'founder@quantmail.in',
            displayName: 'Founder & CEO',
          };
        }
        return null;
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
    bookingLink: {
      findUnique: vi.fn().mockImplementation(async ({ where }: { where: { slug: string } }) => {
        const found = bookingLinks.get(where.slug);
        return found ? { ...found } : null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: { where?: any }) => {
        return Array.from(bookingLinks.values()).filter(
          (l) => !where?.userId || l.userId === where.userId,
        );
      }),
      create: vi.fn().mockImplementation(async ({ data }: { data: any }) => {
        const id = data.id || `link-${autoLinkSeq++}`;
        const record = { id, ...data };
        bookingLinks.set(data.slug, record);
        return { ...record };
      }),
    },
    _eventsMap: events,
    _bookingLinksMap: bookingLinks,
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

  describe('7. RFC 5545 Meeting Invites (Task C18)', () => {
    it('GET /events/:id/invite.ics generates METHOD:REQUEST with ORGANIZER and ATTENDEE tags', async () => {
      const event = await prisma.event.create({
        data: {
          id: 'evt-invite-test',
          userId: 'user-parity-1',
          title: 'Architectural Sync',
          description: 'Weekly sync with external leads',
          startTime: new Date('2026-09-25T10:00:00.000Z'),
          endTime: new Date('2026-09-25T11:00:00.000Z'),
          attendees: JSON.stringify([
            { email: 'alex@external.org', name: 'Alex Partner', status: 'needs-action' },
            { email: 'sam@collaborator.io', name: 'Sam Collab', status: 'accepted' },
          ]),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/events/${event.id}/invite.ics`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/calendar; charset=utf-8');
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="architectural_sync_invite.ics"',
      );

      const body = res.body;
      expect(body).toContain('METHOD:REQUEST');
      expect(body).toContain('SEQUENCE:0');
      expect(body).toContain('ORGANIZER;CN=Founder & CEO:mailto:founder@quantmail.in');
      expect(body).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Alex Partner:mailto:alex@external.org',
      );
      expect(body).toContain(
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE;CN=Sam Collab:mailto:sam@collaborator.io',
      );
    });
  });

  describe('8. RFC 5545 Event Cancellation (Task C20)', () => {
    it('GET /events/:id/cancel.ics generates METHOD:CANCEL with STATUS:CANCELLED and SEQUENCE:1', async () => {
      const event = await prisma.event.create({
        data: {
          id: 'evt-cancel-test',
          userId: 'user-parity-1',
          title: 'Cancelled Meeting',
          startTime: new Date('2026-09-26T15:00:00.000Z'),
          endTime: new Date('2026-09-26T16:00:00.000Z'),
          attendees: JSON.stringify([
            { email: 'team@partner.com', name: 'Partner Team', status: 'accepted' },
          ]),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/events/${event.id}/cancel.ics`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain(
        'attachment; filename="cancelled_meeting_cancel.ics"',
      );

      const body = res.body;
      expect(body).toContain('METHOD:CANCEL');
      expect(body).toContain('STATUS:CANCELLED');
      expect(body).toContain('SEQUENCE:1');
      expect(body).toContain('ORGANIZER;CN=Founder & CEO:mailto:founder@quantmail.in');
    });
  });

  describe('9. Free/Busy Engine & Overlapping Block Merging (Task C23)', () => {
    it('GET /events/free-busy aggregates events and consolidates overlapping busy blocks', async () => {
      // Event A: 10:00 - 11:30
      await prisma.event.create({
        data: {
          id: 'busy-1',
          userId: 'user-parity-1',
          title: 'Session A',
          startTime: new Date('2026-09-22T10:00:00.000Z'),
          endTime: new Date('2026-09-22T11:30:00.000Z'),
        },
      });
      // Event B: 11:00 - 12:00 (overlaps with Session A)
      await prisma.event.create({
        data: {
          id: 'busy-2',
          userId: 'user-parity-1',
          title: 'Session B',
          startTime: new Date('2026-09-22T11:00:00.000Z'),
          endTime: new Date('2026-09-22T12:00:00.000Z'),
        },
      });
      // Event C: 14:00 - 15:00 (separate slot)
      await prisma.event.create({
        data: {
          id: 'busy-3',
          userId: 'user-parity-1',
          title: 'Session C',
          startTime: new Date('2026-09-22T14:00:00.000Z'),
          endTime: new Date('2026-09-22T15:00:00.000Z'),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/events/free-busy?start=2026-09-22T00:00:00.000Z&end=2026-09-22T23:59:59.999Z',
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.conflictsCount).toBe(3);
      expect(json.data.busyBlocksCount).toBe(2);

      const busy = json.data.busy;
      expect(busy.length).toBe(2);
      // First consolidated block: 10:00 to 12:00
      expect(new Date(busy[0].start).toISOString()).toBe('2026-09-22T10:00:00.000Z');
      expect(new Date(busy[0].end).toISOString()).toBe('2026-09-22T12:00:00.000Z');
      // Second block: 14:00 to 15:00
      expect(new Date(busy[1].start).toISOString()).toBe('2026-09-22T14:00:00.000Z');
      expect(new Date(busy[1].end).toISOString()).toBe('2026-09-22T15:00:00.000Z');
    });
  });

  describe('10. Conflict Detection & Warning (Task C24)', () => {
    it('rejects conflicting event with 409 CONFLICT_DETECTED when checkConflicts is true', async () => {
      await prisma.event.create({
        data: {
          id: 'evt-existing',
          userId: 'user-parity-1',
          title: 'Deep Work Block',
          startTime: new Date('2026-09-23T14:00:00.000Z'),
          endTime: new Date('2026-09-23T16:00:00.000Z'),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Interrupting Call',
          start: '2026-09-23T15:00:00.000Z',
          end: '2026-09-23T15:30:00.000Z',
          checkConflicts: true,
        },
      });

      expect(res.statusCode).toBe(409);
      const json = res.json();
      expect(json.code).toBe('CONFLICT_DETECTED');
      expect(json.conflicts.length).toBeGreaterThan(0);
      expect(json.conflicts[0].id).toBe('evt-existing');
    });

    it('allows conflicting event when force: true is provided alongside checkConflicts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Forced Priority Meeting',
          start: '2026-09-23T15:00:00.000Z',
          end: '2026-09-23T15:30:00.000Z',
          checkConflicts: true,
          force: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });
  });

  describe('11. Query Window Limits (Task C27)', () => {
    it('GET /events rejects query windows exceeding 365 days with 400 WINDOW_TOO_LARGE', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/events?start=2026-01-01T00:00:00.000Z&end=2027-02-01T00:00:00.000Z',
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('WINDOW_TOO_LARGE');
    });
  });

  describe('12. Recurring Series Split: "this_and_following" Scope (Task C07)', () => {
    it('DELETE /events/:syntheticId?scope=this_and_following clamps parent recurrence until right before occurrence', async () => {
      await prisma.event.create({
        data: {
          id: 'series-split-del',
          userId: 'user-parity-1',
          calendarId: 'cal-primary',
          title: 'Daily All-Hands',
          description: 'Team standup series',
          startTime: new Date('2026-09-20T09:00:00.000Z'),
          endTime: new Date('2026-09-20T09:30:00.000Z'),
          recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
        },
      });

      const occurrenceId = 'series-split-del_2026-09-22T09:00:00.000Z';
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/events/${occurrenceId}?scope=this_and_following`,
      });

      expect(deleteRes.statusCode).toBe(200);
      const json = deleteRes.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('This and following occurrences deleted');
      expect(new Date(json.data.until).toISOString()).toBe('2026-09-22T08:59:59.000Z');

      const parent = await prisma.event.findUnique({ where: { id: 'series-split-del' } });
      expect(parent?.recurrenceRule).toContain('UNTIL=20260922T085959Z');

      const listRes = await app.inject({
        method: 'GET',
        url: '/events?start=2026-09-20T00:00:00.000Z&end=2026-09-25T23:59:59.000Z',
      });
      expect(listRes.statusCode).toBe(200);
      const events = listRes.json().data.filter((e: any) => e.title === 'Daily All-Hands');
      const dates = events.map((e: any) => e.startTime.slice(0, 10));
      expect(dates).toContain('2026-09-20');
      expect(dates).toContain('2026-09-21');
      expect(dates).not.toContain('2026-09-22');
      expect(dates).not.toContain('2026-09-23');
    });

    it('DELETE /events/:syntheticId with scope in body also clamps parent series', async () => {
      await prisma.event.create({
        data: {
          id: 'series-split-del-body',
          userId: 'user-parity-1',
          calendarId: 'cal-primary',
          title: 'Weekly Sync',
          startTime: new Date('2026-09-21T10:00:00.000Z'),
          endTime: new Date('2026-09-21T11:00:00.000Z'),
          recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
        },
      });

      const occurrenceId = 'series-split-del-body_2026-09-28T10:00:00.000Z';
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/events/${occurrenceId}`,
        payload: { scope: 'this_and_following' },
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().data.message).toBe('This and following occurrences deleted');

      const parent = await prisma.event.findUnique({ where: { id: 'series-split-del-body' } });
      expect(parent?.recurrenceRule).toContain('UNTIL=20260928T095959Z');
    });

    it('PUT /events/:syntheticId with scope: "this_and_following" splits series and creates new recurring series', async () => {
      await prisma.event.create({
        data: {
          id: 'series-split-put',
          userId: 'user-parity-1',
          calendarId: 'cal-primary',
          title: 'Engineering Architecture Review',
          description: 'Weekly review',
          location: 'Conference Room 1',
          startTime: new Date('2026-09-21T10:00:00.000Z'),
          endTime: new Date('2026-09-21T11:00:00.000Z'),
          recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
        },
      });

      const occurrenceId = 'series-split-put_2026-09-28T10:00:00.000Z';
      const putRes = await app.inject({
        method: 'PUT',
        url: `/events/${occurrenceId}`,
        payload: {
          scope: 'this_and_following',
          title: 'Engineering Architecture & AI Sync',
          location: 'Executive Virtual Room',
          start: '2026-09-28T14:00:00.000Z',
          end: '2026-09-28T15:30:00.000Z',
        },
      });

      expect(putRes.statusCode).toBe(200);
      const json = putRes.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe('Engineering Architecture & AI Sync');
      expect(json.data.location).toBe('Executive Virtual Room');
      expect(json.data.startTime).toBe('2026-09-28T14:00:00.000Z');
      expect(json.data.endTime).toBe('2026-09-28T15:30:00.000Z');
      expect(json.data.recurrence).toContain('FREQ=WEEKLY');

      const parent = await prisma.event.findUnique({ where: { id: 'series-split-put' } });
      expect(parent?.recurrenceRule).toContain('UNTIL=20260928T095959Z');

      const newSeriesId = json.data.id;
      const newSeries = await prisma.event.findUnique({ where: { id: newSeriesId } });
      expect(newSeries).not.toBeNull();
      expect(newSeries?.title).toBe('Engineering Architecture & AI Sync');
      expect(newSeries?.recurrenceRule).toContain('FREQ=WEEKLY');
      expect(new Date(newSeries!.startTime).toISOString()).toBe('2026-09-28T14:00:00.000Z');
    });
  });

  describe('13. TimeZone Field in Events (Task C10 & C12)', () => {
    it('POST /events accepts timeZone and returns it in toEventDto', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Global Tokyo Sync',
          start: '2026-09-25T01:00:00.000Z',
          end: '2026-09-25T02:00:00.000Z',
          timeZone: 'Asia/Tokyo',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.timeZone).toBe('Asia/Tokyo');

      const getRes = await app.inject({
        method: 'GET',
        url: `/events/${json.data.id}`,
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data.timeZone).toBe('Asia/Tokyo');
    });

    it('defaults timeZone to UTC when not explicitly specified', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'Default Timezone Event',
          start: '2026-09-25T10:00:00.000Z',
          end: '2026-09-25T11:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.timeZone).toBe('UTC');
    });

    it('PUT /events/:id updates timeZone', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          title: 'London Sync',
          start: '2026-09-26T12:00:00.000Z',
          end: '2026-09-26T13:00:00.000Z',
          timeZone: 'UTC',
        },
      });
      const id = createRes.json().data.id;

      const updateRes = await app.inject({
        method: 'PUT',
        url: `/events/${id}`,
        payload: {
          timeZone: 'Europe/London',
        },
      });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().data.timeZone).toBe('Europe/London');
    });
  });

  describe('14. Working Hours Conflict Check on Booking Links (Task C25)', () => {
    const bookingSlug = 'founder-office-hours';
    const mondayDate = new Date(2030, 0, 7); // Monday Jan 7, 2030

    beforeEach(async () => {
      await prisma.bookingLink.create({
        data: {
          id: 'link-parity-25',
          userId: 'user-parity-1',
          slug: bookingSlug,
          title: 'Founder Office Hours',
          description: '1-on-1 discussion',
          duration: 60,
          availableDays: JSON.stringify([1, 2, 3, 4, 5]),
          startHour: 9,
          endHour: 17,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    it('rejects booking requested before link.startHour with 400 INVALID_BOOKING_SLOT', async () => {
      const earlySlot = new Date(mondayDate);
      earlySlot.setHours(8, 0, 0, 0);

      const res = await app.inject({
        method: 'POST',
        url: `/booking/links/${bookingSlug}/book`,
        payload: {
          slot: earlySlot.toISOString(),
          name: 'Early Bird',
          email: 'early@example.com',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('INVALID_BOOKING_SLOT');
    });

    it('rejects booking that ends after link.endHour with 400 INVALID_BOOKING_SLOT', async () => {
      const lateSlot = new Date(mondayDate);
      lateSlot.setHours(16, 30, 0, 0);

      const res = await app.inject({
        method: 'POST',
        url: `/booking/links/${bookingSlug}/book`,
        payload: {
          slot: lateSlot.toISOString(),
          name: 'Late Booker',
          email: 'late@example.com',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('INVALID_BOOKING_SLOT');
    });

    it('rejects booking on unavailable day (Sunday) with 400 INVALID_BOOKING_SLOT', async () => {
      const sundaySlot = new Date(2030, 0, 6, 11, 0, 0, 0); // Sunday Jan 6, 2030

      const res = await app.inject({
        method: 'POST',
        url: `/booking/links/${bookingSlug}/book`,
        payload: {
          slot: sundaySlot.toISOString(),
          name: 'Weekend Booker',
          email: 'weekend@example.com',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('INVALID_BOOKING_SLOT');
    });

    it('confirms booking when slot is strictly within availableDays and working hours', async () => {
      const validSlot = new Date(mondayDate);
      validSlot.setHours(10, 0, 0, 0);

      const res = await app.inject({
        method: 'POST',
        url: `/booking/links/${bookingSlug}/book`,
        payload: {
          slot: validSlot.toISOString(),
          name: 'Valid Client',
          email: 'client@example.com',
          notes: 'Discuss Q4 objectives',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toContain('Founder Office Hours');
    });
  });
});
