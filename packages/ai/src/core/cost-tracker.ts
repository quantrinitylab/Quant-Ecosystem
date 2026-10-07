// ============================================================================
// AI Core - Cost Tracker & Rate Limiter
// ============================================================================

import type { CostRecord, BudgetConfig, RateLimitConfig } from '../types';
import { BudgetExceededError, RateLimitError } from '../types';

const DEFAULT_BUDGET: BudgetConfig = {
  dailyBudget: 1000.0,
  perUserBudget: 10.0,
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 60,
  windowMs: 60000,
};

/** Maximum number of records to keep before pruning */
const MAX_RECORDS = 10000;

/**
 * Cost Tracker
 *
 * Tracks per-user token usage and cost, enforces daily and per-user budgets,
 * and provides sliding window rate limiting.
 */
export class CostTracker {
  private records: CostRecord[] = [];
  private budgetConfig: BudgetConfig;
  private rateLimitConfig: RateLimitConfig;
  private requestTimestamps: Map<string, number[]> = new Map();
  private dailyResetAt: number;

  constructor(
    budgetConfig: Partial<BudgetConfig> = {},
    rateLimitConfig: Partial<RateLimitConfig> = {},
  ) {
    this.budgetConfig = { ...DEFAULT_BUDGET, ...budgetConfig };
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT, ...rateLimitConfig };
    this.dailyResetAt = this.getNextDayReset();
  }

  /**
   * Track usage for a request
   */
  trackUsage(
    userId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    cost: number,
  ): void {
    this.maybeResetDaily();

    const record: CostRecord = {
      userId,
      model,
      promptTokens,
      completionTokens,
      cost,
      timestamp: Date.now(),
    };
    this.records.push(record);

    // Record request timestamp for rate limiting
    const timestamps = this.requestTimestamps.get(userId) || [];
    timestamps.push(Date.now());
    this.requestTimestamps.set(userId, timestamps);
  }

  /**
   * Check if user is within budget. Throws BudgetExceededError if not.
   */
  checkBudget(userId: string): void {
    this.maybeResetDaily();

    // Check daily budget
    const dailySpend = this.getDailySpend();
    if (dailySpend >= this.budgetConfig.dailyBudget) {
      throw new BudgetExceededError(
        'Daily AI cost budget exceeded',
        userId,
        dailySpend,
        this.budgetConfig.dailyBudget,
      );
    }

    // Check per-user budget
    const userSpend = this.getUserSpend(userId);
    if (userSpend >= this.budgetConfig.perUserBudget) {
      throw new BudgetExceededError(
        'User AI cost budget exceeded',
        userId,
        userSpend,
        this.budgetConfig.perUserBudget,
      );
    }
  }

  /**
   * Check rate limit for user. Throws RateLimitError if exceeded.
   */
  checkRateLimit(userId: string): void {
    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;

    const timestamps = this.requestTimestamps.get(userId) || [];
    // Clean up old timestamps
    const recentTimestamps = timestamps.filter((t) => t > windowStart);
    this.requestTimestamps.set(userId, recentTimestamps);

    if (recentTimestamps.length >= this.rateLimitConfig.requestsPerMinute) {
      const oldestInWindow = recentTimestamps[0] ?? now;
      const retryAfterMs = oldestInWindow + this.rateLimitConfig.windowMs - now;
      throw new RateLimitError('Rate limit exceeded', userId, retryAfterMs);
    }
  }

  /**
   * Get total spend for a user (current day)
   */
  getUserSpend(userId: string): number {
    this.maybeResetDaily();
    const dayStart = this.dailyResetAt - 86400000;
    return this.records
      .filter((r) => r.userId === userId && r.timestamp >= dayStart)
      .reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get total daily spend across all users
   */
  getDailySpend(): number {
    this.maybeResetDaily();
    const dayStart = this.dailyResetAt - 86400000;
    return this.records.filter((r) => r.timestamp >= dayStart).reduce((sum, r) => sum + r.cost, 0);
  }

  /**
   * Get the full usage log
   */
  getUsageLog(): CostRecord[] {
    return [...this.records];
  }

  /**
   * Reset daily tracking if needed and prune old records
   */
  private maybeResetDaily(): void {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyResetAt = this.getNextDayReset();
      // Prune records older than the current budget window
      const dayStart = this.dailyResetAt - 86400000;
      this.records = this.records.filter((r) => r.timestamp >= dayStart);
    }

    // Also prune if records exceed max size
    if (this.records.length > MAX_RECORDS) {
      const dayStart = this.dailyResetAt - 86400000;
      this.records = this.records.filter((r) => r.timestamp >= dayStart);
      // If still over max, keep only the most recent MAX_RECORDS entries
      if (this.records.length > MAX_RECORDS) {
        this.records = this.records.slice(-MAX_RECORDS);
      }
    }
  }

  /**
   * Get the next midnight reset timestamp
   */
  private getNextDayReset(): number {
    return Date.now() + 86400000;
  }
}
