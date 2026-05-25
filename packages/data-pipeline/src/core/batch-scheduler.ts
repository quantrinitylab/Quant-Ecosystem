// ============================================================================
// Data Pipeline Package - Batch Scheduler
// ============================================================================

import type {
  BatchJob,
  CronSchedule,
  JobDependency,
  BatchConfig,
  JobStatus,
  JobRun,
  RetryPolicy,
} from '../types';

/** Internal queue for job execution */
interface JobQueue {
  name: string;
  concurrencyLimit: number;
  runningJobs: Set<string>;
  pendingJobs: string[];
}

/**
 * BatchScheduler - Cron-based batch processing scheduler
 * Supports cron expression parsing, job dependencies, concurrency limits,
 * timeout handling, and manual triggering.
 */
export class BatchScheduler {
  private jobs: Map<string, BatchJob> = new Map();
  private queues: Map<string, JobQueue> = new Map();
  private jobRuns: Map<string, JobRun[]> = new Map();
  private jobCounter: number = 0;

  constructor() {
    this.queues.set('default', {
      name: 'default',
      concurrencyLimit: 5,
      runningJobs: new Set(),
      pendingJobs: [],
    });
  }

  /**
   * Schedule a new batch job
   */
  public scheduleJob(
    name: string,
    cronExpression: string,
    handler: string,
    config?: Partial<BatchConfig>,
    dependencies?: JobDependency[]
  ): BatchJob {
    const id = `job-${++this.jobCounter}-${Date.now()}`;
    const schedule = this.parseCronExpression(cronExpression);

    const jobConfig: BatchConfig = {
      queue: config?.queue ?? 'default',
      priority: config?.priority ?? 5,
      timeout: config?.timeout ?? 300000,
      concurrencyLimit: config?.concurrencyLimit ?? 1,
      retryPolicy: config?.retryPolicy ?? this.defaultRetryPolicy(),
      tags: config?.tags ?? [],
    };

    const job: BatchJob = {
      id,
      name,
      schedule,
      handler,
      config: jobConfig,
      dependencies: dependencies ?? [],
      status: 'scheduled',
      lastRun: null,
      nextRunAt: this.getNextRunTime(schedule),
      enabled: true,
      createdAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.jobRuns.set(id, []);

    // Ensure queue exists
    if (!this.queues.has(jobConfig.queue)) {
      this.queues.set(jobConfig.queue, {
        name: jobConfig.queue,
        concurrencyLimit: 10,
        runningJobs: new Set(),
        pendingJobs: [],
      });
    }

    return job;
  }

  /**
   * Cancel a scheduled job
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = false;
    job.status = 'cancelled';
    job.nextRunAt = null;

    // Remove from queue
    const queue = this.queues.get(job.config.queue);
    if (queue) {
      queue.runningJobs.delete(jobId);
      queue.pendingJobs = queue.pendingJobs.filter(id => id !== jobId);
    }

    return true;
  }

  /**
   * Get the status of a job
   */
  public getJobStatus(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Get the next N scheduled run times for a job
   */
  public getNextRuns(jobId: string, count: number = 5): number[] {
    const job = this.jobs.get(jobId);
    if (!job || !job.enabled) return [];

    const runs: number[] = [];
    let currentTime = Date.now();

    for (let i = 0; i < count; i++) {
      const nextRun = this.getNextRunTimeAfter(job.schedule, currentTime);
      runs.push(nextRun);
      currentTime = nextRun + 60000; // Move forward at least 1 minute
    }

    return runs;
  }

  /**
   * Manually trigger a job execution
   */
  public triggerManual(jobId: string): JobRun | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    // Check dependencies
    if (!this.areDependenciesMet(job)) {
      job.status = 'waiting_dependency';
      return null;
    }

    // Check queue concurrency
    const queue = this.queues.get(job.config.queue);
    if (queue && queue.runningJobs.size >= queue.concurrencyLimit) {
      queue.pendingJobs.push(jobId);
      job.status = 'queued';
      return null;
    }

    return this.executeJob(job);
  }

  /**
   * Get all jobs with optional status filter
   */
  public getJobs(status?: JobStatus): BatchJob[] {
    const jobs = Array.from(this.jobs.values());
    if (status) {
      return jobs.filter(j => j.status === status);
    }
    return jobs;
  }

  /**
   * Get run history for a job
   */
  public getJobHistory(jobId: string, limit: number = 10): JobRun[] {
    const runs = this.jobRuns.get(jobId) ?? [];
    return runs.slice(-limit);
  }

  /**
   * Process scheduled jobs (called periodically by the scheduler loop)
   */
  public tick(): JobRun[] {
    const now = Date.now();
    const executedRuns: JobRun[] = [];

    for (const job of this.jobs.values()) {
      if (!job.enabled || job.status === 'running') continue;

      if (job.nextRunAt !== null && job.nextRunAt <= now) {
        if (this.areDependenciesMet(job)) {
          const run = this.executeJob(job);
          if (run) {
            executedRuns.push(run);
          }
        } else {
          job.status = 'waiting_dependency';
        }
      }
    }

    return executedRuns;
  }

  /**
   * Parse a cron expression into components
   */
  public parseCronExpression(expression: string): CronSchedule {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5) {
      throw new Error(`Invalid cron expression: ${expression}. Expected 5 fields.`);
    }

    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
      expression,
    };
  }

  /**
   * Check if a cron field matches a given value
   */
  public matchesCronField(field: string, value: number, max: number): boolean {
    if (field === '*') return true;

    // Handle step values (*/5)
    if (field.startsWith('*/')) {
      const step = parseInt(field.substring(2), 10);
      return value % step === 0;
    }

    // Handle ranges (1-5)
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start && value <= end;
    }

    // Handle lists (1,3,5)
    if (field.includes(',')) {
      const values = field.split(',').map(Number);
      return values.includes(value);
    }

    // Exact match
    return parseInt(field, 10) === value;
  }

  /**
   * Get the next run time based on a cron schedule
   */
  private getNextRunTime(schedule: CronSchedule): number {
    return this.getNextRunTimeAfter(schedule, Date.now());
  }

  /**
   * Get the next run time after a specific timestamp
   */
  private getNextRunTimeAfter(schedule: CronSchedule, afterTime: number): number {
    const date = new Date(afterTime);
    date.setSeconds(0, 0);
    date.setMinutes(date.getMinutes() + 1);

    // Search up to 366 days ahead
    const maxIterations = 366 * 24 * 60;

    for (let i = 0; i < maxIterations; i++) {
      const minute = date.getMinutes();
      const hour = date.getHours();
      const dayOfMonth = date.getDate();
      const month = date.getMonth() + 1;
      const dayOfWeek = date.getDay();

      if (
        this.matchesCronField(schedule.minute, minute, 59) &&
        this.matchesCronField(schedule.hour, hour, 23) &&
        this.matchesCronField(schedule.dayOfMonth, dayOfMonth, 31) &&
        this.matchesCronField(schedule.month, month, 12) &&
        this.matchesCronField(schedule.dayOfWeek, dayOfWeek, 6)
      ) {
        return date.getTime();
      }

      date.setMinutes(date.getMinutes() + 1);
    }

    // Fallback: next hour
    return afterTime + 3600000;
  }

  /**
   * Execute a job and track its run
   */
  private executeJob(job: BatchJob): JobRun {
    const runId = `run-${job.id}-${Date.now()}`;

    const run: JobRun = {
      runId,
      jobId: job.id,
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      duration: 0,
      attempts: 1,
    };

    job.status = 'running';

    const queue = this.queues.get(job.config.queue);
    if (queue) {
      queue.runningJobs.add(job.id);
    }

    // Simulate execution (in real implementation, this would invoke the handler)
    run.status = 'completed';
    run.completedAt = Date.now();
    run.duration = run.completedAt - run.startedAt;

    job.status = 'completed';
    job.lastRun = run;
    job.nextRunAt = this.getNextRunTime(job.schedule);

    if (queue) {
      queue.runningJobs.delete(job.id);
      this.processQueuePending(queue);
    }

    // Store run history
    const runs = this.jobRuns.get(job.id) ?? [];
    runs.push(run);
    this.jobRuns.set(job.id, runs);

    return run;
  }

  /**
   * Check if all dependencies for a job are met
   */
  private areDependenciesMet(job: BatchJob): boolean {
    for (const dep of job.dependencies) {
      const depJob = this.jobs.get(dep.jobId);
      if (!depJob) continue;

      switch (dep.type) {
        case 'success':
          if (depJob.lastRun?.status !== 'completed') return false;
          break;
        case 'completion':
          if (depJob.status === 'running') return false;
          break;
        case 'failure':
          if (depJob.lastRun?.status !== 'failed') return false;
          break;
      }

      // Check timeout for dependency
      if (depJob.lastRun) {
        const elapsed = Date.now() - depJob.lastRun.startedAt;
        if (elapsed > dep.timeout) return false;
      }
    }

    return true;
  }

  /**
   * Process pending jobs in a queue when capacity frees up
   */
  private processQueuePending(queue: JobQueue): void {
    while (
      queue.pendingJobs.length > 0 &&
      queue.runningJobs.size < queue.concurrencyLimit
    ) {
      const nextJobId = queue.pendingJobs.shift();
      if (nextJobId) {
        const job = this.jobs.get(nextJobId);
        if (job && job.enabled) {
          this.executeJob(job);
        }
      }
    }
  }

  /**
   * Default retry policy for jobs
   */
  private defaultRetryPolicy(): RetryPolicy {
    return {
      maxRetries: 3,
      initialDelay: 5000,
      maxDelay: 60000,
      backoffMultiplier: 2,
      retryableErrors: ['transient', 'timeout'],
    };
  }
}
