export interface UsageResult {
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
  period: string;
}

export interface StatsResult {
  /** Total non-deleted AI conversations the user has created. */
  totalConversations: number;
  /** Lifetime tokens consumed across all of the user's sessions. */
  totalTokens: number;
  /** Tokens consumed in sessions active since local midnight. */
  tokensToday: number;
  /** Consecutive days (ending today/yesterday) with at least one active session. */
  streakDays: number;
  /** Experience points derived deterministically from real activity. */
  xp: number;
  /** Level derived from xp. */
  level: number;
}

export interface BillingResult {
  currentUsage: UsageResult;
  limits: {
    maxTokensPerDay: number;
    maxCostPerDay: number;
  };
  remainingBudget: number;
}

export interface DailyUsagePoint {
  /** ISO date (YYYY-MM-DD), local time. */
  date: string;
  tokens: number;
  cost: number;
  sessions: number;
}

interface SessionUsageRecord {
  totalTokensUsed: number;
  totalCost: number;
  createdAt?: Date;
  updatedAt?: Date;
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

  /**
   * Real engagement stats derived entirely from the user's persisted AI
   * sessions. No hardcoded values: streak, xp and level are computed from
   * actual activity timestamps and token consumption.
   */
  async getStats(userId: string): Promise<StatsResult> {
    const sessions = await this.prisma.aISession.findMany({
      where: { userId, deletedAt: null },
      select: { totalTokensUsed: true, totalCost: true, createdAt: true, updatedAt: true },
    });

    const totalConversations = sessions.length;
    const totalTokens = sessions.reduce(
      (sum: number, s: SessionUsageRecord) => sum + s.totalTokensUsed,
      0,
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tokensToday = sessions
      .filter((s: SessionUsageRecord) => s.updatedAt != null && s.updatedAt >= todayStart)
      .reduce((sum: number, s: SessionUsageRecord) => sum + s.totalTokensUsed, 0);

    const activityDates = sessions
      .map((s: SessionUsageRecord) => s.updatedAt ?? s.createdAt)
      .filter((d: Date | undefined): d is Date => d != null);
    const streakDays = this.computeStreak(activityDates);

    // XP is a deterministic function of real usage: 25 per conversation plus
    // 1 per 100 tokens. Level grows sub-linearly with XP.
    const xp = totalConversations * 25 + Math.floor(totalTokens / 100);
    const level = Math.floor(Math.sqrt(xp / 50)) + 1;

    return { totalConversations, totalTokens, tokensToday, streakDays, xp, level };
  }

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private isoDay(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Per-day token/cost/session breakdown over the last `days` days (default 30),
   * bucketed by session activity time. Days with no activity are returned as
   * explicit zero points so the series is dense and chart-ready.
   */
  async getDailyUsage(userId: string, days = 30): Promise<DailyUsagePoint[]> {
    const windowDays = Math.min(Math.max(Math.trunc(days), 1), 365);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (windowDays - 1));

    const sessions = await this.prisma.aISession.findMany({
      where: { userId, deletedAt: null, updatedAt: { gte: start } },
      select: { totalTokensUsed: true, totalCost: true, createdAt: true, updatedAt: true },
    });

    // Seed a dense, ordered map of zeroed days.
    const buckets = new Map<string, DailyUsagePoint>();
    for (let i = 0; i < windowDays; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      buckets.set(this.isoDay(day), { date: this.isoDay(day), tokens: 0, cost: 0, sessions: 0 });
    }

    for (const session of sessions) {
      const when = session.updatedAt ?? session.createdAt;
      if (!when) continue;
      const key = this.isoDay(when);
      const point = buckets.get(key);
      if (!point) continue;
      point.tokens += session.totalTokensUsed;
      point.cost += session.totalCost;
      point.sessions += 1;
    }

    return Array.from(buckets.values());
  }

  /**
   * Count consecutive active days ending today (or yesterday, so a streak is
   * not considered broken until a full day with no activity passes).
   */
  private computeStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;
    const activeDays = new Set(dates.map((d) => this.dayKey(d)));

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    if (!activeDays.has(this.dayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
      if (!activeDays.has(this.dayKey(cursor))) return 0;
    }

    let streak = 0;
    while (activeDays.has(this.dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
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
