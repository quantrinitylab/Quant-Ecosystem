// ============================================================================
// Reindex Job Manager - Manage reindex job lifecycle
// ============================================================================

import { z } from 'zod';

export const ReindexJobStateSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type ReindexJobState = z.infer<typeof ReindexJobStateSchema>;

export const ReindexJobSchema = z.object({
  id: z.string(),
  indexName: z.string(),
  state: ReindexJobStateSchema,
  progress: z.number().min(0).max(100),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
});

export type ReindexJob = z.infer<typeof ReindexJobSchema>;

/**
 * ReindexJobManager - Manages reindex job lifecycle
 *
 * Provides methods to start, track, list, and cancel reindex jobs.
 * Uses an in-memory store for job state.
 *
 * NOTE (v1 - demo/development scope): This service uses an in-memory Map as its backing
 * store. All job state is lost on process restart. This is intentional for the current phase.
 * Production deployment requires a persistence adapter (e.g., database-backed store with a
 * worker queue) to retain job state across restarts.
 */
export class ReindexJobManager {
  private readonly jobs = new Map<string, ReindexJob>();
  private idCounter = 0;

  startReindex(indexName: string): ReindexJob {
    this.idCounter++;
    const job: ReindexJob = {
      id: `reindex-${this.idCounter}`,
      indexName,
      state: 'pending',
      progress: 0,
      createdAt: new Date(),
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJobStatus(jobId: string): ReindexJob | undefined {
    return this.jobs.get(jobId);
  }

  listJobs(): ReindexJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      // Tiebreak by ID (higher counter = more recent)
      return b.id.localeCompare(a.id);
    });
  }

  cancelJob(jobId: string): ReindexJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    if (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') {
      return job;
    }

    const cancelled: ReindexJob = {
      ...job,
      state: 'cancelled',
      completedAt: new Date(),
    };
    this.jobs.set(jobId, cancelled);
    return cancelled;
  }

  /**
   * Transition a job to running state.
   */
  markRunning(jobId: string): ReindexJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== 'pending') return undefined;

    const running: ReindexJob = {
      ...job,
      state: 'running',
      startedAt: new Date(),
    };
    this.jobs.set(jobId, running);
    return running;
  }

  /**
   * Update the progress percentage of a running job.
   */
  updateProgress(jobId: string, progress: number): ReindexJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== 'running') return undefined;

    const updated: ReindexJob = {
      ...job,
      progress: Math.min(100, Math.max(0, progress)),
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  /**
   * Mark a job as completed.
   */
  markCompleted(jobId: string): ReindexJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== 'running') return undefined;

    const completed: ReindexJob = {
      ...job,
      state: 'completed',
      progress: 100,
      completedAt: new Date(),
    };
    this.jobs.set(jobId, completed);
    return completed;
  }

  /**
   * Mark a job as failed with an error message.
   */
  markFailed(jobId: string, error: string): ReindexJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job || (job.state !== 'running' && job.state !== 'pending')) return undefined;

    const failed: ReindexJob = {
      ...job,
      state: 'failed',
      completedAt: new Date(),
      error,
    };
    this.jobs.set(jobId, failed);
    return failed;
  }
}
