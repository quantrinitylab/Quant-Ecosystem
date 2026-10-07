// ============================================================================
// Bulkhead - Resource Isolation and Concurrency Control
// ============================================================================

import { BulkheadConfig, BulkheadMetrics, BulkheadPriority, BulkheadQueueItem } from '../types';

const PRIORITY_ORDER: Record<BulkheadPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class Bulkhead {
  private config: BulkheadConfig;
  private activeCount: number = 0;
  private queue: BulkheadQueueItem<any>[] = [];
  private metrics: BulkheadMetrics;
  private executionTimes: number[] = [];
  private queueTimes: number[] = [];
  private successCount: number = 0;
  private failureCount: number = 0;
  private maxConcurrentAdaptive: number;
  private adaptiveWindow: { success: boolean; timestamp: number }[] = [];

  constructor(config?: Partial<BulkheadConfig>) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? 10,
      maxQueue: config?.maxQueue ?? 50,
      queueTimeout: config?.queueTimeout ?? 30000,
      priority: config?.priority ?? 'normal',
      adaptiveSizing: config?.adaptiveSizing ?? false,
    };

    this.maxConcurrentAdaptive = this.config.maxConcurrent;

    this.metrics = {
      activeCount: 0,
      queueDepth: 0,
      totalExecuted: 0,
      totalRejected: 0,
      totalTimedOut: 0,
      averageExecutionTime: 0,
      averageQueueTime: 0,
    };
  }

  // Execute a function within the bulkhead
  async execute<T>(fn: () => Promise<T>, priority?: BulkheadPriority): Promise<T> {
    const effectivePriority = priority || this.config.priority;
    const maxConcurrent = this.config.adaptiveSizing
      ? this.maxConcurrentAdaptive
      : this.config.maxConcurrent;

    // If there is capacity, execute immediately
    if (this.activeCount < maxConcurrent) {
      return this.runExecution(fn);
    }

    // If queue is full, reject (load shedding)
    if (this.queue.length >= this.config.maxQueue) {
      this.metrics.totalRejected++;
      throw new Error('Bulkhead queue is full - request rejected (load shedding)');
    }

    // Enqueue with timeout
    return this.enqueue(fn, effectivePriority);
  }

  // Run execution directly
  private async runExecution<T>(fn: () => Promise<T>): Promise<T> {
    this.activeCount++;
    this.metrics.activeCount = this.activeCount;
    const startTime = Date.now();

    try {
      const result = await fn();
      this.recordExecution(Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordExecution(Date.now() - startTime, false);
      throw error;
    } finally {
      this.activeCount--;
      this.metrics.activeCount = this.activeCount;
      this.processQueue();
    }
  }

  // Enqueue a request
  private enqueue<T>(fn: () => Promise<T>, priority: BulkheadPriority): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: BulkheadQueueItem<T> = {
        fn,
        priority,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      };

      // Priority insertion (maintain sorted order)
      this.insertByPriority(item);
      this.metrics.queueDepth = this.queue.length;

      // Set queue timeout
      const timer = setTimeout(() => {
        const index = this.queue.indexOf(item);
        if (index !== -1) {
          this.queue.splice(index, 1);
          this.metrics.queueDepth = this.queue.length;
          this.metrics.totalTimedOut++;
          reject(new Error(`Bulkhead queue timeout after ${this.config.queueTimeout}ms`));
        }
      }, this.config.queueTimeout);

      // Attach timer cleanup to the item
      const originalResolve = item.resolve;
      const originalReject = item.reject;
      item.resolve = (value: T) => {
        clearTimeout(timer);
        originalResolve(value);
      };
      item.reject = (error: Error) => {
        clearTimeout(timer);
        originalReject(error);
      };
    });
  }

  // Insert item into queue by priority (FIFO within same priority)
  private insertByPriority<T>(item: BulkheadQueueItem<T>): void {
    const itemOrder = PRIORITY_ORDER[item.priority];
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const existingOrder = PRIORITY_ORDER[this.queue[i]!.priority];
      if (itemOrder < existingOrder) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, item);
  }

  // Process next item in queue
  private processQueue(): void {
    const maxConcurrent = this.config.adaptiveSizing
      ? this.maxConcurrentAdaptive
      : this.config.maxConcurrent;

    while (this.activeCount < maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.metrics.queueDepth = this.queue.length;

      const queueTime = Date.now() - item.enqueuedAt;
      this.recordQueueTime(queueTime);

      // Execute the queued item
      this.activeCount++;
      this.metrics.activeCount = this.activeCount;
      const startTime = Date.now();

      item
        .fn()
        .then((result) => {
          this.recordExecution(Date.now() - startTime, true);
          item.resolve(result);
        })
        .catch((error) => {
          this.recordExecution(Date.now() - startTime, false);
          item.reject(error instanceof Error ? error : new Error(String(error)));
        })
        .finally(() => {
          this.activeCount--;
          this.metrics.activeCount = this.activeCount;
          this.processQueue();
        });
    }
  }

  // Record execution metrics
  private recordExecution(duration: number, success: boolean): void {
    this.metrics.totalExecuted++;
    this.executionTimes.push(duration);
    if (this.executionTimes.length > 1000) {
      this.executionTimes = this.executionTimes.slice(-500);
    }
    this.metrics.averageExecutionTime = this.calculateAverage(this.executionTimes);

    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }

    // Adaptive sizing
    if (this.config.adaptiveSizing) {
      this.adaptiveWindow.push({ success, timestamp: Date.now() });
      this.adjustConcurrency();
    }
  }

  // Record queue wait time
  private recordQueueTime(duration: number): void {
    this.queueTimes.push(duration);
    if (this.queueTimes.length > 1000) {
      this.queueTimes = this.queueTimes.slice(-500);
    }
    this.metrics.averageQueueTime = this.calculateAverage(this.queueTimes);
  }

  // Calculate average
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Adaptive sizing: adjust max concurrent based on success rate
  private adjustConcurrency(): void {
    const now = Date.now();
    const windowMs = 30000; // 30 second window
    this.adaptiveWindow = this.adaptiveWindow.filter((e) => now - e.timestamp < windowMs);

    if (this.adaptiveWindow.length < 10) return;

    const successes = this.adaptiveWindow.filter((e) => e.success).length;
    const successRate = successes / this.adaptiveWindow.length;

    if (successRate > 0.95 && this.maxConcurrentAdaptive < this.config.maxConcurrent * 2) {
      // High success rate - increase concurrency
      this.maxConcurrentAdaptive = Math.min(
        this.maxConcurrentAdaptive + 1,
        this.config.maxConcurrent * 2,
      );
    } else if (successRate < 0.5 && this.maxConcurrentAdaptive > 1) {
      // Low success rate - decrease concurrency
      this.maxConcurrentAdaptive = Math.max(Math.floor(this.maxConcurrentAdaptive * 0.75), 1);
    }
  }

  // Get current metrics
  getMetrics(): BulkheadMetrics {
    return { ...this.metrics };
  }

  // Get active count
  getActiveCount(): number {
    return this.activeCount;
  }

  // Get queue depth
  getQueueDepth(): number {
    return this.queue.length;
  }

  // Get available slots
  getAvailableSlots(): number {
    const maxConcurrent = this.config.adaptiveSizing
      ? this.maxConcurrentAdaptive
      : this.config.maxConcurrent;
    return Math.max(0, maxConcurrent - this.activeCount);
  }

  // Get available queue space
  getAvailableQueueSpace(): number {
    return Math.max(0, this.config.maxQueue - this.queue.length);
  }

  // Get success rate
  getSuccessRate(): number {
    const total = this.successCount + this.failureCount;
    if (total === 0) return 1;
    return this.successCount / total;
  }

  // Get current max concurrent (considering adaptive)
  getCurrentMaxConcurrent(): number {
    return this.config.adaptiveSizing ? this.maxConcurrentAdaptive : this.config.maxConcurrent;
  }

  // Get config
  getConfig(): BulkheadConfig {
    return { ...this.config };
  }

  // Update config
  updateConfig(config: Partial<BulkheadConfig>): void {
    Object.assign(this.config, config);
    if (!this.config.adaptiveSizing) {
      this.maxConcurrentAdaptive = this.config.maxConcurrent;
    }
  }

  // Drain queue (reject all queued items)
  drain(): number {
    const count = this.queue.length;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      item.reject(new Error('Bulkhead drained'));
    }
    this.metrics.queueDepth = 0;
    return count;
  }

  // Reset
  reset(): void {
    this.drain();
    this.activeCount = 0;
    this.executionTimes = [];
    this.queueTimes = [];
    this.successCount = 0;
    this.failureCount = 0;
    this.adaptiveWindow = [];
    this.maxConcurrentAdaptive = this.config.maxConcurrent;
    this.metrics = {
      activeCount: 0,
      queueDepth: 0,
      totalExecuted: 0,
      totalRejected: 0,
      totalTimedOut: 0,
      averageExecutionTime: 0,
      averageQueueTime: 0,
    };
  }
}
