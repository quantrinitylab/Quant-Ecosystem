// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import calendarRoutes from '../routes/calendar';
import {
  CalendarCallAlertService,
  type CalendarEventInput,
} from '../services/calendar-call-alert.service';
import type { ProactiveAgentJob, TypedQueue } from '@quant/queue';

/**
 * Regression for the calendar call-alert queue lifecycle finding:
 * CalendarCallAlertService built a real BullMQ TypedQueue in its constructor
 * with no close path, and the calendar route plugin registered no onClose
 * hook — so the queue's Redis connection outlived app.close() (same
 * orphaned-connection teardown class as the ci-runs #1466 gate red).
 *
 * Expected lifecycle: register -> app.close() closes the route-owned queue
 * exactly once; injected (caller-owned) queues are never closed by the
 * service; repeated close() calls are a no-op.
 *
 * NOTE on the mock: the service hardcodes the queue name
 * 'quant:proactive-jobs', which BullMQ rejects ('Queue name cannot contain
 * :'), so the real constructor always throws and the service degrades to
 * memory-only (filed separately as a cross-lane finding: the QuantChat
 * worker uses the same illegal name, so both sides must be renamed
 * together). The module mock below stands in for a successfully-constructed
 * queue so the ownership/idempotency logic itself is proven; it does not
 * hide the name bug, which is tracked independently.
 */
const { mockQueueClose, mockQueueAdd, MockTypedQueue } = vi.hoisted(() => {
  const mockQueueClose = vi.fn().mockResolvedValue(undefined);
  const mockQueueAdd = vi.fn().mockResolvedValue('job-1');
  class MockTypedQueue {
    static lastName: string | undefined;
    constructor(name: string) {
      MockTypedQueue.lastName = name;
    }
    add = mockQueueAdd;
    remove = vi.fn().mockResolvedValue(undefined);
    close = mockQueueClose;
  }
  return { mockQueueClose, mockQueueAdd, MockTypedQueue };
});

vi.mock('@quant/queue', () => ({
  TypedQueue: MockTypedQueue,
  ProactiveAgentJobSchema: {},
}));

describe('CalendarCallAlertService queue lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('close() never closes an injected (caller-owned) queue and leaves it usable', async () => {
    const mockQueue = {
      add: vi.fn().mockResolvedValue('job-1'),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as TypedQueue<ProactiveAgentJob>;

    const service = new CalendarCallAlertService({ queue: mockQueue });
    await service.close();
    await service.close();
    expect(mockQueue.close).not.toHaveBeenCalled();

    const event: CalendarEventInput = {
      id: 'owned-queue-event',
      title: 'Owned Queue Sync',
      userId: 'user-owned',
      startTime: new Date('2026-09-15T10:00:00.000Z'),
      reminders: [{ type: 'call', minutesBefore: 10 }],
    };
    const scheduled = await service.scheduleAlertsForEvent(
      event,
      new Date('2026-09-15T09:30:00.000Z'),
    );
    expect(scheduled).toHaveLength(1);
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('close() closes a service-owned queue exactly once, even when called twice', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6399');

    const service = new CalendarCallAlertService();
    expect(MockTypedQueue.lastName).toBe('quant:proactive-jobs');
    await service.close();
    await service.close();
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });

  it('close() without REDIS_URL is a no-op', async () => {
    vi.stubEnv('REDIS_URL', '');

    const service = new CalendarCallAlertService();
    await service.close();
    expect(mockQueueClose).not.toHaveBeenCalled();
  });
});

describe('calendar route plugin queue lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('app.close() closes the route-owned queue exactly once', async () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6399');

    const app = Fastify();
    app.register(calendarRoutes);
    await app.ready();
    await app.close();
    await app.close();
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });
});
