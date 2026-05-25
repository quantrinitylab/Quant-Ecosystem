// ============================================================================
// Data Pipeline Package - Growth Metrics Calculator
// ============================================================================

import type {
  GrowthMetrics,
  RetentionCohort,
  ChurnPrediction,
  ChurnFactor,
  ActiveUserMetrics,
} from '../types';

/** User activity record */
interface UserActivity {
  userId: string;
  timestamp: number;
  eventType: string;
  properties: Record<string, unknown>;
}

/** User metadata for analysis */
interface UserMetadata {
  userId: string;
  signupDate: number;
  lastActiveAt: number;
  totalEvents: number;
  activeDays: Set<string>;
  firstSessionCompleted: boolean;
  keyActionsCompleted: Set<string>;
}

/**
 * GrowthMetricsCalculator - DAU/WAU/MAU, retention, churn prediction
 * Calculates active user metrics with deduplication, retention cohorts,
 * churn probability scoring, and power user identification.
 */
export class GrowthMetricsCalculator {
  private activities: UserActivity[] = [];
  private userMetadata: Map<string, UserMetadata> = new Map();
  private keyActions: Set<string> = new Set(['signup_complete', 'first_action', 'invite_sent']);
  private powerUserThreshold: number = 0.9; // Top 10%

  constructor(keyActions?: string[]) {
    if (keyActions) {
      this.keyActions = new Set(keyActions);
    }
  }

  /**
   * Record a user activity event
   */
  public recordActivity(
    userId: string,
    eventType: string,
    timestamp: number = Date.now(),
    properties: Record<string, unknown> = {}
  ): void {
    this.activities.push({ userId, timestamp, eventType, properties });

    // Update user metadata
    if (!this.userMetadata.has(userId)) {
      this.userMetadata.set(userId, {
        userId,
        signupDate: timestamp,
        lastActiveAt: timestamp,
        totalEvents: 0,
        activeDays: new Set(),
        firstSessionCompleted: false,
        keyActionsCompleted: new Set(),
      });
    }

    const metadata = this.userMetadata.get(userId)!;
    metadata.lastActiveAt = Math.max(metadata.lastActiveAt, timestamp);
    metadata.totalEvents++;
    metadata.activeDays.add(this.dateKey(timestamp));

    if (this.keyActions.has(eventType)) {
      metadata.keyActionsCompleted.add(eventType);
    }

    if (eventType === 'session_end' && !metadata.firstSessionCompleted) {
      metadata.firstSessionCompleted = true;
    }
  }

  /**
   * Calculate Daily Active Users for a specific date
   */
  public calculateDAU(date: number = Date.now()): number {
    const dayKey = this.dateKey(date);
    const activeUsers = new Set<string>();

    for (const activity of this.activities) {
      if (this.dateKey(activity.timestamp) === dayKey) {
        activeUsers.add(activity.userId);
      }
    }

    return activeUsers.size;
  }

  /**
   * Calculate Weekly Active Users for a week containing the given date
   */
  public calculateWAU(date: number = Date.now()): number {
    const weekStart = this.getWeekStart(date);
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
    const activeUsers = new Set<string>();

    for (const activity of this.activities) {
      if (activity.timestamp >= weekStart && activity.timestamp < weekEnd) {
        activeUsers.add(activity.userId);
      }
    }

    return activeUsers.size;
  }

  /**
   * Calculate Monthly Active Users for a month containing the given date
   */
  public calculateMAU(date: number = Date.now()): number {
    const monthStart = this.getMonthStart(date);
    const monthEnd = this.getMonthEnd(date);
    const activeUsers = new Set<string>();

    for (const activity of this.activities) {
      if (activity.timestamp >= monthStart && activity.timestamp < monthEnd) {
        activeUsers.add(activity.userId);
      }
    }

    return activeUsers.size;
  }

  /**
   * Calculate comprehensive growth metrics snapshot
   */
  public getGrowthMetrics(date: number = Date.now()): GrowthMetrics {
    const dau = this.calculateDAU(date);
    const wau = this.calculateWAU(date);
    const mau = this.calculateMAU(date);

    // Calculate growth rate (compare to previous period)
    const previousMonthDate = date - 30 * 24 * 60 * 60 * 1000;
    const previousMAU = this.calculateMAU(previousMonthDate);
    const growthRate = previousMAU > 0 ? (mau - previousMAU) / previousMAU : 0;

    return {
      dau,
      wau,
      mau,
      dauWauRatio: wau > 0 ? dau / wau : 0,
      dauMauRatio: mau > 0 ? dau / mau : 0,
      growthRate,
      activationRate: this.getActivationRate(date),
      date,
    };
  }

  /**
   * Calculate retention cohort analysis
   */
  public getRetentionCohort(cohortDate: string, maxDays: number = 30): RetentionCohort {
    const cohortStart = new Date(cohortDate).getTime();
    const cohortEnd = cohortStart + 24 * 60 * 60 * 1000;

    // Find users who signed up on the cohort date
    const cohortUsers = new Set<string>();
    for (const [userId, metadata] of this.userMetadata.entries()) {
      if (metadata.signupDate >= cohortStart && metadata.signupDate < cohortEnd) {
        cohortUsers.add(userId);
      }
    }

    const cohortSize = cohortUsers.size;
    const retentionByDay: Record<number, number> = {};
    const retentionByWeek: Record<number, number> = {};

    // Calculate daily retention
    for (let day = 1; day <= maxDays; day++) {
      const dayStart = cohortStart + day * 24 * 60 * 60 * 1000;
      const dayKey = this.dateKey(dayStart);
      let retainedCount = 0;

      for (const userId of cohortUsers) {
        const metadata = this.userMetadata.get(userId);
        if (metadata && metadata.activeDays.has(dayKey)) {
          retainedCount++;
        }
      }

      retentionByDay[day] = cohortSize > 0 ? retainedCount / cohortSize : 0;
    }

    // Calculate weekly retention
    for (let week = 1; week <= Math.ceil(maxDays / 7); week++) {
      const weekStart = cohortStart + (week - 1) * 7 * 24 * 60 * 60 * 1000;
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
      let retainedCount = 0;

      for (const userId of cohortUsers) {
        const metadata = this.userMetadata.get(userId);
        if (metadata) {
          const wasActive = Array.from(metadata.activeDays).some(dayStr => {
            const dayTime = new Date(dayStr).getTime();
            return dayTime >= weekStart && dayTime < weekEnd;
          });
          if (wasActive) retainedCount++;
        }
      }

      retentionByWeek[week] = cohortSize > 0 ? retainedCount / cohortSize : 0;
    }

    // Average retention
    const retentionValues = Object.values(retentionByDay);
    const averageRetention = retentionValues.length > 0
      ? retentionValues.reduce((a, b) => a + b, 0) / retentionValues.length
      : 0;

    return {
      cohortDate,
      cohortSize,
      retentionByDay,
      retentionByWeek,
      averageRetention,
    };
  }

  /**
   * Predict churn probability for a user
   */
  public predictChurn(userId: string): ChurnPrediction {
    const metadata = this.userMetadata.get(userId);
    if (!metadata) {
      return {
        userId,
        churnProbability: 1.0,
        riskLevel: 'critical',
        factors: [{ name: 'no_data', weight: 1.0, description: 'No activity data found' }],
        predictedChurnDate: null,
        lastActivityAt: 0,
      };
    }

    const factors: ChurnFactor[] = [];
    let churnScore = 0;

    // Factor 1: Days since last activity
    const daysSinceActive = (Date.now() - metadata.lastActiveAt) / (24 * 60 * 60 * 1000);
    const inactivityWeight = Math.min(daysSinceActive / 30, 1.0) * 0.35;
    churnScore += inactivityWeight;
    factors.push({
      name: 'inactivity',
      weight: inactivityWeight,
      description: `${Math.round(daysSinceActive)} days since last activity`,
    });

    // Factor 2: Declining frequency
    const recentDays = this.getActiveDaysInRange(userId, Date.now() - 14 * 24 * 60 * 60 * 1000, Date.now());
    const previousDays = this.getActiveDaysInRange(userId, Date.now() - 28 * 24 * 60 * 60 * 1000, Date.now() - 14 * 24 * 60 * 60 * 1000);
    const frequencyDecline = previousDays > 0 ? Math.max(0, 1 - (recentDays / previousDays)) : 0;
    const frequencyWeight = frequencyDecline * 0.25;
    churnScore += frequencyWeight;
    factors.push({
      name: 'frequency_decline',
      weight: frequencyWeight,
      description: `Activity dropped ${Math.round(frequencyDecline * 100)}% in last 2 weeks`,
    });

    // Factor 3: Low engagement depth
    const avgDailyEvents = metadata.totalEvents / Math.max(metadata.activeDays.size, 1);
    const engagementWeight = Math.max(0, 1 - (avgDailyEvents / 10)) * 0.2;
    churnScore += engagementWeight;
    factors.push({
      name: 'low_engagement',
      weight: engagementWeight,
      description: `Average ${avgDailyEvents.toFixed(1)} events per active day`,
    });

    // Factor 4: Key actions not completed
    const keyActionCompletion = metadata.keyActionsCompleted.size / Math.max(this.keyActions.size, 1);
    const activationWeight = (1 - keyActionCompletion) * 0.2;
    churnScore += activationWeight;
    factors.push({
      name: 'incomplete_activation',
      weight: activationWeight,
      description: `${Math.round(keyActionCompletion * 100)}% of key actions completed`,
    });

    // Normalize score
    const churnProbability = Math.min(Math.max(churnScore, 0), 1);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (churnProbability < 0.25) riskLevel = 'low';
    else if (churnProbability < 0.5) riskLevel = 'medium';
    else if (churnProbability < 0.75) riskLevel = 'high';
    else riskLevel = 'critical';

    // Predict churn date based on activity decay
    const predictedChurnDate = churnProbability > 0.5
      ? Date.now() + Math.round((1 - churnProbability) * 30 * 24 * 60 * 60 * 1000)
      : null;

    return {
      userId,
      churnProbability,
      riskLevel,
      factors,
      predictedChurnDate,
      lastActivityAt: metadata.lastActiveAt,
    };
  }

  /**
   * Calculate activation rate (users completing key actions in first session)
   */
  public getActivationRate(date: number = Date.now()): number {
    const monthStart = this.getMonthStart(date);
    let newUsers = 0;
    let activatedUsers = 0;

    for (const metadata of this.userMetadata.values()) {
      if (metadata.signupDate >= monthStart) {
        newUsers++;
        if (metadata.keyActionsCompleted.size > 0) {
          activatedUsers++;
        }
      }
    }

    return newUsers > 0 ? activatedUsers / newUsers : 0;
  }

  /**
   * Get active user metrics breakdown
   */
  public getActiveUserMetrics(date: number = Date.now()): ActiveUserMetrics {
    const dayStart = this.getDayStart(date);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const monthStart = this.getMonthStart(date);
    const previousMonthStart = this.getMonthStart(monthStart - 1);

    const totalUsers = this.userMetadata.size;
    const activeToday = new Set<string>();
    const newThisMonth = new Set<string>();
    const activeLastMonth = new Set<string>();
    const activeThisMonth = new Set<string>();

    for (const [userId, metadata] of this.userMetadata.entries()) {
      if (metadata.activeDays.has(this.dateKey(date))) {
        activeToday.add(userId);
      }
      if (metadata.signupDate >= monthStart) {
        newThisMonth.add(userId);
      }
      // Check if active this month
      for (const dayStr of metadata.activeDays) {
        const dayTime = new Date(dayStr).getTime();
        if (dayTime >= monthStart && dayTime < dayEnd) {
          activeThisMonth.add(userId);
        }
        if (dayTime >= previousMonthStart && dayTime < monthStart) {
          activeLastMonth.add(userId);
        }
      }
    }

    // Returning users: active this month AND last month
    const returning = new Set<string>();
    for (const userId of activeThisMonth) {
      if (activeLastMonth.has(userId) && !newThisMonth.has(userId)) {
        returning.add(userId);
      }
    }

    // Reactivated: active this month but NOT last month, not new
    const reactivated = new Set<string>();
    for (const userId of activeThisMonth) {
      if (!activeLastMonth.has(userId) && !newThisMonth.has(userId)) {
        reactivated.add(userId);
      }
    }

    // Churned: active last month but not this month
    let churned = 0;
    for (const userId of activeLastMonth) {
      if (!activeThisMonth.has(userId)) {
        churned++;
      }
    }

    // Power users: top 10% by activity
    const activityScores = Array.from(this.userMetadata.values())
      .map(m => m.totalEvents)
      .sort((a, b) => b - a);
    const powerThreshold = activityScores[Math.floor(activityScores.length * 0.1)] ?? 0;
    let powerUsers = 0;
    for (const metadata of this.userMetadata.values()) {
      if (metadata.totalEvents >= powerThreshold && powerThreshold > 0) {
        powerUsers++;
      }
    }

    return {
      totalUsers,
      activeUsers: activeThisMonth.size,
      newUsers: newThisMonth.size,
      returningUsers: returning.size,
      reactivatedUsers: reactivated.size,
      churned,
      powerUsers,
      casualUsers: activeThisMonth.size - powerUsers,
    };
  }

  /**
   * Get number of active days for a user in a date range
   */
  private getActiveDaysInRange(userId: string, start: number, end: number): number {
    const metadata = this.userMetadata.get(userId);
    if (!metadata) return 0;

    let count = 0;
    for (const dayStr of metadata.activeDays) {
      const dayTime = new Date(dayStr).getTime();
      if (dayTime >= start && dayTime < end) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get date key (YYYY-MM-DD format)
   */
  private dateKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Get start of day
   */
  private getDayStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Get start of week (Monday)
   */
  private getWeekStart(timestamp: number): number {
    const d = new Date(timestamp);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Get start of month
   */
  private getMonthStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Get end of month
   */
  private getMonthEnd(timestamp: number): number {
    const d = new Date(timestamp);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
}
