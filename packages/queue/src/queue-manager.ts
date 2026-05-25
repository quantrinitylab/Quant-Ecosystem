import { Queue, type JobsOptions } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { ZodSchema } from 'zod';

export interface TypedQueueOptions {
  host: string;
  port: number;
}

export class TypedQueue<TPayload> {
  private readonly queue: Queue;
  private readonly schema: ZodSchema<TPayload>;

  constructor(name: string, schema: ZodSchema<TPayload>, connection: TypedQueueOptions) {
    this.schema = schema;
    this.queue = new Queue(name, { connection });
  }

  async add(jobName: string, payload: TPayload, opts?: JobsOptions): Promise<string> {
    const validated = this.schema.parse(payload);
    const jobId = opts?.jobId ?? randomUUID();
    await this.queue.add(jobName, validated, { ...opts, jobId });
    return jobId;
  }

  async addBulk(
    jobs: Array<{ name: string; data: TPayload; opts?: JobsOptions }>,
  ): Promise<string[]> {
    const validatedJobs = jobs.map((job) => {
      const validated = this.schema.parse(job.data);
      const jobId = job.opts?.jobId ?? randomUUID();
      return {
        name: job.name,
        data: validated,
        opts: { ...job.opts, jobId },
      };
    });
    await this.queue.addBulk(validatedJobs);
    return validatedJobs.map((j) => j.opts.jobId as string);
  }

  async getJob(id: string) {
    return this.queue.getJob(id);
  }

  async drain(): Promise<void> {
    await this.queue.drain();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
