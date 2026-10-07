import { describe, it, expect, vi } from 'vitest';
import { DeliveryQueue, DeliveryJobSchema } from './delivery-queue.js';

describe('DeliveryQueue', () => {
  it('job enqueues with correct schema validation', () => {
    const queue = new DeliveryQueue();

    queue.enqueue({
      activityId: 'act-1',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 0,
      maxAttempts: 5,
    });

    expect(queue.size()).toBe(1);
    expect(queue.getPendingJobs()[0]!.activityId).toBe('act-1');

    const parsed = DeliveryJobSchema.safeParse(queue.getPendingJobs()[0]);
    expect(parsed.success).toBe(true);
  });

  it('backoff calculates correctly (1s, 2s, 4s, 8s...)', () => {
    const queue = new DeliveryQueue();

    expect(queue.calculateBackoff(0)).toBe(1000);
    expect(queue.calculateBackoff(1)).toBe(2000);
    expect(queue.calculateBackoff(2)).toBe(4000);
    expect(queue.calculateBackoff(3)).toBe(8000);
    expect(queue.calculateBackoff(4)).toBe(16000);
  });

  it('max attempts respected (job dropped after max)', () => {
    const queue = new DeliveryQueue();

    queue.enqueue({
      activityId: 'act-fail',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 4,
      maxAttempts: 5,
    });

    queue.processNext(() => false);

    expect(queue.size()).toBe(0);
    expect(queue.getFailedJobs()).toHaveLength(1);
    expect(queue.getFailedJobs()[0]!.activityId).toBe('act-fail');
  });

  it('failed delivery re-enqueues with incremented attempt', () => {
    const queue = new DeliveryQueue();

    queue.enqueue({
      activityId: 'act-retry',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 0,
      maxAttempts: 5,
    });

    queue.processNext(() => false);

    expect(queue.size()).toBe(1);
    const pending = queue.getPendingJobs();
    expect(pending[0]!.attempt).toBe(1);
    expect(pending[0]!.activityId).toBe('act-retry');
  });

  it('failed job gets nextAttemptAfter timestamp set', () => {
    const queue = new DeliveryQueue();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    queue.enqueue({
      activityId: 'act-delay',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 0,
      maxAttempts: 5,
    });

    queue.processNext(() => false);

    const pending = queue.getPendingJobs();
    expect(pending[0]!.nextAttemptAfter).toBe(now + 2000); // backoff(1) = 2000
    vi.restoreAllMocks();
  });

  it('processNext skips jobs whose nextAttemptAfter is in the future', () => {
    const queue = new DeliveryQueue();
    const now = Date.now();

    queue.enqueue({
      activityId: 'act-future',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 1,
      maxAttempts: 5,
      nextAttemptAfter: now + 60000, // 60s in the future
    });

    const result = queue.processNext(() => true);
    expect(result).toBeUndefined();
    expect(queue.size()).toBe(1); // job stays in queue
  });

  it('processNext processes jobs whose nextAttemptAfter has passed', () => {
    const queue = new DeliveryQueue();
    const now = Date.now();

    queue.enqueue({
      activityId: 'act-past',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      attempt: 1,
      maxAttempts: 5,
      nextAttemptAfter: now - 1000, // 1s in the past
    });

    const result = queue.processNext(() => true);
    expect(result).toBeDefined();
    expect(result!.activityId).toBe('act-past');
    expect(queue.size()).toBe(0);
  });

  it('schema validates signedHeaders field', () => {
    const parsed = DeliveryJobSchema.safeParse({
      activityId: 'act-headers',
      recipientInbox: 'https://remote.example/inbox',
      payload: '{"type":"Create"}',
      signedHeaders: { signature: 'sig-value', host: 'remote.example' },
      attempt: 0,
      maxAttempts: 5,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data!.signedHeaders).toEqual({ signature: 'sig-value', host: 'remote.example' });
  });
});
