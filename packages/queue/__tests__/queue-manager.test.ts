import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const mockAddBulk = vi.fn().mockResolvedValue([]);
const mockGetJob = vi.fn().mockResolvedValue({ id: 'job-1', data: {} });
const mockDrain = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function () {
    return {
      add: mockAdd,
      addBulk: mockAddBulk,
      getJob: mockGetJob,
      drain: mockDrain,
      close: mockClose,
    };
  }),
}));

import { TypedQueue } from '../src/queue-manager.js';

const TestSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});

type TestPayload = z.infer<typeof TestSchema>;

describe('TypedQueue', () => {
  let queue: TypedQueue<TestPayload>;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new TypedQueue('test-queue', TestSchema, {
      host: 'localhost',
      port: 6379,
    });
  });

  it('should add a job with valid payload', async () => {
    const payload = { to: 'user@test.com', subject: 'Hi', body: 'Hello' };
    const jobId = await queue.add('send-email', payload);

    expect(mockAdd).toHaveBeenCalledWith('send-email', payload, {
      jobId,
    });
    expect(typeof jobId).toBe('string');
  });

  it('should throw ZodError for invalid payload on add', async () => {
    const invalidPayload = { to: 123 } as unknown as TestPayload;
    await expect(queue.add('send-email', invalidPayload)).rejects.toThrow();
  });

  it('should add bulk jobs with valid payloads', async () => {
    const jobs = [
      { name: 'email-1', data: { to: 'a@b.com', subject: 'S1', body: 'B1' } },
      { name: 'email-2', data: { to: 'c@d.com', subject: 'S2', body: 'B2' } },
    ];
    const ids = await queue.addBulk(jobs);

    expect(mockAddBulk).toHaveBeenCalledTimes(1);
    expect(ids).toHaveLength(2);
  });

  it('should throw ZodError for invalid payload in addBulk', async () => {
    const jobs = [
      {
        name: 'email-1',
        data: { to: 123, subject: 'S1', body: 'B1' } as unknown as TestPayload,
      },
    ];
    await expect(queue.addBulk(jobs)).rejects.toThrow();
  });

  it('should get a job by id', async () => {
    const result = await queue.getJob('job-1');
    expect(mockGetJob).toHaveBeenCalledWith('job-1');
    expect(result).toBeDefined();
  });

  it('should drain the queue', async () => {
    await queue.drain();
    expect(mockDrain).toHaveBeenCalled();
  });

  it('should close the queue', async () => {
    await queue.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
