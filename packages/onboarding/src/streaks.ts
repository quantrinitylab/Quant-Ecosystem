import type { GamificationConfig, HabitLoopConfig, StreakConfig } from './types.js';

const DEFAULT_GRACE_PERIOD_HOURS = 36;
const MAX_DAILY_NOTIFICATIONS = 2;

export class StreakEngine {
  private config: GamificationConfig;
  private habitLoop: HabitLoopConfig;

  constructor(optIn: boolean = false) {
    this.config = {
      optIn,
      streaks: {
        enabled: optIn,
        optIn,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: undefined,
        gracePeriodHours: DEFAULT_GRACE_PERIOD_HOURS,
        maxNotificationsPerDay: MAX_DAILY_NOTIFICATIONS,
      },
      dailyBriefEnabled: optIn,
      weeklyReviewEnabled: optIn,
      addictionSafeguards: {
        maxDailyNotifications: MAX_DAILY_NOTIFICATIONS,
        quietHoursEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 8,
        noFOMO: true,
      },
    };
    this.habitLoop = {
      dailyBrief: {
        enabled: optIn,
        preferredTime: '09:00',
        content: 'mixed',
      },
      weeklyReview: {
        enabled: optIn,
        preferredDay: 'monday',
        includeStreaks: true,
        includeGoals: true,
      },
    };
  }

  optIn(): void {
    this.config.optIn = true;
    this.config.streaks.optIn = true;
    this.config.streaks.enabled = true;
    this.config.dailyBriefEnabled = true;
    this.config.weeklyReviewEnabled = true;
    this.habitLoop.dailyBrief.enabled = true;
    this.habitLoop.weeklyReview.enabled = true;
  }

  optOut(): void {
    this.config.optIn = false;
    this.config.streaks.optIn = false;
    this.config.streaks.enabled = false;
    this.config.dailyBriefEnabled = false;
    this.config.weeklyReviewEnabled = false;
    this.habitLoop.dailyBrief.enabled = false;
    this.habitLoop.weeklyReview.enabled = false;
  }

  isOptedIn(): boolean {
    return this.config.optIn;
  }

  recordActivity(date: Date = new Date()): void {
    if (!this.config.optIn) {
      return;
    }

    const lastDate = this.config.streaks.lastActivityDate;
    if (!lastDate) {
      this.config.streaks.currentStreak = 1;
      this.config.streaks.longestStreak = 1;
      this.config.streaks.lastActivityDate = date;
      return;
    }

    const hoursSinceLastActivity = (date.getTime() - lastDate.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastActivity < 24) {
      // Same day activity, no streak change
      this.config.streaks.lastActivityDate = date;
      return;
    }

    if (hoursSinceLastActivity <= this.config.streaks.gracePeriodHours + 24) {
      // Within grace period, continue streak
      this.config.streaks.currentStreak += 1;
    } else {
      // Streak broken
      this.config.streaks.currentStreak = 1;
    }

    this.config.streaks.longestStreak = Math.max(
      this.config.streaks.longestStreak,
      this.config.streaks.currentStreak,
    );
    this.config.streaks.lastActivityDate = date;
  }

  getCurrentStreak(): number {
    return this.config.streaks.currentStreak;
  }

  getLongestStreak(): number {
    return this.config.streaks.longestStreak;
  }

  getStreakConfig(): StreakConfig {
    return { ...this.config.streaks };
  }

  getGamificationConfig(): GamificationConfig {
    return { ...this.config };
  }

  getHabitLoopConfig(): HabitLoopConfig {
    return { ...this.habitLoop };
  }

  generateDailyBrief(): { title: string; items: string[] } | null {
    if (!this.config.optIn || !this.config.dailyBriefEnabled) {
      return null;
    }
    return {
      title: 'Your Daily Brief',
      items: [
        `Current streak: ${this.config.streaks.currentStreak} days`,
        `Longest streak: ${this.config.streaks.longestStreak} days`,
        'Keep it up! No pressure though.',
      ],
    };
  }

  generateWeeklyReview(): { title: string; summary: string; streakInfo?: string } | null {
    if (!this.config.optIn || !this.config.weeklyReviewEnabled) {
      return null;
    }
    return {
      title: 'Your Weekly Review',
      summary: 'Here is what you accomplished this week.',
      streakInfo: this.habitLoop.weeklyReview.includeStreaks
        ? `${this.config.streaks.currentStreak}-day streak`
        : undefined,
    };
  }

  isInQuietHours(hour: number): boolean {
    const { quietHoursStart, quietHoursEnd, quietHoursEnabled } = this.config.addictionSafeguards;
    if (!quietHoursEnabled) return false;
    if (quietHoursStart > quietHoursEnd) {
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }
    return hour >= quietHoursStart && hour < quietHoursEnd;
  }

  hasAddictionSafeguards(): boolean {
    return this.config.addictionSafeguards.noFOMO;
  }
}

export function createStreakEngine(optIn: boolean = false): StreakEngine {
  return new StreakEngine(optIn);
}
