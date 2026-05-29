import { z } from 'zod';
import type { SpendDashboard, SpendRecord } from './types.js';

export const RecordSpendSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  modelId: z.string().min(1),
  appId: z.string().min(1),
  tokensInput: z.number().int().min(0),
  tokensOutput: z.number().int().min(0),
  cost: z.number().min(0),
  creditsUsed: z.number().min(0),
  timestamp: z.number().positive(),
  source: z.enum(['byoc', 'credits', 'allowance', 'local']),
});

/**
 * Per-token rates used to estimate "avoided cloud cost" when inference runs
 * locally. Defaults use GPT-4o-mini pricing as a reasonable baseline for the
 * cost a user would have paid if routed to a cloud provider.
 */
export interface LocalSavingsRateConfig {
  /** Cost per input token that would have been charged by cloud (default: GPT-4o-mini $0.15/1M = 0.00000015) */
  inputTokenRate: number;
  /** Cost per output token that would have been charged by cloud (default: GPT-4o-mini $0.60/1M = 0.0000006) */
  outputTokenRate: number;
}

export interface SpendDashboardConfig {
  /** Per-token rates for computing local inference savings estimates */
  localSavingsRates: LocalSavingsRateConfig;
}

/**
 * Default rates based on GPT-4o-mini pricing (as of 2024):
 * - Input: $0.15 per 1M tokens = $0.00000015 per token
 * - Output: $0.60 per 1M tokens = $0.0000006 per token
 */
const DEFAULT_LOCAL_SAVINGS_RATES: LocalSavingsRateConfig = {
  inputTokenRate: 0.00000015,
  outputTokenRate: 0.0000006,
};

export class SpendDashboardService {
  private readonly records: Map<string, SpendRecord[]> = new Map();
  private readonly localSavingsRates: LocalSavingsRateConfig;

  constructor(config: Partial<SpendDashboardConfig> = {}) {
    this.localSavingsRates = config.localSavingsRates ?? DEFAULT_LOCAL_SAVINGS_RATES;
  }

  recordSpend(record: SpendRecord): void {
    RecordSpendSchema.parse(record);

    const userRecords = this.records.get(record.userId) ?? [];
    userRecords.push(record);
    this.records.set(record.userId, userRecords);
  }

  getDashboard(userId: string, periodStart: number, periodEnd: number): SpendDashboard {
    const userRecords = this.records.get(userId) ?? [];
    const filtered = userRecords.filter(
      (r) => r.timestamp >= periodStart && r.timestamp <= periodEnd,
    );

    const byModel = new Map<string, number>();
    const byApp = new Map<string, number>();
    const byDay = new Map<string, number>();
    let totalCost = 0;
    let totalCreditsUsed = 0;
    let totalTokens = 0;
    let savingsFromLocal = 0;

    for (const r of filtered) {
      totalCost += r.cost;
      totalCreditsUsed += r.creditsUsed;
      totalTokens += r.tokensInput + r.tokensOutput;

      byModel.set(r.modelId, (byModel.get(r.modelId) ?? 0) + r.cost);
      byApp.set(r.appId, (byApp.get(r.appId) ?? 0) + r.cost);

      const dayKey = new Date(r.timestamp).toISOString().slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + r.cost);

      if (r.source === 'local') {
        savingsFromLocal +=
          r.tokensInput * this.localSavingsRates.inputTokenRate +
          r.tokensOutput * this.localSavingsRates.outputTokenRate;
      }
    }

    return {
      userId,
      periodStart,
      periodEnd,
      totalCost,
      totalCreditsUsed,
      totalTokens,
      byModel,
      byApp,
      byDay,
      savingsFromLocal,
    };
  }

  getTopModels(userId: string, limit: number = 5): { modelId: string; cost: number }[] {
    const userRecords = this.records.get(userId) ?? [];
    const byCost = new Map<string, number>();

    for (const r of userRecords) {
      byCost.set(r.modelId, (byCost.get(r.modelId) ?? 0) + r.cost);
    }

    return Array.from(byCost.entries())
      .map(([modelId, cost]) => ({ modelId, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
  }

  getDailyTrend(userId: string, days: number = 30): { date: string; total: number }[] {
    const userRecords = this.records.get(userId) ?? [];
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const byDay = new Map<string, number>();
    for (const r of userRecords) {
      if (r.timestamp >= cutoff) {
        const dayKey = new Date(r.timestamp).toISOString().slice(0, 10);
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + r.cost);
      }
    }

    return Array.from(byDay.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  estimateMonthlyProjection(userId: string): number {
    const userRecords = this.records.get(userId) ?? [];
    if (userRecords.length === 0) return 0;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentRecords = userRecords.filter((r) => r.timestamp >= thirtyDaysAgo);

    if (recentRecords.length === 0) return 0;

    const totalCost = recentRecords.reduce((sum, r) => sum + r.cost, 0);
    const firstRecord = Math.min(...recentRecords.map((r) => r.timestamp));
    const daysCovered = Math.max(1, (now - firstRecord) / (24 * 60 * 60 * 1000));

    return (totalCost / daysCovered) * 30;
  }

  getLocalSavings(userId: string): number {
    const userRecords = this.records.get(userId) ?? [];
    let savings = 0;

    for (const r of userRecords) {
      if (r.source === 'local') {
        savings +=
          r.tokensInput * this.localSavingsRates.inputTokenRate +
          r.tokensOutput * this.localSavingsRates.outputTokenRate;
      }
    }

    return savings;
  }
}
