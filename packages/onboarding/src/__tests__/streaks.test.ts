import { describe, expect, it } from 'vitest';
import { StreakEngine, createStreakEngine } from '../streaks.js';

describe('Streaks and Gamification', () => {
  describe('opt-in behavior', () => {
    it('is not opted in by default', () => {
      const engine = createStreakEngine();
      expect(engine.isOptedIn()).toBe(false);
    });

    it('can opt in', () => {
      const engine = createStreakEngine();
      engine.optIn();
      expect(engine.isOptedIn()).toBe(true);
    });

    it('can opt out', () => {
      const engine = createStreakEngine(true);
      expect(engine.isOptedIn()).toBe(true);
      engine.optOut();
      expect(engine.isOptedIn()).toBe(false);
    });

    it('does not track activity when not opted in', () => {
      const engine = createStreakEngine(false);
      engine.recordActivity(new Date());
      expect(engine.getCurrentStreak()).toBe(0);
    });

    it('tracks activity when opted in', () => {
      const engine = createStreakEngine(true);
      engine.recordActivity(new Date());
      expect(engine.getCurrentStreak()).toBe(1);
    });
  });

  describe('streak tracking', () => {
    it('starts a streak on first activity', () => {
      const engine = new StreakEngine(true);
      engine.recordActivity(new Date('2025-01-01T10:00:00Z'));
      expect(engine.getCurrentStreak()).toBe(1);
      expect(engine.getLongestStreak()).toBe(1);
    });

    it('continues streak with consecutive day activity', () => {
      const engine = new StreakEngine(true);
      engine.recordActivity(new Date('2025-01-01T10:00:00Z'));
      engine.recordActivity(new Date('2025-01-02T10:00:00Z'));
      engine.recordActivity(new Date('2025-01-03T10:00:00Z'));

      expect(engine.getCurrentStreak()).toBe(3);
      expect(engine.getLongestStreak()).toBe(3);
    });

    it('does not increase streak for same-day activity', () => {
      const engine = new StreakEngine(true);
      engine.recordActivity(new Date('2025-01-01T10:00:00Z'));
      engine.recordActivity(new Date('2025-01-01T15:00:00Z'));

      expect(engine.getCurrentStreak()).toBe(1);
    });

    it('resets streak after grace period expires', () => {
      const engine = new StreakEngine(true);
      engine.recordActivity(new Date('2025-01-01T10:00:00Z'));
      engine.recordActivity(new Date('2025-01-02T10:00:00Z'));
      // 4 days later, well beyond 36h grace
      engine.recordActivity(new Date('2025-01-06T10:00:00Z'));

      expect(engine.getCurrentStreak()).toBe(1);
      expect(engine.getLongestStreak()).toBe(2);
    });

    it('maintains streak within grace period', () => {
      const engine = new StreakEngine(true);
      engine.recordActivity(new Date('2025-01-01T10:00:00Z'));
      // Just over 24h but within 36h grace + 24h window = 60h
      engine.recordActivity(new Date('2025-01-03T08:00:00Z'));

      expect(engine.getCurrentStreak()).toBe(2);
    });
  });

  describe('no-addiction safeguards', () => {
    it('has addiction safeguards enabled', () => {
      const engine = createStreakEngine(true);
      expect(engine.hasAddictionSafeguards()).toBe(true);
    });

    it('respects quiet hours', () => {
      const engine = createStreakEngine(true);
      expect(engine.isInQuietHours(23)).toBe(true);
      expect(engine.isInQuietHours(3)).toBe(true);
      expect(engine.isInQuietHours(10)).toBe(false);
      expect(engine.isInQuietHours(14)).toBe(false);
    });

    it('limits max daily notifications', () => {
      const engine = createStreakEngine(true);
      const config = engine.getGamificationConfig();
      expect(config.addictionSafeguards.maxDailyNotifications).toBeLessThanOrEqual(2);
    });

    it('enables noFOMO by default', () => {
      const engine = createStreakEngine(true);
      const config = engine.getGamificationConfig();
      expect(config.addictionSafeguards.noFOMO).toBe(true);
    });
  });

  describe('daily brief', () => {
    it('generates daily brief when opted in', () => {
      const engine = createStreakEngine(true);
      engine.recordActivity(new Date());
      const brief = engine.generateDailyBrief();

      expect(brief).not.toBeNull();
      expect(brief!.title).toBe('Your Daily Brief');
      expect(brief!.items.length).toBeGreaterThan(0);
    });

    it('returns null when not opted in', () => {
      const engine = createStreakEngine(false);
      const brief = engine.generateDailyBrief();
      expect(brief).toBeNull();
    });
  });

  describe('weekly review', () => {
    it('generates weekly review when opted in', () => {
      const engine = createStreakEngine(true);
      const review = engine.generateWeeklyReview();

      expect(review).not.toBeNull();
      expect(review!.title).toBe('Your Weekly Review');
      expect(review!.streakInfo).toBeDefined();
    });

    it('returns null when not opted in', () => {
      const engine = createStreakEngine(false);
      const review = engine.generateWeeklyReview();
      expect(review).toBeNull();
    });
  });
});
