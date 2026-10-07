// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import {
  CalendarCallAlertService,
  type CalendarEventInput,
} from '../services/calendar-call-alert.service';
import type { TypedQueue, ProactiveAgentJob } from '@quant/queue';

describe('CalendarCallAlertService Unit Tests', () => {
  it('ignores reminders of non-call types (push, email)', async () => {
    const service = new CalendarCallAlertService();
    const event: CalendarEventInput = {
      id: 'event-1',
      title: 'Standup',
      userId: 'user-123',
      startTime: new Date('2026-09-15T10:00:00.000Z'),
      reminders: [
        { type: 'push', minutesBefore: 15 },
        { type: 'email', minutesBefore: 30 },
      ],
    };

    const scheduled = await service.scheduleAlertsForEvent(event);
    expect(scheduled).toHaveLength(0);
    expect(service.getScheduledAlerts('user-123')).toHaveLength(0);
  });

  it('correctly calculates fireAt and schedules call alert job for type call', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as TypedQueue<ProactiveAgentJob>;

    const service = new CalendarCallAlertService({ queue: mockQueue });
    const now = new Date('2026-09-15T09:30:00.000Z');
    const startTime = new Date('2026-09-15T10:00:00.000Z');

    const event: CalendarEventInput = {
      id: 'meeting-99',
      title: 'Board Review',
      userId: 'user-456',
      startTime,
      location: 'Conference Room Alpha',
      organizer: 'Satya',
      reminders: [{ type: 'call', minutesBefore: 10 }],
    };

    const scheduled = await service.scheduleAlertsForEvent(event, now);

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      jobId: 'call-alert-meeting-99-10',
      eventId: 'meeting-99',
      userId: 'user-456',
      title: 'Board Review',
      minutesBefore: 10,
      fireAt: '2026-09-15T09:50:00.000Z',
      status: 'scheduled',
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'meeting-call-alert',
      expect.objectContaining({
        jobType: 'meeting_call_alert',
        userId: 'user-456',
        targetApp: 'quantchat',
        scheduledFor: '2026-09-15T09:50:00.000Z',
        priority: 'urgent',
        payload: {
          meetingId: 'meeting-99',
          title: 'Board Review',
          organizer: 'Satya',
          startTime: startTime.toISOString(),
          minutesUntilStart: 10,
          location: 'Conference Room Alpha',
        },
      }),
      {
        delay: 20 * 60 * 1000, // 09:30 to 09:50 = 20 minutes = 1,200,000 ms
        jobId: 'call-alert-meeting-99-10',
      },
    );
  });

  it('handles multiple call reminders and JSON string reminders', async () => {
    const service = new CalendarCallAlertService();
    const now = new Date('2026-09-15T09:00:00.000Z');
    const startTime = new Date('2026-09-15T10:00:00.000Z');

    const event: CalendarEventInput = {
      id: 'multi-call-event',
      title: 'Design Sync',
      userId: 'user-789',
      startTime,
      reminders: JSON.stringify([
        { type: 'call', minutesBefore: 15 },
        { type: 'push', minutesBefore: 10 },
        { type: 'call', minutesBefore: 5 },
      ]),
    };

    const scheduled = await service.scheduleAlertsForEvent(event, now);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.map((s) => s.minutesBefore)).toEqual([15, 5]);

    const active = service.getScheduledAlerts('user-789');
    expect(active).toHaveLength(2);
  });

  it('cancels scheduled alerts for an event and removes BullMQ job', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      remove: vi.fn().mockResolvedValue(undefined),
    } as unknown as TypedQueue<ProactiveAgentJob>;

    const service = new CalendarCallAlertService({ queue: mockQueue });
    const event: CalendarEventInput = {
      id: 'event-to-cancel',
      title: 'Sync',
      userId: 'user-cancel',
      startTime: new Date('2026-09-15T11:00:00.000Z'),
      reminders: [{ type: 'call', minutesBefore: 5 }],
    };

    await service.scheduleAlertsForEvent(event);
    expect(service.getScheduledAlerts('user-cancel')).toHaveLength(1);

    const cancelledCount = await service.cancelAlertsForEvent('event-to-cancel');
    expect(cancelledCount).toBe(1);
    expect(service.getScheduledAlerts('user-cancel')).toHaveLength(0);
    expect(mockQueue.remove).toHaveBeenCalledWith('call-alert-event-to-cancel-5');
  });

  it('gracefully handles queue failure and retains memory alert', async () => {
    const failingQueue = {
      add: vi.fn().mockRejectedValue(new Error('Redis connection down')),
    } as unknown as TypedQueue<ProactiveAgentJob>;

    const service = new CalendarCallAlertService({ queue: failingQueue });
    const event: CalendarEventInput = {
      id: 'event-resilient',
      title: 'Resilient Event',
      userId: 'user-resilient',
      startTime: new Date('2026-09-15T12:00:00.000Z'),
      reminders: [{ type: 'call', minutesBefore: 10 }],
    };

    const scheduled = await service.scheduleAlertsForEvent(event);
    expect(scheduled).toHaveLength(1);
    expect(service.getScheduledAlerts('user-resilient')).toHaveLength(1);
  });
});

describe('Calendar Route Call Alert Integration', () => {
  function createTestHarness() {
    const callAlertService = new CalendarCallAlertService();
    const mockEvents: Record<string, any> = {};

    const mockPrisma = {
      event: {
        create: vi.fn(async ({ data }) => {
          const id = `event-${Date.now()}`;
          const record = { id, ...data };
          mockEvents[id] = record;
          return record;
        }),
        findUnique: vi.fn(async ({ where }) => mockEvents[where.id] ?? null),
        update: vi.fn(async ({ where, data }) => {
          const existing = mockEvents[where.id];
          if (!existing) throw new Error('Not found');
          const updated = { ...existing, ...data };
          mockEvents[where.id] = updated;
          return updated;
        }),
        delete: vi.fn(async ({ where }) => {
          delete mockEvents[where.id];
          return { id: where.id };
        }),
        findMany: vi.fn(async () => Object.values(mockEvents)),
      },
    };

    const app = Fastify();
    app.register(errorHandlerPlugin);
    app.addHook('preHandler', async (request) => {
      (request as any).auth = { userId: 'test-user-call' };
    });
    (app as any).prisma = mockPrisma;
    app.register((instance, _opts, done) => {
      calendarRoutes(instance, { callAlertService });
      done();
    });

    return { app, callAlertService, mockPrisma };
  }

  it('POST /events with call reminder schedules a call alert and GET /events/alerts/scheduled returns it', async () => {
    const { app, callAlertService } = createTestHarness();

    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        title: 'Strategy Sync',
        start: '2026-09-15T14:00:00.000Z',
        end: '2026-09-15T15:00:00.000Z',
        reminders: [
          { type: 'call', minutesBefore: 5, label: '5 minutes before' },
          { type: 'push', minutesBefore: 15, label: '15 minutes before' },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    const eventId = body.data.id;

    // Verify scheduled alerts query
    const alertsResponse = await app.inject({
      method: 'GET',
      url: '/events/alerts/scheduled',
    });

    expect(alertsResponse.statusCode).toBe(200);
    const alerts = alertsResponse.json().data;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      eventId,
      userId: 'test-user-call',
      title: 'Strategy Sync',
      minutesBefore: 5,
      status: 'scheduled',
    });

    await app.close();
  });

  it('DELETE /events/:id cancels scheduled call alert', async () => {
    const { app, callAlertService } = createTestHarness();

    const createRes = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        title: 'Call to cancel',
        start: '2026-09-15T16:00:00.000Z',
        reminders: [{ type: 'call', minutesBefore: 10 }],
      },
    });

    const eventId = createRes.json().data.id;
    expect(callAlertService.getScheduledAlerts('test-user-call')).toHaveLength(1);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}`,
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(callAlertService.getScheduledAlerts('test-user-call')).toHaveLength(0);

    await app.close();
  });
});
