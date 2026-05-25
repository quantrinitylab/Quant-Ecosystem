export interface UsageResult {
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
  period: string;
}

export interface BillingResult {
  currentUsage: UsageResult;
  limits: {
    maxTokensPerDay: number;
    maxCostPerDay: number;
  };
  remainingBudget: number;
}

interface SessionUsageRecord {
  totalTokensUsed: number;
  totalCost: number;
}

export interface UsagePrismaClient {
  aISession: {
    findMany: (args: Record<string, unknown>) => Promise<SessionUsageRecord[]>;
  };
}

export class UsageService {
  private readonly dailyTokenLimit = 1000000;
  private readonly dailyCostLimit = 10.0;

  constructor(private readonly prisma: UsagePrismaClient) {}

  async getUsage(userId: string, period: 'day' | 'week' | 'month'): Promise<UsageResult> {
    const startDate = this.getPeriodStart(period);

    const sessions = await this.prisma.aISession.findMany({
      where: {
        userId,
        updatedAt: { gte: startDate },
        deletedAt: null,
      },
      select: {
        totalTokensUsed: true,
        totalCost: true,
      },
    });

    const totalTokens = sessions.reduce(
      (sum: number, s: SessionUsageRecord) => sum + s.totalTokensUsed,
      0,
    );
    const totalCost = sessions.reduce((sum: number, s: SessionUsageRecord) => sum + s.totalCost, 0);

    return {
      totalTokens,
      totalCost,
      sessionCount: sessions.length,
      period,
    };
  }

  async getBilling(userId: string): Promise<BillingResult> {
    const currentUsage = await this.getUsage(userId, 'day');

    return {
      currentUsage,
      limits: {
        maxTokensPerDay: this.dailyTokenLimit,
        maxCostPerDay: this.dailyCostLimit,
      },
      remainingBudget: Math.max(0, this.dailyCostLimit - currentUsage.totalCost),
    };
  }

  async checkQuota(userId: string): Promise<boolean> {
    const usage = await this.getUsage(userId, 'day');
    return usage.totalCost < this.dailyCostLimit && usage.totalTokens < this.dailyTokenLimit;
  }

  private getPeriodStart(period: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (period) {
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week': {
        const dayOfWeek = now.getDay();
        const diff = now.getDate() - dayOfWeek;
        return new Date(now.getFullYear(), now.getMonth(), diff);
      }
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }
}
