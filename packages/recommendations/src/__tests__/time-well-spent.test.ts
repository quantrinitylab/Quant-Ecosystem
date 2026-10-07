import { describe, it, expect } from 'vitest';
import { TimeWellSpent } from '../personalization/time-well-spent';
import type { SessionData } from '../personalization/time-well-spent';

describe('TimeWellSpent', () => {
  function createService(): TimeWellSpent {
    return new TimeWellSpent();
  }

  function makeSession(overrides: Partial<SessionData> = {}): SessionData {
    return {
      userId: 'user1',
      startTime: Date.now(),
      duration: 600, // 10 minutes in seconds
      engagements: 15,
      rapidScrolls: 5,
      ...overrides,
    };
  }

  describe('trackSession', () => {
    it('should accumulate sessions for a user', () => {
      const service = createService();

      service.trackSession('user1', makeSession());
      service.trackSession('user1', makeSession());

      const summary = service.getDailySummary('user1');
      expect(summary.sessions).toBe(2);
    });
  });

  describe('getDailySummary', () => {
    it('should return zero summary for unknown user', () => {
      const service = createService();
      const summary = service.getDailySummary('unknown');

      expect(summary.totalMinutes).toBe(0);
      expect(summary.sessions).toBe(0);
      expect(summary.engagementsPerMinute).toBe(0);
      expect(summary.rapidScrollRate).toBe(0);
    });

    it('should compute correct totals', () => {
      const service = createService();

      // Session 1: 10 minutes, 15 engagements, 5 rapid scrolls
      service.trackSession(
        'user1',
        makeSession({ duration: 600, engagements: 15, rapidScrolls: 5 }),
      );
      // Session 2: 20 minutes, 30 engagements, 10 rapid scrolls
      service.trackSession(
        'user1',
        makeSession({ duration: 1200, engagements: 30, rapidScrolls: 10 }),
      );

      const summary = service.getDailySummary('user1');

      expect(summary.totalMinutes).toBe(30); // 600/60 + 1200/60
      expect(summary.sessions).toBe(2);
      expect(summary.engagementsPerMinute).toBeCloseTo(1.5); // 45 / 30
      expect(summary.rapidScrollRate).toBeCloseTo(15 / 60); // 15 rapid / (15 rapid + 45 engagements)
    });
  });

  describe('predictRegret', () => {
    it('should return zero regret for unknown user', () => {
      const service = createService();
      const prediction = service.predictRegret('unknown');

      expect(prediction.regretScore).toBe(0);
      expect(prediction.shouldNotify).toBe(false);
      expect(prediction.suggestion).toBe('');
    });

    it('should predict high regret for long session with rapid scrolling', () => {
      const service = createService();

      // 35 minutes, 10 engagements (low), 200 rapid scrolls (very high)
      service.trackSession(
        'user1',
        makeSession({ duration: 2100, engagements: 10, rapidScrolls: 200 }),
      );

      const prediction = service.predictRegret('user1');

      expect(prediction.regretScore).toBeGreaterThan(0.5);
      expect(prediction.shouldNotify).toBe(true);
      expect(prediction.suggestion).toContain('minutes');
      expect(prediction.suggestion).toContain('Take a break');
    });

    it('should predict low regret for short engaged session', () => {
      const service = createService();

      // 5 minutes, high engagement, low rapid scrolls
      service.trackSession(
        'user1',
        makeSession({ duration: 300, engagements: 30, rapidScrolls: 2 }),
      );

      const prediction = service.predictRegret('user1');

      expect(prediction.regretScore).toBeLessThan(0.5);
      expect(prediction.shouldNotify).toBe(false);
    });

    it('should predict high regret for long session with low engagement', () => {
      const service = createService();

      // 40 minutes, very few engagements, moderate scrolls
      service.trackSession(
        'user1',
        makeSession({ duration: 2400, engagements: 5, rapidScrolls: 10 }),
      );

      const prediction = service.predictRegret('user1');

      expect(prediction.regretScore).toBeGreaterThan(0.5);
      expect(prediction.shouldNotify).toBe(true);
    });
  });

  describe('opt-out', () => {
    it('should not notify opted-out users', () => {
      const service = createService();

      service.setOptOut('user1', true);

      // Long session with high rapid scrolling
      service.trackSession(
        'user1',
        makeSession({ duration: 2100, engagements: 10, rapidScrolls: 200 }),
      );

      const prediction = service.predictRegret('user1');
      expect(prediction.shouldNotify).toBe(false);
    });

    it('should track opt-out state correctly', () => {
      const service = createService();

      expect(service.isOptedOut('user1')).toBe(false);

      service.setOptOut('user1', true);
      expect(service.isOptedOut('user1')).toBe(true);

      service.setOptOut('user1', false);
      expect(service.isOptedOut('user1')).toBe(false);
    });
  });
});
