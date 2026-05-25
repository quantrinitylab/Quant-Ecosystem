import { Worker, type WorkerOptions } from 'bullmq';
import pino from 'pino';
import type { ZodSchema } from 'zod';

const logger = pino({ name: 'queue-worker' });

export interface TypedWorkerOptions {
  connection: { host: string; port: number };
  concurrency?: number;
  limiter?: { max: number; duration: number };
}

export interface TypedJob<TPayload> {
  id: string;
  name: string;
  data: TPayload;
}

export function createTypedWorker<TPayload>(
  queueName: string,
  schema: ZodSchema<TPayload>,
  processor: (job: TypedJob<TPayload>) => Promise<void>,
  opts?: TypedWorkerOptions,
): Worker {
  const workerOpts: WorkerOptions = {
    connection: opts?.connection ?? { host: 'localhost', port: 6379 },
    concurrency: opts?.concurrency,
    limiter: opts?.limiter,
  };

  const worker = new Worker(
    queueName,
    async (job) => {
      const validated = schema.parse(job.data);
      await processor({
        id: job.id ?? '',
        name: job.name,
        data: validated,
      });
    },
    workerOpts,
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Worker error');
  });

  return worker;
}
