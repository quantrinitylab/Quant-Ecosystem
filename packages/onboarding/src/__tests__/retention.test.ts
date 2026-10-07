import { describe, expect, it } from 'vitest';
import { createRetentionTracker, getReEngagementDays } from '../retention.js';

describe('Retention Tracking', () => {
  describe('D7 retention measurement', () => {
    it('initializes with default metrics', () => {
      const tracker = createRetentionTracker('user-1');
      const metrics = tracker.getMetrics();

      expect(metrics.userId).toBe('user-1');
      expect(metrics.d7Retained).toBe(false);
      expect(metrics.d7Target).toBe(0.25);
      expect(metrics.retentionRate).toBe(0);
      expect(metrics.unsubscribed).toBe(false);
    });

    it('tracks activity days', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-2', signupDate);

      tracker.recordActivity(new Date('2025-01-02T10:00:00Z'));
      tracker.recordActivity(new Date('2025-01-03T10:00:00Z'));

      const daysActive = tracker.getDaysActive();
      expect(daysActive).toContain(0); // signup day
      expect(daysActive).toContain(1);
      expect(daysActive).toContain(2);
    });

    it('meets D7 target when active enough days', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-3', signupDate);

      // Active on days 1, 3, 5 (plus day 0 = 4 days in first 7)
      tracker.recordActivity(new Date('2025-01-02T10:00:00Z'));
      tracker.recordActivity(new Date('2025-01-04T10:00:00Z'));
      tracker.recordActivity(new Date('2025-01-06T10:00:00Z'));

      // Trigger D7 check by recording activity after day 7
      tracker.recordActivity(new Date('2025-01-09T10:00:00Z'));

      expect(tracker.meetsRetentionGate()).toBe(true);
      expect(tracker.getRetentionRate()).toBeGreaterThanOrEqual(0.25);
    });

    it('does not meet D7 target when not active enough', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-4', signupDate);

      // Only active on signup day
      // Check after day 7
      tracker.recordActivity(new Date('2025-01-09T10:00:00Z'));

      // Only 2 days active out of 7 = 0.28... but day 0 and day 8
      // Actually day 0 is in first 7, day 8 is not
      // So only 1 day active in first 7 = 1/7 = 0.14
      expect(tracker.getRetentionRate()).toBeLessThan(0.25);
      expect(tracker.meetsRetentionGate()).toBe(false);
    });
  });

  describe('re-engagement scheduling', () => {
    it('returns scheduled days', () => {
      const days = getReEngagementDays();
      expect(days).toEqual([3, 7, 14, 30]);
    });

    it('suggests re-engagement for inactive users', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-5', signupDate);

      // 4 days later, user inactive since signup
      const checkDate = new Date('2025-01-05T10:00:00Z');
      const day = tracker.shouldSendReEngagement(checkDate);

      expect(day).toBe(3);
    });

    it('does not suggest re-engagement for active users', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-6', signupDate);

      // User was active yesterday
      const yesterday = new Date('2025-01-04T10:00:00Z');
      tracker.recordActivity(yesterday);

      const checkDate = new Date('2025-01-05T10:00:00Z');
      const day = tracker.shouldSendReEngagement(checkDate);

      expect(day).toBeNull();
    });

    it('does not send the same re-engagement twice', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-7', signupDate);

      const checkDate = new Date('2025-01-05T10:00:00Z');
      const day = tracker.shouldSendReEngagement(checkDate);
      expect(day).toBe(3);

      tracker.sendReEngagement(3, checkDate);

      const dayAfter = tracker.shouldSendReEngagement(checkDate);
      expect(dayAfter).toBeNull(); // Day 7 not reached yet
    });

    it('moves to next scheduled day after sending', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-8', signupDate);

      // Send day 3
      tracker.sendReEngagement(3, new Date('2025-01-05T10:00:00Z'));

      // Check at day 8 (7 days after signup)
      const checkDate = new Date('2025-01-09T10:00:00Z');
      const day = tracker.shouldSendReEngagement(checkDate);
      expect(day).toBe(7);
    });
  });

  describe('one-click unsubscribe', () => {
    it('generates an unsubscribe token', () => {
      const tracker = createRetentionTracker('user-9');
      const token = tracker.getUnsubscribeToken();
      expect(token).toBeTruthy();
      expect(token.length).toBe(32);
    });

    it('unsubscribes with correct token', () => {
      const tracker = createRetentionTracker('user-10');
      const token = tracker.getUnsubscribeToken();

      const result = tracker.unsubscribe(token);
      expect(result).toBe(true);
      expect(tracker.isUnsubscribed()).toBe(true);
    });

    it('rejects incorrect token', () => {
      const tracker = createRetentionTracker('user-11');

      const result = tracker.unsubscribe('wrong-token');
      expect(result).toBe(false);
      expect(tracker.isUnsubscribed()).toBe(false);
    });

    it('stops re-engagement after unsubscribe', () => {
      const signupDate = new Date('2025-01-01T10:00:00Z');
      const tracker = createRetentionTracker('user-12', signupDate);
      const token = tracker.getUnsubscribeToken();

      tracker.unsubscribe(token);

      const checkDate = new Date('2025-01-05T10:00:00Z');
      const day = tracker.shouldSendReEngagement(checkDate);
      expect(day).toBeNull();
    });

    it('stops activity tracking after unsubscribe', () => {
      const tracker = createRetentionTracker('user-13');
      const token = tracker.getUnsubscribeToken();
      tracker.unsubscribe(token);

      const initialDays = tracker.getDaysActive().length;
      tracker.recordActivity(new Date('2025-06-01T10:00:00Z'));
      expect(tracker.getDaysActive().length).toBe(initialDays);
    });
  });
});
