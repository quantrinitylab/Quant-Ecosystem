import type { ReEngagementDay, ReEngagementSchedule, RetentionMetrics } from './types.js';

const D7_RETENTION_TARGET = 0.25;
const RE_ENGAGEMENT_DAYS: ReEngagementDay[] = [3, 7, 14, 30];

export class RetentionTracker {
  private metrics: RetentionMetrics;
  private reEngagement: ReEngagementSchedule;

  constructor(userId: string, signupDate: Date = new Date()) {
    this.metrics = {
      userId,
      signupDate,
      lastActiveDate: signupDate,
      d7Retained: false,
      d7Target: D7_RETENTION_TARGET,
      daysActive: [0],
      retentionRate: 0,
      reEngagementSent: [],
      unsubscribed: false,
    };
    this.reEngagement = {
      userId,
      scheduledDays: [...RE_ENGAGEMENT_DAYS],
      sentNotifications: [],
      unsubscribed: false,
      oneClickUnsubscribeToken: this.generateToken(),
    };
  }

  private generateToken(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars[bytes[i]! % chars.length];
    }
    return token;
  }

  recordActivity(date: Date = new Date()): void {
    if (this.metrics.unsubscribed) return;

    this.metrics.lastActiveDate = date;
    const daysSinceSignup = Math.floor(
      (date.getTime() - this.metrics.signupDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (!this.metrics.daysActive.includes(daysSinceSignup)) {
      this.metrics.daysActive.push(daysSinceSignup);
    }

    // Check D7 retention
    if (daysSinceSignup >= 7) {
      const activeDaysInFirst7 = this.metrics.daysActive.filter((d) => d <= 7).length;
      this.metrics.retentionRate = activeDaysInFirst7 / 7;
      this.metrics.d7Retained = this.metrics.retentionRate >= D7_RETENTION_TARGET;
    }
  }

  meetsRetentionGate(): boolean {
    return this.metrics.d7Retained;
  }

  getRetentionRate(): number {
    return this.metrics.retentionRate;
  }

  getMetrics(): RetentionMetrics {
    return { ...this.metrics };
  }

  getReEngagementSchedule(): ReEngagementSchedule {
    return { ...this.reEngagement };
  }

  shouldSendReEngagement(currentDate: Date = new Date()): ReEngagementDay | null {
    if (this.metrics.unsubscribed || this.reEngagement.unsubscribed) {
      return null;
    }

    const daysSinceSignup = Math.floor(
      (currentDate.getTime() - this.metrics.signupDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const daysSinceLastActive = Math.floor(
      (currentDate.getTime() - this.metrics.lastActiveDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only send if user has been inactive
    if (daysSinceLastActive < 2) {
      return null;
    }

    for (const day of this.reEngagement.scheduledDays) {
      if (daysSinceSignup >= day) {
        const alreadySent = this.reEngagement.sentNotifications.some((n) => n.day === day);
        if (!alreadySent) {
          return day;
        }
      }
    }

    return null;
  }

  sendReEngagement(day: ReEngagementDay, sentAt: Date = new Date()): void {
    if (this.metrics.unsubscribed || this.reEngagement.unsubscribed) {
      return;
    }

    this.reEngagement.sentNotifications.push({ day, sentAt });
    this.metrics.reEngagementSent.push(day);
  }

  unsubscribe(token: string): boolean {
    if (token === this.reEngagement.oneClickUnsubscribeToken) {
      this.metrics.unsubscribed = true;
      this.reEngagement.unsubscribed = true;
      return true;
    }
    return false;
  }

  isUnsubscribed(): boolean {
    return this.metrics.unsubscribed;
  }

  getUnsubscribeToken(): string {
    return this.reEngagement.oneClickUnsubscribeToken;
  }

  getDaysActive(): number[] {
    return [...this.metrics.daysActive];
  }
}

export function createRetentionTracker(userId: string, signupDate?: Date): RetentionTracker {
  return new RetentionTracker(userId, signupDate);
}

export function getReEngagementDays(): ReEngagementDay[] {
  return [...RE_ENGAGEMENT_DAYS];
}
