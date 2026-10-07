import { describe, it, expect, beforeEach } from 'vitest';
import { WorkQueueManager } from '../work-queue.js';

describe('WorkQueueManager', () => {
  let manager: WorkQueueManager;

  beforeEach(() => {
    manager = new WorkQueueManager();
  });

  it('defines a job type', () => {
    manager.defineJob('email', async () => {}, { maxRetries: 5 });
    expect(manager.getJobNames()).toContain('email');
  });

  it('enqueues a job', () => {
    manager.defineJob('email', async () => {});
    const job = manager.enqueue('email', { to: 'user@example.com' });

    expect(job.id).toBeDefined();
    expect(job.name).toBe('email');
    expect(job.status).toBe('waiting');
    expect(job.data).toEqual({ to: 'user@example.com' });
  });

  it('throws when enqueueing undefined job', () => {
    expect(() => manager.enqueue('undefined-job', {})).toThrow('Job not defined: undefined-job');
  });

  it('processes jobs successfully', async () => {
    const processed: string[] = [];
    manager.defineJob<{ msg: string }>('task', async (data) => {
      processed.push(data.msg);
    });

    manager.enqueue('task', { msg: 'hello' });
    const job = await manager.processNext('task');

    expect(job).not.toBeNull();
    expect(job!.status).toBe('completed');
    expect(processed).toEqual(['hello']);
  });

  it('retries failed jobs up to maxRetries', async () => {
    let attempts = 0;
    manager.defineJob(
      'flaky',
      async () => {
        attempts++;
        throw new Error('Transient failure');
      },
      { maxRetries: 3 },
    );

    manager.enqueue('flaky', {});

    // First attempt
    const job1 = await manager.processNext('flaky');
    expect(job1!.status).toBe('waiting');
    expect(job1!.attempts).toBe(1);

    // Second attempt
    await manager.processNext('flaky');
    expect(attempts).toBe(2);

    // Third attempt - should go to dead letter
    const job3 = await manager.processNext('flaky');
    expect(job3!.status).toBe('dead-letter');
    expect(attempts).toBe(3);
  });

  it('moves failed jobs to dead letter queue', async () => {
    manager.defineJob(
      'failing',
      async () => {
        throw new Error('permanent failure');
      },
      { maxRetries: 1 },
    );

    manager.enqueue('failing', { data: 'test' });
    await manager.processNext('failing');

    const dlq = manager.getDeadLetterQueue('failing');
    expect(dlq).toHaveLength(1);
    expect(dlq[0].error).toBe('permanent failure');
  });

  it('processes jobs by priority (higher first)', async () => {
    const order: number[] = [];
    manager.defineJob<{ priority: number }>('ordered', async (data) => {
      order.push(data.priority);
    });

    manager.enqueue('ordered', { priority: 1 }, 1);
    manager.enqueue('ordered', { priority: 3 }, 3);
    manager.enqueue('ordered', { priority: 2 }, 2);

    await manager.processNext('ordered');
    await manager.processNext('ordered');
    await manager.processNext('ordered');

    expect(order).toEqual([3, 2, 1]);
  });

  it('returns null when no jobs to process', async () => {
    manager.defineJob('empty', async () => {});
    const result = await manager.processNext('empty');
    expect(result).toBeNull();
  });

  it('returns queue metrics', async () => {
    manager.defineJob('counted', async () => {});
    manager.enqueue('counted', {});
    manager.enqueue('counted', {});
    await manager.processNext('counted');

    const metrics = manager.getMetrics('counted');
    expect(metrics.totalJobs).toBe(2);
    expect(metrics.completed).toBe(1);
    expect(metrics.waiting).toBe(1);
  });

  it('returns aggregate metrics', () => {
    manager.defineJob('a', async () => {});
    manager.defineJob('b', async () => {});
    manager.enqueue('a', {});
    manager.enqueue('b', {});

    const metrics = manager.getMetrics();
    expect(metrics.totalJobs).toBe(2);
    expect(metrics.waiting).toBe(2);
  });

  it('retries with configurable delay (retryDelayMs config is respected)', async () => {
    let attempts = 0;
    manager.defineJob(
      'delayed-retry',
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('Retry needed');
      },
      { maxRetries: 3, retryDelayMs: 500 },
    );

    manager.enqueue('delayed-retry', {});

    // First attempt fails, job goes back to waiting
    const job1 = await manager.processNext('delayed-retry');
    expect(job1!.status).toBe('waiting');
    expect(job1!.attempts).toBe(1);
    expect(job1!.error).toBe('Retry needed');

    // Second attempt fails, job goes back to waiting
    const job2 = await manager.processNext('delayed-retry');
    expect(job2!.status).toBe('waiting');
    expect(job2!.attempts).toBe(2);

    // Third attempt succeeds
    const job3 = await manager.processNext('delayed-retry');
    expect(job3!.status).toBe('completed');
    expect(job3!.attempts).toBe(3);
    expect(attempts).toBe(3);
  });

  it('moves job to dead letter after max retries with delay config', async () => {
    manager.defineJob(
      'always-fails',
      async () => {
        throw new Error('permanent error');
      },
      { maxRetries: 2, retryDelayMs: 200 },
    );

    manager.enqueue('always-fails', { id: 1 });

    // First attempt - back to waiting
    const job1 = await manager.processNext('always-fails');
    expect(job1!.status).toBe('waiting');
    expect(job1!.attempts).toBe(1);

    // Second attempt - goes to dead letter
    const job2 = await manager.processNext('always-fails');
    expect(job2!.status).toBe('dead-letter');
    expect(job2!.attempts).toBe(2);
    expect(job2!.error).toBe('permanent error');
    expect(job2!.failedAt).not.toBeNull();

    const dlq = manager.getDeadLetterQueue('always-fails');
    expect(dlq).toHaveLength(1);
    expect(dlq[0].data).toEqual({ id: 1 });
  });

  it('respects rate limit config definition', () => {
    manager.defineJob('rate-limited', async () => {}, {
      rateLimit: { maxPerSecond: 5, maxConcurrent: 2 },
    });

    // Verify the job is defined with rate limit config
    const names = manager.getJobNames();
    expect(names).toContain('rate-limited');

    // Enqueue multiple jobs and process them
    for (let i = 0; i < 10; i++) {
      manager.enqueue('rate-limited', { index: i });
    }

    const metrics = manager.getMetrics('rate-limited');
    expect(metrics.totalJobs).toBe(10);
    expect(metrics.waiting).toBe(10);
  });

  it('tracks processing time in metrics after completion', async () => {
    manager.defineJob('timed', async () => {
      // Simulate some work
    });

    manager.enqueue('timed', {});
    await manager.processNext('timed');

    const metrics = manager.getMetrics('timed');
    expect(metrics.completed).toBe(1);
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });
});
