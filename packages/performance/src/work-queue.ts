// ============================================================================
// Performance Package - Work Queue Manager
// BullMQ-style async work queue with dead letter queue and rate limiting
// ============================================================================

/** Job options */
export interface JobOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  deadLetterQueue?: string;
  rateLimit?: RateLimitConfig;
}

/** Rate limit configuration */
export interface RateLimitConfig {
  maxPerSecond: number;
  maxConcurrent: number;
}

/** Job definition */
export interface JobDefinition<T = unknown> {
  name: string;
  handler: (data: T) => Promise<void>;
  options: Required<JobOptions>;
}

/** Enqueued job */
export interface EnqueuedJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  priority: number;
  status: JobStatus;
  attempts: number;
  maxRetries: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  error: string | null;
}

/** Job status */
export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'dead-letter';

/** Queue metrics */
export interface QueueMetrics {
  totalJobs: number;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  deadLettered: number;
  avgProcessingTimeMs: number;
  throughputPerSecond: number;
}

/**
 * WorkQueueManager provides BullMQ-style job queue management with
 * job definitions, priority-based enqueueing, dead letter queues,
 * and per-queue rate limiting.
 */
export class WorkQueueManager {
  private readonly definitions: Map<string, JobDefinition>;
  private readonly queues: Map<string, EnqueuedJob[]>;
  private readonly deadLetterQueues: Map<string, EnqueuedJob[]>;
  private readonly processingTimes: number[];
  private jobCounter: number;
  private completedCount: number;
  private failedCount: number;
  private readonly startTime: number;

  constructor() {
    this.definitions = new Map();
    this.queues = new Map();
    this.deadLetterQueues = new Map();
    this.processingTimes = [];
    this.jobCounter = 0;
    this.completedCount = 0;
    this.failedCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Define a job type with its handler and options.
   */
  defineJob<T = unknown>(
    name: string,
    handler: (data: T) => Promise<void>,
    options: JobOptions = {},
  ): void {
    const definition: JobDefinition = {
      name,
      handler: handler as (data: unknown) => Promise<void>,
      options: {
        maxRetries: options.maxRetries ?? 3,
        retryDelayMs: options.retryDelayMs ?? 1000,
        timeoutMs: options.timeoutMs ?? 30000,
        deadLetterQueue: options.deadLetterQueue ?? `${name}:dead-letter`,
        rateLimit: options.rateLimit ?? { maxPerSecond: 100, maxConcurrent: 10 },
      },
    };
    this.definitions.set(name, definition);
    this.queues.set(name, []);
    this.deadLetterQueues.set(definition.options.deadLetterQueue, []);
  }

  /**
   * Enqueue a job for processing.
   */
  enqueue<T = unknown>(jobName: string, data: T, priority: number = 0): EnqueuedJob<T> {
    const definition = this.definitions.get(jobName);
    if (!definition) {
      throw new Error(`Job not defined: ${jobName}`);
    }

    const job: EnqueuedJob<T> = {
      id: `job_${++this.jobCounter}`,
      name: jobName,
      data,
      priority,
      status: 'waiting',
      attempts: 0,
      maxRetries: definition.options.maxRetries,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      error: null,
    };

    const queue = this.queues.get(jobName)!;
    // Insert by priority (higher priority first)
    const insertIndex = queue.findIndex((j) => j.priority < priority);
    if (insertIndex === -1) {
      queue.push(job as EnqueuedJob);
    } else {
      queue.splice(insertIndex, 0, job as EnqueuedJob);
    }

    return job;
  }

  /**
   * Process the next job in a queue. Returns the processed job or null.
   */
  async processNext(jobName: string): Promise<EnqueuedJob | null> {
    const definition = this.definitions.get(jobName);
    if (!definition) {
      throw new Error(`Job not defined: ${jobName}`);
    }

    const queue = this.queues.get(jobName)!;
    const job = queue.find((j) => j.status === 'waiting');
    if (!job) return null;

    job.status = 'active';
    job.startedAt = Date.now();
    job.attempts++;

    try {
      await definition.handler(job.data);
      job.status = 'completed';
      job.completedAt = Date.now();
      this.completedCount++;
      this.processingTimes.push(job.completedAt - job.startedAt);
    } catch (error) {
      if (job.attempts >= definition.options.maxRetries) {
        job.status = 'dead-letter';
        job.failedAt = Date.now();
        job.error = error instanceof Error ? error.message : String(error);
        this.failedCount++;

        // Move to dead letter queue
        const dlq = this.deadLetterQueues.get(definition.options.deadLetterQueue);
        if (dlq) {
          dlq.push(job);
        }
      } else {
        job.status = 'waiting';
        job.error = error instanceof Error ? error.message : String(error);
      }
    }

    return job;
  }

  /**
   * Get metrics for a specific queue or all queues combined.
   */
  getMetrics(jobName?: string): QueueMetrics {
    if (jobName) {
      return this.getQueueMetrics(jobName);
    }

    // Aggregate all queues
    let totalJobs = 0;
    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const [, queue] of this.queues) {
      for (const job of queue) {
        totalJobs++;
        switch (job.status) {
          case 'waiting':
            waiting++;
            break;
          case 'active':
            active++;
            break;
          case 'completed':
            completed++;
            break;
          case 'failed':
            failed++;
            break;
          case 'dead-letter':
            deadLettered++;
            break;
        }
      }
    }

    const avgProcessingTimeMs =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
        : 0;

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const throughputPerSecond = elapsedSeconds > 0 ? this.completedCount / elapsedSeconds : 0;

    return {
      totalJobs,
      waiting,
      active,
      completed,
      failed,
      deadLettered,
      avgProcessingTimeMs,
      throughputPerSecond,
    };
  }

  /**
   * Get dead letter queue entries for a job type.
   */
  getDeadLetterQueue(jobName: string): EnqueuedJob[] {
    const definition = this.definitions.get(jobName);
    if (!definition) return [];
    return this.deadLetterQueues.get(definition.options.deadLetterQueue) ?? [];
  }

  /**
   * Get all defined job names.
   */
  getJobNames(): string[] {
    return [...this.definitions.keys()];
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Get metrics for a single queue */
  private getQueueMetrics(jobName: string): QueueMetrics {
    const queue = this.queues.get(jobName) ?? [];
    const definition = this.definitions.get(jobName);
    const dlq = definition
      ? (this.deadLetterQueues.get(definition.options.deadLetterQueue) ?? [])
      : [];

    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;

    for (const job of queue) {
      switch (job.status) {
        case 'waiting':
          waiting++;
          break;
        case 'active':
          active++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    const avgProcessingTimeMs =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
        : 0;

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const throughputPerSecond = elapsedSeconds > 0 ? completed / elapsedSeconds : 0;

    return {
      totalJobs: queue.length,
      waiting,
      active,
      completed,
      failed,
      deadLettered: dlq.length,
      avgProcessingTimeMs,
      throughputPerSecond,
    };
  }
}
