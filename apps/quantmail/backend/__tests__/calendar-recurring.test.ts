// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import {
  RecurringService,
  type CalendarEvent,
  type RecurrenceRule,
} from '../services/recurring.service';
import { BookingLinkService } from '../services/booking-link.service';

const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const startTime = overrides.startTime ?? new Date('2026-01-01T09:00:00.000Z');
  return {
    id: 'recurring-1',
    title: 'Recurring standup',
    description: '',
    startTime,
    endTime: overrides.endTime ?? new Date(startTime.getTime() + HOUR),
    allDay: false,
    location: '',
    userId: 'user-1',
    attendees: [],
    recurrenceRule: 'FREQ=DAILY',
    status: 'confirmed',
    reminders: [],
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2025-12-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('RecurringService RRULE parsing and serialization', () => {
  const service = new RecurringService();

  it.each([
    ['DAILY', 'daily'],
    ['WEEKLY', 'weekly'],
    ['MONTHLY', 'monthly'],
    ['YEARLY', 'yearly'],
  ] as const)('parses %s frequency', (rruleFrequency, expectedFrequency) => {
    expect(service.parseRRule(`FREQ=${rruleFrequency}`)).toEqual({
      frequency: expectedFrequency,
      interval: 1,
    });
  });

  it('round-trips interval, count, until, and byDay values', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 2,
      count: 8,
      until: new Date('2026-12-31T00:00:00.000Z'),
      byDay: ['MO', 'WE', 'FR'],
    };

    const serialized = service.serializeRRule(rule);
    expect(serialized).toBe(
      'FREQ=WEEKLY;INTERVAL=2;COUNT=8;UNTIL=20261231T000000Z;BYDAY=MO,WE,FR',
    );
    expect(service.parseRRule(serialized)).toEqual(rule);
  });

  it('serializes every supported frequency', () => {
    expect(service.serializeRRule({ frequency: 'daily', interval: 1 })).toBe('FREQ=DAILY');
    expect(service.serializeRRule({ frequency: 'weekly', interval: 1 })).toBe('FREQ=WEEKLY');
    expect(service.serializeRRule({ frequency: 'monthly', interval: 1 })).toBe('FREQ=MONTHLY');
    expect(service.serializeRRule({ frequency: 'yearly', interval: 1 })).toBe('FREQ=YEARLY');
  });
});

describe('RecurringService occurrence expansion', () => {
  const service = new RecurringService();

  it('generates exactly three daily instances in a five-day window when count is three', () => {
    const occurrences = service.expandOccurrences(
      event({ recurrenceRule: 'FREQ=DAILY;COUNT=3' }),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-05T23:59:59.999Z'),
    );

    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((item) => item.startTime.toISOString())).toEqual([
      '2026-01-01T09:00:00.000Z',
      '2026-01-02T09:00:00.000Z',
      '2026-01-03T09:00:00.000Z',
    ]);
  });

  it('stops a weekly series at the inclusive until boundary', () => {
    const occurrences = service.expandOccurrences(
      event({
        startTime: new Date('2026-01-05T09:00:00.000Z'),
        endTime: new Date('2026-01-05T10:00:00.000Z'),
        recurrenceRule: 'FREQ=WEEKLY;UNTIL=20260119T090000Z',
      }),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-02-28T23:59:59.999Z'),
    );

    expect(occurrences.map((item) => item.startTime.toISOString())).toEqual([
      '2026-01-05T09:00:00.000Z',
      '2026-01-12T09:00:00.000Z',
      '2026-01-19T09:00:00.000Z',
    ]);
  });

  it('skips an exception without dropping subsequent occurrences', () => {
    const occurrences = service.expandOccurrences(
      event({ recurrenceRule: 'FREQ=DAILY;COUNT=3;EXDATE=20260102T090000Z' }),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-05T23:59:59.999Z'),
    );

    expect(occurrences.map((item) => item.startTime.toISOString())).toEqual([
      '2026-01-01T09:00:00.000Z',
      '2026-01-03T09:00:00.000Z',
      '2026-01-04T09:00:00.000Z',
    ]);
  });

  it('matches only requested weekdays', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 1,
      byDay: ['MO', 'WE', 'FR'],
    };

    expect(service.matchesRule(new Date('2026-01-05T12:00:00.000Z'), rule)).toBe(true);
    expect(service.matchesRule(new Date('2026-01-07T12:00:00.000Z'), rule)).toBe(true);
    expect(service.matchesRule(new Date('2026-01-09T12:00:00.000Z'), rule)).toBe(true);
    expect(service.matchesRule(new Date('2026-01-06T12:00:00.000Z'), rule)).toBe(false);
  });
});

describe('GET /events recurring expansion', () => {
  it('expands a series that began before the window, sorts results, and returns unique IDs', async () => {
    const standardRows = [
      event({
        id: 'single-late',
        title: 'Late one-off',
        startTime: new Date('2026-01-04T12:00:00.000Z'),
        endTime: new Date('2026-01-04T13:00:00.000Z'),
        recurrenceRule: null,
      }),
      event({
        id: 'single-early',
        title: 'Early one-off',
        startTime: new Date('2026-01-03T08:00:00.000Z'),
        endTime: new Date('2026-01-03T08:30:00.000Z'),
        recurrenceRule: null,
      }),
    ];
    const recurringRow = event({
      startTime: new Date('2026-01-01T09:00:00.000Z'),
      endTime: new Date('2026-01-01T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY',
      attendees: [{ email: 'team@example.com' }],
      reminders: [{ type: 'push', minutesBefore: 10 }],
    });
    const prisma = {
      event: {
        findMany: vi.fn(async (args: { where: { recurrenceRule?: unknown } }) =>
          args.where.recurrenceRule === null ? standardRows : [recurringRow],
        ),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      calendar: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
      },
      bookingLink: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };
    const app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
    });
    await app.register(calendarRoutes);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/events?start=2026-01-03T00:00:00.000Z&end=2026-01-05T23:59:59.999Z',
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const results = response.json().data as Array<{ id: string; start: string }>;
    const starts = results.map((item) => item.start);
    expect(starts).toEqual([...starts].sort());
    expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
    expect(results.filter((item) => item.id.startsWith('recurring-1_'))).toHaveLength(3);
    expect(results.some((item) => item.start === '2026-01-03T09:00:00.000Z')).toBe(true);
    expect(prisma.event.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('BookingLinkService recurring conflict guards', () => {
  function harness() {
    const bookingDate = new Date(2030, 0, 7, 0, 0, 0, 0);
    const recurringStart = new Date(2029, 11, 31, 10, 0, 0, 0);
    const recurringEvent = event({
      startTime: recurringStart,
      endTime: new Date(recurringStart.getTime() + HOUR),
      recurrenceRule: 'FREQ=WEEKLY',
    });
    const bookingLink = {
      id: 'link-1',
      userId: 'user-1',
      slug: 'standup',
      title: 'Office hours',
      description: '',
      duration: 60,
      availableDays: JSON.stringify([bookingDate.getDay()]),
      startHour: 9,
      endHour: 12,
      isActive: true,
      createdAt: new Date('2029-01-01T00:00:00.000Z'),
      updatedAt: new Date('2029-01-01T00:00:00.000Z'),
    };
    const prisma = {
      bookingLink: {
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(bookingLink),
        findMany: vi.fn(),
      },
      event: {
        findMany: vi.fn(async (args: { where: { recurrenceRule?: unknown } }) =>
          args.where.recurrenceRule === null ? [] : [recurringEvent],
        ),
        create: vi.fn(),
      },
    };
    return {
      bookingDate,
      prisma,
      service: new BookingLinkService(prisma as never),
    };
  }

  it('marks an overlapping recurring slot unavailable and leaves other slots available', async () => {
    const { bookingDate, service } = harness();
    const slots = await service.getAvailableSlots('standup', bookingDate);

    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => [slot.start.getHours(), slot.available])).toEqual([
      [9, true],
      [10, false],
      [11, true],
    ]);
  });

  it('rejects confirmation when the selected slot overlaps a recurring occurrence', async () => {
    const { bookingDate, prisma, service } = harness();
    const selectedSlot = new Date(bookingDate);
    selectedSlot.setHours(10, 0, 0, 0);

    await expect(
      service.confirmBooking('standup', selectedSlot, {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      }),
    ).rejects.toMatchObject({
      message: 'Selected slot is no longer available',
      statusCode: 409,
      code: 'SLOT_UNAVAILABLE',
    });
    expect(prisma.event.create).not.toHaveBeenCalled();
  });
});
