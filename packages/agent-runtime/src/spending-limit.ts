import { z } from 'zod';

export const SpendingLimitConfigSchema = z.object({
  dailyCap: z.number().positive(),
  weeklyCap: z.number().positive(),
  monthlyCap: z.number().positive(),
  perTaskCap: z.number().positive().optional(),
  tokensPerHourCap: z.number().positive().int().optional(),
});

export type SpendingLimitConfig = z.infer<typeof SpendingLimitConfigSchema>;

export type SpendingPeriod = 'daily' | 'weekly' | 'monthly';

export type CapType = 'daily' | 'weekly' | 'monthly' | 'perTask' | 'tokensPerHour';

export class SpendingCapBreachedError extends Error {
  public readonly capType: CapType;
  public readonly current: number;
  public readonly limit: number;

  constructor(capType: CapType, current: number, limit: number) {
    super(`Spending cap breached: ${capType} (current: ${current}, limit: ${limit})`);
    this.name = 'SpendingCapBreachedError';
    this.capType = capType;
    this.current = current;
    this.limit = limit;
  }
}

export interface SpendingLimitOptions {
  onBreach?: (error: SpendingCapBreachedError) => void;
}

export class SpendingLimit {
  private readonly config: SpendingLimitConfig;
  private dailySpend: number = 0;
  private weeklySpend: number = 0;
  private monthlySpend: number = 0;
  private currentTaskSpend: number = 0;
  private tokenUsage: { tokens: number; timestamp: number }[] = [];
  private readonly onBreach?: (error: SpendingCapBreachedError) => void;

  constructor(config: SpendingLimitConfig, options?: SpendingLimitOptions) {
    this.config = SpendingLimitConfigSchema.parse(config);
    this.onBreach = options?.onBreach;
  }

  recordSpend(amount: number): void {
    if (amount <= 0) {
      throw new Error('Spend amount must be positive');
    }

    // Check daily cap
    if (this.dailySpend + amount > this.config.dailyCap) {
      const error = new SpendingCapBreachedError(
        'daily',
        this.dailySpend + amount,
        this.config.dailyCap,
      );
      this.onBreach?.(error);
      throw error;
    }
    // Check weekly cap
    if (this.weeklySpend + amount > this.config.weeklyCap) {
      const error = new SpendingCapBreachedError(
        'weekly',
        this.weeklySpend + amount,
        this.config.weeklyCap,
      );
      this.onBreach?.(error);
      throw error;
    }
    // Check monthly cap
    if (this.monthlySpend + amount > this.config.monthlyCap) {
      const error = new SpendingCapBreachedError(
        'monthly',
        this.monthlySpend + amount,
        this.config.monthlyCap,
      );
      this.onBreach?.(error);
      throw error;
    }

    this.dailySpend += amount;
    this.weeklySpend += amount;
    this.monthlySpend += amount;
  }

  canSpend(amount: number): boolean {
    if (this.dailySpend + amount > this.config.dailyCap) return false;
    if (this.weeklySpend + amount > this.config.weeklyCap) return false;
    if (this.monthlySpend + amount > this.config.monthlyCap) return false;
    return true;
  }

  canSpendOnTask(amount: number): boolean {
    const cap = this.config.perTaskCap;
    if (cap === undefined) return true;
    return this.currentTaskSpend + amount <= cap;
  }

  recordTaskSpend(amount: number): void {
    if (amount <= 0) {
      throw new Error('Spend amount must be positive');
    }
    const cap = this.config.perTaskCap;
    if (cap !== undefined && this.currentTaskSpend + amount > cap) {
      const error = new SpendingCapBreachedError('perTask', this.currentTaskSpend + amount, cap);
      this.onBreach?.(error);
      throw error;
    }
    this.currentTaskSpend += amount;
    this.recordSpend(amount);
  }

  resetTaskSpend(): void {
    this.currentTaskSpend = 0;
  }

  recordTokenUsage(tokens: number): void {
    if (tokens <= 0) {
      throw new Error('Token count must be positive');
    }
    const now = Date.now();
    this.tokenUsage.push({ tokens, timestamp: now });
    this.pruneTokenUsage(now);

    const cap = this.config.tokensPerHourCap;
    if (cap !== undefined) {
      const hourlyTokens = this.getTokensInLastHour(now);
      if (hourlyTokens > cap) {
        const error = new SpendingCapBreachedError('tokensPerHour', hourlyTokens, cap);
        this.onBreach?.(error);
        throw error;
      }
    }
  }

  canSpendTokens(tokens: number): boolean {
    const cap = this.config.tokensPerHourCap;
    if (cap === undefined) return true;
    const now = Date.now();
    this.pruneTokenUsage(now);
    const currentTokens = this.getTokensInLastHour(now);
    return currentTokens + tokens <= cap;
  }

  getRemainingBudget(period: SpendingPeriod): number {
    switch (period) {
      case 'daily':
        return Math.max(0, this.config.dailyCap - this.dailySpend);
      case 'weekly':
        return Math.max(0, this.config.weeklyCap - this.weeklySpend);
      case 'monthly':
        return Math.max(0, this.config.monthlyCap - this.monthlySpend);
    }
  }

  reset(period: SpendingPeriod): void {
    switch (period) {
      case 'daily':
        this.dailySpend = 0;
        break;
      case 'weekly':
        this.weeklySpend = 0;
        break;
      case 'monthly':
        this.monthlySpend = 0;
        break;
    }
  }

  getConfig(): SpendingLimitConfig {
    return { ...this.config };
  }

  private pruneTokenUsage(now: number): void {
    const oneHourAgo = now - 60 * 60 * 1000;
    this.tokenUsage = this.tokenUsage.filter((entry) => entry.timestamp > oneHourAgo);
  }

  private getTokensInLastHour(now: number): number {
    const oneHourAgo = now - 60 * 60 * 1000;
    return this.tokenUsage
      .filter((entry) => entry.timestamp > oneHourAgo)
      .reduce((sum, entry) => sum + entry.tokens, 0);
  }
}
