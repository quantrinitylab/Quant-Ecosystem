// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import {
  CalendarCallAlertService,
  type CalendarEventInput,
} from '../services/calendar-call-alert.service';
import type { TypedQueue, ProactiveAgentJob } from '@quant/queue';

// The queue class is faked so these tests never touch a real Redis: the
// lifecycle contract (who closes what, exactly once) is what is pinned here.
const { ownedQueueCloseMock } = vi.hoisted(() => ({ ownedQueueCloseMock: vi.fn() }));

vi.mock('@quant/queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quant/queue')>();
  class FakeTypedQueue {
    add = vi.fn().mockResolvedValue('job-1');
    close = ownedQueueCloseMock;
    constructor(..._args: unknown[]) {}
  }
  return { ...actual, TypedQueue: FakeTypedQueue };
});

/**
 * Queue-lifecycle contract for CalendarCallAlertService (same failure class
 * as the ci-routes queue fix, #1489): a service-created queue must close
 * exactly once on shutdown, and an injected queue must never be closed by
 * this service — it belongs to its creator.
 */

describe('CalendarCallAlertService queue lifecycle', () => {
  const prevRedisUrl = process.env['REDIS_URL'];

  beforeEach(() => {
    ownedQueueCloseMock.mockClear();
  });

  afterEach(() => {
    if (prevRedisUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = prevRedisUrl;
  });

  it('closes an owned (redisUrl-created) queue exactly once across repeated close() calls', async () => {
    const service = new CalendarCallAlertService({ redisUrl: 'redis://127.0.0.1:6379' });
    await service.close();
    await service.close();
    expect(ownedQueueCloseMock).toHaveBeenCalledTimes(1);
  });

  it('never closes an injected queue (owned by its creator)', async () => {
    const injectedClose = vi.fn();
    const injected = {
      add: vi.fn().mockResolvedValue('job-1'),
      close: injectedClose,
    } as unknown as TypedQueue<ProactiveAgentJob>;
    const service = new CalendarCallAlertService({ queue: injected });
    await service.close();
    await service.close();
    expect(injectedClose).not.toHaveBeenCalled();
    expect(ownedQueueCloseMock).not.toHaveBeenCalled();
  });

  it('close() with no queue at all is a no-op', async () => {
    delete process.env['REDIS_URL'];
    const service = new CalendarCallAlertService();
    await expect(service.close()).resolves.toBeUndefined();
    expect(ownedQueueCloseMock).not.toHaveBeenCalled();
  });
});

describe('Calendar routes plugin: call-alert queue shutdown wiring', () => {
  const prevRedisUrl = process.env['REDIS_URL'];
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    ownedQueueCloseMock.mockClear();
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    if (prevRedisUrl === undefined) delete process.env['REDIS_URL'];
    else process.env['REDIS_URL'] = prevRedisUrl;
  });

  it('closes its self-created call-alert queue exactly once on app.close()', async () => {
    process.env['REDIS_URL'] = 'redis://127.0.0.1:6379';
    app = Fastify();
    await app.register(errorHandlerPlugin);
    (app as unknown as { prisma: unknown }).prisma = {};
    await app.register(calendarRoutes);
    await app.ready();
    const before = ownedQueueCloseMock.mock.calls.length;

    await app.close();
    await app.close();
    app = null;

    expect(ownedQueueCloseMock.mock.calls.length - before).toBe(1);
  });

  it('does not close an injected service queue on app.close()', async () => {
    const injectedClose = vi.fn();
    const injected = {
      add: vi.fn().mockResolvedValue('job-1'),
      close: injectedClose,
    } as unknown as TypedQueue<ProactiveAgentJob>;
    const injectedService = new CalendarCallAlertService({ queue: injected });
    app = Fastify();
    await app.register(errorHandlerPlugin);
    (app as unknown as { prisma: unknown }).prisma = {};
    await app.register(calendarRoutes, { callAlertService: injectedService });
    await app.ready();

    await app.close();
    app = null;

    expect(injectedClose).not.toHaveBeenCalled();
  });

  it('a scheduled call alert still flows through an injected queue', async () => {
    const injectedAdd = vi.fn().mockResolvedValue('job-1');
    const injected = {
      add: injectedAdd,
      close: vi.fn(),
    } as unknown as TypedQueue<ProactiveAgentJob>;
    const service = new CalendarCallAlertService({ queue: injected });
    const event: CalendarEventInput = {
      id: 'event-1',
      title: 'Call',
      userId: 'user-1',
      startTime: new Date('2026-09-15T10:00:00.000Z'),
      reminders: [{ type: 'call', minutesBefore: 10 }],
    };
    const scheduled = await service.scheduleAlertsForEvent(
      event,
      new Date('2026-09-15T09:30:00.000Z'),
    );
    expect(scheduled).toHaveLength(1);
    expect(injectedAdd).toHaveBeenCalledTimes(1);
  });
});
