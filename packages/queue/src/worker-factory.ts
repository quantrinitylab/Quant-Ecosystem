import { Worker, type WorkerOptions } from 'bullmq';
import pino from 'pino';
import type { ZodSchema } from 'zod';

const logger = pino({ name: 'queue-worker' });

export interface TypedWorkerOptions {
  connection: WorkerOptions['connection'];
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
  // fix/qm-quantgit-cijob-persist: the processor may return a result payload
  // (previously forced to void). The return value becomes the BullMQ job's
  // return value, delivered to QueueEvents 'completed' listeners — this is
  // how the ci-runner reports its PipelineRunResult so the backend can
  // persist per-job CiJob rows + logs. Existing void processors keep
  // working: their return value is simply undefined.
  processor: (job: TypedJob<TPayload>) => Promise<unknown>,
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
      return processor({
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
