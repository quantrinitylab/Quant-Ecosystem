// ============================================================================
// Retry Handler - Intelligent Retry with Backoff and Jitter
// ============================================================================

import { RetryConfig, RetryMetrics, RetryResult } from '../types';

type RetryPredicate = (error: Error) => boolean;
type OnRetryCallback = (error: Error, attempt: number, delay: number) => void;

export class RetryHandler {
  private config: RetryConfig;
  private metrics: RetryMetrics;
  private retryPredicate: RetryPredicate | null = null;
  private onRetryCallback: OnRetryCallback | null = null;
  private budgetRemaining: number;
  private budgetResetInterval: number = 60000;
  private lastBudgetReset: number = Date.now();
  private budgetLimit: number;
  private lastDelay: number = 0;
  private totalExecutions: number = 0;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      baseDelay: config?.baseDelay ?? 1000,
      maxDelay: config?.maxDelay ?? 30000,
      backoffStrategy: config?.backoffStrategy ?? 'exponential',
      jitterType: config?.jitterType ?? 'full',
      retryableErrors: config?.retryableErrors ?? [],
      nonRetryableErrors: config?.nonRetryableErrors ?? [],
      deadline: config?.deadline ?? null,
    };

    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0,
      lastAttempt: null,
    };

    this.budgetLimit = this.config.maxAttempts * 10;
    this.budgetRemaining = this.budgetLimit;
  }

  // Execute a function with retry logic
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    this.totalExecutions++;
    this.refreshBudget();

    let lastError: Error | undefined;
    let totalDelay = 0;
    let attempt = 0;
    const startTime = Date.now();

    for (attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        const value = await fn();

        if (attempt > 0) {
          this.metrics.successfulRetries++;
        }

        this.metrics.lastAttempt = Date.now();
        return {
          success: true,
          value,
          attempts: attempt + 1,
          totalDelay,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.metrics.totalAttempts++;

        // Check if error is non-retryable
        if (this.isNonRetryable(lastError)) {
          break;
        }

        // Check retry predicate
        if (this.retryPredicate && !this.retryPredicate(lastError)) {
          break;
        }

        // Check if retryable (if specific errors are configured)
        if (this.config.retryableErrors.length > 0 && !this.isRetryable(lastError)) {
          break;
        }

        // Check retry budget
        if (this.budgetRemaining <= 0) {
          break;
        }

        // Check if this is the last attempt
        if (attempt >= this.config.maxAttempts - 1) {
          break;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt);

        // Check deadline awareness
        if (this.config.deadline !== null) {
          const elapsed = Date.now() - startTime;
          const remaining = this.config.deadline - elapsed;
          if (remaining <= delay) {
            break; // Not enough time to retry
          }
        }

        // Consume retry budget
        this.budgetRemaining--;

        // Notify callback
        if (this.onRetryCallback) {
          this.onRetryCallback(lastError, attempt + 1, delay);
        }

        // Wait
        await this.sleep(delay);
        totalDelay += delay;
        this.metrics.totalDelay += delay;
        this.lastDelay = delay;
      }
    }

    this.metrics.failedRetries++;
    this.metrics.lastAttempt = Date.now();

    return {
      success: false,
      error: lastError,
      attempts: attempt + 1,
      totalDelay,
    };
  }

  // Calculate delay based on strategy and jitter
  calculateDelay(attempt: number): number {
    const baseDelay = this.calculateBaseDelay(attempt);
    const jitteredDelay = this.applyJitter(baseDelay, attempt);
    return Math.min(jitteredDelay, this.config.maxDelay);
  }

  // Calculate base delay based on backoff strategy
  private calculateBaseDelay(attempt: number): number {
    switch (this.config.backoffStrategy) {
      case 'exponential':
        return this.config.baseDelay * Math.pow(2, attempt);
      case 'linear':
        return this.config.baseDelay * (attempt + 1);
      case 'constant':
        return this.config.baseDelay;
      default:
        return this.config.baseDelay;
    }
  }

  // Apply jitter to delay
  private applyJitter(delay: number, _attempt: number): number {
    switch (this.config.jitterType) {
      case 'full':
        // Full jitter: random(0, calculatedDelay)
        return Math.random() * delay;

      case 'equal':
        // Equal jitter: delay/2 + random(0, delay/2)
        return delay / 2 + Math.random() * (delay / 2);

      case 'decorrelated':
        // Decorrelated jitter: min(maxDelay, random(baseDelay, lastDelay * 3))
        const lower = this.config.baseDelay;
        const upper = Math.max(lower, (this.lastDelay || this.config.baseDelay) * 3);
        return Math.min(this.config.maxDelay, lower + Math.random() * (upper - lower));

      default:
        return delay;
    }
  }

  // Check if error is non-retryable
  private isNonRetryable(error: Error): boolean {
    if (this.config.nonRetryableErrors.length === 0) return false;
    return this.config.nonRetryableErrors.some(
      (errType) => error.name === errType || error.message.includes(errType),
    );
  }

  // Check if error is retryable
  private isRetryable(error: Error): boolean {
    if (this.config.retryableErrors.length === 0) return true;
    return this.config.retryableErrors.some(
      (errType) => error.name === errType || error.message.includes(errType),
    );
  }

  // Refresh retry budget periodically
  private refreshBudget(): void {
    const now = Date.now();
    if (now - this.lastBudgetReset >= this.budgetResetInterval) {
      this.budgetRemaining = this.budgetLimit;
      this.lastBudgetReset = now;
    }
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Set custom retry predicate
  setRetryPredicate(predicate: RetryPredicate): void {
    this.retryPredicate = predicate;
  }

  // Set on-retry callback
  setOnRetryCallback(callback: OnRetryCallback): void {
    this.onRetryCallback = callback;
  }

  // Get metrics
  getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }

  // Get remaining retry budget
  getBudgetRemaining(): number {
    this.refreshBudget();
    return this.budgetRemaining;
  }

  // Set retry budget limit
  setBudgetLimit(limit: number): void {
    this.budgetLimit = limit;
    this.budgetRemaining = Math.min(this.budgetRemaining, limit);
  }

  // Set budget reset interval
  setBudgetResetInterval(intervalMs: number): void {
    this.budgetResetInterval = intervalMs;
  }

  // Update config
  updateConfig(config: Partial<RetryConfig>): void {
    Object.assign(this.config, config);
  }

  // Get config
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  // Get success rate
  getSuccessRate(): number {
    const total = this.metrics.successfulRetries + this.metrics.failedRetries;
    if (total === 0) return 1;
    return this.metrics.successfulRetries / total;
  }

  // Get average retry count
  getAverageRetries(): number {
    const total = this.metrics.successfulRetries + this.metrics.failedRetries;
    if (total === 0) return 0;
    return this.metrics.totalAttempts / total;
  }

  // Get average delay
  getAverageDelay(): number {
    if (this.metrics.totalAttempts === 0) return 0;
    return this.metrics.totalDelay / this.metrics.totalAttempts;
  }

  // Get total executions
  getTotalExecutions(): number {
    return this.totalExecutions;
  }

  // Reset metrics
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0,
      lastAttempt: null,
    };
    this.totalExecutions = 0;
    this.lastDelay = 0;
  }

  // Reset everything
  reset(): void {
    this.resetMetrics();
    this.budgetRemaining = this.budgetLimit;
    this.lastBudgetReset = Date.now();
    this.retryPredicate = null;
    this.onRetryCallback = null;
  }

  // Compute delay sequence (for inspection/testing)
  getDelaySequence(attempts: number): number[] {
    const delays: number[] = [];
    let savedLastDelay = this.lastDelay;
    for (let i = 0; i < attempts; i++) {
      const delay = this.calculateDelay(i);
      delays.push(Math.round(delay));
      this.lastDelay = delay;
    }
    this.lastDelay = savedLastDelay;
    return delays;
  }
}
