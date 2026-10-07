import { z } from 'zod';

export const DeliveryJobSchema = z.object({
  activityId: z.string(),
  recipientInbox: z.string(),
  payload: z.string(),
  signedHeaders: z.record(z.string()).optional(),
  attempt: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  nextAttemptAfter: z.number().optional(),
});

export type DeliveryJob = z.infer<typeof DeliveryJobSchema>;

export class DeliveryQueue {
  private queue: DeliveryJob[] = [];
  private failed: DeliveryJob[] = [];
  private baseDelay = 1000;

  enqueue(job: DeliveryJob): void {
    const validated = DeliveryJobSchema.parse(job);
    this.queue.push(validated);
  }

  processNext(deliverFn?: (job: DeliveryJob) => boolean): DeliveryJob | undefined {
    const now = Date.now();
    const index = this.queue.findIndex(
      (j) => j.nextAttemptAfter === undefined || j.nextAttemptAfter <= now,
    );
    if (index === -1) return undefined;

    const [job] = this.queue.splice(index, 1);
    if (!job) return undefined;

    const success = deliverFn ? deliverFn(job) : true;

    if (!success) {
      const nextAttempt = job.attempt + 1;
      if (nextAttempt < job.maxAttempts) {
        this.queue.push({
          ...job,
          attempt: nextAttempt,
          nextAttemptAfter: now + this.calculateBackoff(nextAttempt),
        });
      } else {
        this.failed.push(job);
      }
    }

    return job;
  }

  calculateBackoff(attempt: number): number {
    return this.baseDelay * Math.pow(2, attempt);
  }

  getPendingJobs(): DeliveryJob[] {
    return [...this.queue];
  }

  getFailedJobs(): DeliveryJob[] {
    return [...this.failed];
  }

  size(): number {
    return this.queue.length;
  }
}
