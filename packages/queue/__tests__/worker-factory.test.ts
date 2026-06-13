import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

let processorFn: ((job: unknown) => Promise<void>) | undefined;
const mockOn = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function (_name, processor, _opts) {
    processorFn = processor as (job: unknown) => Promise<void>;
    return { on: mockOn, close: mockClose };
  }),
}));

vi.mock('pino', () => ({
  default: () => ({
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

import { createTypedWorker } from '../src/worker-factory.js';

const TestSchema = z.object({
  message: z.string(),
  count: z.number(),
});

describe('createTypedWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processorFn = undefined;
  });

  it('should create a worker', () => {
    const processor = vi.fn().mockResolvedValue(undefined);
    const worker = createTypedWorker('test-queue', TestSchema, processor, {
      connection: { host: 'localhost', port: 6379 },
    });

    expect(worker).toBeDefined();
    expect(mockOn).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should validate data and call processor with typed job', async () => {
    const processor = vi.fn().mockResolvedValue(undefined);
    createTypedWorker('test-queue', TestSchema, processor, {
      connection: { host: 'localhost', port: 6379 },
    });

    expect(processorFn).toBeDefined();
    await processorFn!({
      id: 'job-123',
      name: 'test-job',
      data: { message: 'hello', count: 42 },
    });

    expect(processor).toHaveBeenCalledWith({
      id: 'job-123',
      name: 'test-job',
      data: { message: 'hello', count: 42 },
    });
  });

  it('should throw on invalid data', async () => {
    const processor = vi.fn().mockResolvedValue(undefined);
    createTypedWorker('test-queue', TestSchema, processor, {
      connection: { host: 'localhost', port: 6379 },
    });

    expect(processorFn).toBeDefined();
    await expect(
      processorFn!({
        id: 'job-456',
        name: 'test-job',
        data: { message: 123, count: 'invalid' },
      }),
    ).rejects.toThrow();
  });
});
